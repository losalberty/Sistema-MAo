"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FilePlus2,
  Filter,
  HandCoins,
  Inbox,
  Link2,
  MessageCircle,
  PanelRight,
  Pencil,
  Phone,
  Printer,
  ScanSearch,
  Search,
  Trash2,
  TrendingUp,
  Undo2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import ClientePicker, { type ClienteHit } from "@/components/ClientePicker";
import { EmptyState, NumInput, Pill, SkeletonRows, confirmar, notify, type PillTone } from "@/components/ui";
import { descargarExcel } from "@/components/Ventana";
import { colorDe, iniciales } from "@/components/Paleta";
import { tasaPara, useTasas } from "@/components/Tasas";

type NoteRow = {
  id: string;
  sequence_number: number;
  client_id: string | null;
  display_name: string;
  note_date: string;
  currency_mode: string;
  exchange_rate: number | null;
  exchange_gap_percent: number | null;
  subtotal: number;
  discount: number;
  total: number;
  total_cost: number;
  payment_status: string;
  due_date: string | null;
  paid_usd: number;
  pending_usd: number;
  payments_count: number;
  effective_status: string;
  days_overdue: number;
  returned_usd: number;
  credit_usd: number;
  created_at: string;
};

type Payment = {
  id: string;
  payment_date: string;
  currency_mode: string;
  amount_currency: number;
  exchange_rate: number | null;
  amount_usd: number;
  method: string | null;
  reference: string | null;
  voided: boolean;
};

type Collection = {
  total: number;
  returned: number;
  neto: number;
  credit: number;
  paid: number;
  pending: number;
  currency_mode: string;
  exchange_rate: number | null;
  display_name: string;
  sequence_number: number;
  payments: Payment[];
};

