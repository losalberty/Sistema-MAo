"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  CircleDot,
  Eye,
  EyeOff,
  FilePlus2,
  Minus,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import ProductPicker, { PickerProduct } from "@/components/ProductPicker";
import { NumInput, notify } from "@/components/ui";
import { tasaPara, useTasas } from "@/components/Tasas";
import { Campo, Ventana, inputCls } from "@/components/Ventana";
import { colorDe, iniciales } from "@/components/Paleta";
import { useAlClicFuera } from "@/components/useFuera";

type ClientRow = {
  id: string;
  client_number?: number;
  name: string;
  tax_id: string | null;
  fiscal_address: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  salesperson: string | null;
  price_tier?: number;
  balance_due?: number;
  credit_days?: number | null;
  notes_count?: number | null;
  overdue?: number | null;
};

// lo que trae el buscador de la nota (incluye existencia y si es bajo pedido)
type Producto = PickerProduct & { supply_type?: string | null; min_stock?: number | null };

type LineItem = {
  product_id: string | null;
  code_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
  cost_snapshot: number;
  price_tier_used: number | null;
  prices?: (number | null)[];
  // solo para mostrar en pantalla (no se guardan en la nota)
  stock?: number | null;
  supply?: string | null;
};

type CurrencyMode = "USD" | "COP" | "BS_BINANCE" | "BS_BCV";

const emptyClientForm = {
  name: "",
  tax_id: "",
  fiscal_address: "",
  phone: "",
  city: "",
  state: "",
  salesperson: "",
  price_tier: "1",
};

const TARIFAS: Record<number, string> = { 1: "Contado", 2: "Credito", 3: "Tarifa 3", 4: "Tarifa 4" };

const MONEDAS: { k: CurrencyMode; t: string; s: string }[] = [
  { k: "USD", t: "Dolares", s: "USD" },
  { k: "BS_BCV", t: "Bs BCV", s: "tasa BCV" },
  { k: "BS_BINANCE", t: "Bs Binance", s: "tasa Binance" },
  { k: "COP", t: "Pesos", s: "colombianos" },
];

function money(n: number) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function enDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

function fechaBonita(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" });
}

