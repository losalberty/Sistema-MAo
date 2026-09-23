"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  CalendarDays,
  Eye,
  FilePlus2,
  FileText,
  HandCoins,
  Mail,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Upload,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  EmptyState,
  NumInput,
  Pill,
  SkeletonRows,
  ToolbarButton,
  ToolbarSeparator,
  confirmar,
  notify,
  type PillTone,
} from "@/components/ui";

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  contact: string | null;
  credit_days: number;
  default_discount: number;
  invoiced: number;
  paid: number;
  balance: number;
  invoices: number;
  products: number;
  active: boolean;
  tax_id: string | null;
  email: string | null;
  overdue: number;
};

type LedgerRow = {
  kind: "factura" | "pago";
  id: string;
  entry_date: string;
  label: string;
  amount: number;
  due_date: string | null;
  items: number;
  paid: number | null;
  pending: number | null;
  method: string | null;
  currency_mode: string | null;
  amount_currency: number | null;
  exchange_rate: number | null;
  reference: string | null;
  receipt_path: string | null;
  invoice_label: string | null;
};

type ProductHit = {
  id: string;
  code: string;
  description: string;
  purchase_price: number | null;
  cost: number | null;
  discount_percent: number | null;
};

type Line = {
  code: string;
  description: string;
  quantity: string;
  list_price: string;
  discount_percent: string;
  previous_cost: number | null;
  known: boolean;
};

const emptyLine: Line = {
  code: "",
  description: "",
  quantity: "1",
  list_price: "0",
  discount_percent: "",
  previous_cost: null,
  known: false,
};

// monedas en que se le puede pagar a un proveedor (mismos colores que en Notas)
const MONEDAS: { key: string; label: string; tone: PillTone; simbolo: string }[] = [
  { key: "USD", label: "Dolares", tone: "success", simbolo: "$" },
  { key: "BS_BCV", label: "Bs BCV", tone: "sky", simbolo: "Bs" },
  { key: "BS_BINANCE", label: "Bs Binance", tone: "warning", simbolo: "Bs" },
  { key: "COP", label: "Pesos", tone: "violet", simbolo: "COP" },
];

// forma de pago -> moneda que se propone sola
const METODOS: { key: string; moneda: string }[] = [
  { key: "Zelle", moneda: "USD" },
  { key: "Efectivo $", moneda: "USD" },
  { key: "Binance USDT", moneda: "USD" },
  { key: "Transferencia Bs", moneda: "BS_BCV" },
  { key: "Pago movil", moneda: "BS_BCV" },
  { key: "Efectivo Bs", moneda: "BS_BCV" },
  { key: "Pesos", moneda: "COP" },
  { key: "Otro", moneda: "" },
];

