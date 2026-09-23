"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, CircleDot, Eye, FilePlus2, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ProductPicker, { PickerProduct } from "@/components/ProductPicker";
import { NumInput, notify } from "@/components/ui";

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
};

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

function NuevaNotaInner() {
  const params = useSearchParams();
  const editId = params.get("id");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);

  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientRow[]>([]);
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

  useEffect(() => {
    // si la URL apunta a la nota que acabamos de guardar, no recargarla
    if (editId && editId !== savedIdRef.current) loadForEdit(editId);
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
    // recuperar las tarifas de cada producto para poder cambiar entre
    // contado y credito tambien al editar una nota ya guardada
    const ids = loaded.map((i) => i.product_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: pr } = await supabase.rpc("products_prices", { p_ids: ids });
      const map = new Map<string, PickerProduct>();
      for (const p of (pr ?? []) as PickerProduct[]) map.set(p.id, p);
      for (const it of loaded) {
        const p = it.product_id ? map.get(it.product_id) : null;
        if (p) it.prices = [p.price_1, p.price_2, p.price_3, p.price_4];
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

  const effectiveRate =
    currencyMode === "BS_BCV" ? exchangeRate * (1 + gapPercent / 100) : exchangeRate;
  const isForeign = currencyMode !== "USD";
  const curLabel = currencyMode === "COP" ? "COP" : "Bs";
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  function priceOf(p: PickerProduct, t: number) {
    const v = t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
    return Number(v ?? p.price_1 ?? 0);
  }

  // Cada busqueda lleva un numero. Si llega la respuesta de una busqueda vieja
  // (porque ya agregaste el producto o seguiste escribiendo), se ignora.
  // Esto evita que el menu se vuelva a abrir solo despues de agregar.
  const searchSeq = useRef(0);

  async function searchProducts(text: string) {
    setQuery(text);
    const mio = ++searchSeq.current;
    if (text.length < 2) return setResults([]);
    const { data, error } = await supabase.rpc("search_products", { search_text: text });
    if (mio !== searchSeq.current) return;
    if (error) return setError(error.message);
    setResults(data ?? []);
  }

  // ---------- sugerencias del renglon de abajo ----------
  const [newHits, setNewHits] = useState<PickerProduct[]>([]);
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
    const { data } = await supabase.rpc("search_products", { search_text: text.trim() });
    if (mio !== newSeq.current) return;
    setNewHits(((data ?? []) as PickerProduct[]).slice(0, 7));
    setNewActive(0);
  }

  function pickNew(p: PickerProduct) {
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

  function addProduct(p: PickerProduct, tierUsed: number) {
    const price = priceOf(p, tierUsed);
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
      },
    ]);
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
  function replaceProduct(i: number, p: PickerProduct) {
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
    const { data } = await supabase.rpc("search_products", { search_text: text });
    const hits = (data ?? []) as PickerProduct[];
    if (hits.length === 0) {
      // no existe: la linea pasa a ser manual con ese codigo, lista para escribirle
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, product_id: null, price_tier_used: null, prices: undefined } : it
        )
      );
      setCodeError(`"${text}" no esta en el catalogo. Escribe la descripcion y el precio, o guardalo abajo.`);
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
        idx === i
          ? { ...x, product_id: p.id, price_tier_used: 1, prices: [p.price_1, null, null, null] }
          : x
      )
    );
    setCodeError(null);
  }

  // Escribir el codigo en la linea vacia del final y darle Enter
  async function addByCode(e: React.KeyboardEvent<HTMLInputElement>) {
    // moverse por las sugerencias con las flechas
    if (newHits.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setNewActive((a) =>
        e.key === "ArrowDown" ? Math.min(a + 1, newHits.length - 1) : Math.max(a - 1, 0)
      );
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
    const { data } = await supabase.rpc("search_products", { search_text: text });
    const hits = (data ?? []) as PickerProduct[];
    if (hits.length === 0) {
      setCodeError(`No existe "${text}"`);
      return;
    }
    pickNew(hits.find((h) => norm(h.code) === norm(text)) ?? hits[0]);
  }

  function addManualProduct() {
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
      },
    ]);
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

  async function searchClients(text: string) {
    setClientQuery(text);
    if (text.length < 2) return setClientResults([]);
    const { data, error } = await supabase.rpc("list_clients", { search_text: text });
    if (error) return setError(error.message);
    setClientResults(data ?? []);
  }

  function selectClient(c: ClientRow) {
    setSelectedClient(c);
    setClientQuery("");
    setClientResults([]);
    const t = c.price_tier ?? 1;
    setItems((prev) =>
      prev.map((it) => {
        if (!it.prices) return it;
        const v = it.prices[t - 1];
        if (v == null) return it;
        return recalc({ ...it, unit_price: Number(v), price_tier_used: t });
      })
    );
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
    const { data, error } = selectedClient
      ? await supabase.rpc("update_client", { p_id: selectedClient.id, ...base })
      : await supabase.rpc("create_client", base);
    setSavingClient(false);
    if (error) return setError(error.message);
    selectClient(data as ClientRow);
    setShowClientForm(false);
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      p_items: items.map(({ prices, ...rest }) => rest),
      p_payment_status: paymentStatus,
      p_due_date: dueDate || null,
    };
  }

  // foto actual de la nota: si es distinta a la ultima guardada, hay cambios sin guardar
  const snapshot = useMemo(
    () => JSON.stringify(buildPayload()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClient, quickClientName, currencyMode, exchangeRate, gapPercent,
     discountAmount, items, paymentStatus, dueDate]
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

  if (loadingEdit) return <p className="text-sm text-gray-400 p-8">Cargando nota...</p>;

  return (
    <main className="max-w-3xl mx-auto p-8">
      {showPicker && (
        <ProductPicker
          tier={tier}
          onPick={(p, t) => {
            addProduct(p, t);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <Link href="/notas" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-4">
        ← Volver a notas
      </Link>
      <h1 className="text-lg font-medium mb-6">{editId ? "Editar nota" : "Nueva nota"}</h1>

      {/* Cliente */}
      <div className="mb-6 border border-gray-200 rounded-lg p-4">
        <label className="text-xs text-gray-500 block mb-2">Cliente</label>
        {selectedClient ? (
          <div className="flex items-start justify-between bg-gray-50 rounded-md px-3 py-2 text-sm">
            <div>
              <p className="font-medium">
                {selectedClient.name}
                <span className="ml-2 text-xs bg-gray-900 text-white rounded px-1.5 py-0.5">
                  Tarifa {tier}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                {[selectedClient.tax_id, selectedClient.city, selectedClient.state]
                  .filter(Boolean)
                  .join(" - ")}
              </p>
              {!!Number(selectedClient.balance_due) && (
                <p className="text-xs text-amber-700 mt-1">
                  Pendiente de cobro: ${Number(selectedClient.balance_due).toFixed(2)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
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
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                Editar
              </button>
              <button
                onClick={() => setSelectedClient(null)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative mb-2">
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="Buscar por nombre, cedula, ciudad o estado"
                value={clientQuery}
                onChange={(e) => searchClients(e.target.value)}
              />
              {clientResults.length > 0 && (
                <div className="border border-gray-200 rounded-md mt-1 bg-white shadow-sm max-h-60 overflow-y-auto">
                  {clientResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c)}
                      className="w-full flex justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
                    >
                      <span>
                        {c.name}
                        <span className="text-xs text-gray-400 ml-2">T{c.price_tier ?? 1}</span>
                      </span>
                      <span className="text-gray-400 text-xs">
                        {[c.tax_id, c.city].filter(Boolean).join(" - ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="O escribe un cliente rapido (sin registrar)"
                value={quickClientName}
                onChange={(e) => setQuickClientName(e.target.value)}
              />
              <button
                onClick={() => {
                  setClientForm({ ...emptyClientForm, name: quickClientName });
                  setShowClientForm(true);
                }}
                className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors whitespace-nowrap"
              >
                {quickClientName ? "Registrar completo" : "+ Nuevo cliente"}
              </button>
            </div>
          </>
        )}

        {showClientForm && (
          <div className="mt-3 border-t border-gray-200 pt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["name", "Nombre o empresa"],
                ["tax_id", "RIF o cedula"],
                ["fiscal_address", "Direccion fiscal"],
                ["phone", "Telefono"],
                ["city", "Ciudad"],
                ["state", "Estado"],
                ["salesperson", "Vendedor"],
              ] as [keyof typeof clientForm, string][]
            ).map(([f, label]) => (
              <input
                key={f}
                className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder={label}
                value={clientForm[f]}
                onChange={(e) => setClientForm((x) => ({ ...x, [f]: e.target.value }))}
              />
            ))}
            <div>
              <select
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={clientForm.price_tier}
                onChange={(e) => setClientForm((x) => ({ ...x, price_tier: e.target.value }))}
              >
                <option value="1">Tarifa 1 (contado)</option>
                <option value="2">Tarifa 2 (credito)</option>
                <option value="3">Tarifa 3</option>
                <option value="4">Tarifa 4</option>
              </select>
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <button onClick={() => setShowClientForm(false)} className="text-sm text-gray-500 px-3 py-1.5">
                Cancelar
              </button>
              <button
                onClick={saveClient}
                disabled={savingClient || !clientForm.name}
                className="text-sm bg-gray-900 text-white rounded-md px-3 py-1.5 disabled:opacity-40"
              >
                {savingClient ? "Guardando..." : "Guardar cliente"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Buscar producto */}
      <div className="mb-2 relative">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">Buscar producto</label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPicker(true)}
              className="text-xs border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
            >
              Ver catalogo
            </button>
            <button
              onClick={addManualProduct}
              className="text-xs border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
            >
              + Producto manual
            </button>
          </div>
        </div>
        <input
          id="buscador"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          placeholder="Codigo o descripcion — Enter agrega el primero, Tab pasa al siguiente campo"
          value={query}
          onChange={(e) => searchProducts(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const next = items.length;
            if (results.length > 0) {
              addProduct(results[0], tier);
              focusEl(`cant-${next}`);
              return;
            }
            // el usuario escribio rapido y la busqueda aun no responde:
            // se resuelve al vuelo, priorizando coincidencia exacta de codigo
            const text = query.trim();
            if (!text) return;
            const { data } = await supabase.rpc("search_products", { search_text: text });
            const hits = (data ?? []) as PickerProduct[];
            if (hits.length === 0) {
              setError(`No se encontro "${text}".`);
              return;
            }
            const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
            const exact = hits.find((h) => norm(h.code) === norm(text));
            addProduct(exact ?? hits[0], tier);
            focusEl(`cant-${next}`);
          }}
        />
        {results.length > 0 && (
          <div className="border border-gray-200 rounded-md mt-1 bg-white shadow-sm max-h-72 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p, tier)}
                className="w-full flex justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <span>
                  <span className="text-gray-400">{p.code}</span> - {p.description}
                  <span className="text-gray-400 text-xs ml-2">{p.category}</span>
                </span>
                <span className="text-gray-500">${priceOf(p, tier).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-sm my-6">
        <thead>
          <tr className="text-xs text-gray-400 text-left">
            <th className="font-normal py-1 w-24">Codigo</th>
            <th className="font-normal py-1">Producto</th>
            <th className="font-normal py-1 w-14">Cant.</th>
            <th className="font-normal py-1 w-36">Precio</th>
            <th className="font-normal py-1 w-20 text-right">Total</th>
            {isForeign && <th className="font-normal py-1 w-24 text-right">{curLabel}</th>}
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-t border-gray-100 align-top">
              <td className="py-2">
                <input
                  id={`cod-${i}`}
                  className={`w-24 border rounded px-2 py-1 text-xs ${
                    it.product_id
                      ? "border-gray-200 text-gray-500"
                      : "border-amber-300 bg-amber-50/60"
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
                    className="block text-[10px] text-indigo-600 hover:text-indigo-800 mt-1"
                  >
                    guardar en catalogo
                  </button>
                )}
              </td>
              <td className="py-2">
                <input
                  id={`desc-${i}`}
                  className="w-full border border-gray-200 rounded px-2 py-1"
                  placeholder="Descripcion"
                  value={it.description_snapshot}
                  onChange={(e) => updateItemText(i, "description_snapshot", e.target.value)}
                  onKeyDown={(e) => onGridKey(e, i, 1)}
                />
              </td>
              <td className="py-2">
                <NumInput
                  id={`cant-${i}`}
                  className="w-12 border border-gray-200 rounded px-2 py-1"
                  value={it.quantity}
                  onChange={(n) => updateItem(i, "quantity", n)}
                  onKeyDown={(e) => onGridKey(e, i, 2)}
                />
              </td>
              <td className="py-2">
                <NumInput
                  id={`prec-${i}`}
                  className="w-20 border border-gray-200 rounded px-2 py-1"
                  value={it.unit_price}
                  onChange={(n) => updateItem(i, "unit_price", n)}
                  onKeyDown={(e) => onGridKey(e, i, 3)}
                />
                {it.prices && (
                  <div className="mt-1 flex items-center gap-1">
                    {[1, 2, 3, 4].map((t) =>
                      it.prices?.[t - 1] != null ? (
                        <button
                          key={t}
                          onClick={() => setLineTier(i, t)}
                          title={`Precio ${t}: $${Number(it.prices?.[t - 1]).toFixed(2)}`}
                          className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
                            it.price_tier_used === t
                              ? "bg-gray-900 text-white border-gray-900"
                              : "border-gray-300 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          T{t}
                        </button>
                      ) : null
                    )}
                    {it.price_tier_used === null && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                        manual
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="py-2 text-right">
                ${it.line_total.toFixed(2)}
                {showProfit && (
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <span className="text-[10px] text-gray-400">costo</span>
                    <NumInput
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-[11px] text-right"
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
              </td>
              {isForeign && (
                <td className="py-2 text-right text-gray-700">
                  {fmt(it.line_total * effectiveRate)}
                </td>
              )}
              <td className="py-2 text-right">
                <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-500">
                  x
                </button>
              </td>
            </tr>
          ))}

          {/* Linea vacia: escribe el codigo y Enter la convierte en linea real */}
          <tr className="border-t border-gray-100">
            <td className="py-2 relative" colSpan={2}>
              <input
                id="cod-nuevo"
                autoComplete="off"
                className="w-56 border border-dashed border-gray-300 rounded px-2 py-1 text-xs focus:border-solid focus:border-brand-400 focus:outline-none transition-colors"
                placeholder="Codigo o nombre, y Enter..."
                value={newCode}
                onChange={(e) => suggestNew(e.target.value)}
                onKeyDown={addByCode}
                onBlur={() => setTimeout(() => setNewHits([]), 150)}
              />
              {codeError && <span className="text-xs text-amber-700 ml-2">{codeError}</span>}

              {newHits.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-30 w-[440px] bg-white border border-gray-200 rounded-xl shadow-pop p-1">
                  {newHits.map((h, k) => (
                    <button
                      key={h.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickNew(h);
                      }}
                      onMouseEnter={() => setNewActive(k)}
                      className={`w-full flex items-baseline gap-2.5 px-2.5 py-1.5 rounded-lg text-left ${
                        k === newActive ? "bg-brand-50" : ""
                      }`}
                    >
                      <span className="w-20 shrink-0 font-mono text-[10.5px] text-gray-500 truncate">
                        {h.code}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-800">
                        {h.description}
                      </span>
                      <span className="shrink-0 text-[12px] text-gray-900">
                        ${priceOf(h, tier).toFixed(2)}
                      </span>
                    </button>
                  ))}
                  <p className="px-2.5 pt-1 pb-0.5 text-[10.5px] text-gray-400 border-t border-gray-100 mt-1">
                    ↑↓ para moverte · Enter para agregar · Esc para cerrar
                  </p>
                </div>
              )}
            </td>
            <td colSpan={isForeign ? 4 : 3} className="py-2 text-xs text-gray-400">
              Enter agrega · luego Enter pasa a cantidad, precio, y vuelve aqui
            </td>
          </tr>
        </tbody>
      </table>

      {/* Cobro */}
      <div className="mb-4 border border-gray-200 rounded-lg p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Estado de cobro</label>
          <select
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
          >
            <option value="PENDIENTE">Pendiente</option>
            <option value="COBRADO">Cobrado</option>
            <option value="ANULADO">Anulado</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Fecha de vencimiento</label>
          <input
            type="date"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      {/* Moneda */}
      <div className="mb-6 border border-gray-200 rounded-lg p-4">
        <label className="text-xs text-gray-500 block mb-2">Moneda de la nota</label>
        <div
          role="radiogroup"
          aria-label="Moneda de la nota"
          className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100 mb-3"
        >
          {(
            [
              { k: "USD", t: "Dolares", s: "USD" },
              { k: "COP", t: "Pesos", s: "colombianos" },
              { k: "BS_BINANCE", t: "Bs Binance", s: "tasa Binance" },
              { k: "BS_BCV", t: "Bs BCV", s: "tasa BCV + brecha" },
            ] as { k: CurrencyMode; t: string; s: string }[]
          ).map((m) => {
            const on = currencyMode === m.k;
            return (
              <button
                key={m.k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCurrencyMode(m.k)}
                className={`rounded-lg px-2 py-1.5 text-center transition-colors ${
                  on
                    ? "bg-white shadow-card ring-1 ring-brand-200 text-brand-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
                }`}
              >
                <span className="block text-[13px] font-medium leading-tight">{m.t}</span>
                <span
                  className={`block text-[10.5px] leading-tight ${
                    on ? "text-brand-500" : "text-gray-400"
                  }`}
                >
                  {m.s}
                </span>
              </button>
            );
          })}
        </div>
        {isForeign && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">
                Tasa del dia ({curLabel} por USD)
              </label>
              <NumInput
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  exchangeRate > 0 ? "border-gray-200" : "border-amber-300 bg-amber-50/40"
                }`}
                value={exchangeRate}
                onChange={setExchangeRate}
                placeholder="escribe la tasa de hoy"
                ariaLabel="Tasa del dia"
              />
            </div>
            {currencyMode === "BS_BCV" && (
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Ajuste de brecha (%)</label>
                <NumInput
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={gapPercent}
                  onChange={setGapPercent}
                  ariaLabel="Ajuste de brecha"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between items-start gap-4 mb-6">
        <div>
          <button
            onClick={() => setShowProfit((s) => !s)}
            className="text-xs border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
          >
            {showProfit ? "Ocultar rentabilidad" : "Ver rentabilidad"}
          </button>
          {showProfit && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm w-60">
              <div className="flex justify-between text-gray-500 py-0.5">
                <span>Costo total</span>
                <span>${totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500 py-0.5">
                <span>Venta total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div
                className={`flex justify-between font-medium pt-1 mt-1 border-t border-gray-200 ${
                  profit >= 0 ? "text-green-700" : "text-red-600"
                }`}
              >
                <span>Ganancia</span>
                <span>
                  ${profit.toFixed(2)} ({margin.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="w-72 text-sm">
          <div className="flex justify-between text-gray-500 py-1">
            <span>Subtotal (USD)</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-500">Descuento (%)</span>
            <NumInput
              className="w-20 border border-gray-200 rounded px-2 py-1 text-right"
              value={discountPercent}
              onChange={setDiscountPercent}
              ariaLabel="Descuento en porcentaje"
            />
          </div>
          <div className="flex justify-between text-gray-400 text-xs py-1">
            <span>Descuento aplicado</span>
            <span>-${discountAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-medium text-base border-t border-gray-200 mt-1 pt-2">
            <span>Total (USD)</span>
            <span>${total.toFixed(2)}</span>
          </div>
          {isForeign && (
            <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
              <div className="flex justify-between text-gray-500 py-1">
                <span>Subtotal ({curLabel})</span>
                <span>{fmt(subtotal * effectiveRate)}</span>
              </div>
              <div className="flex justify-between text-gray-500 py-1">
                <span>Descuento ({curLabel})</span>
                <span>-{fmt(discountAmount * effectiveRate)}</span>
              </div>
              <div className="flex justify-between font-medium text-base pt-1">
                <span>Total ({curLabel})</span>
                <span>{fmt(total * effectiveRate)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {/* barra de guardado: siempre visible, nunca desaparece */}
      <div className="sticky bottom-0 -mx-8 px-8 py-3 bg-white/90 backdrop-blur border-t border-gray-200 flex items-center gap-3">
        <div className="flex items-center gap-2 text-[12.5px] min-w-0">
          {dirty ? (
            <>
              <CircleDot size={14} className="text-amber-500 shrink-0" />
              <span className="text-amber-700">Cambios sin guardar</span>
            </>
          ) : currentId ? (
            <>
              <Check size={14} className="text-emerald-600 shrink-0" />
              <span className="text-gray-600">
                Guardada
                {savedNoteNumber ? ` · Nota #${String(savedNoteNumber).padStart(4, "0")}` : ""}
              </span>
            </>
          ) : (
            <span className="text-gray-400">Nota nueva, aun sin guardar</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {currentId && (
            <Link
              href={`/notas/ver?id=${currentId}`}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-gray-300 text-[13px] text-gray-700 hover:bg-gray-50"
            >
              <Eye size={15} strokeWidth={1.75} />
              Ver / imprimir
            </Link>
          )}
          {currentId && (
            <button
              onClick={resetForm}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-gray-300 text-[13px] text-gray-700 hover:bg-gray-50"
            >
              <FilePlus2 size={15} strokeWidth={1.75} />
              Nueva nota
            </button>
          )}
          <button
            disabled={saving || items.length === 0 || (!!currentId && !dirty)}
            onClick={saveNote}
            className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-brand-700 text-white text-[13px] font-medium shadow-sm hover:bg-brand-800 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Save size={15} strokeWidth={2} />
            {saving ? "Guardando..." : currentId ? "Guardar cambios" : "Guardar nota"}
          </button>
        </div>
      </div>
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