// pastilla de existencia de un repuesto
function Existencia({ stock, supply, pide }: { stock?: number | null; supply?: string | null; pide?: number }) {
  if (supply === "PEDIDO")
    return <span className="text-[11px] px-1.5 py-px rounded-md bg-violet-50 text-violet-700 whitespace-nowrap">bajo pedido</span>;
  if (stock === undefined || stock === null) return null;
  const s = Number(stock);
  const falta = pide !== undefined && pide > s;
  if (s <= 0)
    return <span className="text-[11px] px-1.5 py-px rounded-md bg-red-50 text-red-600 whitespace-nowrap">agotado</span>;
  return (
    <span
      className={`text-[11px] px-1.5 py-px rounded-md whitespace-nowrap ${
        falta ? "bg-amber-50 text-amber-800" : s <= 5 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {falta ? `solo hay ${s}` : `${s} en stock`}
    </span>
  );
}

function NuevaNotaInner() {
  const params = useSearchParams();
  const editId = params.get("id");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Producto[]>([]);
  const [activo, setActivo] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);

  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientRow[]>([]);
  const [clienteActivo, setClienteActivo] = useState(0);
  const [verClientes, setVerClientes] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [quickClientName, setQuickClientName] = useState("");
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [savingClient, setSavingClient] = useState(false);

  const [discountPercent, setDiscountPercent] = useState(0);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("USD");
  const [exchangeRate, setExchangeRate] = useState(0);
  const [gapPercent, setGapPercent] = useState(0);

  const [paymentStatus, setPaymentStatus] = useState("PENDIENTE");
  const [dueDate, setDueDate] = useState("");
  const [showProfit, setShowProfit] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedNoteNumber, setSavedNoteNumber] = useState<number | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  // Guardado: la foto de lo ultimo que se guardo, para saber si hay cambios pendientes
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [baselinePending, setBaselinePending] = useState(false);
  const savedIdRef = useRef<string | null>(null);

  // la nota con la que se trabaja: la que se abrio para editar, o la que se acaba de crear
  const currentId = editId ?? savedNoteId;

  const tier = selectedClient?.price_tier ?? 1;

  // los desplegables se cierran al hacer clic afuera o con Esc
  const cajaClientes = useRef<HTMLDivElement>(null);
  const cajaProductos = useRef<HTMLDivElement>(null);
  const cerrarClientes = useCallback(() => setVerClientes(false), []);
  const cerrarProductos = useCallback(() => {
    searchSeq.current++;
    setResults([]);
  }, []);
  useAlClicFuera(cajaClientes, verClientes && clientResults.length > 0, cerrarClientes);
  useAlClicFuera(cajaProductos, results.length > 0, cerrarProductos);

  useEffect(() => {
    // si la URL apunta a la nota que acabamos de guardar, no recargarla
    if (editId && editId !== savedIdRef.current) loadForEdit(editId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  async function loadForEdit(id: string) {
    setLoadingEdit(true);
    const { data, error } = await supabase.rpc("get_note_detail", { p_note_id: id });
    setLoadingEdit(false);
    if (error) return setError(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    const loaded: LineItem[] = (row.items ?? []).map((i: LineItem) => ({
      ...i,
      cost_snapshot: i.cost_snapshot ?? 0,
    }));
    // recuperar las tarifas (y la existencia) de cada producto para poder cambiar
    // entre contado y credito tambien al editar una nota ya guardada
    const ids = loaded.map((i) => i.product_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: pr } = await supabase.rpc("productos_para_nota", { p_ids: ids });
      const map = new Map<string, Producto>();
      for (const p of (pr ?? []) as Producto[]) map.set(p.id, p);
      for (const it of loaded) {
        const p = it.product_id ? map.get(it.product_id) : null;
        if (p) {
          it.prices = [p.price_1, p.price_2, p.price_3, p.price_4];
          it.stock = Number(p.stock_quantity ?? 0);
          it.supply = p.supply_type ?? "ALMACEN";
        }
      }
    }
    setItems(loaded);
    setQuickClientName(row.quick_client_name ?? "");
    if (row.client_id) {
      const { data: cs } = await supabase.rpc("list_clients", { search_text: row.display_name });
      const found = (cs ?? []).find((c: ClientRow) => c.id === row.client_id);
      setSelectedClient(found ?? null);
    }
    setCurrencyMode((row.currency_mode as CurrencyMode) ?? "USD");
    setExchangeRate(row.exchange_rate ?? 0);
    setGapPercent(row.exchange_gap_percent ?? 0);
    setPaymentStatus(row.payment_status ?? "PENDIENTE");
    setDueDate(row.due_date ?? "");
    const sub = row.subtotal ?? 0;
    setDiscountPercent(sub > 0 ? Math.round(((row.discount ?? 0) / sub) * 10000) / 100 : 0);
    setSavedNoteNumber(row.sequence_number ?? null);
    // cuando todo lo cargado este en pantalla, tomar esa foto como "lo guardado"
    setBaselinePending(true);
  }

  function resetForm() {
    setItems([]);
    setQuery("");
    setResults([]);
    setSelectedClient(null);
    setQuickClientName("");
    setClientQuery("");
    setClientResults([]);
    setDiscountPercent(0);
    setCurrencyMode("USD");
    setExchangeRate(0);
    setGapPercent(0);
    setPaymentStatus("PENDIENTE");
    setDueDate("");
    setSavedNoteNumber(null);
    setSavedNoteId(null);
    savedIdRef.current = null;
    setLastSaved(null);
    setError(null);
    window.history.replaceState({}, "", "/notas/nueva");
  }

  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const total = subtotal - discountAmount;
  const totalCost = items.reduce((s, i) => s + (i.cost_snapshot || 0) * i.quantity, 0);
  const profit = total - totalCost;
  const margin = total > 0 ? (profit / total) * 100 : 0;

  // tasas del dia guardadas abajo a la izquierda del menu
  const tasas = useTasas();
  const tasaHoy = tasaPara(currencyMode, tasas);

  // al cambiar la moneda se pone sola la tasa de hoy de esa moneda
  function elegirMoneda(k: CurrencyMode) {
    setCurrencyMode(k);
    if (k === "USD") return;
    const t = tasaPara(k, tasas);
    if (t > 0) setExchangeRate(t);
    else if (k !== currencyMode) setExchangeRate(0);
  }

  const effectiveRate = currencyMode === "BS_BCV" ? exchangeRate * (1 + gapPercent / 100) : exchangeRate;
  const isForeign = currencyMode !== "USD";
  const curLabel = currencyMode === "COP" ? "COP" : "Bs";
  const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function priceOf(p: PickerProduct, t: number) {
    const v = t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
    return Number(v ?? p.price_1 ?? 0);
  }

  // Cada busqueda lleva un numero. Si llega la respuesta de una busqueda vieja
  // (porque ya agregaste el producto o seguiste escribiendo), se ignora.
  // Esto evita que el menu se vuelva a abrir solo despues de agregar.
  const searchSeq = useRef(0);

  async function buscar(texto: string): Promise<Producto[]> {
    const { data, error } = await supabase.rpc("buscar_para_nota", { p_text: texto });
    if (error) {
      setError(error.message);
      return [];
    }
    return (data ?? []) as Producto[];
  }

  async function searchProducts(text: string) {
    setQuery(text);
    const mio = ++searchSeq.current;
    if (text.trim().length < 2) return setResults([]);
    const hits = await buscar(text.trim());
    if (mio !== searchSeq.current) return;
    setResults(hits.slice(0, 12));
    setActivo(0);
  }

  // ---------- sugerencias del renglon de abajo ----------
  const [newHits, setNewHits] = useState<Producto[]>([]);
  const [newActive, setNewActive] = useState(0);
  const newSeq = useRef(0);

  async function suggestNew(text: string) {
    setNewCode(text);
    setCodeError(null);
    const mio = ++newSeq.current;
    if (text.trim().length < 2) {
      setNewHits([]);
      return;
    }
    const hits = await buscar(text.trim());
    if (mio !== newSeq.current) return;
    setNewHits(hits.slice(0, 7));
    setNewActive(0);
  }

  function pickNew(p: Producto) {
    newSeq.current++;
    const next = items.length;
    addProduct(p, tier);
    setNewCode("");
    setNewHits([]);
    focusEl(`cant-${next}`);
  }

  function focusEl(id: string) {
    setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select?.();
      }
    }, 30);
  }

  function avisarExistencia(p: Producto, cantidad: number) {
    if ((p.supply_type ?? "ALMACEN") === "PEDIDO") return;
    const s = Number(p.stock_quantity ?? 0);
    if (s <= 0) notify.aviso(`${p.code} esta agotado`, "Se agrega igual; queda esperando en Pedidos hasta que llegue.");
    else if (cantidad > s) notify.aviso(`Solo hay ${s} de ${p.code}`, "Lo que falte queda esperando en Pedidos.");
  }

  function addProduct(p: Producto, tierUsed: number) {
    const price = priceOf(p, tierUsed);
    // si el repuesto ya esta en la nota, se le suma 1 en vez de repetir la linea
    const ya = items.findIndex((it) => it.product_id === p.id);
    if (ya >= 0) {
      const nueva = items[ya].quantity + 1;
      setItems((prev) => prev.map((it, idx) => (idx === ya ? recalc({ ...it, quantity: nueva }) : it)));
      avisarExistencia(p, nueva);
      notify.info(`${p.code}: ahora son ${nueva}`, "Ya estaba en la nota, se le sumo 1.");
    } else {
      setItems((prev) => [
        ...prev,
        {
          product_id: p.id,
          code_snapshot: p.code,
          description_snapshot: p.description,
          quantity: 1,
          unit_price: price,
          line_discount: 0,
          line_total: price,
          cost_snapshot: Number(p.cost ?? 0),
          price_tier_used: tierUsed,
          prices: [p.price_1, p.price_2, p.price_3, p.price_4],
          stock: p.stock_quantity != null ? Number(p.stock_quantity) : null,
          supply: p.supply_type ?? "ALMACEN",
        },
      ]);
      avisarExistencia(p, 1);
    }
    // invalidar cualquier busqueda que siga en camino
    searchSeq.current++;
    setQuery("");
    setResults([]);
  }

  // ---------- cuadricula: navegacion y edicion ----------
  // Columnas: 0 codigo · 1 descripcion · 2 cantidad · 3 precio

  function focusCell(row: number, col: number) {
    const ids = ["cod", "desc", "cant", "prec"];
    focusEl(`${ids[col]}-${row}`);
  }

  // Cambia el producto de una linea ya metida, conservando la cantidad
  function replaceProduct(i: number, p: Producto) {
    const price = priceOf(p, tier);
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i
          ? recalc({
              ...it,
              product_id: p.id,
              code_snapshot: p.code,
              description_snapshot: p.description,
              unit_price: price,
              cost_snapshot: Number(p.cost ?? 0),
              price_tier_used: tier,
              prices: [p.price_1, p.price_2, p.price_3, p.price_4],
              stock: p.stock_quantity != null ? Number(p.stock_quantity) : null,
              supply: p.supply_type ?? "ALMACEN",
            })
          : it
      )
    );
  }

  // Enter sobre el codigo de una linea existente: lo resuelve y lo cambia
  async function resolveLineCode(i: number) {
    const text = (items[i]?.code_snapshot ?? "").trim();
    if (!text) return;
    setCodeError(null);
    const hits = await buscar(text);
    if (hits.length === 0) {
      // no existe: la linea pasa a ser manual con ese codigo, lista para escribirle
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, product_id: null, price_tier_used: null, prices: undefined, stock: null, supply: null } : it
        )
      );
      setCodeError(`"${text}" no esta en el catalogo. Escribe la descripcion y el precio, o guardalo en el catalogo.`);
      focusCell(i, 1);
      return;
    }
    const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
    replaceProduct(i, hits.find((h) => norm(h.code) === norm(text)) ?? hits[0]);
    focusCell(i, 2);
  }

  async function onGridKey(e: React.KeyboardEvent<HTMLInputElement>, i: number, col: number) {
    const last = items.length - 1;
    if (e.key === "ArrowDown" && i < last) {
      e.preventDefault();
      return focusCell(i + 1, col);
    }
    if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      return focusCell(i - 1, col);
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (col === 0) return resolveLineCode(i);
    if (col < 3) return focusCell(i, col + 1);
    // ultima columna: baja a la linea siguiente, o a la linea vacia del final
    if (i === last) return focusEl("cod-nuevo");
    return focusCell(i + 1, 0);
  }

  // Guarda en el catalogo un producto que se escribio a mano en la nota
  async function saveManualToCatalog(i: number) {
    const it = items[i];
    if (!it.code_snapshot.trim() || !it.description_snapshot.trim()) {
      setCodeError("Necesita codigo y descripcion para guardarlo en el catalogo.");
      return;
    }
    const { data, error } = await supabase.rpc("upsert_product", {
      p_id: null,
      p_code: it.code_snapshot.trim(),
      p_description: it.description_snapshot.trim(),
      p_brand: null,
      p_category: null,
      p_price_1: it.unit_price,
      p_price_2: null,
      p_price_3: null,
      p_price_4: null,
      p_has_stock_control: true,
      p_stock_quantity: 0,
      p_price_list: "Lista principal",
      p_cost: it.cost_snapshot || 0,
      p_purchase_price: null,
      p_discount_percent: 0,
    });
    if (error) return setError(error.message);
    const p = data as PickerProduct;
    setItems((prev) =>
      prev.map((x, idx) =>
        idx === i ? { ...x, product_id: p.id, price_tier_used: 1, prices: [p.price_1, null, null, null], stock: 0, supply: "ALMACEN" } : x
      )
    );
    setCodeError(null);
    notify.ok("Guardado en el catalogo", it.code_snapshot.trim());
  }

  // Escribir el codigo en la linea vacia del final y darle Enter
  async function addByCode(e: React.KeyboardEvent<HTMLInputElement>) {
    // moverse por las sugerencias con las flechas
    if (newHits.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setNewActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, newHits.length - 1) : Math.max(a - 1, 0)));
      return;
    }
    if (e.key === "Escape") {
      newSeq.current++;
      setNewHits([]);
      return;
    }
    if (e.key !== "Enter" && !(e.key === "Tab" && !e.shiftKey && newCode.trim())) return;
    const text = newCode.trim();
    if (!text) return;
    e.preventDefault();
    setCodeError(null);

    const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

    // si hay sugerencias a la vista: codigo exacto primero, si no la marcada
    if (newHits.length > 0) {
      const exacto = newHits.find((h) => norm(h.code) === norm(text));
      pickNew(exacto ?? newHits[newActive] ?? newHits[0]);
      return;
    }

    newSeq.current++;
    const hits = await buscar(text);
    if (hits.length === 0) {
      setCodeError(`No existe "${text}"`);
      return;
    }
    pickNew(hits.find((h) => norm(h.code) === norm(text)) ?? hits[0]);
  }

  // Enter en el buscador grande: agrega el marcado (o el codigo exacto)
  async function teclaBuscador(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActivo((a) => (e.key === "ArrowDown" ? Math.min(a + 1, results.length - 1) : Math.max(a - 1, 0)));
      return;
    }
    if (e.key === "Escape") {
      cerrarProductos();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = items.length;
    const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
    const text = query.trim();
    if (results.length > 0) {
      const exacto = results.find((h) => norm(h.code) === norm(text));
      addProduct(exacto ?? results[activo] ?? results[0], tier);
      focusEl(`cant-${next}`);
      return;
    }
    // el usuario escribio rapido y la busqueda aun no responde:
    // se resuelve al vuelo, priorizando coincidencia exacta de codigo
    if (!text) return;
    const hits = await buscar(text);
    if (hits.length === 0) {
      setError(`No se encontro "${text}".`);
      return;
    }
    addProduct(hits.find((h) => norm(h.code) === norm(text)) ?? hits[0], tier);
    focusEl(`cant-${next}`);
  }

  function addManualProduct() {
    const next = items.length;
    setItems((prev) => [
      ...prev,
      {
        product_id: null,
        code_snapshot: "",
        description_snapshot: "",
        quantity: 1,
        unit_price: 0,
        line_discount: 0,
        line_total: 0,
        cost_snapshot: 0,
        price_tier_used: null,
        stock: null,
        supply: null,
      },
    ]);
    focusEl(`cod-${next}`);
  }

  function recalc(it: LineItem) {
    return { ...it, line_total: it.quantity * it.unit_price - it.line_discount };
  }

  function updateItem(i: number, field: "quantity" | "unit_price" | "cost_snapshot", v: number) {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const upd = { ...it, [field]: v };
        if (field === "unit_price") upd.price_tier_used = null;
        return recalc(upd);
      })
    );
  }

  function sumar(i: number, d: number) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? recalc({ ...it, quantity: Math.max(1, it.quantity + d) }) : it)));
  }

  function setLineTier(i: number, t: number) {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i || !it.prices) return it;
        const v = it.prices[t - 1];
        if (v == null) return it;
        return recalc({ ...it, unit_price: Number(v), price_tier_used: t });
      })
    );
  }

  function updateItemText(i: number, field: "code_snapshot" | "description_snapshot", v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: v } : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ---------- clientes ----------
  const clienteSeq = useRef(0);
  async function searchClients(text: string) {
    setClientQuery(text);
    setVerClientes(true);
    const mio = ++clienteSeq.current;
    if (text.trim().length < 2) return setClientResults([]);
    const { data, error } = await supabase.rpc("list_clients", { search_text: text.trim() });
    if (mio !== clienteSeq.current) return;
    if (error) return setError(error.message);
    setClientResults(((data ?? []) as ClientRow[]).slice(0, 8));
    setClienteActivo(0);
  }

  function selectClient(c: ClientRow) {
    setSelectedClient(c);
    setClientQuery("");
    setClientResults([]);
    setVerClientes(false);
    const t = c.price_tier ?? 1;
    setItems((prev) =>
      prev.map((it) => {
        if (!it.prices) return it;
        const v = it.prices[t - 1];
        if (v == null) return it;
        return recalc({ ...it, unit_price: Number(v), price_tier_used: t });
      })
    );
    // en una nota nueva, el vencimiento sale solo con los dias de credito del cliente
    if (!currentId && !dueDate && Number(c.credit_days) > 0) setDueDate(enDias(Number(c.credit_days)));
    if (Number(c.overdue) > 0.005)
      notify.aviso(`${c.name} tiene $${money(Number(c.overdue))} vencido`, "Revisa antes de darle mas credito.");
    setTimeout(() => document.getElementById("buscador")?.focus(), 40);
  }

  function teclaClientes(e: React.KeyboardEvent<HTMLInputElement>) {
    if (clientResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setClienteActivo((a) => Math.min(a + 1, clientResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setClienteActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = clientResults[clienteActivo];
      if (c) selectClient(c);
    } else if (e.key === "Escape") {
      setVerClientes(false);
    }
  }

  async function saveClient() {
    setSavingClient(true);
    setError(null);
    const base = {
      p_name: clientForm.name,
      p_tax_id: clientForm.tax_id,
      p_fiscal_address: clientForm.fiscal_address,
      p_phone: clientForm.phone,
      p_city: clientForm.city,
      p_state: clientForm.state,
      p_salesperson: clientForm.salesperson,
      p_price_tier: Number(clientForm.price_tier) || 1,
    };
    const editando = !!selectedClient;
    const { data, error } = editando
      ? await supabase.rpc("update_client", { p_id: selectedClient!.id, ...base })
      : await supabase.rpc("create_client", base);
    setSavingClient(false);
    if (error) return setError(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as ClientRow;
    // al editar se conserva lo que ya se sabia (deuda, credito)
    selectClient(editando ? { ...selectedClient!, ...row } : row);
    setQuickClientName("");
    setShowClientForm(false);
    notify.ok(editando ? "Cliente actualizado" : "Cliente registrado", row?.name);
  }

  function buildPayload() {
    return {
      p_client_id: selectedClient?.id ?? null,
      p_quick_client_name: selectedClient ? null : quickClientName || "Cliente eventual",
      p_currency_mode: currencyMode,
      p_exchange_rate: isForeign ? exchangeRate : null,
      p_exchange_gap_percent: currencyMode === "BS_BCV" ? gapPercent : null,
      p_show_company_name: true,
      p_show_logo: true,
      p_discount: discountAmount,
      // lo que solo sirve en pantalla no se manda a la base
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      p_items: items.map(({ prices, stock, supply, ...rest }) => rest),
      p_payment_status: paymentStatus,
      p_due_date: dueDate || null,
    };
  }

  // foto actual de la nota: si es distinta a la ultima guardada, hay cambios sin guardar
  const snapshot = useMemo(
    () => JSON.stringify(buildPayload()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClient, quickClientName, currencyMode, exchangeRate, gapPercent, discountAmount, items, paymentStatus, dueDate]
  );
  const dirty = lastSaved === null ? items.length > 0 : snapshot !== lastSaved;

  useEffect(() => {
    if (baselinePending) {
      setLastSaved(snapshot);
      setBaselinePending(false);
    }
  }, [baselinePending, snapshot]);

  // avisar si se cierra la pestaña con cambios sin guardar
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const CURRENCY_NAME: Record<CurrencyMode, string> = {
    USD: "dolares",
    COP: "pesos",
    BS_BINANCE: "Binance",
    BS_BCV: "BCV",
  };

  async function saveNote() {
    setError(null);
    if (items.length === 0) {
      notify.aviso("La nota no tiene productos");
      return;
    }
    if (isForeign && !(exchangeRate > 0)) {
      const msg = `Falta la tasa de ${CURRENCY_NAME[currencyMode]}`;
      setError(`${msg}. Escribela en "Tasa del dia" antes de guardar.`);
      notify.error(msg, "Escribela en Tasa del dia antes de guardar.");
      return;
    }

    setSaving(true);
    const payload = buildPayload();
    const snap = JSON.stringify(payload);
    const eraNueva = !currentId;

    const { data, error } = currentId
      ? await supabase.rpc("update_note", { p_note_id: currentId, ...payload })
      : await supabase.rpc("create_note", payload);
    setSaving(false);

    if (error) {
      setError(error.message);
      notify.error("No se pudo guardar", error.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const id = (row?.id as string) ?? currentId ?? null;
    const numero = row?.sequence_number ?? savedNoteNumber;

    savedIdRef.current = id;
    setSavedNoteId(id);
    setSavedNoteNumber(numero ?? null);
    setLastSaved(snap);

    // dejar la direccion apuntando a esta nota: si recargas, sigues en ella
    if (eraNueva && id) window.history.replaceState({}, "", `/notas/nueva?id=${id}`);

    const etiqueta = numero ? `Nota #${String(numero).padStart(4, "0")}` : "Nota";
    notify.ok(eraNueva ? `${etiqueta} guardada` : "Cambios guardados", eraNueva ? undefined : etiqueta);
  }

  // Ctrl + S guarda
  const guardarRef = useRef(saveNote);
  guardarRef.current = saveNote;
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        guardarRef.current();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  if (loadingEdit) return <p className="text-sm text-gray-400 p-8">Cargando nota...</p>;

  const deuda = Number(selectedClient?.balance_due) || 0;
  const vencido = Number(selectedClient?.overdue) || 0;
  const unidades = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const tBcv = tasaPara("BS_BCV", tasas);
  const tBin = tasaPara("BS_BINANCE", tasas);
  const anulada = paymentStatus === "ANULADO";

  return (
    <main className="p-6 max-w-[1240px] pb-16">
      {showPicker && (
        <ProductPicker
          tier={tier}
          onPick={(p, t) => {
            addProduct(p as Producto, t);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* ---------- encabezado ---------- */}
      <div className="flex items-end gap-3 mb-4">
        <div className="min-w-0">
          <Link href="/notas" className="inline-flex items-center gap-1 text-[12.5px] text-gray-500 hover:text-gray-900 mb-1">
            <ArrowLeft size={14} /> Notas
          </Link>
          <h1 className="text-[24px] font-semibold text-gray-900 tracking-tight flex items-center gap-3">
            {currentId ? `Nota #${savedNoteNumber ? String(savedNoteNumber).padStart(4, "0") : "…"}` : "Nueva nota"}
            {dirty ? (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-amber-50 text-amber-800 text-[12px] font-medium">
                <CircleDot size={12} /> sin guardar
              </span>
            ) : currentId ? (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-medium">
                <Check size={12} /> guardada
              </span>
            ) : null}
          </h1>
          <p className="text-[13px] text-gray-500 first-letter:uppercase">
            {new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        {/* =================== izquierda =================== */}
        <div className="min-w-0 space-y-4">
          {/* ---------- cliente ---------- */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4">
            <p className="text-[12px] font-medium text-gray-500 mb-2">Cliente</p>
            {selectedClient ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/50">
                  <span
                    className="w-11 h-11 rounded-full text-white text-[14px] font-semibold flex items-center justify-center shrink-0"
                    style={{ background: colorDe(selectedClient.name) }}
                  >
                    {iniciales(selectedClient.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 truncate">{selectedClient.name}</p>
                    <p className="text-[12.5px] text-gray-500 flex flex-wrap gap-x-2.5">
                      {selectedClient.tax_id && <span>{selectedClient.tax_id}</span>}
                      {selectedClient.city && <span>{selectedClient.city}</span>}
                      {selectedClient.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} /> {selectedClient.phone}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-[11.5px] px-2 py-0.5 rounded-md font-medium ${
                        tier === 1 ? "bg-gray-100 text-gray-700" : "bg-brand-50 text-brand-700"
                      }`}
                    >
                      Tarifa {TARIFAS[tier] ?? tier}
                    </span>
                    <span className="text-[11.5px] text-gray-500">
                      {Number(selectedClient.credit_days) > 0 ? `${selectedClient.credit_days} dias de credito` : "de contado"}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setClientForm({
                          name: selectedClient.name ?? "",
                          tax_id: selectedClient.tax_id ?? "",
                          fiscal_address: selectedClient.fiscal_address ?? "",
                          phone: selectedClient.phone ?? "",
                          city: selectedClient.city ?? "",
                          state: selectedClient.state ?? "",
                          salesperson: selectedClient.salesperson ?? "",
                          price_tier: String(selectedClient.price_tier ?? 1),
                        });
                        setShowClientForm(true);
                      }}
                      title="Editar cliente"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedClient(null);
                        setTimeout(() => document.getElementById("buscar-cliente")?.focus(), 30);
                      }}
                      title="Cambiar de cliente"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-white"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                {deuda > 0.005 && (
                  <div
                    className={`mt-2.5 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] ${
                      vencido > 0.005 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    <AlertTriangle size={15} className="shrink-0 mt-px" />
                    <span>
                      Este cliente te debe <b className="font-semibold">${money(deuda)}</b>
                      {vencido > 0.005 && (
                        <>
                          , de eso <b className="font-semibold">${money(vencido)} ya vencido</b>
                        </>
                      )}
                      .{" "}
                      <Link href={`/clientes?id=${selectedClient.id}`} className="underline underline-offset-2 font-medium">
                        Ver su estado de cuenta
                      </Link>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative" ref={cajaClientes}>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    id="buscar-cliente"
                    autoFocus={!editId}
                    className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-[10px] text-[14px] bg-white focus:border-brand-500"
                    placeholder="Buscar cliente por nombre, RIF, telefono o ciudad"
                    value={clientQuery}
                    onChange={(e) => searchClients(e.target.value)}
                    onFocus={() => setVerClientes(true)}
                    onKeyDown={teclaClientes}
                  />
                  {verClientes && clientResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-12 z-30 rounded-xl bg-white border border-gray-200 shadow-pop p-1.5 max-h-80 overflow-y-auto">
                      {clientResults.map((c, k) => {
                        const d = Number(c.balance_due) || 0;
                        const v = Number(c.overdue) || 0;
                        return (
                          <button
                            key={c.id}
                            onMouseEnter={() => setClienteActivo(k)}
                            onClick={() => selectClient(c)}
                            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left ${
                              k === clienteActivo ? "bg-gray-50" : ""
                            }`}
                          >
                            <span
                              className="w-8 h-8 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0"
                              style={{ background: colorDe(c.name) }}
                            >
                              {iniciales(c.name)}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13.5px] text-gray-900 truncate">{c.name}</span>
                              <span className="block text-[11.5px] text-gray-400 truncate">
                                {[c.tax_id, c.city, TARIFAS[c.price_tier ?? 1]].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            {v > 0.005 ? (
                              <span className="text-[11.5px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 whitespace-nowrap">
                                ${money(v)} vencido
                              </span>
                            ) : d > 0.005 ? (
                              <span className="text-[11.5px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 whitespace-nowrap">
                                debe ${money(d)}
                              </span>
                            ) : (
                              <span className="text-[11.5px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">al dia</span>
                            )}
                          </button>
                        );
                      })}
                      <p className="px-2.5 pt-1.5 pb-0.5 mt-1 border-t border-gray-100 text-[11px] text-gray-400">
                        ↑↓ para moverte · Enter para elegir · Esc para cerrar
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 items-center mt-2.5">
                  <input
                    className="flex-1 h-9 px-3 border border-gray-200 rounded-lg text-[13px] bg-white"
                    placeholder="O un cliente rapido, sin registrar (ej: Mostrador)"
                    value={quickClientName}
                    onChange={(e) => setQuickClientName(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      setClientForm({ ...emptyClientForm, name: quickClientName || clientQuery });
                      setShowClientForm(true);
                    }}
                    className="h-9 px-3 rounded-lg inline-flex items-center gap-1.5 text-[13px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300 whitespace-nowrap"
                  >
                    <UserPlus size={15} /> Nuevo cliente
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ---------- productos ---------- */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-card">
            <div className="flex items-center gap-2 px-4 pt-4 pb-3">
              <p className="text-[12px] font-medium text-gray-500">Productos</p>
              {items.length > 0 && (
                <span className="text-[11.5px] text-gray-400">
                  · {items.length} linea{items.length === 1 ? "" : "s"} · {unidades} unidades
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowPicker(true)}
                className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12.5px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              >
                <BookOpen size={14} /> Catalogo
              </button>
              <button
                onClick={addManualProduct}
                className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12.5px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              >
                <Plus size={14} /> Producto manual
              </button>
            </div>

            <div className="px-4 pb-3 relative" ref={cajaProductos}>
              <Package size={15} className="absolute left-7 top-[13px] text-gray-400 pointer-events-none" />
              <input
                id="buscador"
                className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-[10px] text-[14px] bg-white focus:border-brand-500"
                placeholder="Busca el repuesto por codigo o nombre (ej: cruceta 1410) y Enter"
                value={query}
                onChange={(e) => searchProducts(e.target.value)}
                onKeyDown={teclaBuscador}
              />
              {results.length > 0 && (
                <div className="absolute left-4 right-4 top-12 z-30 rounded-xl bg-white border border-gray-200 shadow-pop p-1.5 max-h-96 overflow-y-auto">
                  {results.map((p, k) => (
                    <button
                      key={p.id}
                      onMouseEnter={() => setActivo(k)}
                      onClick={() => {
                        const next = items.length;
                        addProduct(p, tier);
                        focusEl(`cant-${next}`);
                      }}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left ${k === activo ? "bg-gray-50" : ""}`}
                    >
                      <span className="w-24 shrink-0 font-mono text-[11.5px] text-gray-500 truncate">{p.code}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] text-gray-900 truncate">{p.description}</span>
                        {(p.brand || p.category) && (
                          <span className="block text-[11px] text-gray-400 truncate">
                            {[p.brand, p.category].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <Existencia stock={p.stock_quantity} supply={p.supply_type} />
                      <span className="w-20 shrink-0 text-right text-[13px] font-semibold text-gray-900">
                        ${money(priceOf(p, tier))}
                      </span>
                    </button>
                  ))}
                  <p className="px-2.5 pt-1.5 pb-0.5 mt-1 border-t border-gray-100 text-[11px] text-gray-400">
                    ↑↓ para moverte · Enter agrega el marcado · precio de tarifa {TARIFAS[tier]}
                  </p>
                </div>
              )}
            </div>

            {/* lineas */}
            <div className="border-t border-gray-100">
              <div className="flex gap-3 items-center px-4 h-9 text-[11px] font-medium text-gray-400 bg-gray-50/60 border-b border-gray-100">
                <span className="w-28">Codigo</span>
                <span className="flex-1 min-w-0">Producto</span>
                <span className="w-[104px] text-center">Cantidad</span>
                <span className="w-[120px] text-right">Precio $</span>
                <span className="w-24 text-right">Total $</span>
                {isForeign && <span className="w-24 text-right">{curLabel}</span>}
                <span className="w-8" />
              </div>

              {items.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <span className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto mb-2">
                    <Package size={20} />
                  </span>
                  <p className="text-[13.5px] font-medium text-gray-800">Agrega el primer repuesto</p>
                  <p className="text-[12.5px] text-gray-400">Buscalo arriba, o escribe el codigo en la linea de abajo y Enter.</p>
                </div>
              )}

              {items.map((it, i) => {
                const pocoStock =
                  it.product_id && it.supply !== "PEDIDO" && it.stock !== undefined && it.stock !== null && it.quantity > Number(it.stock);
                return (
                  <div key={i} className="group flex gap-3 items-start px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50/60">
                    <div className="w-28 shrink-0">
                      <input
                        id={`cod-${i}`}
                        className={`w-full h-8 px-2 border rounded-lg font-mono text-[11.5px] ${
                          it.product_id ? "border-gray-200 text-gray-600 bg-white" : "border-amber-300 bg-amber-50/60"
                        }`}
                        placeholder="Codigo"
                        value={it.code_snapshot}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => updateItemText(i, "code_snapshot", e.target.value)}
                        onKeyDown={(e) => onGridKey(e, i, 0)}
                      />
                      {!it.product_id && it.code_snapshot.trim() && it.description_snapshot.trim() && (
                        <button
                          onClick={() => saveManualToCatalog(i)}
                          className="block text-[10.5px] text-brand-700 hover:underline mt-1"
                        >
                          guardar en catalogo
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        id={`desc-${i}`}
                        className="w-full h-8 px-2 border border-gray-200 rounded-lg text-[13px] bg-white"
                        placeholder="Descripcion"
                        value={it.description_snapshot}
                        onChange={(e) => updateItemText(i, "description_snapshot", e.target.value)}
                        onKeyDown={(e) => onGridKey(e, i, 1)}
                      />
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {it.product_id ? (
                          <Existencia stock={it.stock} supply={it.supply} pide={it.quantity} />
                        ) : (
                          <span className="text-[11px] px-1.5 py-px rounded-md bg-amber-50 text-amber-800">fuera del catalogo</span>
                        )}
                        {pocoStock && <span className="text-[11px] text-amber-700">lo que falte queda en Pedidos</span>}
                      </div>
                    </div>
                    <div className="w-[104px] shrink-0 flex items-center justify-center">
                      <div className="inline-flex items-center h-8 border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <button
                          onClick={() => sumar(i, -1)}
                          aria-label="Uno menos"
                          className="w-7 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
                        >
                          <Minus size={13} />
                        </button>
                        <NumInput
                          id={`cant-${i}`}
                          className="w-10 h-full text-center text-[13px] font-medium outline-none bg-transparent"
                          value={it.quantity}
                          onChange={(n) => updateItem(i, "quantity", n)}
                          onKeyDown={(e) => onGridKey(e, i, 2)}
                          ariaLabel="Cantidad"
                        />
                        <button
                          onClick={() => sumar(i, 1)}
                          aria-label="Uno mas"
                          className="w-7 h-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="w-[120px] shrink-0">
                      <NumInput
                        id={`prec-${i}`}
                        className="w-full h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-right bg-white"
                        value={it.unit_price}
                        onChange={(n) => updateItem(i, "unit_price", n)}
                        onKeyDown={(e) => onGridKey(e, i, 3)}
                        ariaLabel="Precio"
                      />
                      {it.prices && (
                        <div className="mt-1 flex items-center justify-end gap-1">
                          {[1, 2, 3, 4].map((t) =>
                            it.prices?.[t - 1] != null ? (
                              <button
                                key={t}
                                onClick={() => setLineTier(i, t)}
                                title={`${TARIFAS[t]}: $${Number(it.prices?.[t - 1]).toFixed(2)}`}
                                className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
                                  it.price_tier_used === t
                                    ? "bg-brand-700 text-white border-brand-700"
                                    : "border-gray-200 text-gray-500 hover:bg-gray-100"
                                }`}
                              >
                                T{t}
                              </button>
                            ) : null
                          )}
                          {it.price_tier_used === null && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">manual</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="w-24 shrink-0 text-right pt-1.5">
                      <span className="text-[13.5px] font-semibold text-gray-900">{money(it.line_total)}</span>
                      {showProfit && (
                        <div className="mt-1 flex items-center justify-end gap-1">
                          <NumInput
                            className="w-14 h-6 border border-gray-200 rounded px-1 text-[11px] text-right"
                            value={it.cost_snapshot}
                            onChange={(n) => updateItem(i, "cost_snapshot", n)}
                            ariaLabel="Costo de la linea"
                          />
                          <span
                            className={`text-[10px] rounded px-1.5 py-0.5 ${
                              it.cost_snapshot <= 0
                                ? "bg-gray-100 text-gray-500"
                                : it.unit_price / it.cost_snapshot - 1 < 0
                                ? "bg-red-100 text-red-800"
                                : it.unit_price / it.cost_snapshot - 1 < 0.15
                                ? "bg-amber-100 text-amber-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {it.cost_snapshot > 0
                              ? `${(((it.unit_price - it.cost_snapshot) / it.cost_snapshot) * 100).toFixed(0)}%`
                              : "sin costo"}
                          </span>
                        </div>
                      )}
                    </div>
                    {isForeign && (
                      <div className="w-24 shrink-0 text-right pt-1.5 text-[13px] text-gray-600">{fmt(it.line_total * effectiveRate)}</div>
                    )}
                    <div className="w-8 shrink-0 pt-0.5">
                      <button
                        onClick={() => removeItem(i)}
                        title="Quitar linea"
                        aria-label="Quitar linea"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 group-hover:text-gray-500 hover:!text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Linea vacia: escribe el codigo y Enter la convierte en linea real */}
              <div className="relative flex items-center gap-3 px-4 py-3">
                <input
                  id="cod-nuevo"
                  autoComplete="off"
                  className="w-64 h-8 px-2.5 border border-dashed border-gray-300 rounded-lg text-[12.5px] focus:border-solid focus:border-brand-400 focus:outline-none bg-white"
                  placeholder="+ codigo o nombre, y Enter…"
                  value={newCode}
                  onChange={(e) => suggestNew(e.target.value)}
                  onKeyDown={addByCode}
                  onBlur={() => setTimeout(() => setNewHits([]), 150)}
                />
                {codeError ? (
                  <span className="text-[12px] text-amber-700">{codeError}</span>
                ) : (
                  <span className="text-[11.5px] text-gray-400">
                    Enter agrega · luego Enter pasa a cantidad, precio, y vuelve aqui
                  </span>
                )}

                {newHits.length > 0 && (
                  <div className="absolute left-4 bottom-full mb-1 z-30 w-[520px] bg-white border border-gray-200 rounded-xl shadow-pop p-1.5">
                    {newHits.map((h, k) => (
                      <button
                        key={h.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickNew(h);
                        }}
                        onMouseEnter={() => setNewActive(k)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left ${
                          k === newActive ? "bg-brand-50" : ""
                        }`}
                      >
                        <span className="w-20 shrink-0 font-mono text-[10.5px] text-gray-500 truncate">{h.code}</span>
                        <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-800">{h.description}</span>
                        <Existencia stock={h.stock_quantity} supply={h.supply_type} />
                        <span className="shrink-0 w-16 text-right text-[12px] text-gray-900">${money(priceOf(h, tier))}</span>
                      </button>
                    ))}
                    <p className="px-2.5 pt-1 pb-0.5 text-[10.5px] text-gray-400 border-t border-gray-100 mt-1">
                      ↑↓ para moverte · Enter para agregar · Esc para cerrar
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- cobro ---------- */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4">
            <p className="text-[12px] font-medium text-gray-500 mb-2.5">Cobro</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <span className="block text-[11px] text-gray-500 mb-1">Estado</span>
                <div className="inline-flex p-[3px] rounded-[9px] bg-gray-100 gap-0.5">
                  {[
                    ["PENDIENTE", "Por cobrar"],
                    ["COBRADO", "Cobrada"],
                    ["ANULADO", "Anulada"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setPaymentStatus(k)}
                      className={`h-7 px-3 rounded-md text-[12.5px] ${
                        paymentStatus === k
                          ? k === "ANULADO"
                            ? "bg-white text-red-600 font-medium shadow-sm"
                            : "bg-white text-gray-900 font-medium shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[11px] text-gray-500 mb-1">Vence</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    className="h-8 px-2 border border-gray-300 rounded-lg text-[12.5px] bg-white"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                  {[
                    [0, "hoy"],
                    [7, "+7"],
                    [15, "+15"],
                    [30, "+30"],
                  ].map(([d, l]) => (
                    <button
                      key={l as string}
                      onClick={() => setDueDate(enDias(d as number))}
                      className={`h-8 px-2 rounded-lg text-[12px] border ${
                        dueDate === enDias(d as number)
                          ? "border-brand-200 bg-brand-50 text-brand-800 font-medium"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {dueDate && (
                <p className="text-[12px] text-gray-500 inline-flex items-center gap-1 pb-1.5">
                  <CalendarDays size={13} /> vence el {fechaBonita(dueDate)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* =================== derecha: resumen fijo =================== */}
        <aside className="lg:sticky lg:top-[68px] bg-white border border-gray-200 rounded-xl shadow-card p-4">
          <p className="text-[12px] font-medium text-gray-500 mb-2">Moneda de la nota</p>
          <div role="radiogroup" aria-label="Moneda de la nota" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 mb-3">
            {MONEDAS.map((m) => {
              const on = currencyMode === m.k;
              return (
                <button
                  key={m.k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => elegirMoneda(m.k)}
                  className={`rounded-lg px-2 py-1.5 text-center transition-colors ${
                    on ? "bg-white shadow-card ring-1 ring-brand-200 text-brand-800" : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
                  }`}
                >
                  <span className="block text-[13px] font-medium leading-tight">{m.t}</span>
                  <span className={`block text-[10.5px] leading-tight ${on ? "text-brand-500" : "text-gray-400"}`}>{m.s}</span>
                </button>
              );
            })}
          </div>

          {isForeign && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[11px] text-gray-500 mb-1 flex items-center gap-1.5 flex-wrap">
                  Tasa ({curLabel} por $)
                  {tasaHoy > 0 && exchangeRate === tasaHoy && <span className="text-[10.5px] text-emerald-700">· la de hoy</span>}
                  {tasaHoy > 0 && exchangeRate !== tasaHoy && (
                    <button type="button" onClick={() => setExchangeRate(tasaHoy)} className="text-[10.5px] text-brand-700 hover:underline">
                      usar la de hoy ({tasaHoy.toLocaleString("es-VE")})
                    </button>
                  )}
                </label>
                <NumInput
                  className={`w-full h-9 px-2.5 border rounded-lg text-[13px] text-right ${
                    exchangeRate > 0 ? "border-gray-300" : "border-amber-300 bg-amber-50/40"
                  }`}
                  value={exchangeRate}
                  onChange={setExchangeRate}
                  placeholder="tasa de hoy"
                  ariaLabel="Tasa del dia"
                />
              </div>
              {currencyMode === "BS_BCV" && (
                <div className="w-24">
                  <label className="text-[11px] text-gray-500 block mb-1">Brecha %</label>
                  <NumInput
                    className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-[13px] text-right"
                    value={gapPercent}
                    onChange={setGapPercent}
                    ariaLabel="Ajuste de brecha"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1 text-[13px]">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>${money(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-500">
              <span className="flex items-center gap-1.5">
                Descuento
                <NumInput
                  className="w-14 h-7 border border-gray-200 rounded-md px-1.5 text-[12.5px] text-right"
                  value={discountPercent}
                  onChange={setDiscountPercent}
                  ariaLabel="Descuento en porcentaje"
                />
                %
              </span>
              <span>{discountAmount > 0 ? `−$${money(discountAmount)}` : "—"}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-gray-500">Total</span>
              <span className={`text-[30px] font-semibold tracking-tight leading-none ${anulada ? "text-gray-400 line-through" : "text-gray-900"}`}>
                {isForeign ? `${curLabel} ${fmt(total * effectiveRate)}` : `$${money(total)}`}
              </span>
            </div>
            <p className="text-right text-[12px] text-gray-400 mt-1">
              {isForeign
                ? `equivale a $${money(total)}`
                : tBcv > 0 || tBin > 0
                ? [tBcv > 0 && `Bs ${fmt(total * tBcv)} BCV`, tBin > 0 && `Bs ${fmt(total * tBin)} Binance`].filter(Boolean).join(" · ")
                : ""}
            </p>
          </div>

          <button
            onClick={() => setShowProfit((s) => !s)}
            className="mt-3 w-full flex items-center justify-between rounded-lg px-3 py-2 bg-gray-50 text-[12.5px] text-gray-500 hover:text-gray-800"
          >
            <span className="flex items-center gap-1.5">
              {showProfit ? <EyeOff size={13} /> : <Eye size={13} />} Rentabilidad
            </span>
            {showProfit ? (
              <span className={profit >= 0 ? "text-emerald-700" : "text-red-600"}>
                ${money(profit)} · {margin.toFixed(1)}%
              </span>
            ) : (
              <span className="text-gray-300">oculta</span>
            )}
          </button>
          {showProfit && (
            <p className="text-[11.5px] text-gray-400 mt-1 px-1">Costo total ${money(totalCost)}. El costo de cada linea se puede corregir en la lista.</p>
          )}

          {error && <p className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-[12.5px] text-red-700">{error}</p>}

          <button
            disabled={saving || items.length === 0 || (!!currentId && !dirty)}
            onClick={saveNote}
            className="mt-4 w-full h-11 rounded-[10px] inline-flex items-center justify-center gap-2 text-[14px] font-medium text-white bg-gradient-to-b from-brand-600 to-brand-800 border border-brand-900 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_4px_12px_-4px_rgba(36,58,102,.55)] hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Save size={16} />
            {saving ? "Guardando..." : currentId ? (dirty ? "Guardar cambios" : "Todo guardado") : "Guardar nota"}
            <kbd className="ml-1 text-[10.5px] px-1.5 py-px rounded-md bg-white/10 border border-white/20 text-white/80 font-sans">
              Ctrl S
            </kbd>
          </button>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Link
              href={currentId ? `/notas/ver?id=${currentId}` : "#"}
              onClick={(e) => {
                if (!currentId) {
                  e.preventDefault();
                  notify.info("Guarda la nota primero", "Despues la puedes ver e imprimir.");
                }
              }}
              className={`h-9 rounded-lg inline-flex items-center justify-center gap-1.5 text-[13px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300 ${
                currentId ? "" : "opacity-50"
              }`}
            >
              <Printer size={15} /> Imprimir
            </Link>
            <button
              onClick={resetForm}
              disabled={!currentId && items.length === 0}
              className="h-9 rounded-lg inline-flex items-center justify-center gap-1.5 text-[13px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-50"
            >
              <FilePlus2 size={15} /> Nueva nota
            </button>
          </div>

          <p className="mt-3 text-[11.5px] text-center">
            {dirty ? (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <CircleDot size={12} /> Hay cambios sin guardar
              </span>
            ) : currentId ? (
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <Check size={12} /> Guardada
              </span>
            ) : (
              <span className="text-gray-400">Nota nueva, aun sin guardar</span>
            )}
          </p>
        </aside>
      </div>

      {showClientForm && (
        <Ventana
          titulo={selectedClient ? "Editar cliente" : "Nuevo cliente"}
          subtitulo="Queda guardado en Clientes y elegido en esta nota"
          icono={selectedClient ? Pencil : UserPlus}
          ancho="max-w-xl"
          onClose={() => setShowClientForm(false)}
          pie={
            <>
              <button onClick={() => setShowClientForm(false)} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
                Cancelar
              </button>
              <button
                onClick={saveClient}
                disabled={savingClient || !clientForm.name.trim()}
                className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
              >
                {savingClient ? "Guardando..." : selectedClient ? "Guardar cambios" : "Registrar y usar"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre o empresa" className="col-span-2">
              <input
                autoFocus
                className={inputCls}
                value={clientForm.name}
                onChange={(e) => setClientForm((x) => ({ ...x, name: e.target.value }))}
              />
            </Campo>
            {(
              [
                ["tax_id", "RIF o cedula"],
                ["phone", "Telefono"],
                ["fiscal_address", "Direccion fiscal"],
                ["city", "Ciudad"],
                ["state", "Estado"],
                ["salesperson", "Vendedor"],
              ] as [keyof typeof clientForm, string][]
            ).map(([f, label]) => (
              <Campo key={f} label={label} className={f === "fiscal_address" ? "col-span-2" : ""}>
                <input className={inputCls} value={clientForm[f]} onChange={(e) => setClientForm((x) => ({ ...x, [f]: e.target.value }))} />
              </Campo>
            ))}
            <Campo label="Tarifa de precios">
              <select
                className={inputCls}
                value={clientForm.price_tier}
                onChange={(e) => setClientForm((x) => ({ ...x, price_tier: e.target.value }))}
              >
                <option value="1">Contado (tarifa 1)</option>
                <option value="2">Credito (tarifa 2)</option>
                <option value="3">Tarifa 3</option>
                <option value="4">Tarifa 4</option>
              </select>
            </Campo>
          </div>
        </Ventana>
      )}
    </main>
  );
}

export default function NuevaNotaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400 p-8">Cargando...</p>}>
      <NuevaNotaInner />
    </Suspense>
  );
}