function monedaDe(k: string | null) {
  return MONEDAS.find((m) => m.key === k) ?? MONEDAS[0];
}

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(n: number) {
  return Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fechaCorta(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" });
}

const inputCls =
  "w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:border-brand-500";

// ---------- fotos de comprobantes ----------

// reduce la foto del telefono (3-5 MB) a unos 200-400 KB antes de subirla
async function comprimir(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

async function subirComprobante(supplierId: string, file: File): Promise<string> {
  const blob = await comprimir(file);
  const esJpg = blob !== file || /jpe?g$/i.test(file.name);
  const ext = esJpg ? "jpg" : (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${supplierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("comprobantes")
    .upload(path, blob, { contentType: esJpg ? "image/jpeg" : file.type || undefined });
  if (error) throw error;
  return path;
}

async function verComprobante(path: string) {
  // se abre la pestaña antes de pedir el enlace para que el navegador no la bloquee
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(path, 600);
  if (error || !data) {
    w?.close();
    notify.error("No se pudo abrir el comprobante", error?.message);
    return;
  }
  if (w) w.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

// estado de una factura segun lo pagado y el vencimiento
function estadoFactura(r: LedgerRow): { texto: string; tone: PillTone } {
  const pend = Number(r.pending ?? 0);
  const pag = Number(r.paid ?? 0);
  if (pend <= 0.005) return { texto: "Pagada", tone: "success" };
  if (r.due_date && r.due_date < today()) return { texto: "Vencida", tone: "danger" };
  if (pag > 0) return { texto: "Abonada", tone: "brand" };
  return { texto: "Pendiente", tone: "warning" };
}

export default function ComprasPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buscaProv, setBuscaProv] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [filtroMov, setFiltroMov] = useState<"todo" | "factura" | "pago">("todo");

  // formulario de factura
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [freight, setFreight] = useState("0");
  const [customs, setCustoms] = useState("0");
  const [other, setOther] = useState("0");
  const [prorate, setProrate] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // buscador de productos
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);

  // ventanas
  const [provModal, setProvModal] = useState<{ id: string | null } | null>(null);
  const [pagoModal, setPagoModal] = useState<{ factura: LedgerRow | null } | null>(null);
  const [facturaVer, setFacturaVer] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    const { data, error } = await supabase.rpc("suppliers_balance");
    setLoading(false);
    if (error) return setError(error.message);
    setError(null);
    const rows = (data ?? []) as SupplierRow[];
    setSuppliers(rows);
    setCurrent((c) => (c && rows.some((r) => r.id === c) ? c : rows.find((r) => r.active)?.id || ""));
  }, []);

  const loadLedger = useCallback(async (id: string) => {
    if (!id) return setLedger([]);
    setLoadingLedger(true);
    const { data, error } = await supabase.rpc("supplier_ledger", { p_supplier_id: id });
    setLoadingLedger(false);
    if (error) return setError(error.message);
    setLedger((data ?? []) as LedgerRow[]);
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    loadLedger(current);
  }, [current, loadLedger]);

  function refrescar() {
    loadSuppliers();
    loadLedger(current);
  }

  const activos = useMemo(() => suppliers.filter((s) => s.active), [suppliers]);
  const archivados = useMemo(() => suppliers.filter((s) => !s.active), [suppliers]);

  const totalDebt = useMemo(
    () => activos.reduce((s, x) => s + Math.max(0, Number(x.balance)), 0),
    [activos]
  );
  const totalVencido = useMemo(
    () => activos.reduce((s, x) => s + Math.max(0, Number(x.overdue)), 0),
    [activos]
  );

  const listaProv = useMemo(() => {
    const base = verArchivados ? archivados : activos;
    const q = buscaProv.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.tax_id ?? "").toLowerCase().includes(q) ||
        (s.contact ?? "").toLowerCase().includes(q)
    );
  }, [activos, archivados, verArchivados, buscaProv]);

  const currentSupplier = suppliers.find((s) => s.id === current);

  const movimientos = useMemo(
    () => (filtroMov === "todo" ? ledger : ledger.filter((r) => r.kind === filtroMov)),
    [ledger, filtroMov]
  );

  const facturasPendientes = useMemo(
    () => ledger.filter((r) => r.kind === "factura" && Number(r.pending ?? 0) > 0.005),
    [ledger]
  );

  // ---------- acciones de proveedor ----------

  function necesitaProveedor(accion: string) {
    if (currentSupplier) return true;
    notify.info("Elige un proveedor primero", `Para ${accion}, toca un proveedor en la lista.`);
    return false;
  }

  async function archivar() {
    if (!currentSupplier || !necesitaProveedor("archivarlo")) return;
    const s = currentSupplier;
    const reactivar = !s.active;
    const ok = await confirmar({
      titulo: reactivar ? `¿Reactivar a ${s.name}?` : `¿Archivar a ${s.name}?`,
      mensaje: reactivar
        ? "Vuelve a aparecer en las listas para facturas, pedidos y productos."
        : "Deja de aparecer en las listas, pero sus facturas, pagos y pedidos se conservan. Lo puedes reactivar cuando quieras.",
      detalle:
        !reactivar && Number(s.balance) > 0.005
          ? `Ojo: todavia le debes ${money(Number(s.balance))}`
          : undefined,
      textoSi: reactivar ? "Si, reactivar" : "Si, archivar",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("set_supplier_active", {
      p_id: s.id,
      p_active: reactivar,
    });
    if (error) return notify.error("No se pudo cambiar", error.message);
    notify.ok(reactivar ? `${s.name} reactivado` : `${s.name} archivado`);
    if (!reactivar) setVerArchivados(false);
    loadSuppliers();
  }

  async function eliminarProveedor() {
    if (!currentSupplier || !necesitaProveedor("eliminarlo")) return;
    const s = currentSupplier;
    const conHistorial = Number(s.invoices) > 0 || ledger.length > 0;

    if (conHistorial) {
      const ok = await confirmar({
        titulo: `${s.name} tiene historial`,
        mensaje:
          "No se puede eliminar un proveedor con facturas o pagos, porque se perderian tus cuentas. Puedes archivarlo: desaparece de las listas pero su historial queda guardado.",
        detalle: `${s.invoices} factura(s) · ${ledger.filter((r) => r.kind === "pago").length} pago(s)`,
        textoSi: "Archivarlo",
        textoNo: "Cancelar",
      });
      if (ok && s.active) {
        const { error } = await supabase.rpc("set_supplier_active", { p_id: s.id, p_active: false });
        if (error) return notify.error("No se pudo archivar", error.message);
        notify.ok(`${s.name} archivado`);
        loadSuppliers();
      }
      return;
    }

    const ok = await confirmar({
      titulo: `¿Eliminar a ${s.name}?`,
      mensaje: "No tiene facturas ni pagos. Esta accion no se puede deshacer.",
      detalle:
        Number(s.products) > 0
          ? `Sus ${s.products} producto(s) quedaran sin proveedor asignado.`
          : undefined,
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_supplier_safe", { p_id: s.id });
    if (error) return notify.error("No se pudo eliminar", error.message);
    notify.ok(`${s.name} eliminado`);
    setCurrent("");
    loadSuppliers();
  }

  // ---------- formulario de factura ----------

  function openForm() {
    const s = suppliers.find((x) => x.id === current && x.active);
    setSupplierId(s?.id ?? "");
    setNumber("");
    setDate(today());
    setDueDate(s?.credit_days ? addDays(today(), s.credit_days) : "");
    setDiscount(String(s?.default_discount ?? 0));
    setFreight("0");
    setCustoms("0");
    setOther("0");
    setProrate(false);
    setShowExtras(false);
    setLines([{ ...emptyLine }]);
    setFormError(null);
    setShowForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 30);
  }

  async function cerrarForm() {
    const hayDatos = lines.some((l) => l.code.trim()) || number.trim();
    if (hayDatos) {
      const ok = await confirmar({
        titulo: "¿Descartar esta factura?",
        mensaje: "Lo que escribiste no se ha guardado.",
        textoSi: "Si, descartar",
        peligro: true,
      });
      if (!ok) return;
    }
    setShowForm(false);
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

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length === 1 ? [{ ...emptyLine }] : prev.filter((_, x) => x !== i)));
  }

  // ---------- navegacion con teclado ----------
  // Columnas: 0 codigo · 1 descripcion · 2 cantidad · 3 precio · 4 descuento

  const CELL_IDS = ["cod", "desc", "cant", "prec", "dto"];

  function focusCell(row: number, col: number) {
    focusEl(`${CELL_IDS[col]}-${row}`);
  }

  async function resolveCode(i: number, text: string) {
    const t = text.trim();
    if (!t) return false;
    const { data } = await supabase.rpc("search_products", { search_text: t });
    const hits = (data ?? []) as ProductHit[];
    if (hits.length === 0) return false;
    const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
    const p = hits.find((h) => norm(h.code) === norm(t)) ?? hits[0];
    setLine(i, {
      code: p.code,
      description: p.description,
      list_price: String(p.purchase_price ?? 0),
      previous_cost: p.cost != null ? Number(p.cost) : null,
      known: true,
    });
    setPickerRow(null);
    setHits([]);
    return true;
  }

  async function onCellKey(e: React.KeyboardEvent<HTMLInputElement>, i: number, col: number) {
    const last = lines.length - 1;

    if (e.key === "ArrowDown" && i < last) {
      e.preventDefault();
      return focusCell(i + 1, col);
    }
    if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      return focusCell(i - 1, col);
    }

    // Tab en la ultima celda de la ultima fila: abre una fila nueva
    if (e.key === "Tab" && !e.shiftKey && col === 4 && i === last) {
      e.preventDefault();
      addLine();
      return focusCell(i + 1, 0);
    }

    if (e.key !== "Enter") return;
    e.preventDefault();

    if (col === 0) {
      const ok = await resolveCode(i, lines[i].code);
      // si lo encontro, la descripcion y el precio ya estan: salta a cantidad
      return focusCell(i, ok ? 2 : 1);
    }
    if (col < 4) return focusCell(i, col + 1);

    // Enter en la ultima columna: siguiente fila (creandola si hace falta)
    if (i === last) addLine();
    return focusCell(i + 1, 0);
  }

  async function search(text: string) {
    setQuery(text);
    if (text.trim().length < 2) return setHits([]);
    const { data } = await supabase.rpc("search_products", { search_text: text.trim() });
    setHits(((data ?? []) as ProductHit[]).slice(0, 12));
  }

  function pick(p: ProductHit, row?: number) {
    const i = row ?? pickerRow;
    if (i == null) return;
    setLine(i, {
      code: p.code,
      description: p.description,
      list_price: String(p.purchase_price ?? 0),
      previous_cost: p.cost != null ? Number(p.cost) : null,
      known: true,
    });
    setPickerRow(null);
    setQuery("");
    setHits([]);
    focusEl(`cant-${i}`);
  }

  const computed = useMemo(() => {
    const gen = Number(discount) || 0;
    let subtotal = 0;
    const rows = lines.map((l) => {
      const qty = Number(l.quantity) || 0;
      const list = Number(l.list_price) || 0;
      const dto = l.discount_percent === "" ? gen : Number(l.discount_percent) || 0;
      const unit = list * (1 - dto / 100);
      const total = unit * qty;
      subtotal += total;
      return { unit, total, dto };
    });
    const extras = (Number(freight) || 0) + (Number(customs) || 0) + (Number(other) || 0);
    const factor = prorate && subtotal > 0 ? extras / subtotal : 0;
    const final = rows.map((r) => ({ ...r, unit: r.unit * (1 + factor) }));
    const risen = final.filter(
      (r, i) => lines[i].known && lines[i].previous_cost != null && r.unit > (lines[i].previous_cost ?? 0)
    ).length;
    const knownCount = lines.filter((l) => l.known && l.previous_cost != null).length;
    return { rows: final, subtotal, extras, total: subtotal + extras, risen, knownCount };
  }, [lines, discount, freight, customs, other, prorate]);

  async function saveInvoice() {
    if (!supplierId) return setFormError("Elige un proveedor.");
    const items = lines
      .filter((l) => l.code.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        code: l.code.trim(),
        description: l.description,
        quantity: l.quantity,
        list_price: l.list_price,
        discount_percent: l.discount_percent === "" ? String(Number(discount) || 0) : l.discount_percent,
      }));
    if (items.length === 0) return setFormError("Agrega al menos un repuesto.");

    setSaving(true);
    setFormError(null);
    const { data, error } = await supabase.rpc("create_purchase_invoice", {
      p_supplier_id: supplierId,
      p_number: number,
      p_date: date,
      p_due_date: dueDate || null,
      p_currency: "USD",
      p_discount: Number(discount) || 0,
      p_freight: Number(freight) || 0,
      p_customs: Number(customs) || 0,
      p_other: Number(other) || 0,
      p_prorate: prorate,
      p_items: items,
    });
    setSaving(false);
    if (error) {
      setFormError(
        error.message.includes("purchase_invoices_no_dup")
          ? "Ya registraste una factura con ese numero para este proveedor."
          : error.message
      );
      return;
    }
    const r = data as {
      total: number;
      costs_updated: number;
      costs_skipped: number;
      unknown_codes: number;
    };
    notify.ok(
      `Factura de ${money(r.total)} registrada`,
      `${r.costs_updated} costo(s) actualizado(s)` +
        (r.costs_skipped ? `, ${r.costs_skipped} sin tocar por ser factura anterior` : "") +
        (r.unknown_codes ? `, ${r.unknown_codes} codigo(s) no existen en Productos` : "") +
        "."
    );
    setShowForm(false);
    setCurrent(supplierId);
    loadSuppliers();
    loadLedger(supplierId);
  }

  // ---------- pagos ----------

  function abrirPago(factura: LedgerRow | null) {
    if (!necesitaProveedor("registrar un pago")) return;
    setPagoModal({ factura });
  }

  async function removeEntry(row: LedgerRow) {
    const pago = row.kind === "pago";
    const ok = await confirmar({
      titulo: pago ? "¿Eliminar este pago?" : `¿Eliminar la factura ${row.label}?`,
      mensaje: pago
        ? "El saldo del proveedor vuelve a subir por este monto."
        : "Se descuenta del inventario lo que entro con ella. Los costos ya aplicados a los productos no se revierten, y sus pagos quedan como pagos a cuenta.",
      detalle: `${fechaCorta(row.entry_date)} · ${money(Math.abs(Number(row.amount)))}`,
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;

    if (pago) {
      const { data, error } = await supabase.rpc("delete_supplier_payment", { p_id: row.id });
      if (error) return notify.error("No se pudo eliminar", error.message);
      const path = data as string | null;
      if (path) await supabase.storage.from("comprobantes").remove([path]);
    } else {
      const { error } = await supabase.rpc("delete_purchase_invoice", { p_id: row.id });
      if (error) return notify.error("No se pudo eliminar", error.message);
    }
    notify.ok(pago ? "Pago eliminado" : "Factura eliminada");
    refrescar();
  }

  // ---------- render ----------

  const bal = Number(currentSupplier?.balance ?? 0);

  return (
    <main className="p-6 max-w-[1180px]">
      {/* ---------- encabezado ---------- */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
            Facturas de compra
          </h1>
          <p className="text-[13px] text-gray-500">
            {activos.length} proveedores
            {totalDebt > 0 && (
              <>
                {" · "}
                <span className="text-amber-700">{money(totalDebt)} por pagar</span>
              </>
            )}
            {totalVencido > 0 && (
              <>
                {" · "}
                <span className="text-red-600">{money(totalVencido)} vencido</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ---------- barra de accesos directos ---------- */}
      <div className="mb-3 flex items-center gap-0.5 rounded-xl bg-white border border-gray-200 shadow-card px-1.5 py-1 overflow-x-auto">
        <ToolbarButton icon={FilePlus2} label="nueva factura" tone="brand" onClick={openForm} />
        <ToolbarButton
          icon={HandCoins}
          label="registrar pago"
          tone="success"
          onClick={() => abrirPago(null)}
        />
        <ToolbarSeparator />
        <ToolbarButton
          icon={UserPlus}
          label="nuevo proveedor"
          onClick={() => setProvModal({ id: null })}
        />
        <ToolbarButton
          icon={Pencil}
          label="editar proveedor"
          onClick={() => necesitaProveedor("editarlo") && setProvModal({ id: current })}
        />
        <ToolbarButton
          icon={currentSupplier && !currentSupplier.active ? ArchiveRestore : Archive}
          label={currentSupplier && !currentSupplier.active ? "reactivar" : "archivar"}
          onClick={archivar}
        />
        <ToolbarButton icon={Trash2} label="eliminar" tone="danger" onClick={eliminarProveedor} />
        <ToolbarSeparator />
        <ToolbarButton
          icon={Archive}
          label={verArchivados ? "ver activos" : `archivados (${archivados.length})`}
          active={verArchivados}
          onClick={() => setVerArchivados((v) => !v)}
        />
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ---------- formulario de factura ---------- */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
              <FilePlus2 size={17} className="text-brand-700" /> Registrar factura de compra
            </p>
            <button
              onClick={cerrarForm}
              aria-label="Cerrar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Proveedor</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  const s = suppliers.find((x) => x.id === e.target.value);
                  setSupplierId(e.target.value);
                  if (s) {
                    setDiscount(String(s.default_discount ?? 0));
                    setDueDate(s.credit_days ? addDays(date, s.credit_days) : "");
                  }
                }}
                className={inputCls}
              >
                <option value="">Elige...</option>
                {activos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Su numero de factura</label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Ej: 1-000241"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Vence</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 mb-3 flex-wrap">
            <span className="text-sm text-gray-600">Descuento general</span>
            <input
              type="number"
              min={0}
              max={99}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-20 h-8 border border-gray-300 rounded-lg px-2 text-sm text-right bg-white"
            />
            <span className="text-sm text-gray-500">%</span>
            <span className="text-xs text-gray-400">
              se aplica a las lineas que no tengan uno propio
            </span>
            <button
              onClick={() => setShowExtras((s) => !s)}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-brand-700"
            >
              <Truck size={14} />
              {showExtras ? "Ocultar gastos" : "Flete y aduana"}
            </button>
          </div>

          {showExtras && (
            <div className="border border-gray-200 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-3 gap-3 mb-3">
                {(
                  [
                    ["Flete", freight, setFreight],
                    ["Aduana", customs, setCustoms],
                    ["Otros gastos", other, setOther],
                  ] as [string, string, (v: string) => void][]
                ).map(([label, value, set]) => (
                  <div key={label}>
                    <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className={`${inputCls} text-right`}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 accent-brand-700"
                  checked={prorate}
                  onChange={(e) => setProrate(e.target.checked)}
                />
                <span>
                  Repartir estos gastos en el costo de cada repuesto
                  <span className="block text-xs text-gray-500">
                    Si lo dejas desmarcado, los gastos se suman al total de la factura pero el
                    costo de los productos queda solo con el precio del proveedor.
                  </span>
                </span>
              </label>
            </div>
          )}

          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-[11px] text-gray-400 text-left uppercase tracking-wide">
                <th className="font-medium py-1.5 w-40">Codigo</th>
                <th className="font-medium py-1.5">Descripcion</th>
                <th className="font-medium py-1.5 w-16 text-right">Cant</th>
                <th className="font-medium py-1.5 w-24 text-right">Precio lista</th>
                <th className="font-medium py-1.5 w-20 text-right">Dto</th>
                <th className="font-medium py-1.5 w-24 text-right">Total</th>
                <th className="font-medium py-1.5 w-28 text-right">Costo antes</th>
                <th className="font-medium py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const c = computed.rows[i];
                const prev = l.previous_cost;
                const up = prev != null && c && c.unit > prev;
                return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2">
                      <input
                        id={`cod-${i}`}
                        value={l.code}
                        onFocus={() => setPickerRow(i)}
                        onChange={(e) => {
                          setLine(i, { code: e.target.value, known: false, previous_cost: null });
                          setPickerRow(i);
                          search(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && hits.length > 0 && pickerRow === i) {
                            e.preventDefault();
                            pick(hits[0], i);
                            return;
                          }
                          onCellKey(e, i, 0);
                        }}
                        placeholder="codigo..."
                        className={`w-full h-8 border rounded-md px-2 ${
                          l.known ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200"
                        }`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        id={`desc-${i}`}
                        value={l.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        onKeyDown={(e) => onCellKey(e, i, 1)}
                        className="w-full h-8 border border-gray-200 rounded-md px-2"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        id={`cant-${i}`}
                        value={l.quantity}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        onKeyDown={(e) => onCellKey(e, i, 2)}
                        className="w-full h-8 border border-gray-200 rounded-md px-2 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        id={`prec-${i}`}
                        value={l.list_price}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setLine(i, { list_price: e.target.value })}
                        onKeyDown={(e) => onCellKey(e, i, 3)}
                        className="w-full h-8 border border-gray-200 rounded-md px-2 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        id={`dto-${i}`}
                        value={l.discount_percent}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setLine(i, { discount_percent: e.target.value })}
                        onKeyDown={(e) => onCellKey(e, i, 4)}
                        placeholder={discount}
                        className="w-full h-8 border border-gray-200 rounded-md px-2 text-right"
                      />
                    </td>
                    <td className="py-1.5 text-right">{money(c?.total ?? 0)}</td>
                    <td className={`py-1.5 text-right ${up ? "text-red-600" : "text-emerald-700"}`}>
                      {prev == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 justify-end">
                          {money(prev)}
                          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => removeLine(i)}
                        aria-label="Quitar linea"
                        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pickerRow != null && hits.length > 0 && (
            <div className="border border-brand-100 bg-brand-50/40 rounded-lg mb-3 max-h-56 overflow-y-auto">
              {hits.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-brand-100/60 last:border-0"
                >
                  <span className="text-gray-400 text-xs mr-2 font-mono">{p.code}</span>
                  {p.description}
                  <span className="text-gray-400 text-xs ml-2">
                    lista {money(Number(p.purchase_price ?? 0))} · costo{" "}
                    {money(Number(p.cost ?? 0))}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => {
                addLine();
                focusCell(lines.length, 0);
              }}
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-brand-700"
            >
              <Plus size={14} /> Agregar linea
            </button>
            <span className="text-[11px] text-gray-400">
              Enter avanza de campo y abre la linea siguiente · Tab tambien · ↑ ↓ cambian de fila
            </span>
          </div>

          {computed.knownCount > 0 && (
            <div
              className={`rounded-lg px-3 py-2 mb-4 text-xs ${
                computed.risen > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {computed.risen > 0
                ? `${computed.risen} de ${computed.knownCount} repuestos te quedan mas caros que antes. Revisa si hay que subir el precio de venta.`
                : "Ningun costo sube con esta factura."}
            </div>
          )}

          {formError && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex items-end justify-between border-t border-gray-200 pt-3">
            <div className="text-xs text-gray-500">
              Subtotal {money(computed.subtotal)}
              {computed.extras > 0 && ` · gastos ${money(computed.extras)}`}
              {computed.extras > 0 && !prorate && (
                <span className="text-amber-700"> (no se reparten en el costo)</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-gray-900">{money(computed.total)}</span>
              <button
                onClick={cerrarForm}
                className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={saveInvoice}
                disabled={saving}
                className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
              >
                {saving ? "Guardando..." : "Guardar y actualizar costos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- proveedores + linea de tiempo ---------- */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden flex min-h-[420px]">
        {/* lista de proveedores */}
        <aside className="w-[250px] shrink-0 border-r border-gray-100 bg-gray-50/40 flex flex-col">
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={buscaProv}
                onChange={(e) => setBuscaProv(e.target.value)}
                placeholder="Buscar proveedor"
                className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[13px] bg-white"
              />
            </div>
            {verArchivados && (
              <p className="text-[11px] text-gray-500 mt-2 px-0.5">
                Viendo archivados ·{" "}
                <button
                  onClick={() => setVerArchivados(false)}
                  className="text-brand-700 hover:underline"
                >
                  volver
                </button>
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {loading && <SkeletonRows rows={5} />}
            {listaProv.map((s) => {
              const on = s.id === current;
              const b = Number(s.balance);
              const venc = Number(s.overdue);
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrent(s.id)}
                  className={`block w-full text-left rounded-lg px-2.5 py-2 mb-0.5 ${
                    on ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-white"
                  }`}
                >
                  <span
                    className={`block text-[13px] truncate ${
                      on ? "text-brand-900 font-medium" : "text-gray-800"
                    } ${!s.active ? "text-gray-400" : ""}`}
                  >
                    {s.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11.5px]">
                    {b > 0.005 ? (
                      <span className="text-amber-700">{money(b)}</span>
                    ) : (
                      <span className="text-gray-400">al dia</span>
                    )}
                    {venc > 0.005 && <span className="text-red-600">· vencido</span>}
                  </span>
                </button>
              );
            })}
            {!loading && listaProv.length === 0 && (
              <p className="text-xs text-gray-400 p-3">
                {verArchivados
                  ? "No hay proveedores archivados."
                  : buscaProv
                  ? "Ningun proveedor coincide."
                  : "Aun no hay proveedores."}
              </p>
            )}
          </div>
        </aside>

        {/* detalle del proveedor */}
        <section className="flex-1 min-w-0">
          {!currentSupplier ? (
            <EmptyState
              icon={Building2}
              title={suppliers.length === 0 ? "Registra tu primer proveedor" : "Elige un proveedor"}
              action={
                suppliers.length === 0 ? (
                  <button
                    onClick={() => setProvModal({ id: null })}
                    className="h-9 px-4 bg-brand-700 text-white text-sm rounded-lg hover:bg-brand-800"
                  >
                    Nuevo proveedor
                  </button>
                ) : undefined
              }
            >
              Aqui veras sus facturas, lo que le has pagado y cuanto le debes.
            </EmptyState>
          ) : (
            <>
              {/* cabecera del proveedor */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[17px] font-semibold text-gray-900 truncate">
                        {currentSupplier.name}
                      </h2>
                      {!currentSupplier.active && <Pill tone="neutral">Archivado</Pill>}
                      <button
                        onClick={() => setProvModal({ id: current })}
                        title="Editar proveedor"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-brand-700 hover:bg-brand-50"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                    <p className="text-[12px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {currentSupplier.tax_id && <span>RIF {currentSupplier.tax_id}</span>}
                      {currentSupplier.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} /> {currentSupplier.phone}
                        </span>
                      )}
                      {currentSupplier.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} /> {currentSupplier.email}
                        </span>
                      )}
                      {currentSupplier.contact && <span>{currentSupplier.contact}</span>}
                      <span>
                        {currentSupplier.credit_days > 0
                          ? `${currentSupplier.credit_days} dias de credito`
                          : "de contado"}
                        {Number(currentSupplier.default_discount) > 0 &&
                          ` · dto ${currentSupplier.default_discount}%`}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => abrirPago(null)}
                      className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                    >
                      <HandCoins size={15} /> Registrar pago
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[
                    { k: "Facturado", v: money(Number(currentSupplier.invoiced)), c: "text-gray-900" },
                    { k: "Pagado", v: money(Number(currentSupplier.paid)), c: "text-emerald-700" },
                    {
                      k: bal < -0.005 ? "A tu favor" : "Le debes",
                      v: money(Math.abs(bal)),
                      c: bal > 0.005 ? "text-amber-700" : "text-gray-500",
                    },
                    {
                      k: "Vencido",
                      v: money(Number(currentSupplier.overdue)),
                      c: Number(currentSupplier.overdue) > 0.005 ? "text-red-600" : "text-gray-400",
                    },
                  ].map((x) => (
                    <div key={x.k} className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-[11px] text-gray-500">{x.k}</p>
                      <p className={`text-[15px] font-semibold ${x.c}`}>{x.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* filtro de movimientos */}
              <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-100 text-[12px]">
                {(
                  [
                    ["todo", "Todo"],
                    ["factura", "Facturas"],
                    ["pago", "Pagos"],
                  ] as const
                ).map(([k, t]) => (
                  <button
                    key={k}
                    onClick={() => setFiltroMov(k)}
                    className={`h-7 px-2.5 rounded-md ${
                      filtroMov === k
                        ? "bg-brand-50 text-brand-700 font-medium"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <span className="ml-auto text-gray-400">
                  {currentSupplier.invoices} factura(s) · {currentSupplier.products} productos
                </span>
              </div>

              {/* movimientos */}
              {loadingLedger && ledger.length === 0 ? (
                <SkeletonRows rows={5} />
              ) : movimientos.length === 0 ? (
                <EmptyState icon={FileText} title="Sin movimientos">
                  Registra la primera factura de este proveedor con el boton{" "}
                  <b className="font-medium">nueva factura</b>.
                </EmptyState>
              ) : (
                <div>
                  {movimientos.map((r) => {
                    const pago = r.kind === "pago";
                    const est = pago ? null : estadoFactura(r);
                    const mon = monedaDe(r.currency_mode);
                    return (
                      <div
                        key={r.kind + r.id}
                        onDoubleClick={() => !pago && setFacturaVer(r.id)}
                        className="group flex items-center gap-3 px-5 h-12 border-b border-gray-100 last:border-0 hover:bg-gray-50/70"
                      >
                        <span className="text-[12px] text-gray-500 w-[74px] shrink-0">
                          {fechaCorta(r.entry_date)}
                        </span>
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            pago ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {pago ? <Wallet size={14} /> : <FileText size={14} />}
                        </span>

                        <div className="flex-1 min-w-0">
                          {pago ? (
                            <>
                              <p className="text-[13px] text-gray-800 truncate flex items-center gap-1.5">
                                {r.label}
                                <Pill tone={mon.tone}>{mon.label}</Pill>
                                {r.invoice_label && (
                                  <span className="text-[11px] text-gray-400">
                                    · factura {r.invoice_label}
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">
                                {r.currency_mode && r.currency_mode !== "USD"
                                  ? `${mon.simbolo} ${num(Number(r.amount_currency))} a tasa ${num(
                                      Number(r.exchange_rate)
                                    )}`
                                  : "en dolares"}
                                {r.reference && ` · ref ${r.reference}`}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[13px] text-gray-800 truncate flex items-center gap-1.5">
                                Factura {r.label}
                                {est && <Pill tone={est.tone}>{est.texto}</Pill>}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">
                                {r.items} articulos
                                {r.due_date && ` · vence ${fechaCorta(r.due_date)}`}
                                {Number(r.paid ?? 0) > 0.005 &&
                                  Number(r.pending ?? 0) > 0.005 &&
                                  ` · falta ${money(Number(r.pending))}`}
                              </p>
                            </>
                          )}
                        </div>

                        {/* acciones de la fila */}
                        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                          {pago && r.receipt_path && (
                            <IconBtn
                              title="Ver comprobante"
                              onClick={() => verComprobante(r.receipt_path as string)}
                            >
                              <Paperclip size={14} />
                            </IconBtn>
                          )}
                          {!pago && (
                            <IconBtn title="Ver factura" onClick={() => setFacturaVer(r.id)}>
                              <Eye size={14} />
                            </IconBtn>
                          )}
                          {!pago && Number(r.pending ?? 0) > 0.005 && (
                            <IconBtn title="Pagar esta factura" tone="success" onClick={() => abrirPago(r)}>
                              <HandCoins size={14} />
                            </IconBtn>
                          )}
                          <IconBtn title="Eliminar" tone="danger" onClick={() => removeEntry(r)}>
                            <Trash2 size={14} />
                          </IconBtn>
                        </div>

                        <span
                          className={`text-[13px] whitespace-nowrap w-24 text-right font-medium ${
                            pago ? "text-emerald-700" : "text-gray-900"
                          }`}
                        >
                          {pago ? "−" : "+"}
                          {money(Math.abs(Number(r.amount)))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {provModal && (
        <ProveedorModal
          id={provModal.id}
          onClose={() => setProvModal(null)}
          onSaved={(id) => {
            setProvModal(null);
            setCurrent(id);
            loadSuppliers();
          }}
        />
      )}

      {pagoModal && currentSupplier && (
        <PagoModal
          supplier={currentSupplier}
          factura={pagoModal.factura}
          pendientes={facturasPendientes}
          onClose={() => setPagoModal(null)}
          onSaved={() => {
            setPagoModal(null);
            refrescar();
          }}
        />
      )}

      {facturaVer && (
        <FacturaModal
          id={facturaVer}
          onClose={() => setFacturaVer(null)}
          onPagar={() => {
            const r = ledger.find((x) => x.id === facturaVer && x.kind === "factura") ?? null;
            setFacturaVer(null);
            abrirPago(r);
          }}
        />
      )}
    </main>
  );
}

/* ============================================================
   Boton pequeño de fila
   ============================================================ */

function IconBtn({
  children,
  title,
  onClick,
  tone = "neutral",
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  tone?: "neutral" | "success" | "danger";
}) {
  const t =
    tone === "success"
      ? "hover:text-emerald-700 hover:bg-emerald-50"
      : tone === "danger"
      ? "hover:text-red-600 hover:bg-red-50"
      : "hover:text-brand-700 hover:bg-brand-50";
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center text-gray-400 ${t}`}
    >
      {children}
    </button>
  );
}

/* ============================================================
   Ventana base (centrada, como la ficha de Notas)
   ============================================================ */

function Ventana({
  titulo,
  subtitulo,
  icono: Icono,
  ancho = "max-w-lg",
  onClose,
  children,
  pie,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  icono: typeof FileText;
  ancho?: string;
  onClose: () => void;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${ancho} max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Icono size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-gray-900 truncate">{titulo}</h2>
            {subtitulo && <div className="text-[12px] text-gray-500">{subtitulo}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {pie && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-end gap-2">
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ============================================================
   Crear / editar proveedor
   ============================================================ */

type SupplierDetail = {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  contact: string | null;
  notes: string | null;
  credit_days: number;
  default_discount: number;
  currency: string;
  active: boolean;
  facturas: number;
  pagos: number;
  pedidos: number;
  productos: number;
};

function ProveedorModal({
  id,
  onClose,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState({
    name: "",
    tax_id: "",
    phone: "",
    email: "",
    contact: "",
    notes: "",
    credit_days: 0,
    default_discount: 0,
  });
  const [det, setDet] = useState<SupplierDetail | null>(null);
  const [cargando, setCargando] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_supplier", { p_id: id }).then(({ data, error }) => {
      setCargando(false);
      if (error) return setErr(error.message);
      const d = data as SupplierDetail;
      setDet(d);
      setF({
        name: d.name ?? "",
        tax_id: d.tax_id ?? "",
        phone: d.phone ?? "",
        email: d.email ?? "",
        contact: d.contact ?? "",
        notes: d.notes ?? "",
        credit_days: Number(d.credit_days) || 0,
        default_discount: Number(d.default_discount) || 0,
      });
    });
  }, [id]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((x) => ({ ...x, [k]: v }));
  }

  async function guardar() {
    if (!f.name.trim()) return setErr("El proveedor necesita un nombre.");
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("save_supplier", {
      p_id: id,
      p_name: f.name.trim(),
      p_tax_id: f.tax_id,
      p_phone: f.phone,
      p_email: f.email,
      p_contact: f.contact,
      p_notes: f.notes,
      p_credit_days: Math.round(f.credit_days),
      p_default_discount: f.default_discount,
      p_currency: det?.currency ?? "USD",
    });
    setBusy(false);
    if (error) return setErr(error.message);
    notify.ok(id ? "Proveedor actualizado" : "Proveedor registrado", f.name.trim());
    onSaved(data as string);
  }

  return (
    <Ventana
      titulo={id ? "Editar proveedor" : "Nuevo proveedor"}
      subtitulo={
        det
          ? `${det.facturas} facturas · ${det.pagos} pagos · ${det.pedidos} pedidos · ${det.productos} productos`
          : "Los datos se pueden cambiar cuando quieras"
      }
      icono={id ? Pencil : UserPlus}
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={busy || cargando || !f.name.trim()}
            className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
          >
            {busy ? "Guardando..." : id ? "Guardar cambios" : "Registrar proveedor"}
          </button>
        </>
      }
    >
      {cargando ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre o razon social" className="col-span-2">
              <input
                autoFocus
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
              />
            </Campo>
            <Campo label="RIF">
              <input
                value={f.tax_id}
                onChange={(e) => set("tax_id", e.target.value)}
                placeholder="J-12345678-9"
                className={inputCls}
              />
            </Campo>
            <Campo label="Telefono">
              <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Correo">
              <input value={f.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Persona de contacto">
              <input value={f.contact} onChange={(e) => set("contact", e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Dias de credito">
              <NumInput
                value={f.credit_days}
                onChange={(n) => set("credit_days", n)}
                className={`${inputCls} text-right`}
              />
            </Campo>
            <Campo label="Descuento habitual %">
              <NumInput
                value={f.default_discount}
                onChange={(n) => set("default_discount", n)}
                className={`${inputCls} text-right`}
              />
            </Campo>
            <Campo label="Notas (cuentas bancarias, Zelle, horarios...)" className="col-span-2">
              <textarea
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm resize-none"
              />
            </Campo>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Los dias de credito calculan solos la fecha de vencimiento, y el descuento habitual
            viene puesto por defecto en cada factura de este proveedor.
          </p>
          {err && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {err}
            </div>
          )}
        </>
      )}
    </Ventana>
  );
}

/* ============================================================
   Registrar pago a proveedor
   ============================================================ */

function PagoModal({
  supplier,
  factura,
  pendientes,
  onClose,
  onSaved,
}: {
  supplier: SupplierRow;
  factura: LedgerRow | null;
  pendientes: LedgerRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [facturaId, setFacturaId] = useState<string>(factura?.id ?? "");
  const [fecha, setFecha] = useState(today());
  const [metodo, setMetodo] = useState("Zelle");
  const [mon, setMon] = useState("USD");
  const [monto, setMonto] = useState<number>(
    factura ? Number(factura.pending ?? factura.amount) : Math.max(Number(supplier.balance), 0)
  );
  const [tasa, setTasa] = useState<number>(0);
  const [refe, setRefe] = useState("");
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const elegida = pendientes.find((p) => p.id === facturaId) ?? (factura?.id === facturaId ? factura : null);
  const deuda = elegida ? Number(elegida.pending ?? 0) : Math.max(Number(supplier.balance), 0);

  // vista previa de la foto
  useEffect(() => {
    if (!archivo || !archivo.type.startsWith("image/")) {
      setVista(null);
      return;
    }
    const u = URL.createObjectURL(archivo);
    setVista(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);

  function elegirMetodo(k: string) {
    setMetodo(k);
    const m = METODOS.find((x) => x.key === k);
    if (m?.moneda) cambiarMoneda(m.moneda);
  }

  function cambiarMoneda(k: string) {
    if (k === mon) return;
    // si el monto venia en dolares, lo pasamos a la otra moneda con la tasa si ya existe
    setMon(k);
    if (k === "USD") setMonto(deuda);
    else setMonto(tasa > 0 ? Math.round(deuda * tasa * 100) / 100 : 0);
  }

  function elegirFactura(id: string) {
    setFacturaId(id);
    const f = pendientes.find((p) => p.id === id);
    const d = f ? Number(f.pending ?? 0) : Math.max(Number(supplier.balance), 0);
    if (mon === "USD") setMonto(d);
    else if (tasa > 0) setMonto(Math.round(d * tasa * 100) / 100);
  }

  const equivale = mon === "USD" ? monto : tasa > 0 ? monto / tasa : 0;
  const quedaria = deuda - equivale;

  async function guardar() {
    setErr(null);
    if (!(monto > 0)) return setErr("Escribe el monto que pagaste.");
    if (mon !== "USD" && !(tasa > 0)) return setErr("Falta la tasa de cambio.");
    setBusy(true);

    let path: string | null = null;
    if (archivo) {
      try {
        path = await subirComprobante(supplier.id, archivo);
      } catch (e) {
        setBusy(false);
        const ok = await confirmar({
          titulo: "No se pudo subir la foto",
          mensaje: "¿Quieres guardar el pago sin el comprobante? Lo puedes volver a registrar despues.",
          detalle: e instanceof Error ? e.message : undefined,
          textoSi: "Guardar sin foto",
        });
        if (!ok) return;
        setBusy(true);
      }
    }

    const { error } = await supabase.rpc("register_supplier_payment", {
      p_supplier_id: supplier.id,
      p_invoice_id: facturaId || null,
      p_date: fecha,
      p_currency_mode: mon,
      p_amount_currency: monto,
      p_exchange_rate: mon === "USD" ? null : tasa,
      p_method: metodo,
      p_reference: refe,
      p_notes: nota,
      p_receipt_path: path,
    });
    setBusy(false);
    if (error) {
      if (path) await supabase.storage.from("comprobantes").remove([path]);
      return setErr(error.message);
    }
    notify.ok(`Pago de ${money(equivale)} registrado`, supplier.name);
    onSaved();
  }

  const m = monedaDe(mon);

  return (
    <Ventana
      titulo="Registrar pago"
      subtitulo={
        <>
          {supplier.name} · le debes{" "}
          <b className="font-medium text-amber-700">{money(Math.max(Number(supplier.balance), 0))}</b>
        </>
      }
      icono={HandCoins}
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={busy}
            className="h-9 px-4 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 shadow-sm disabled:opacity-40"
          >
            {busy ? "Guardando..." : "Guardar pago"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Aplicar a" className="col-span-2">
          <select value={facturaId} onChange={(e) => elegirFactura(e.target.value)} className={inputCls}>
            <option value="">A cuenta (sin factura especifica)</option>
            {pendientes.map((p) => (
              <option key={p.id} value={p.id}>
                Factura {p.label} · {fechaCorta(p.entry_date)} · falta {money(Number(p.pending ?? 0))}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Forma de pago" className="col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {METODOS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => elegirMetodo(x.key)}
                className={`h-8 px-2.5 rounded-lg text-[12.5px] border ${
                  metodo === x.key
                    ? "border-brand-300 bg-brand-50 text-brand-800 font-medium"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {x.key}
              </button>
            ))}
          </div>
        </Campo>

        <Campo label="Moneda en que pagaste" className="col-span-2">
          <div role="radiogroup" className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-gray-100">
            {MONEDAS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={mon === x.key}
                onClick={() => cambiarMoneda(x.key)}
                className={`h-8 rounded-md text-[12.5px] ${
                  mon === x.key ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </Campo>

        <Campo label={`Monto pagado (${m.simbolo})`}>
          <NumInput value={monto} onChange={setMonto} className={`${inputCls} text-right`} />
        </Campo>
        <Campo label={mon === "USD" ? "Tasa (no aplica)" : `Tasa (${m.simbolo} por dolar)`}>
          <NumInput
            value={mon === "USD" ? null : tasa}
            onChange={(n) => {
              setTasa(n);
            }}
            disabled={mon === "USD"}
            className={`${inputCls} text-right disabled:bg-gray-50`}
          />
        </Campo>

        <Campo label="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Referencia / numero de operacion">
          <input value={refe} onChange={(e) => setRefe(e.target.value)} className={inputCls} />
        </Campo>

        <Campo label="Nota (opcional)" className="col-span-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} />
        </Campo>

        <Campo label="Comprobante (foto o PDF)" className="col-span-2">
          {archivo ? (
            <div className="flex items-center gap-3 p-2 rounded-lg border border-gray-200">
              {vista ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vista} alt="Comprobante" className="w-14 h-14 rounded-md object-cover" />
              ) : (
                <span className="w-14 h-14 rounded-md bg-gray-100 flex items-center justify-center text-gray-400">
                  <FileText size={20} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-gray-800 truncate">{archivo.name}</p>
                <p className="text-[11px] text-gray-400">
                  {(archivo.size / 1024 / 1024).toFixed(1)} MB · se reduce al subir
                </p>
              </div>
              <button
                onClick={() => setArchivo(null)}
                aria-label="Quitar comprobante"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 h-16 rounded-lg border border-dashed border-gray-300 text-[13px] text-gray-500 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50/40 cursor-pointer">
              <Upload size={16} /> Subir captura o foto del pago
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </Campo>
      </div>

      {monto > 0 && (mon === "USD" || tasa > 0) && (
        <div
          className={`mt-3 p-2.5 rounded-lg text-sm ${
            quedaria < -0.005 ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {mon !== "USD" && (
            <>
              Equivale a <b className="font-medium">{money(equivale)}</b>.{" "}
            </>
          )}
          {quedaria > 0.005 ? (
            <>
              {elegida ? "La factura" : "La deuda"} quedaria en{" "}
              <b className="font-medium">{money(quedaria)}</b>
            </>
          ) : quedaria < -0.005 ? (
            <>
              Pagas <b className="font-medium">{money(-quedaria)}</b> de mas: queda a tu favor
            </>
          ) : (
            <>{elegida ? "La factura queda pagada completa" : "Quedas al dia con este proveedor"}</>
          )}
        </div>
      )}

      {err && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}
    </Ventana>
  );
}

/* ============================================================
   Ver una factura de compra
   ============================================================ */

type InvoiceDetail = {
  invoice: {
    id: string;
    supplier_invoice_number: string | null;
    invoice_date: string;
    due_date: string | null;
    discount_percent: number;
    freight: number;
    customs: number;
    other_costs: number;
    prorate_extras: boolean;
    subtotal: number;
    total: number;
  };
  supplier: string;
  items: {
    id: string;
    code_snapshot: string;
    description_snapshot: string;
    quantity: number;
    list_price: number;
    discount_percent: number;
    unit_cost: number;
    line_total: number;
    previous_cost: number | null;
  }[];
  paid: number;
};

function FacturaModal({
  id,
  onClose,
  onPagar,
}: {
  id: string;
  onClose: () => void;
  onPagar: () => void;
}) {
  const [d, setD] = useState<InvoiceDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_purchase_invoice", { p_id: id }).then(({ data, error }) => {
      if (error) return setErr(error.message);
      setD(data as InvoiceDetail);
    });
  }, [id]);

  const inv = d?.invoice;
  const pendiente = inv ? Math.max(Number(inv.total) - Number(d?.paid ?? 0), 0) : 0;
  const gastos = inv ? Number(inv.freight) + Number(inv.customs) + Number(inv.other_costs) : 0;

  return (
    <Ventana
      titulo={inv ? `Factura ${inv.supplier_invoice_number || "sin numero"}` : "Factura"}
      subtitulo={
        inv ? (
          <span className="inline-flex items-center gap-1.5">
            {d?.supplier} · <CalendarDays size={12} /> {fechaCorta(inv.invoice_date)}
            {inv.due_date && ` · vence ${fechaCorta(inv.due_date)}`}
          </span>
        ) : undefined
      }
      icono={FileText}
      ancho="max-w-3xl"
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cerrar
          </button>
          {pendiente > 0.005 && (
            <button
              onClick={onPagar}
              className="h-9 px-4 inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 shadow-sm"
            >
              <HandCoins size={15} /> Pagar {money(pendiente)}
            </button>
          )}
        </>
      }
    >
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!d && !err && <SkeletonRows rows={5} />}
      {d && inv && (
        <>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] text-gray-400 text-left uppercase tracking-wide">
                <th className="font-medium py-1.5 w-32">Codigo</th>
                <th className="font-medium py-1.5">Descripcion</th>
                <th className="font-medium py-1.5 w-14 text-right">Cant</th>
                <th className="font-medium py-1.5 w-20 text-right">Lista</th>
                <th className="font-medium py-1.5 w-14 text-right">Dto</th>
                <th className="font-medium py-1.5 w-20 text-right">Costo</th>
                <th className="font-medium py-1.5 w-24 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((x) => {
                const sube = x.previous_cost != null && Number(x.unit_cost) > Number(x.previous_cost);
                return (
                  <tr key={x.id} className="border-t border-gray-100">
                    <td className="py-1.5 font-mono text-[11.5px] text-gray-500">{x.code_snapshot}</td>
                    <td className="py-1.5 text-gray-800">{x.description_snapshot}</td>
                    <td className="py-1.5 text-right">{Number(x.quantity)}</td>
                    <td className="py-1.5 text-right">{num(Number(x.list_price))}</td>
                    <td className="py-1.5 text-right text-gray-500">{Number(x.discount_percent)}%</td>
                    <td className={`py-1.5 text-right ${sube ? "text-red-600" : ""}`}>
                      {num(Number(x.unit_cost))}
                    </td>
                    <td className="py-1.5 text-right font-medium">{num(Number(x.line_total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 ml-auto w-64 text-[13px] space-y-1">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{money(Number(inv.subtotal))}</span>
            </div>
            {gastos > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Flete, aduana y otros{inv.prorate_extras ? " (repartidos)" : ""}</span>
                <span>{money(gastos)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1">
              <span>Total</span>
              <span>{money(Number(inv.total))}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Pagado</span>
              <span>{money(Number(d.paid))}</span>
            </div>
            <div className={`flex justify-between ${pendiente > 0.005 ? "text-amber-700" : "text-gray-400"}`}>
              <span>Falta</span>
              <span>{money(pendiente)}</span>
            </div>
          </div>
        </>
      )}
    </Ventana>
  );
}