type Linea = {
  note_id: string;
  sequence_number: number;
  note_date: string;
  currency_mode: string;
  display_name: string;
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Busqueda = {
  unidades: number;
  notas: number;
  lineas_count: number;
  total_usd: number;
  primera_fecha: string | null;
  ultima_fecha: string | null;
  ultimo_precio: number | null;
  por_mes: { mes: string; unidades: number; total: number }[];
  lineas: Linea[];
};

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS_LARGOS = [
  "domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado",
];

const DIAS_CORTOS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

type Moneda = {
  key: string;
  label: string;
  largo: string;
  pill: string;
  corto: string;
};

const MONEDAS: Moneda[] = [
  { key: "USD", label: "dolares", largo: "dolares", pill: "bg-emerald-50 text-emerald-800", corto: "USD" },
  { key: "COP", label: "pesos", largo: "pesos colombianos", pill: "bg-violet-50 text-violet-800", corto: "COP" },
  { key: "BS_BINANCE", label: "Bs Binance", largo: "bolivares tasa Binance", pill: "bg-amber-50 text-amber-800", corto: "Bs" },
  { key: "BS_BCV", label: "Bs BCV", largo: "bolivares tasa BCV", pill: "bg-blue-50 text-blue-800", corto: "Bs" },
];

const ESTADOS = [
  { key: "PENDIENTE", label: "pendientes" },
  { key: "ABONADA", label: "abonadas" },
  { key: "COBRADO", label: "cobradas" },
  { key: "ANULADO", label: "anuladas" },
];

function moneda(mode: string): Moneda {
  return MONEDAS.find((m) => m.key === mode) ?? MONEDAS[0];
}

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function miles(n: number) {
  return Math.round(n ?? 0).toLocaleString("en-US");
}

function effectiveRate(mode: string, rate: number | null, gap: number | null) {
  if (mode === "BS_BCV") return (rate ?? 0) * (1 + (gap ?? 0) / 100);
  return rate ?? 0;
}

function fechaLarga(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}

/* ================= estado de cobro de una nota, en una pastilla ================= */

function estadoDe(n: NoteRow): { tone: PillTone; texto: string } {
  if (n.effective_status === "ANULADO") return { tone: "neutral", texto: "anulada" };
  if (n.effective_status === "COBRADO") return { tone: "success", texto: "cobrada" };
  if (n.days_overdue > 0) return { tone: "danger", texto: `vencida ${n.days_overdue}d` };
  if (n.effective_status === "ABONADA") return { tone: "warning", texto: "abonada" };
  return { tone: "neutral", texto: "pendiente" };
}

const TONO_MONEDA: Record<string, PillTone> = {
  USD: "success",
  COP: "violet",
  BS_BINANCE: "warning",
  BS_BCV: "sky",
};

const POR_PAGINA = 200;

type Vista = "TODAS" | "PENDIENTE" | "VENCIDA" | "ABONADA" | "COBRADO" | "ANULADO";

const VISTAS: { k: Vista; l: string }[] = [
  { k: "TODAS", l: "Todas" },
  { k: "PENDIENTE", l: "Pendientes" },
  { k: "VENCIDA", l: "Vencidas" },
  { k: "ABONADA", l: "Abonadas" },
  { k: "COBRADO", l: "Cobradas" },
  { k: "ANULADO", l: "Anuladas" },
];

// en que pestaña cae cada nota (una sola)
function vistaDe(n: NoteRow): Vista {
  if (n.effective_status === "ANULADO") return "ANULADO";
  if (n.effective_status === "COBRADO") return "COBRADO";
  if (n.days_overdue > 0) return "VENCIDA";
  if (n.effective_status === "ABONADA") return "ABONADA";
  return "PENDIENTE";
}

type Orden = { k: "num" | "fecha" | "cliente" | "total"; dir: 1 | -1 };

// la pagina va envuelta en Suspense porque lee la direccion (?nota=... desde el buscador)
export default function NotasPage() {
  return (
    <Suspense fallback={null}>
      <Notas />
    </Suspense>
  );
}

function Notas() {
  const router = useRouter();
  const params = useSearchParams();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [year, setYear] = useState<string>("");
  const [month, setMonth] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>("TODAS");
  const [monedas, setMonedas] = useState<Set<string>>(new Set());
  const [verMonedas, setVerMonedas] = useState(false);
  const [orden, setOrden] = useState<Orden>({ k: "fecha", dir: -1 });
  const [verGanancia, setVerGanancia] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dragging = useRef(false);
  const dragAdds = useRef(true);

  const [panel, setPanel] = useState<{ id: string; abonar: boolean } | null>(null);
  const [devolverId, setDevolverId] = useState<string | null>(null);
  const [showBuscar, setShowBuscar] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);

  // cuadro negro de informacion rapida
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // años que tienen notas (consulta liviana: solo cuenta)
  const [anios, setAnios] = useState<string[]>([]);
  // cuantas filas se dibujan a la vez (el resto con "mostrar mas")
  const [visibles, setVisibles] = useState(POR_PAGINA);

  // 1) al abrir: averiguar los años y quedarse en el actual
  useEffect(() => {
    (async () => {
      const actual = String(new Date().getFullYear());
      const { data, error } = await supabase.rpc("notes_years");
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const lista = ((data ?? []) as { anio: number }[]).map((r) => String(r.anio));
      if (!lista.includes(actual)) lista.unshift(actual);
      lista.sort().reverse();
      setAnios(lista);
      setYear(actual);
    })();
  }, []);

  // 2) solo se descarga el año que estas mirando, no toda la historia
  const load = useCallback(async () => {
    if (!year) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("list_notes_rango", {
      p_desde: `${year}-01-01`,
      p_hasta: `${year}-12-31`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setNotes((data ?? []) as NoteRow[]);
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  // el buscador universal y la campanita llegan aqui con ?nota=ID
  useEffect(() => {
    const id = params.get("nota");
    if (!id) return;
    setPanel({ id, abonar: params.get("abonar") === "1" });
    router.replace("/notas");
  }, [params, router]);

  useEffect(() => {
    function up() {
      dragging.current = false;
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // la tecla / pone el cursor en el buscador
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"] *)')) return;
      e.preventDefault();
      buscador.current?.focus();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // el cuadro negro se esconde si la pagina se mueve
  useEffect(() => {
    function ocultar() {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setHover(null);
    }
    window.addEventListener("scroll", ocultar, true);
    window.addEventListener("resize", ocultar);
    return () => {
      window.removeEventListener("scroll", ocultar, true);
      window.removeEventListener("resize", ocultar);
    };
  }, []);

  async function handleDelete(id: string) {
    const n = notes.find((x) => x.id === id);
    const ok = await confirmar({
      titulo: n ? `¿Eliminar la nota #${n.sequence_number}?` : "¿Eliminar esta nota?",
      mensaje: "Esta accion no se puede deshacer.",
      detalle: n ? `${n.display_name} · $${money(n.total)}` : undefined,
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_note", { p_note_id: id });
    if (error) {
      notify.error("No se pudo eliminar", error.message);
      return;
    }
    setNotes((prev) => prev.filter((x) => x.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPanel(null);
    notify.ok(n ? `Nota #${n.sequence_number} eliminada` : "Nota eliminada");
  }

  function setSel(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // ---------- filtros ----------
  const delAnio = useMemo(
    () => notes.filter((n) => !year || n.note_date.slice(0, 4) === year),
    [notes, year]
  );

  // las notas del periodo marcado (mes o trimestre), antes de pestañas y buscador
  const delPeriodo = useMemo(() => {
    if (month !== null) return delAnio.filter((n) => Number(n.note_date.slice(5, 7)) - 1 === month);
    if (quarter !== null)
      return delAnio.filter((n) => Math.floor((Number(n.note_date.slice(5, 7)) - 1) / 3) === quarter);
    return delAnio;
  }, [delAnio, month, quarter]);

  const conteo = useMemo(() => {
    const c: Record<Vista, number> = { TODAS: 0, PENDIENTE: 0, VENCIDA: 0, ABONADA: 0, COBRADO: 0, ANULADO: 0 };
    for (const n of delPeriodo) {
      const v = vistaDe(n);
      c[v]++;
      if (v !== "ANULADO") c.TODAS++;
    }
    return c;
  }, [delPeriodo]);

  const filtered = useMemo(() => {
    let list =
      vista === "TODAS"
        ? delPeriodo.filter((n) => n.effective_status !== "ANULADO")
        : delPeriodo.filter((n) => vistaDe(n) === vista);
    if (monedas.size > 0) list = list.filter((n) => monedas.has(n.currency_mode));
    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/^#/, "");
      list = list.filter(
        (n) => n.display_name.toLowerCase().includes(q) || String(n.sequence_number).includes(q)
      );
    }
    const val = (n: NoteRow) =>
      orden.k === "num"
        ? n.sequence_number
        : orden.k === "fecha"
        ? n.note_date + String(n.sequence_number).padStart(9, "0")
        : orden.k === "cliente"
        ? n.display_name.toLowerCase()
        : n.total;
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * orden.dir);
  }, [delPeriodo, vista, monedas, search, orden]);

  // al cambiar el filtro se vuelve a mostrar solo la primera tanda
  useEffect(() => {
    setVisibles(POR_PAGINA);
  }, [year, month, quarter, vista, monedas, search]);

  const totals = useMemo(() => {
    const vivo = (n: NoteRow) => n.effective_status !== "ANULADO";
    const anio = delAnio.filter(vivo).reduce((s, n) => s + n.total, 0);
    const mes = filtered.filter(vivo).reduce((s, n) => s + n.total, 0);
    const porCobrar = delAnio.filter(vivo).reduce((s, n) => s + n.pending_usd, 0);
    let sel = 0;
    let selFalta = 0;
    let selCount = 0;
    for (const n of notes) {
      if (selected.has(n.id)) {
        sel += n.total;
        selFalta += n.pending_usd;
        selCount++;
      }
    }
    return { anio, mes, porCobrar, sel, selFalta, selCount };
  }, [delAnio, filtered, notes, selected]);

  const etiquetaPeriodo =
    month !== null ? MESES_LARGOS[month] : quarter !== null ? `trimestre ${quarter + 1}` : "todo el año";

  const hoverNote = hover ? notes.find((n) => n.id === hover.id) ?? null : null;
  const marcadas = notes.filter((n) => selected.has(n.id));
  const unica = marcadas.length === 1 ? marcadas[0] : null;

  function ordenarPor(k: Orden["k"]) {
    setOrden((o) => ({ k, dir: o.k === k ? (o.dir === 1 ? -1 : 1) : k === "cliente" ? 1 : -1 }));
  }

  function exportar() {
    const lista = marcadas.length > 0 ? marcadas : filtered;
    descargarExcel(
      `notas-${year}`,
      ["Nº", "Fecha", "Cliente", "Estado", "Moneda", "Total $", "Abonado $", "Falta $", "Vence", "Dias vencida"],
      lista.map((n) => [
        n.sequence_number,
        n.note_date,
        n.display_name,
        estadoDe(n).texto,
        moneda(n.currency_mode).label,
        money(n.total),
        money(n.paid_usd),
        money(n.pending_usd),
        n.due_date ?? "",
        n.days_overdue,
      ])
    );
    notify.ok("Archivo descargado", `${lista.length} notas`);
  }

  // ---------- cuadro negro: aparece tras una pausa, solo informa ----------
  function entrarFila(id: string, el: HTMLElement) {
    if (dragging.current) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (hover) {
      setHover({ id, rect: el.getBoundingClientRect() });
      return;
    }
    hoverTimer.current = setTimeout(() => {
      setHover({ id, rect: el.getBoundingClientRect() });
    }, 650);
  }
  function salirFila() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
  }

  const cabecera = (k: Orden["k"], label: string, cls: string) => (
    <button
      onClick={() => ordenarPor(k)}
      className={`${cls} flex items-center gap-1 hover:text-gray-700 ${orden.k === k ? "text-gray-700" : ""} ${
        cls.includes("text-right") ? "justify-end" : ""
      }`}
    >
      {label}
      {orden.k === k ? (
        orden.dir === 1 ? (
          <ChevronUp size={12} />
        ) : (
          <ChevronDown size={12} />
        )
      ) : (
        <ArrowUpDown size={11} className="opacity-40" />
      )}
    </button>
  );

  return (
    <main className="p-6 max-w-[1240px] pb-28">
      {/* ---------- encabezado ---------- */}
      <div className="flex items-end gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold text-gray-900 tracking-tight">Notas</h1>
          <p className="text-[13px] text-gray-500">
            {conteo.TODAS} notas · {etiquetaPeriodo} {year}
            <span className="text-gray-300"> · </span>
            vendido <b className="font-medium text-gray-700">${miles(totals.anio)}</b> en el año
            <span className="text-gray-300"> · </span>
            por cobrar <b className="font-medium text-amber-700">${miles(totals.porCobrar)}</b>
          </p>
        </div>
        <div className="flex-1" />
        <BotonSec icon={ScanSearch} label="Buscar a fondo" onClick={() => setShowBuscar(true)} />
        <BotonSec
          icon={verGanancia ? EyeOff : TrendingUp}
          label={verGanancia ? "Ocultar ganancia" : "Ver ganancia"}
          onClick={() => setVerGanancia((v) => !v)}
          activo={verGanancia}
        />
        <BotonSec icon={Download} label="Exportar" onClick={exportar} />
      </div>

      {/* ---------- pestañas ---------- */}
      <div className="flex gap-1 border-b border-gray-200 mt-4 mb-3 overflow-x-auto">
        {VISTAS.map((v) => {
          const on = vista === v.k;
          const n = conteo[v.k];
          return (
            <button
              key={v.k}
              onClick={() => {
                setVista(v.k);
                setSelected(new Set());
              }}
              className={`h-10 px-2.5 -mb-px flex items-center gap-2 text-[13.5px] border-b-2 whitespace-nowrap transition-colors ${
                on ? "border-brand-700 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {v.l}
              <span
                className={`min-w-[22px] h-[19px] px-1.5 rounded-full text-[11px] flex items-center justify-center ${
                  v.k === "VENCIDA" && n > 0
                    ? "bg-red-50 text-red-600 font-medium"
                    : on
                    ? "bg-brand-50 text-brand-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden flex">
        {/* ---------- columna de periodos ---------- */}
        <aside className="w-[118px] shrink-0 border-r border-gray-100 p-2.5 select-none bg-gray-50/40">
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setMonth(null);
              setQuarter(null);
              setSelected(new Set());
            }}
            className="w-full h-7 px-1.5 border border-gray-200 rounded-lg text-xs mb-2.5 bg-white"
          >
            {anios.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <div className="flex gap-1.5">
            <div className="flex-1">
              {MESES_CORTOS.map((m, i) => (
                <button
                  key={m}
                  onClick={() => {
                    setQuarter(null);
                    setMonth(month === i ? null : i);
                    setSelected(new Set());
                  }}
                  className={`block w-full text-left text-[11.5px] px-1.5 py-[3px] rounded ${
                    month === i ? "bg-brand-700 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="w-6 border-l border-gray-100 pl-1">
              {[0, 1, 2, 3].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setMonth(null);
                    setQuarter(quarter === q ? null : q);
                    setSelected(new Set());
                  }}
                  className={`block w-full text-center text-[10.5px] py-[2px] rounded ${
                    quarter === q ? "bg-brand-700 text-white" : "text-gray-400 hover:bg-gray-100"
                  }`}
                  style={{ marginTop: q === 0 ? 11 : 31 }}
                >
                  {q + 1}T
                </button>
              ))}
            </div>
          </div>

          {(month !== null || quarter !== null) && (
            <button
              onClick={() => {
                setMonth(null);
                setQuarter(null);
              }}
              className="mt-2.5 text-[10.5px] text-gray-400 hover:text-gray-700 underline"
            >
              ver todo el año
            </button>
          )}
        </aside>

        {/* ---------- tabla ---------- */}
        <section className="flex-1 min-w-0">
          <div className="flex items-center gap-2 p-2.5 border-b border-gray-100">
            <div className="relative flex-1 max-w-[380px]">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                ref={buscador}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente o nº de nota"
                className="w-full h-8 pl-8 pr-8 border border-gray-200 rounded-lg text-[13px] focus:border-brand-400"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] px-1.5 rounded border border-gray-200 text-gray-400 bg-gray-50 font-sans">
                /
              </kbd>
            </div>

            {/* filtro de moneda */}
            <div className="relative">
              <button
                onClick={() => setVerMonedas((v) => !v)}
                className={`h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12.5px] border ${
                  monedas.size > 0
                    ? "border-brand-200 bg-brand-50 text-brand-800"
                    : "border-dashed border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                <Filter size={13} />
                Moneda{monedas.size > 0 ? ` · ${monedas.size}` : ""}
                <ChevronDown size={13} />
              </button>
              {verMonedas && (
                <>
                  <div className="fixed inset-0 z-20" onMouseDown={() => setVerMonedas(false)} />
                  <div className="absolute left-0 top-9 z-30 w-52 rounded-xl bg-white border border-gray-200 shadow-pop p-1.5">
                    {MONEDAS.map((m) => {
                      const on = monedas.has(m.key);
                      const cuantas = delPeriodo.filter((n) => n.currency_mode === m.key).length;
                      return (
                        <button
                          key={m.key}
                          onClick={() =>
                            setMonedas((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.key)) next.delete(m.key);
                              else next.add(m.key);
                              return next;
                            })
                          }
                          className="w-full flex items-center gap-2 h-8 px-2 rounded-lg text-[13px] hover:bg-gray-50"
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              on ? "bg-brand-700 border-brand-700 text-white" : "border-gray-300"
                            }`}
                          >
                            {on && <Check size={11} strokeWidth={3} />}
                          </span>
                          <Pill tone={TONO_MONEDA[m.key] ?? "neutral"}>{m.label}</Pill>
                          <span className="ml-auto text-[11.5px] text-gray-400">{cuantas}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {(monedas.size > 0 || search) && (
              <button
                onClick={() => {
                  setMonedas(new Set());
                  setSearch("");
                }}
                className="h-8 px-2 rounded-lg inline-flex items-center gap-1 text-[12.5px] text-gray-500 hover:bg-gray-100"
              >
                <X size={13} /> Limpiar
              </button>
            )}

            <span className="ml-auto text-[11.5px] text-gray-400 hidden lg:block">
              clic en el cliente abre la nota · arrastra para sumar
            </span>
          </div>

          {/* encabezado de columnas */}
          <div className="flex gap-3 items-center px-3 h-9 border-b border-gray-200 bg-gray-50/60 text-[11px] font-medium text-gray-400">
            <span className="w-4 shrink-0" />
            {cabecera("fecha", "Nº", "w-[60px] shrink-0")}
            {cabecera("cliente", "Cliente", "flex-1 min-w-0")}
            <span className="w-[100px] shrink-0">Estado</span>
            <span className="w-[86px] shrink-0">Cobro</span>
            <span className="w-[84px] shrink-0">Moneda</span>
            {verGanancia && <span className="w-16 shrink-0 text-right">Ganancia</span>}
            {cabecera("total", "Total", "w-[92px] shrink-0 text-right")}
            <span className="w-[86px] shrink-0" />
          </div>

          {loading && notes.length === 0 && <SkeletonRows rows={8} />}

          {!loading && filtered.length === 0 && (
            <EmptyState icon={Inbox} title="No hay notas que coincidan">
              {vista === "VENCIDA"
                ? "No hay notas vencidas en este periodo. Bien ahi."
                : "Prueba con otra pestaña, otro mes o borra lo que escribiste en el buscador."}
            </EmptyState>
          )}

          <div className="select-none" onMouseLeave={salirFila}>
            {filtered.slice(0, visibles).map((n) => {
              const neto = n.total - (n.returned_usd ?? 0);
              const pct = neto > 0 ? Math.min((n.paid_usd / neto) * 100, 100) : 100;
              const anulada = n.effective_status === "ANULADO";
              const d = new Date(n.note_date + "T00:00:00");
              const profit = n.total - n.total_cost;
              const isSel = selected.has(n.id);
              const est = estadoDe(n);
              const m = moneda(n.currency_mode);
              const color = colorDe(n.display_name);
              return (
                <div
                  key={n.id}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,input")) return;
                    salirFila();
                    dragging.current = true;
                    dragAdds.current = !isSel;
                    setSel(n.id, !isSel);
                  }}
                  onMouseEnter={(e) => {
                    if (dragging.current) {
                      setSel(n.id, dragAdds.current);
                      return;
                    }
                    entrarFila(n.id, e.currentTarget);
                  }}
                  onDoubleClick={() => setPanel({ id: n.id, abonar: false })}
                  className={`group flex gap-3 items-center px-3 h-[50px] border-b border-gray-100 text-[13px] cursor-default transition-colors ${
                    isSel ? "bg-brand-50/70" : "hover:bg-gray-50/80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => setSel(n.id, !isSel)}
                    className="w-3.5 h-3.5 shrink-0 accent-brand-700"
                    aria-label={`Marcar nota ${n.sequence_number}`}
                  />
                  <span className="w-[60px] shrink-0 leading-tight">
                    <span className="block text-[11.5px] text-gray-400 font-mono">#{n.sequence_number}</span>
                    <span className="block text-[12px] text-gray-600">
                      {d.getDate()} {MESES_CORTOS[d.getMonth()]}
                    </span>
                  </span>
                  <span className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span
                      className="w-7 h-7 rounded-full text-white text-[10.5px] font-semibold flex items-center justify-center shrink-0"
                      style={{ background: anulada ? "#9ca3af" : color }}
                    >
                      {iniciales(n.display_name)}
                    </span>
                    <button
                      onClick={() => setPanel({ id: n.id, abonar: false })}
                      title="Abrir la nota"
                      className={`min-w-0 text-left truncate ${
                        anulada
                          ? "text-gray-400 line-through"
                          : "text-gray-900 font-medium hover:text-brand-700 hover:underline underline-offset-2"
                      }`}
                    >
                      {n.display_name}
                    </button>
                  </span>
                  <span className="w-[100px] shrink-0">
                    <Pill tone={est.tone}>{est.texto}</Pill>
                  </span>
                  <span className="w-[86px] shrink-0 flex items-center gap-1.5">
                    <span className="flex-1 h-[5px] bg-gray-100 rounded-full overflow-hidden">
                      <span
                        className={`block h-full rounded-full ${
                          anulada ? "bg-gray-300" : pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-gray-200"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-7 text-right text-[10.5px] text-gray-400">{Math.round(pct)}%</span>
                  </span>
                  <span className="w-[84px] shrink-0">
                    <Pill tone={TONO_MONEDA[n.currency_mode] ?? "neutral"}>{m.label}</Pill>
                  </span>
                  {verGanancia && (
                    <span className={`w-16 shrink-0 text-right ${profit < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {money(profit)}
                    </span>
                  )}
                  <span className={`w-[92px] shrink-0 text-right leading-tight ${anulada ? "text-gray-400" : "text-gray-900"}`}>
                    <span className="flex items-center justify-end gap-1 font-medium">
                      {n.returned_usd > 0 && (
                        <span title={`Devolucion: -$${money(n.returned_usd)}`}>
                          <Undo2 size={12} className="text-orange-500" />
                        </span>
                      )}
                      ${money(n.total)}
                    </span>
                    {!anulada && n.paid_usd > 0 && n.pending_usd > 0.005 && (
                      <span className="block text-[11px] text-gray-400 font-normal">falta ${money(n.pending_usd)}</span>
                    )}
                  </span>
                  <span className="w-[86px] shrink-0 flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!anulada && n.pending_usd > 0.005 && (
                      <AccionFila
                        icon={HandCoins}
                        title="Registrar abono"
                        tono="ok"
                        onClick={() => setPanel({ id: n.id, abonar: true })}
                      />
                    )}
                    <AccionFila icon={MessageCircle} title="Escribir por WhatsApp" onClick={() => whatsappNota(n.id)} />
                    <AccionFila icon={PanelRight} title="Abrir la nota" onClick={() => setPanel({ id: n.id, abonar: false })} />
                  </span>
                </div>
              );
            })}
          </div>

          {!loading && filtered.length > visibles && (
            <div className="flex justify-center py-2.5 border-t border-gray-100">
              <button
                onClick={() => setVisibles((v) => v + POR_PAGINA)}
                className="h-8 px-4 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700 shadow-sm"
              >
                Mostrar {Math.min(POR_PAGINA, filtered.length - visibles)} más
                <span className="text-gray-400"> · faltan {filtered.length - visibles}</span>
              </button>
            </div>
          )}

          {/* ---------- pie ---------- */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-t border-gray-200 bg-gray-50/80 text-[12px]">
            <span className="text-gray-500">
              {filtered.length} nota{filtered.length === 1 ? "" : "s"} en la vista
            </span>
            <span className="ml-auto text-gray-500">
              {month !== null ? MESES_CORTOS[month] : quarter !== null ? `${quarter + 1}T` : "vista"}{" "}
              <b className="font-medium text-gray-900">${miles(totals.mes)}</b>
            </span>
            <span className="text-gray-500">
              año <b className="font-medium text-gray-900">${miles(totals.anio)}</b>
            </span>
            <span className="text-gray-500">
              por cobrar <b className="font-medium text-amber-700">${miles(totals.porCobrar)}</b>
            </span>
          </div>
        </section>
      </div>

      {/* ---------- barra de seleccion (sube desde abajo) ---------- */}
      <div
        className={`fixed left-1/2 bottom-6 z-40 -translate-x-1/2 transition-all duration-300 ${
          totals.selCount > 0 ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-1 rounded-2xl bg-gray-900 text-white pl-4 pr-1.5 py-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,.5)]">
          <span className="text-[13px] font-semibold mr-1">
            {totals.selCount} seleccionada{totals.selCount === 1 ? "" : "s"}
          </span>
          <span className="text-[12.5px] text-gray-400 mr-2">
            ${money(totals.sel)}
            {totals.selFalta > 0.005 && <> · falta ${money(totals.selFalta)}</>}
          </span>
          {unica && (
            <>
              <BotonBarra icon={PanelRight} label="Abrir" onClick={() => setPanel({ id: unica.id, abonar: false })} />
              {unica.effective_status !== "ANULADO" && unica.pending_usd > 0.005 && (
                <BotonBarra icon={HandCoins} label="Abonar" onClick={() => setPanel({ id: unica.id, abonar: true })} />
              )}
              <BotonBarra icon={Pencil} label="Editar" onClick={() => router.push(`/notas/nueva?id=${unica.id}`)} />
              {unica.effective_status !== "ANULADO" && (
                <BotonBarra icon={Undo2} label="Devolver" onClick={() => setDevolverId(unica.id)} />
              )}
            </>
          )}
          <BotonBarra icon={Download} label="Exportar" onClick={exportar} />
          <button
            onClick={() => setSelected(new Set())}
            title="Quitar seleccion"
            aria-label="Quitar seleccion"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {hover && hoverNote && !panel && totals.selCount === 0 && <CuadroRapido n={hoverNote} rect={hover.rect} />}

      {panel && (
        <PanelNota
          key={panel.id + (panel.abonar ? "-a" : "")}
          noteId={panel.id}
          abonarAlAbrir={panel.abonar}
          onClose={() => setPanel(null)}
          onCambio={load}
          onDevolver={(id) => setDevolverId(id)}
          onEditar={(id) => router.push(`/notas/nueva?id=${id}`)}
          onVer={(id) => router.push(`/notas/ver?id=${id}`)}
          onBorrar={handleDelete}
        />
      )}

      {devolverId && (
        <DevolverModal
          noteId={devolverId}
          onClose={() => setDevolverId(null)}
          onSaved={() => {
            setDevolverId(null);
            notify.ok("Devolucion registrada");
            load();
          }}
        />
      )}

      {showBuscar && <BusquedaModal onClose={() => setShowBuscar(false)} />}
    </main>
  );
}

/* ================= botones pequeños ================= */

function BotonSec({
  icon: Icono,
  label,
  onClick,
  activo,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  activo?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[34px] px-3 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] font-medium border shadow-[0_1px_2px_rgba(16,24,40,.05)] whitespace-nowrap transition-colors ${
        activo
          ? "border-brand-200 bg-brand-50 text-brand-800"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      }`}
    >
      <Icono size={15} strokeWidth={1.9} />
      {label}
    </button>
  );
}

function AccionFila({
  icon: Icono,
  title,
  onClick,
  tono,
}: {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  tono?: "ok";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-[27px] h-[27px] rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-[0_1px_2px_rgba(16,24,40,.08)] hover:ring-1 hover:ring-gray-200 ${
        tono === "ok" ? "hover:text-emerald-700" : "hover:text-gray-900"
      }`}
    >
      <Icono size={15} strokeWidth={1.9} />
    </button>
  );
}

function BotonBarra({ icon: Icono, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-2.5 rounded-xl inline-flex items-center gap-1.5 text-[12.5px] text-gray-300 hover:text-white hover:bg-white/10"
    >
      <Icono size={14} />
      {label}
    </button>
  );
}

/* ================= WhatsApp ================= */

// telefono venezolano -> formato internacional para WhatsApp
function telWhatsapp(tel: string | null | undefined) {
  if (!tel) return null;
  let t = tel.replace(/\D/g, "");
  if (!t) return null;
  if (t.startsWith("0")) t = "58" + t.slice(1);
  else if (t.length === 10) t = "58" + t;
  return t;
}

function mensajeNota(p: PanelData) {
  const nombre = (p.client?.name ?? p.display_name).split(" ")[0];
  const fecha = new Date(p.note_date + "T00:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long" });
  if (p.pending > 0.005)
    return `Hola ${nombre}, le escribo por la nota #${p.sequence_number} del ${fecha} por $${money(p.total)}. Queda pendiente $${money(p.pending)}. ¡Gracias!`;
  return `Hola ${nombre}, le escribo por la nota #${p.sequence_number} del ${fecha} por $${money(p.total)}. ¡Gracias por su compra!`;
}

function abrirWhatsapp(p: PanelData) {
  const tel = telWhatsapp(p.client?.phone);
  const texto = encodeURIComponent(mensajeNota(p));
  if (!tel) notify.info("Este cliente no tiene telefono guardado", "Elige el contacto en WhatsApp.");
  window.open(tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`, "_blank");
}

async function whatsappNota(id: string) {
  const { data, error } = await supabase.rpc("get_note_panel", { p_note_id: id });
  if (error || !data) return notify.error("No se pudo abrir WhatsApp", error?.message);
  abrirWhatsapp(data as PanelData);
}

/* ================= panel lateral de la nota ================= */

type PanelData = {
  id: string;
  sequence_number: number;
  note_date: string;
  created_at: string;
  due_date: string | null;
  currency_mode: string;
  exchange_rate: number | null;
  exchange_gap_percent: number | null;
  subtotal: number;
  discount: number;
  total: number;
  total_cost: number;
  payment_status: string;
  display_name: string;
  client: { id: string; name: string; phone: string | null; city: string | null; credit_days: number } | null;
  paid: number;
  returned: number;
  neto: number;
  pending: number;
  credit: number;
  days_overdue: number;
  effective_status: string;
  items: {
    id: string;
    product_id: string | null;
    code: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    cost: number;
  }[];
  payments: (Payment & { created_at: string })[];
  returns: { id: string; numero: number; return_date: string; total: number; unidades: number }[];
};

const METODOS = ["Efectivo $", "Zelle", "Pago movil", "Transferencia", "Binance", "Efectivo Bs", "Otro"];

function fechaCorta(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });
}

function PanelNota({
  noteId,
  abonarAlAbrir,
  onClose,
  onCambio,
  onDevolver,
  onEditar,
  onVer,
  onBorrar,
}: {
  noteId: string;
  abonarAlAbrir: boolean;
  onClose: () => void;
  onCambio: () => void;
  onDevolver: (id: string) => void;
  onEditar: (id: string) => void;
  onVer: (id: string) => void;
  onBorrar: (id: string) => void;
}) {
  const [p, setP] = useState<PanelData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState<"resumen" | "productos" | "pagos" | "devoluciones">("resumen");
  const [abonando, setAbonando] = useState(abonarAlAbrir);
  const [verRentab, setVerRentab] = useState(false);
  const [verMas, setVerMas] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_note_panel", { p_note_id: noteId });
    if (error) return setErr(error.message);
    if (!data) return setErr("Esa nota ya no existe.");
    setP(data as PanelData);
  }, [noteId]);

  useEffect(() => {
    cargar();
    const t = requestAnimationFrame(() => setAbierto(true));
    return () => cancelAnimationFrame(t);
  }, [cargar]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // si hay una confirmacion abierta encima, que esa se cierre primero
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"] *)').length > 1) return;
      cerrar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [cerrar]);

  async function anular(id: string) {
    const ok = await confirmar({
      titulo: "¿Anular este abono?",
      mensaje: "Queda en el historial tachado, pero deja de contar para el pago de la nota.",
      textoSi: "Si, anular",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("void_note_payment", { p_payment_id: id });
    if (error) return notify.error("No se pudo anular", error.message);
    notify.ok("Abono anulado");
    cargar();
    onCambio();
  }

  function copiarEnlace() {
    const url = `${window.location.origin}/notas?nota=${noteId}`;
    navigator.clipboard?.writeText(url).then(
      () => notify.ok("Enlace copiado", "Pegalo donde quieras para volver a esta nota"),
      () => notify.info(url)
    );
  }

  const anulada = p?.effective_status === "ANULADO";
  const pct = p ? (p.neto > 0 ? Math.min((p.paid / p.neto) * 100, 100) : 100) : 0;
  const est = p
    ? estadoDe({
        effective_status: p.effective_status,
        days_overdue: p.days_overdue,
      } as NoteRow)
    : null;
  const m = moneda(p?.currency_mode ?? "USD");
  const tasa = p ? effectiveRate(p.currency_mode, p.exchange_rate, p.exchange_gap_percent) : 0;
  const pagosVivos = (p?.payments ?? []).filter((x) => !x.voided);
  const profit = p ? p.total - p.total_cost : 0;

  // linea de tiempo: creada, abonos, devoluciones
  const actividad = p
    ? [
        {
          k: "c",
          f: p.created_at ?? p.note_date,
          icono: FilePlus2,
          tono: "bg-brand-50 text-brand-700",
          texto: (
            <>
              Nota creada · {p.items.length} producto{p.items.length === 1 ? "" : "s"} por <b>${money(p.total)}</b>
            </>
          ),
          tachado: false,
        },
        ...p.payments.map((x) => ({
          k: x.id,
          f: x.created_at ?? x.payment_date,
          icono: HandCoins,
          tono: x.voided ? "bg-gray-100 text-gray-400" : "bg-emerald-50 text-emerald-700",
          texto: (
            <>
              Abono de <b>${money(x.amount_usd)}</b>
              {x.currency_mode !== "USD" && (
                <span className="text-gray-400">
                  {" "}
                  ({moneda(x.currency_mode).corto} {money(x.amount_currency)})
                </span>
              )}
              {x.method ? ` · ${x.method}` : ""}
              {x.voided ? " · anulado" : ""}
            </>
          ),
          tachado: x.voided,
        })),
        ...p.returns.map((r) => ({
          k: r.id,
          f: r.return_date,
          icono: Undo2,
          tono: "bg-orange-50 text-orange-600",
          texto: (
            <>
              Devolucion #{r.numero} · {r.unidades} unidad{r.unidades === 1 ? "" : "es"} por <b>${money(r.total)}</b>
            </>
          ),
          tachado: false,
        })),
      ].sort((a, b) => (a.f < b.f ? 1 : -1))
    : [];

  const RADIO = 26;
  const CIRC = 2 * Math.PI * RADIO;

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="Nota">
      <div
        className={`absolute inset-0 bg-gray-950/30 backdrop-blur-[1.5px] transition-opacity duration-200 ${
          abierto ? "opacity-100" : "opacity-0"
        }`}
        onMouseDown={cerrar}
      />
      <aside
        className={`absolute top-2 right-2 bottom-2 w-[500px] max-w-[calc(100vw-16px)] flex flex-col rounded-2xl bg-white border border-gray-200 shadow-pop overflow-hidden transition-transform duration-300 ease-[cubic-bezier(.2,.85,.25,1)] ${
          abierto ? "translate-x-0" : "translate-x-[calc(100%+24px)]"
        }`}
      >
        {/* ---------- cabecera ---------- */}
        <div className="px-5 pt-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono text-gray-400">
              Nota #{p ? String(p.sequence_number).padStart(4, "0") : "…"}
            </span>
            {est && <Pill tone={est.tone}>{est.texto}</Pill>}
            {p && <Pill tone={TONO_MONEDA[p.currency_mode] ?? "neutral"}>{m.label}</Pill>}
            <div className="flex-1" />
            <button
              onClick={copiarEnlace}
              title="Copiar enlace a esta nota"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
            >
              <Link2 size={15} />
            </button>
            <button
              onClick={cerrar}
              title="Cerrar (Esc)"
              aria-label="Cerrar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
            >
              <X size={17} />
            </button>
          </div>

          <div className="flex items-center gap-3 mt-3 mb-3">
            <span
              className="w-11 h-11 rounded-full text-white text-[14px] font-semibold flex items-center justify-center shrink-0"
              style={{ background: p ? (anulada ? "#9ca3af" : colorDe(p.display_name)) : "#e5e7eb" }}
            >
              {p ? iniciales(p.display_name) : ""}
            </span>
            <div className="min-w-0 flex-1">
              <h2
                className={`text-[17px] font-semibold tracking-tight truncate ${
                  anulada ? "text-gray-400 line-through" : "text-gray-900"
                }`}
              >
                {p?.display_name ?? "Cargando…"}
              </h2>
              {p && (
                <p className="text-[12.5px] text-gray-500 flex items-center gap-x-2.5 gap-y-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} /> {fechaLarga(p.note_date)}
                  </span>
                  {p.pending > 0.005 && !anulada && (
                    <span className={`inline-flex items-center gap-1 ${p.days_overdue > 0 ? "text-red-600" : ""}`}>
                      <Clock size={12} />
                      {p.days_overdue > 0 ? `vencio hace ${p.days_overdue} dias` : `vence ${fechaCorta(p.due_date)}`}
                    </span>
                  )}
                  {p.client?.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} /> {p.client.phone}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-1 -mb-px">
            {(
              [
                ["resumen", "Resumen", null],
                ["productos", "Productos", p?.items.length ?? null],
                ["pagos", "Pagos", pagosVivos.length],
                ["devoluciones", "Devoluciones", p?.returns.length ?? null],
              ] as const
            )
              .filter(([k, , n]) => k !== "devoluciones" || (n ?? 0) > 0)
              .map(([k, l, n]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`h-9 px-2.5 flex items-center gap-1.5 text-[13px] border-b-2 ${
                    tab === k ? "border-brand-700 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {l}
                  {n !== null && n !== undefined && (
                    <span className="min-w-[18px] h-[17px] px-1 rounded-full bg-gray-100 text-gray-500 text-[10.5px] flex items-center justify-center">
                      {n}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* ---------- cuerpo ---------- */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!p && !err && (
            <div className="space-y-3">
              <div className="skeleton h-16 w-full" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          )}

          {p && tab === "resumen" && (
            <>
              <div className="flex items-center gap-4 mb-4">
                <svg width="64" height="64" className="-rotate-90 shrink-0">
                  <circle cx="32" cy="32" r={RADIO} fill="none" stroke="#eef0f4" strokeWidth="7" />
                  <circle
                    cx="32"
                    cy="32"
                    r={RADIO}
                    fill="none"
                    stroke={anulada ? "#d1d5db" : pct >= 100 ? "#10b981" : "#f59e0b"}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={abierto ? CIRC * (1 - pct / 100) : CIRC}
                    style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1) .15s" }}
                  />
                </svg>
                <div>
                  <p className="text-[12px] text-gray-500">Cobrado</p>
                  <p className="text-[24px] font-semibold tracking-tight text-gray-900 leading-tight">{Math.round(pct)}%</p>
                  <p className="text-[12px] text-gray-400">
                    {pagosVivos.length} abono{pagosVivos.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-3 py-2.5">
                  <p className="text-[11.5px] text-gray-500">Total</p>
                  <p className="text-[17px] font-semibold tracking-tight">${money(p.neto)}</p>
                </div>
                <div className="px-3 py-2.5 border-l border-gray-200">
                  <p className="text-[11.5px] text-gray-500">Abonado</p>
                  <p className="text-[17px] font-semibold tracking-tight text-emerald-700">${money(p.paid)}</p>
                </div>
                <div className="px-3 py-2.5 border-l border-gray-200">
                  <p className="text-[11.5px] text-gray-500">Falta</p>
                  <p
                    className={`text-[17px] font-semibold tracking-tight ${
                      p.pending > 0.005 ? "text-red-600" : "text-gray-300"
                    }`}
                  >
                    ${money(p.pending)}
                  </p>
                </div>
              </div>

              <div className="mt-2 space-y-0.5">
                {p.returned > 0 && (
                  <Linea k="Devuelto" v={`−$${money(p.returned)} (la nota era de $${money(p.total)})`} tone="text-orange-700" />
                )}
                {p.credit > 0.005 && <Linea k="Saldo a favor del cliente" v={`$${money(p.credit)}`} tone="text-sky-700" />}
                {p.currency_mode !== "USD" && (
                  <Linea
                    k={`En ${m.label}`}
                    v={tasa > 0 ? `${m.corto} ${miles(p.total * tasa)} · tasa ${tasa.toLocaleString("es-VE", { maximumFractionDigits: 4 })}` : "sin tasa"}
                  />
                )}
              </div>

              {abonando && !anulada && p.pending > 0.005 && (
                <FormAbono
                  p={p}
                  onCancel={() => setAbonando(false)}
                  onSaved={(usd) => {
                    setAbonando(false);
                    notify.ok(`Abono de $${money(usd)} registrado`, `Nota #${p.sequence_number} · ${p.display_name}`);
                    cargar();
                    onCambio();
                  }}
                />
              )}

              {/* acciones */}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {!abonando && !anulada && p.pending > 0.005 && (
                  <button
                    onClick={() => setAbonando(true)}
                    className="h-9 px-3.5 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-gradient-to-b from-emerald-500 to-emerald-700 border border-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_4px_12px_-4px_rgba(13,127,87,.5)] hover:brightness-105"
                  >
                    <HandCoins size={15} /> Registrar abono
                  </button>
                )}
                <BotonSec icon={MessageCircle} label="WhatsApp" onClick={() => abrirWhatsapp(p)} />
                <BotonSec icon={Printer} label="Imprimir" onClick={() => onVer(p.id)} />
                <BotonSec icon={Pencil} label="Editar" onClick={() => onEditar(p.id)} />
                <div className="relative">
                  <button
                    onClick={() => setVerMas((v) => !v)}
                    title="Mas acciones"
                    className="h-[34px] w-[34px] rounded-[9px] inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  >
                    <Ellipsis size={16} />
                  </button>
                  {verMas && (
                    <>
                      <div className="fixed inset-0 z-10" onMouseDown={() => setVerMas(false)} />
                      <div className="absolute right-0 top-10 z-20 w-52 rounded-xl bg-white border border-gray-200 shadow-pop p-1.5">
                        {!anulada && (
                          <button
                            onClick={() => {
                              setVerMas(false);
                              onDevolver(p.id);
                            }}
                            className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-[13px] text-gray-700 hover:bg-gray-50"
                          >
                            <Undo2 size={15} /> Registrar devolucion
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setVerMas(false);
                            copiarEnlace();
                          }}
                          className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-[13px] text-gray-700 hover:bg-gray-50"
                        >
                          <Link2 size={15} /> Copiar enlace
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button
                          onClick={() => {
                            setVerMas(false);
                            onBorrar(p.id);
                          }}
                          className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-[13px] text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={15} /> Eliminar nota
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* rentabilidad: oculta hasta que la pidas */}
              <button
                onClick={() => setVerRentab((v) => !v)}
                className="mt-4 w-full flex items-center justify-between rounded-lg px-3 py-2 bg-gray-50 text-[12.5px] text-gray-500 hover:text-gray-800"
              >
                <span className="flex items-center gap-1.5">
                  {verRentab ? <EyeOff size={13} /> : <Eye size={13} />} Rentabilidad
                </span>
                {verRentab ? (
                  <span className={profit < 0 ? "text-red-600" : "text-emerald-700"}>
                    ganancia ${money(profit)} · {p.total > 0 ? ((profit / p.total) * 100).toFixed(1) : "0"}%
                  </span>
                ) : (
                  <span className="text-gray-300">oculta</span>
                )}
              </button>

              {/* actividad */}
              <p className="mt-5 mb-2 text-[11.5px] font-medium text-gray-400">Actividad</p>
              <div>
                {actividad.map((a, i) => {
                  const Icono = a.icono;
                  return (
                    <div key={a.k} className="relative flex gap-3 pb-3">
                      {i < actividad.length - 1 && (
                        <span className="absolute left-[11px] top-7 bottom-0 w-px bg-gray-200" />
                      )}
                      <span className={`w-[23px] h-[23px] rounded-full flex items-center justify-center shrink-0 ${a.tono}`}>
                        <Icono size={12} />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className={`text-[13px] ${a.tachado ? "text-gray-400 line-through" : "text-gray-700"}`}>
                          {a.texto}
                        </p>
                        <p className="text-[11.5px] text-gray-400">{fechaCorta(a.f)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {p && tab === "productos" && (
            <>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {p.items.map((it, i) => (
                  <div key={it.id} className={`flex gap-3 px-3 py-2.5 ${i ? "border-t border-gray-100" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-gray-900 truncate">{it.description}</p>
                      <p className="text-[11.5px] font-mono text-gray-400">{it.code}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] text-gray-500">
                        {it.quantity} × ${money(it.unit_price)}
                      </p>
                      <p className="text-[13px] font-medium text-gray-900">${money(it.line_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 ml-auto w-56 space-y-0.5">
                <Linea k="Subtotal" v={`$${money(p.subtotal)}`} />
                {p.discount > 0 && <Linea k="Descuento" v={`−$${money(p.discount)}`} />}
                <div className="flex justify-between text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                  <span>Total</span>
                  <span>${money(p.total)}</span>
                </div>
              </div>
            </>
          )}

          {p && tab === "pagos" && (
            <>
              {p.payments.length === 0 ? (
                <EmptyState icon={Wallet} title="Todavia no hay abonos">
                  Registra el primero desde la pestaña Resumen.
                </EmptyState>
              ) : (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {[...p.payments].reverse().map((x, i) => (
                    <div
                      key={x.id}
                      className={`flex items-center gap-3 px-3 py-2.5 ${i ? "border-t border-gray-100" : ""} ${
                        x.voided ? "opacity-50" : ""
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                        <Banknote size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] text-gray-900 ${x.voided ? "line-through" : ""}`}>
                          {x.method || "Abono"}
                          {x.reference && <span className="text-gray-400"> · ref {x.reference}</span>}
                        </p>
                        <p className="text-[11.5px] text-gray-400">
                          {fechaCorta(x.payment_date)} · {moneda(x.currency_mode).label}
                          {x.currency_mode !== "USD" && ` ${money(x.amount_currency)} a ${x.exchange_rate ?? "—"}`}
                          {x.voided && " · anulado"}
                        </p>
                      </div>
                      <span className={`text-[13.5px] font-medium ${x.voided ? "text-gray-400" : "text-emerald-700"}`}>
                        ${money(x.amount_usd)}
                      </span>
                      {!x.voided && (
                        <button
                          onClick={() => anular(x.id)}
                          title="Anular este abono"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {p && tab === "devoluciones" && (
            <>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {p.returns.map((r, i) => (
                  <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${i ? "border-t border-gray-100" : ""}`}>
                    <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <Undo2 size={15} />
                    </span>
                    <div className="flex-1">
                      <p className="text-[13px] text-gray-900">Devolucion #{r.numero}</p>
                      <p className="text-[11.5px] text-gray-400">
                        {fechaCorta(r.return_date)} · {r.unidades} unidad{r.unidades === 1 ? "" : "es"}
                      </p>
                    </div>
                    <span className="text-[13.5px] font-medium text-orange-700">−${money(r.total)}</span>
                  </div>
                ))}
              </div>
              {!anulada && (
                <button
                  onClick={() => onDevolver(p.id)}
                  className="mt-3 h-9 px-3 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                >
                  <Undo2 size={15} /> Registrar otra devolucion
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Linea({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3 text-[12.5px] py-[3px]">
      <span className="text-gray-500">{k}</span>
      <span className={`text-right ${tone ?? "text-gray-900"}`}>{v}</span>
    </div>
  );
}

/* ================= abono dentro del panel ================= */

function FormAbono({
  p,
  onCancel,
  onSaved,
}: {
  p: PanelData;
  onCancel: () => void;
  onSaved: (usd: number) => void;
}) {
  const tasas = useTasas();
  const tasaNota = effectiveRate(p.currency_mode, p.exchange_rate, p.exchange_gap_percent);
  // la tasa que se propone: la de hoy; si no hay, la que se uso en la nota
  const tasaInicial = (mon: string) => {
    if (mon === "USD") return 1;
    const hoy = tasaPara(mon, tasas);
    if (hoy > 0) return hoy;
    return mon === p.currency_mode ? tasaNota : 0;
  };

  const [mon, setMon] = useState(p.currency_mode);
  const [tasa, setTasa] = useState(() => tasaInicial(p.currency_mode));
  const [monto, setMonto] = useState(() => {
    const t = tasaInicial(p.currency_mode);
    return p.currency_mode === "USD" ? p.pending : t > 0 ? Math.round(p.pending * t * 100) / 100 : 0;
  });
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [metodo, setMetodo] = useState(p.currency_mode === "USD" ? "Efectivo $" : "Pago movil");
  const [refe, setRefe] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // si las tasas llegan despues de abrir, completar
  useEffect(() => {
    if (mon !== "USD" && !(tasa > 0)) {
      const t = tasaInicial(mon);
      if (t > 0) {
        setTasa(t);
        setMonto(Math.round(p.pending * t * 100) / 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasas]);

  function cambiarMoneda(k: string) {
    setMon(k);
    const t = tasaInicial(k);
    setTasa(t);
    setMonto(k === "USD" ? p.pending : t > 0 ? Math.round(p.pending * t * 100) / 100 : 0);
    if (k === "USD" && metodo === "Pago movil") setMetodo("Efectivo $");
    if (k !== "USD" && (metodo === "Efectivo $" || metodo === "Zelle")) setMetodo("Pago movil");
  }

  const equivale = mon === "USD" ? monto : tasa > 0 ? monto / tasa : 0;
  const queda = p.pending - equivale;

  async function guardar() {
    setErr(null);
    if (!(monto > 0)) return setErr("Escribe el monto del abono.");
    if (mon !== "USD" && !(tasa > 0)) return setErr("Falta la tasa de cambio.");
    setBusy(true);
    const { error } = await supabase.rpc("add_note_payment", {
      p_note_id: p.id,
      p_payment_date: fecha,
      p_currency_mode: mon,
      p_amount_currency: monto,
      p_exchange_rate: mon === "USD" ? null : tasa,
      p_method: metodo || null,
      p_reference: refe.trim() || null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved(Math.round(equivale * 100) / 100);
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
      <div className="flex items-center gap-2 mb-3">
        <HandCoins size={16} className="text-emerald-700" />
        <p className="text-[13.5px] font-semibold text-gray-900">Registrar abono</p>
        <button
          onClick={onCancel}
          aria-label="Cancelar abono"
          className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-white"
        >
          <X size={15} />
        </button>
      </div>

      <div role="radiogroup" className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-white border border-gray-200 mb-3">
        {MONEDAS.map((x) => (
          <button
            key={x.key}
            role="radio"
            aria-checked={mon === x.key}
            onClick={() => cambiarMoneda(x.key)}
            className={`h-7 rounded-md text-[12px] ${
              mon === x.key ? "bg-brand-700 text-white font-medium" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="block text-[11px] text-gray-500 mb-1">Monto recibido ({moneda(mon).corto})</span>
          <NumInput
            value={monto}
            onChange={setMonto}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-[14px] font-medium text-right bg-white focus:border-brand-500"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-500 mb-1">
            Tasa {mon === "USD" ? "(no aplica)" : tasa > 0 && tasa === tasaPara(mon, tasas) ? "· la de hoy" : ""}
          </span>
          <NumInput
            value={mon === "USD" ? null : tasa}
            onChange={setTasa}
            disabled={mon === "USD"}
            placeholder={mon === "USD" ? "—" : "0"}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-[13px] text-right bg-white disabled:bg-gray-50 focus:border-brand-500"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-500 mb-1">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-[13px] bg-white"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-500 mb-1">Referencia</span>
          <input
            value={refe}
            onChange={(e) => setRefe(e.target.value)}
            placeholder="opcional"
            className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-[13px] bg-white"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {METODOS.map((x) => (
          <button
            key={x}
            onClick={() => setMetodo(x)}
            className={`h-7 px-2.5 rounded-lg text-[12px] border ${
              metodo === x
                ? "border-brand-300 bg-brand-50 text-brand-800 font-medium"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {x}
          </button>
        ))}
      </div>

      {monto > 0 && (mon === "USD" || tasa > 0) && (
        <p className="mt-3 text-[12.5px] text-gray-700">
          {mon !== "USD" && (
            <>
              Equivale a <b>${money(equivale)}</b> ·{" "}
            </>
          )}
          {queda > 0.005 ? (
            <>
              la nota queda en <b className="text-red-600">${money(queda)}</b>
            </>
          ) : queda < -0.005 ? (
            <b className="text-sky-700">sobran ${money(-queda)} a favor del cliente</b>
          ) : (
            <b className="text-emerald-700">queda cobrada completa</b>
          )}
        </p>
      )}

      {err && <p className="mt-2 text-[12.5px] text-red-600">{err}</p>}

      <button
        onClick={guardar}
        disabled={busy}
        className="mt-3 w-full h-10 rounded-[10px] inline-flex items-center justify-center gap-1.5 text-[13.5px] font-medium text-white bg-gradient-to-b from-emerald-500 to-emerald-700 border border-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,.2)] hover:brightness-105 disabled:opacity-50"
      >
        <Check size={16} /> {busy ? "Guardando…" : "Guardar abono"}
      </button>
    </div>
  );
}

/* ================= cuadro negro ================= */

function CuadroRapido({ n, rect }: { n: NoteRow; rect: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const alto = el.offsetHeight;
    const ancho = el.offsetWidth;
    const margen = 8;
    const abajo = rect.bottom + 6;
    const cabeAbajo = abajo + alto + margen <= window.innerHeight;
    const top = cabeAbajo ? abajo : Math.max(margen, rect.top - alto - 6);
    const left = Math.min(
      Math.max(margen, rect.right - ancho - 44),
      window.innerWidth - ancho - margen
    );
    setPos({ top, left });
  }, [rect, n.id]);

  const m = moneda(n.currency_mode);
  const tasa = effectiveRate(n.currency_mode, n.exchange_rate, n.exchange_gap_percent);

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-40 w-[280px] pointer-events-none rounded-xl bg-gray-900 px-3.5 py-3 shadow-pop ring-1 ring-black/5"
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] font-medium text-white truncate pr-2">
          {n.display_name}
        </span>
        <span className="text-[10.5px] text-gray-400 font-mono shrink-0">
          #{n.sequence_number}
        </span>
      </div>
      <Fila k="Fecha" v={fechaLarga(n.note_date)} />
      <Fila k="Moneda" v={m.largo} />
      {n.currency_mode !== "USD" && (
        <>
          <Fila
            k="Tasa usada"
            v={
              tasa > 0 ? tasa.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "sin tasa"
            }
          />
          <Fila k={`Cobrado en ${m.corto}`} v={tasa > 0 ? miles(n.total * tasa) : "—"} />
        </>
      )}
      {n.returned_usd > 0 && (
        <Fila k="Devuelto" v={`−$${money(n.returned_usd)}`} tone="text-orange-300" />
      )}
      <div className="h-px bg-white/10 my-1.5" />
      <Fila k="Abonado" v={`$${money(n.paid_usd)}`} tone="text-emerald-300" />
      <Fila
        k="Falta"
        v={n.pending_usd > 0.005 ? `$${money(n.pending_usd)}` : "nada, cobrada"}
        tone={n.pending_usd > 0.005 ? "text-red-300" : "text-emerald-300"}
      />
      {n.due_date && n.pending_usd > 0.005 && (
        <Fila
          k="Vence"
          v={n.days_overdue > 0 ? `${n.due_date} · hace ${n.days_overdue}d` : n.due_date}
          tone={n.days_overdue > 0 ? "text-red-300" : "text-gray-200"}
        />
      )}
      <p className="mt-2 pt-1.5 border-t border-white/10 text-[10.5px] text-gray-400">
        Doble clic o <span className="text-gray-200">⤢</span> para abrir la ficha con todas las
        acciones
      </p>
    </div>
  );
}

/* ================= ventana de devolucion ================= */

type LineaVendida = {
  note_item_id: string;
  product_id: string | null;
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
  supply_type: string;
  supplier_name: string | null;
  ya_devuelto: number;
};

type DevRegistrada = {
  id: string;
  numero: number;
  return_date: string;
  total: number;
  items: {
    code: string;
    description: string;
    quantity: number;
    line_total: number;
    reason: string | null;
    destination: string;
    observation: string | null;
  }[];
};

type DatosDev = {
  total_devuelto: number;
  lineas_vendidas: LineaVendida[];
  devoluciones: DevRegistrada[];
};

const MOTIVOS = [
  "No era compatible",
  "Vino defectuoso",
  "Se daño en el camino",
  "Pidio otro repuesto",
  "Se arrepintio",
  "Le sobro",
  "Otro",
];

const DESTINOS: { k: string; l: string; ayuda: string }[] = [
  { k: "ALMACEN", l: "Vuelve a mi almacen", ayuda: "esta bueno, se vuelve a vender" },
  { k: "PROVEEDOR", l: "Se lo devuelvo al proveedor", ayuda: "no toca tu stock" },
  { k: "PERDIDA", l: "Se perdio", ayuda: "vino roto y no lo reclamas" },
];

function DevolverModal({
  noteId,
  onClose,
  onSaved,
}: {
  noteId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<DatosDev | null>(null);
  const [col, setCol] = useState<Collection | null>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState<
    Record<string, { qty: string; reason: string; destination: string; obs: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      supabase.rpc("note_returns", { p_note_id: noteId }),
      supabase.rpc("note_collection", { p_note_id: noteId }),
    ]);
    if (r1.error) {
      setErr(r1.error.message);
      return;
    }
    setD(r1.data as DatosDev);
    if (!r2.error) setCol(r2.data as Collection);
  }, [noteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function marcar(l: LineaVendida) {
    setSel((p) => {
      const n = { ...p };
      if (n[l.note_item_id]) {
        delete n[l.note_item_id];
      } else {
        n[l.note_item_id] = {
          qty: "1",
          reason: MOTIVOS[0],
          destination: l.supply_type === "PEDIDO" ? "PROVEEDOR" : "ALMACEN",
          obs: "",
        };
      }
      return n;
    });
  }

  function editar(id: string, campo: string, valor: string) {
    setSel((p) => ({ ...p, [id]: { ...p[id], [campo]: valor } }));
  }

  const resumen = useMemo(() => {
    if (!d) return { monto: 0, aAlmacen: 0, aProveedor: 0, perdida: 0 };
    let monto = 0;
    let aAlmacen = 0;
    let aProveedor = 0;
    let perdida = 0;
    for (const l of d.lineas_vendidas) {
      const s = sel[l.note_item_id];
      if (!s) continue;
      const q = Number(s.qty.replace(",", ".")) || 0;
      monto += q * l.unit_price;
      if (s.destination === "ALMACEN") aAlmacen += q;
      else if (s.destination === "PROVEEDOR") aProveedor += q;
      else perdida += q;
    }
    return { monto, aAlmacen, aProveedor, perdida };
  }, [sel, d]);

  async function guardar() {
    setErr(null);
    const items = Object.entries(sel)
      .map(([id, s]) => ({
        note_item_id: id,
        quantity: Number(s.qty.replace(",", ".")) || 0,
        reason: s.reason,
        destination: s.destination,
        observation: s.obs,
      }))
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      setErr("Marca al menos una linea y ponle cantidad.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("create_return", {
      p_note_id: noteId,
      p_return_date: fecha,
      p_items: items,
      p_notes: null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved();
  }

  async function borrar(id: string) {
    const ok = await confirmar({
      titulo: "¿Eliminar esta devolucion?",
      mensaje: "La mercancia vuelve a contarse como vendida y la deuda del cliente vuelve a subir.",
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_return", { p_return_id: id });
    if (error) {
      setErr(error.message);
      return;
    }
    cargar();
  }

  const nuevaDeuda = col
    ? Math.max(col.neto - resumen.monto - col.paid, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">
            Devolver {col ? `de la nota ${col.sequence_number}` : ""}
          </h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            cerrar
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {col?.display_name} · marca lo que el cliente trajo de vuelta
        </p>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-[11px] text-gray-500">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-8 px-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {d?.lineas_vendidas.map((l) => {
          const s = sel[l.note_item_id];
          const disponible = l.quantity - l.ya_devuelto;
          return (
            <div
              key={l.note_item_id}
              className={`border rounded-xl p-3 mb-2 ${
                s ? "border-indigo-300" : "border-gray-200"
              } ${disponible <= 0 ? "opacity-50" : ""}`}
            >
              <div className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={!!s}
                  disabled={disponible <= 0}
                  onChange={() => marcar(l)}
                  className="w-3.5 h-3.5 shrink-0"
                />
                <span className="flex-1 min-w-0 truncate text-[13px]">
                  {l.description}
                </span>
                <span
                  className={`text-[10.5px] px-1.5 py-[1px] rounded-full shrink-0 ${
                    l.supply_type === "PEDIDO"
                      ? "bg-violet-50 text-violet-800"
                      : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {l.supply_type === "PEDIDO" ? "bajo pedido" : "de almacen"}
                </span>
                <span className="text-[11.5px] text-gray-500 shrink-0">
                  vendio {l.quantity}
                  {l.ya_devuelto > 0 && ` · devolvio ${l.ya_devuelto}`}
                </span>
                {s && (
                  <input
                    value={s.qty}
                    onChange={(e) => editar(l.note_item_id, "qty", e.target.value)}
                    className="w-14 h-7 px-2 border border-indigo-300 rounded-lg text-sm text-right shrink-0"
                  />
                )}
                <span className="w-16 text-right text-[13px] shrink-0">
                  {s
                    ? money((Number(s.qty.replace(",", ".")) || 0) * l.unit_price)
                    : money(l.unit_price)}
                </span>
              </div>

              {s && (
                <div className="mt-2.5">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[10.5px] text-gray-500 mb-1">
                        Motivo
                      </label>
                      <select
                        value={s.reason}
                        onChange={(e) => editar(l.note_item_id, "reason", e.target.value)}
                        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-[12.5px]"
                      >
                        {MOTIVOS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-gray-500 mb-1">
                        ¿A donde va?
                      </label>
                      <select
                        value={s.destination}
                        onChange={(e) =>
                          editar(l.note_item_id, "destination", e.target.value)
                        }
                        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-[12.5px]"
                      >
                        {DESTINOS.map((x) => (
                          <option key={x.k} value={x.k}>
                            {x.l}
                            {x.k === "PROVEEDOR" && l.supplier_name
                              ? ` (${l.supplier_name})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <input
                    value={s.obs}
                    onChange={(e) => editar(l.note_item_id, "obs", e.target.value)}
                    placeholder="Observacion: que paso exactamente"
                    className="w-full h-8 px-2.5 border border-gray-200 rounded-lg text-[12.5px]"
                  />
                </div>
              )}
            </div>
          );
        })}

        {resumen.monto > 0 && col && (
          <div className="p-3 rounded-lg bg-emerald-50 text-[12.5px] text-emerald-800 leading-relaxed mb-3">
            {resumen.aAlmacen > 0 && (
              <div>· {resumen.aAlmacen} unidades vuelven a tu almacen</div>
            )}
            {resumen.aProveedor > 0 && (
              <div>· {resumen.aProveedor} no tocan tu stock, van de vuelta al proveedor</div>
            )}
            {resumen.perdida > 0 && (
              <div>· {resumen.perdida} se pierden</div>
            )}
            <div>
              · el cliente deja de deber{" "}
              <b className="font-medium">${money(resumen.monto)}</b>
              {nuevaDeuda > 0
                ? `, le queda debiendo $${money(nuevaDeuda)}`
                : ", queda en cero"}
            </div>
          </div>
        )}

        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 mb-5">
          <button
            onClick={guardar}
            disabled={busy || resumen.monto <= 0}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-40"
          >
            {busy ? "Guardando..." : "Guardar devolucion"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>

        {d && d.devoluciones.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] text-gray-400 mb-2">
              Devoluciones ya registradas de esta nota
            </p>
            {d.devoluciones.map((r) => (
              <div
                key={r.id}
                className="group border border-orange-200 bg-orange-50/50 rounded-lg p-2.5 mb-2"
              >
                <div className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="text-orange-800">
                    D-{String(r.numero).padStart(3, "0")} · {r.return_date}
                  </span>
                  <span className="ml-auto text-orange-900">−${money(r.total)}</span>
                  <button
                    onClick={() => borrar(r.id)}
                    className="text-[11px] text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                  >
                    eliminar
                  </button>
                </div>
                {r.items.map((it, i) => (
                  <div key={i} className="text-[11.5px] text-gray-600 mt-1">
                    {it.quantity} × {it.description} · {it.reason} ·{" "}
                    {it.destination === "ALMACEN"
                      ? "volvio al almacen"
                      : it.destination === "PROVEEDOR"
                      ? "al proveedor"
                      : "perdida"}
                    {it.observation && ` · ${it.observation}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Fila({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between text-[12px] py-[2px]">
      <span className="text-gray-400">{k}</span>
      <span className={tone ?? "text-gray-100"}>{v}</span>
    </div>
  );
}

/* ================= ventana de busqueda profunda ================= */

function BusquedaModal({ onClose }: { onClose: () => void }) {
  const [cliente, setCliente] = useState<ClienteHit | null>(null);
  const [texto, setTexto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [res, setRes] = useState<Busqueda | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clienteId = cliente?.id ?? "";

  async function buscar() {
    setErr(null);
    if (!clienteId && !texto.trim()) {
      setErr("Elige un cliente o escribe un producto. Puedes usar solo uno de los dos.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("deep_search", {
      p_client_id: clienteId || null,
      p_text: texto.trim(),
      p_from: desde || null,
      p_to: hasta || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setRes(data as Busqueda);
  }

  const maxMes = useMemo(() => {
    if (!res || res.por_mes.length === 0) return 0;
    return Math.max(...res.por_mes.map((m) => m.unidades));
  }, [res]);

  const clienteNombre = cliente?.name ?? "";

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">Busqueda profunda</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            cerrar
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Busca que le vendiste a quien. Puedes llenar uno solo de los dos campos.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Cliente</label>
            <ClientePicker
              value={cliente}
              onChange={setCliente}
              placeholder="Escribe el nombre, ej: repues"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Producto: codigo o nombre
            </label>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscar();
              }}
              placeholder="330REPOTEN o cruceta GUT-20"
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 items-center mb-4">
          <span className="text-[11px] text-gray-400">desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-8 px-2 border border-gray-200 rounded-lg text-xs"
          />
          <span className="text-[11px] text-gray-400">hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-8 px-2 border border-gray-200 rounded-lg text-xs"
          />
          <button
            onClick={buscar}
            disabled={busy}
            className="ml-auto px-4 h-8 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        {res && res.lineas_count === 0 && (
          <div className="p-3 rounded-lg bg-gray-50 text-sm text-gray-600">
            No hay resultados. {clienteNombre && texto
              ? `${clienteNombre} no ha llevado nada que coincida con "${texto}".`
              : "Prueba con menos palabras o quita el rango de fechas."}
          </div>
        )}

        {res && res.lineas_count > 0 && (
          <>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-sm text-emerald-800 mb-3">
              {clienteNombre ? "Si lo ha llevado: " : "Encontrado: "}
              <b className="font-medium">{money(res.unidades)} unidades</b> en{" "}
              <b className="font-medium">{res.notas} notas</b>
              {res.primera_fecha && res.ultima_fecha && (
                <> , entre {res.primera_fecha} y {res.ultima_fecha}</>
              )}
              {res.ultimo_precio != null && (
                <>. Ultimo precio <b className="font-medium">${money(res.ultimo_precio)}</b></>
              )}
              . Total <b className="font-medium">${money(res.total_usd)}</b>
            </div>

            {res.por_mes.length > 1 && (
              <div className="flex gap-1 items-end h-14 mb-4">
                {res.por_mes.map((m) => (
                  <div key={m.mes} className="flex-1 text-center group relative">
                    <div
                      className="bg-violet-300 group-hover:bg-violet-500 rounded-t transition-colors"
                      style={{
                        height: `${maxMes > 0 ? (m.unidades / maxMes) * 40 : 0}px`,
                        minHeight: "2px",
                      }}
                    />
                    <div className="text-[9.5px] text-gray-400 mt-1">
                      {MESES_CORTOS[Number(m.mes.slice(5, 7)) - 1]}
                    </div>
                    <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {money(m.unidades)} uds · ${money(m.total)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2.5 px-1 py-1.5 border-b border-gray-100 text-[10.5px] text-gray-400">
              <span className="w-14">fecha</span>
              <span className="w-8">nota</span>
              {!clienteId && <span className="w-28">cliente</span>}
              <span className="flex-1 min-w-0">producto</span>
              <span className="w-10 text-right">cant</span>
              <span className="w-14 text-right">precio $</span>
              <span className="w-14 text-right">total $</span>
            </div>
            {res.lineas.map((l, i) => (
              <div
                key={`${l.note_id}-${i}`}
                className="flex gap-2.5 px-1 py-1.5 border-b border-gray-50 text-[12.5px]"
              >
                <span className="w-14 text-gray-500">{l.note_date}</span>
                <Link
                  href={`/notas/nueva?id=${l.note_id}`}
                  className="w-8 text-indigo-600 hover:underline font-mono text-[10.5px]"
                >
                  {l.sequence_number}
                </Link>
                {!clienteId && (
                  <span className="w-28 truncate text-gray-600">{l.display_name}</span>
                )}
                <span className="flex-1 min-w-0 truncate" title={l.description}>
                  {l.description}
                </span>
                <span className="w-10 text-right">{money(l.quantity)}</span>
                <span className="w-14 text-right">{money(l.unit_price)}</span>
                <span className="w-14 text-right">{money(l.line_total)}</span>
              </div>
            ))}

            <p className="text-[11px] text-gray-400 mt-3">
              Todos los precios en dolares, sin importar en que moneda se hizo cada nota.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
