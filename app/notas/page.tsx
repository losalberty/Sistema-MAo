"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  EyeOff,
  Eye,
  FilePlus2,
  HandCoins,
  Inbox,
  Maximize2,
  Pencil,
  Printer,
  RotateCcw,
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
import {
  EmptyState,
  Pill,
  SkeletonRows,
  ToolbarButton,
  ToolbarSeparator,
  confirmar,
  notify,
  type PillTone,
} from "@/components/ui";

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

export default function NotasPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [year, setYear] = useState<string>("");
  const [month, setMonth] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<number | null>(null);
  const [estados, setEstados] = useState<string[]>(["PENDIENTE", "ABONADA", "COBRADO"]);
  const [verGanancia, setVerGanancia] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dragging = useRef(false);
  const dragAdds = useRef(true);

  const [abonarId, setAbonarId] = useState<string | null>(null);
  const [devolverId, setDevolverId] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [showBuscar, setShowBuscar] = useState(false);

  // cuadro negro de informacion rapida
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_notes");
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setNotes((data ?? []) as NoteRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!year && notes.length > 0) setYear(notes[0].note_date.slice(0, 4));
  }, [notes, year]);

  useEffect(() => {
    function up() {
      dragging.current = false;
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
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

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) s.add(n.note_date.slice(0, 4));
    return Array.from(s).sort().reverse();
  }, [notes]);

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
    setFichaId(null);
    notify.ok(n ? `Nota #${n.sequence_number} eliminada` : "Nota eliminada");
  }

  function toggleEstado(k: string) {
    setEstados((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function setSel(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // notas del año (base para el total anual)
  const delAnio = useMemo(
    () => notes.filter((n) => !year || n.note_date.slice(0, 4) === year),
    [notes, year]
  );

  const filtered = useMemo(() => {
    let list = delAnio;
    if (month !== null) {
      list = list.filter((n) => Number(n.note_date.slice(5, 7)) - 1 === month);
    } else if (quarter !== null) {
      list = list.filter((n) => {
        const m = Number(n.note_date.slice(5, 7)) - 1;
        return Math.floor(m / 3) === quarter;
      });
    }
    if (estados.length > 0 && estados.length < ESTADOS.length) {
      list = list.filter((n) => estados.includes(n.effective_status));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.display_name.toLowerCase().includes(q) ||
          String(n.sequence_number).includes(q)
      );
    }
    return list;
  }, [delAnio, month, quarter, estados, search]);

  const totals = useMemo(() => {
    const vivo = (n: NoteRow) => n.effective_status !== "ANULADO";
    const anio = delAnio.filter(vivo).reduce((s, n) => s + n.total, 0);
    const mes = filtered.filter(vivo).reduce((s, n) => s + n.total, 0);
    const porCobrar = delAnio.filter(vivo).reduce((s, n) => s + n.pending_usd, 0);
    let sel = 0;
    let selCount = 0;
    for (const n of filtered) {
      if (selected.has(n.id)) {
        sel += n.total;
        selCount++;
      }
    }
    return { anio, mes, porCobrar, sel, selCount };
  }, [delAnio, filtered, selected]);

  const etiquetaPeriodo =
    month !== null
      ? MESES_LARGOS[month]
      : quarter !== null
      ? `trimestre ${quarter + 1}`
      : "todo el año";

  const abonarNote = notes.find((n) => n.id === abonarId) ?? null;
  const hoverNote = hover ? notes.find((n) => n.id === hover.id) ?? null : null;

  // ---------- acciones de la barra: trabajan sobre la nota marcada ----------
  function unaMarcada(accion: string): NoteRow | null {
    const marcadas = filtered.filter((n) => selected.has(n.id));
    if (marcadas.length === 1) return marcadas[0];
    notify.info(
      marcadas.length === 0 ? "Marca una nota primero" : "Marca solo una nota",
      `Para ${accion}, marca la casilla de la nota en la lista.`
    );
    return null;
  }

  function accionFicha() {
    const n = unaMarcada("ver su ficha");
    if (n) setFichaId(n.id);
  }
  function accionEditar() {
    const n = unaMarcada("editarla");
    if (n) router.push(`/notas/nueva?id=${n.id}`);
  }
  function accionAbonar() {
    const n = unaMarcada("abonar");
    if (!n) return;
    if (n.effective_status === "ANULADO") return notify.aviso("Esa nota esta anulada");
    if (n.pending_usd <= 0.005) return notify.info("Esa nota ya esta cobrada completa");
    setAbonarId(n.id);
  }
  function accionDevolver() {
    const n = unaMarcada("registrar una devolucion");
    if (!n) return;
    if (n.effective_status === "ANULADO") return notify.aviso("Esa nota esta anulada");
    setDevolverId(n.id);
  }

  // ---------- cuadro negro: aparece tras una pausa, solo informa ----------
  function entrarFila(id: string, el: HTMLElement) {
    if (dragging.current) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    // la primera vez espera un poco (para no molestar al pasar de largo);
    // si ya hay un cuadro abierto, cambia al instante a la fila nueva
    if (hover) {
      setHover({ id, rect: el.getBoundingClientRect() });
      return;
    }
    hoverTimer.current = setTimeout(() => {
      setHover({ id, rect: el.getBoundingClientRect() });
    }, 380);
  }
  function salirFila() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
  }

  return (
    <main className="p-6 max-w-[1180px]">
      {/* ---------- encabezado ---------- */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Notas</h1>
          <p className="text-[13px] text-gray-500">
            {filtered.length} notas · {etiquetaPeriodo}
          </p>
        </div>
      </div>

      {/* ---------- barra de accesos directos ---------- */}
      <div className="mb-3 flex items-center gap-0.5 rounded-xl bg-white border border-gray-200 shadow-card px-1.5 py-1 overflow-x-auto">
        <ToolbarButton
          icon={FilePlus2}
          label="nueva nota"
          tone="brand"
          onClick={() => router.push("/notas/nueva")}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={Maximize2} label="ver ficha" onClick={accionFicha} />
        <ToolbarButton icon={Pencil} label="editar" onClick={accionEditar} />
        <ToolbarButton icon={HandCoins} label="abonar" tone="success" onClick={accionAbonar} />
        <ToolbarButton icon={Undo2} label="devolver" onClick={accionDevolver} />
        <ToolbarSeparator />
        <ToolbarButton
          icon={ScanSearch}
          label="buscar a fondo"
          onClick={() => setShowBuscar(true)}
        />
        <ToolbarButton
          icon={verGanancia ? EyeOff : TrendingUp}
          label={verGanancia ? "ocultar ganancia" : "ver ganancia"}
          active={verGanancia}
          onClick={() => setVerGanancia((v) => !v)}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={Wallet} label="cobranzas" onClick={() => router.push("/cobranzas")} />
        <ToolbarButton
          icon={RotateCcw}
          label="devoluciones"
          onClick={() => router.push("/devoluciones")}
        />
        <div className="ml-auto pl-3 pr-1.5 text-[11px] text-gray-400 whitespace-nowrap hidden lg:block">
          marca una nota y usa la barra
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
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
            {years.map((y) => (
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
                    month === i
                      ? "bg-brand-700 text-white"
                      : "text-gray-600 hover:bg-gray-100"
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
                    quarter === q
                      ? "bg-brand-700 text-white"
                      : "text-gray-400 hover:bg-gray-100"
                  }`}
                  style={{ marginTop: q === 0 ? 11 : 31 }}
                >
                  {q + 1}T
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-200/70 my-2.5" />

          {ESTADOS.map((e) => (
            <label
              key={e.key}
              className="flex items-center gap-1.5 text-[11.5px] mb-1 cursor-pointer text-gray-600"
            >
              <input
                type="checkbox"
                checked={estados.includes(e.key)}
                onChange={() => toggleEstado(e.key)}
                className="w-3 h-3 accent-brand-700"
              />
              {e.label}
            </label>
          ))}

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
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente o numero de nota"
                className="w-full h-8 pl-8 pr-2.5 border border-gray-200 rounded-lg text-[12.5px]"
              />
            </div>
          </div>

          {/* encabezado de columnas: cada dato en su columna fija */}
          <div className="flex gap-2.5 items-center px-3 py-1.5 border-b border-gray-300 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
            <span className="w-3.5 shrink-0" />
            <span className="w-11 shrink-0">nº</span>
            <span className="w-14 shrink-0">fecha</span>
            <span className="flex-1 min-w-0">cliente</span>
            <span className="w-[92px] shrink-0">estado</span>
            <span className="w-[70px] shrink-0">cobro</span>
            <span className="w-[82px] shrink-0">moneda</span>
            {verGanancia && <span className="w-16 shrink-0 text-right">ganancia</span>}
            <span className="w-[84px] shrink-0 text-right">monto</span>
            <span className="w-7 shrink-0" />
          </div>

          {loading && <SkeletonRows rows={8} />}

          {!loading && filtered.length === 0 && (
            <EmptyState icon={Inbox} title="No hay notas que coincidan">
              Revisa el mes, los estados marcados a la izquierda, o lo que escribiste en el
              buscador.
            </EmptyState>
          )}

          <div className="select-none" onMouseLeave={salirFila}>
            {!loading &&
              filtered.map((n, idx) => {
                const pct = n.total > 0 ? Math.min((n.paid_usd / n.total) * 100, 100) : 0;
                const anulada = n.effective_status === "ANULADO";
                const d = new Date(n.note_date + "T00:00:00");
                const profit = n.total - n.total_cost;
                const isSel = selected.has(n.id);
                const est = estadoDe(n);
                const m = moneda(n.currency_mode);
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
                    onDoubleClick={() => setFichaId(n.id)}
                    className={`group flex gap-2.5 items-center px-3 h-9 border-b border-gray-100 text-[12.5px] cursor-default ${
                      isSel
                        ? "bg-brand-50/70"
                        : idx % 2
                        ? "bg-gray-50/40 hover:bg-gray-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => setSel(n.id, !isSel)}
                      className="w-3 h-3 shrink-0 accent-brand-700"
                      aria-label={`Marcar nota ${n.sequence_number}`}
                    />
                    <span className="w-11 shrink-0 text-[11px] text-gray-400 font-mono">
                      {n.sequence_number}
                    </span>
                    <span className="w-14 shrink-0 text-gray-500">
                      {DIAS_CORTOS[d.getDay()]} {d.getDate()}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      <Link
                        href={`/notas/nueva?id=${n.id}`}
                        className={
                          anulada
                            ? "text-gray-400 line-through"
                            : "text-gray-800 hover:text-brand-700 hover:underline"
                        }
                      >
                        {n.display_name}
                      </Link>
                    </span>
                    <span className="w-[92px] shrink-0">
                      <Pill tone={est.tone}>{est.texto}</Pill>
                    </span>
                    <span className="w-[70px] shrink-0 flex items-center gap-1.5">
                      <span className="flex-1 h-[4px] bg-gray-100 rounded-full overflow-hidden">
                        <span
                          className={`block h-full ${anulada ? "bg-gray-300" : "bg-emerald-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-7 text-right text-[10px] text-gray-400">
                        {Math.round(pct)}%
                      </span>
                    </span>
                    <span className="w-[82px] shrink-0">
                      <Pill tone={TONO_MONEDA[n.currency_mode] ?? "neutral"}>{m.label}</Pill>
                    </span>
                    {verGanancia && (
                      <span
                        className={`w-16 shrink-0 text-right ${
                          profit < 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {money(profit)}
                      </span>
                    )}
                    <span
                      className={`w-[84px] shrink-0 text-right flex items-center justify-end gap-1 ${
                        anulada ? "text-gray-400" : "text-gray-900"
                      }`}
                    >
                      {n.returned_usd > 0 && (
                        <span title={`Devolucion: -$${money(n.returned_usd)}`}>
                          <Undo2 size={12} className="text-orange-500" />
                        </span>
                      )}
                      {money(n.total)}
                    </span>
                    <span className="w-7 shrink-0 flex justify-end">
                      <button
                        onClick={() => setFichaId(n.id)}
                        title="Abrir ficha de la nota"
                        aria-label={`Abrir ficha de la nota ${n.sequence_number}`}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 group-hover:text-gray-500 hover:!text-brand-700 hover:bg-brand-50"
                      >
                        <Maximize2 size={13} strokeWidth={2} />
                      </button>
                    </span>
                  </div>
                );
              })}
          </div>

          {/* ---------- pie ---------- */}
          <div className="flex items-center gap-3 px-3 py-2 border-t border-gray-200 bg-gray-50 text-[11.5px]">
            {totals.selCount > 0 ? (
              <span className="text-brand-700">
                {totals.selCount} seleccionadas{" "}
                <b className="font-medium">${money(totals.sel)}</b>
                <button
                  onClick={() => setSelected(new Set())}
                  className="ml-2 text-gray-400 hover:text-gray-700 underline"
                >
                  quitar
                </button>
              </span>
            ) : (
              <span className="text-gray-400">
                arrastra sobre las filas para ir sumando · doble clic abre la ficha
              </span>
            )}
            <span className="ml-auto text-gray-500">
              {month !== null
                ? MESES_CORTOS[month]
                : quarter !== null
                ? `${quarter + 1}T`
                : "periodo"}{" "}
              <b className="font-medium text-gray-900">${miles(totals.mes)}</b>
            </span>
            <span className="text-gray-500">
              año <b className="font-medium text-gray-900">${miles(totals.anio)}</b>
            </span>
            <span className="text-gray-500">
              por cobrar{" "}
              <b className="font-medium text-amber-700">${miles(totals.porCobrar)}</b>
            </span>
          </div>
        </section>
      </div>

      {hover && hoverNote && !fichaId && <CuadroRapido n={hoverNote} rect={hover.rect} />}

      {fichaId && (
        <FichaNota
          noteId={fichaId}
          row={notes.find((x) => x.id === fichaId) ?? null}
          onClose={() => setFichaId(null)}
          onAbonar={(id) => {
            setFichaId(null);
            setAbonarId(id);
          }}
          onDevolver={(id) => {
            setFichaId(null);
            setDevolverId(id);
          }}
          onEditar={(id) => router.push(`/notas/nueva?id=${id}`)}
          onVer={(id) => router.push(`/notas/ver?id=${id}`)}
          onBorrar={handleDelete}
        />
      )}

      {abonarId && abonarNote && (
        <AbonarModal
          noteId={abonarId}
          defaultCurrency={abonarNote.currency_mode}
          defaultRate={effectiveRate(
            abonarNote.currency_mode,
            abonarNote.exchange_rate,
            abonarNote.exchange_gap_percent
          )}
          onClose={() => setAbonarId(null)}
          onSaved={() => {
            setAbonarId(null);
            notify.ok("Abono registrado");
            load();
          }}
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

/* ================= cuadro negro: informacion rapida al pasar el cursor ================= */
/*
 * Solo informa: no tiene botones, asi que no hace falta "entrar" en el.
 * Se mide a si mismo y se coloca donde quepa: abajo de la fila si hay
 * espacio, y si no, arriba. Nunca queda cortado por el borde de la pantalla.
 */
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

/* ================= ficha de la nota: ventana al centro con todo ================= */

type DetalleNota = {
  items?: {
    code_snapshot: string;
    description_snapshot: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
};

function FichaNota({
  noteId,
  row,
  onClose,
  onAbonar,
  onDevolver,
  onEditar,
  onVer,
  onBorrar,
}: {
  noteId: string;
  row: NoteRow | null;
  onClose: () => void;
  onAbonar: (id: string) => void;
  onDevolver: (id: string) => void;
  onEditar: (id: string) => void;
  onVer: (id: string) => void;
  onBorrar: (id: string) => void;
}) {
  const [det, setDet] = useState<DetalleNota | null>(null);
  const [col, setCol] = useState<Collection | null>(null);
  const [verRentab, setVerRentab] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.rpc("get_note_detail", { p_note_id: noteId }),
      supabase.rpc("note_collection", { p_note_id: noteId }),
    ]).then(([r1, r2]) => {
      if (!vivo) return;
      const d = Array.isArray(r1.data) ? r1.data[0] : r1.data;
      setDet((d ?? null) as DetalleNota | null);
      if (!r2.error) setCol(r2.data as Collection);
    });
    return () => {
      vivo = false;
    };
  }, [noteId]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onClose]);

  if (!row) return null;

  const n = row;
  const est = estadoDe(n);
  const m = moneda(n.currency_mode);
  const tasa = effectiveRate(n.currency_mode, n.exchange_rate, n.exchange_gap_percent);
  const anulada = n.effective_status === "ANULADO";
  const neto = n.total - (n.returned_usd ?? 0);
  const pct = neto > 0 ? Math.min((n.paid_usd / neto) * 100, 100) : 100;
  const profit = n.total - n.total_cost;
  const margen = n.total > 0 ? (profit / n.total) * 100 : 0;
  const lineas = det?.items ?? [];
  const pagos = (col?.payments ?? []).filter((p) => !p.voided);
  const puedeAbonar = !anulada && n.pending_usd > 0.005;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ficha-titulo"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* cabecera */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-mono text-gray-400">
                Nota #{String(n.sequence_number).padStart(4, "0")}
              </span>
              <Pill tone={est.tone}>{est.texto}</Pill>
              <Pill tone={TONO_MONEDA[n.currency_mode] ?? "neutral"}>{m.label}</Pill>
            </div>
            <h2
              id="ficha-titulo"
              className={`text-[18px] font-semibold tracking-tight truncate ${
                anulada ? "text-gray-400 line-through" : "text-gray-900"
              }`}
            >
              {n.display_name}
            </h2>
            <p className="text-[12px] text-gray-500 flex items-center gap-1.5">
              <CalendarDays size={13} /> {fechaLarga(n.note_date)}
              {n.due_date && n.pending_usd > 0.005 && (
                <span className={n.days_overdue > 0 ? "text-red-600" : ""}>
                  · vence {n.due_date}
                  {n.days_overdue > 0 ? ` (hace ${n.days_overdue} dias)` : ""}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 grid grid-cols-1 md:grid-cols-[1fr_230px] gap-5">
          {/* izquierda: lineas y abonos */}
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">
              Productos
            </p>
            {!det ? (
              <div className="space-y-2 py-1">
                <div className="skeleton h-3 w-4/5" />
                <div className="skeleton h-3 w-3/5" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ) : lineas.length === 0 ? (
              <p className="text-[12.5px] text-gray-400">Sin lineas.</p>
            ) : (
              <div className="rounded-lg border border-gray-100">
                {lineas.slice(0, 7).map((l, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 px-2.5 py-1.5 text-[12.5px] ${
                      i ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <span className="w-9 shrink-0 text-right text-gray-500">{l.quantity}×</span>
                    <span className="flex-1 min-w-0 truncate text-gray-800">
                      {l.description_snapshot}
                    </span>
                    <span className="shrink-0 text-gray-900">{money(l.line_total)}</span>
                  </div>
                ))}
                {lineas.length > 7 && (
                  <div className="px-2.5 py-1.5 border-t border-gray-100 text-[11.5px] text-gray-400">
                    y {lineas.length - 7} lineas mas
                  </div>
                )}
              </div>
            )}

            <p className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400 mt-4 mb-1.5">
              Abonos
            </p>
            {!col ? (
              <div className="skeleton h-3 w-1/2" />
            ) : pagos.length === 0 ? (
              <p className="text-[12.5px] text-gray-400">Todavia no hay abonos.</p>
            ) : (
              <div className="rounded-lg border border-gray-100">
                {pagos.slice(-5).map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex gap-2 px-2.5 py-1.5 text-[12.5px] ${
                      i ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <span className="w-[74px] shrink-0 text-gray-500">{p.payment_date}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-600">
                      {moneda(p.currency_mode).corto} {money(p.amount_currency)}
                      {p.method ? ` · ${p.method}` : ""}
                    </span>
                    <span className="shrink-0 text-emerald-700">${money(p.amount_usd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* derecha: montos */}
          <div className="md:border-l md:border-gray-100 md:pl-5">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 mb-3">
              <p className="text-[11px] text-gray-500">Falta por cobrar</p>
              <p
                className={`text-[24px] font-semibold tracking-tight ${
                  n.pending_usd > 0.005 ? "text-gray-900" : "text-emerald-700"
                }`}
              >
                ${money(n.pending_usd)}
              </p>
              <div className="mt-1.5 h-[5px] bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[10.5px] text-gray-500">{Math.round(pct)}% cobrado</p>
            </div>

            <Dato k="Total" v={`$${money(n.total)}`} />
            {n.discount > 0 && <Dato k="Descuento" v={`−$${money(n.discount)}`} />}
            {n.returned_usd > 0 && (
              <Dato k="Devuelto" v={`−$${money(n.returned_usd)}`} tone="text-orange-700" />
            )}
            <Dato k="Abonado" v={`$${money(n.paid_usd)}`} tone="text-emerald-700" />
            {n.credit_usd > 0 && (
              <Dato k="Saldo a favor" v={`$${money(n.credit_usd)}`} tone="text-sky-700" />
            )}
            {n.currency_mode !== "USD" && (
              <>
                <div className="h-px bg-gray-100 my-2" />
                <Dato
                  k="Tasa usada"
                  v={
                    tasa > 0
                      ? tasa.toLocaleString("en-US", { maximumFractionDigits: 4 })
                      : "sin tasa"
                  }
                />
                <Dato k={`Total en ${m.corto}`} v={tasa > 0 ? miles(n.total * tasa) : "—"} />
              </>
            )}

            <div className="h-px bg-gray-100 my-2" />
            <button
              onClick={() => setVerRentab((v) => !v)}
              className="w-full flex items-center justify-between text-[12px] text-gray-500 hover:text-gray-800 py-0.5"
            >
              <span className="flex items-center gap-1.5">
                {verRentab ? <EyeOff size={13} /> : <Eye size={13} />} Rentabilidad
              </span>
              {verRentab ? (
                <span className={profit < 0 ? "text-red-600" : "text-emerald-700"}>
                  ${money(profit)} · {margen.toFixed(1)}%
                </span>
              ) : (
                <span className="text-gray-300">oculta</span>
              )}
            </button>
          </div>
        </div>

        {/* acciones: cada una lleva a donde corresponde */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 bg-gray-50/80 border-t border-gray-100">
          <BotonFicha
            icon={HandCoins}
            label="Abonar"
            principal
            disabled={!puedeAbonar}
            title={
              anulada
                ? "La nota esta anulada"
                : n.pending_usd <= 0.005
                ? "Ya esta cobrada completa"
                : "Registrar un abono"
            }
            onClick={() => onAbonar(n.id)}
          />
          <BotonFicha
            icon={Undo2}
            label="Devolver"
            disabled={anulada}
            onClick={() => onDevolver(n.id)}
          />
          <BotonFicha icon={Pencil} label="Editar" onClick={() => onEditar(n.id)} />
          <BotonFicha icon={Printer} label="Ver / imprimir" onClick={() => onVer(n.id)} />
          <button
            onClick={() => onBorrar(n.id)}
            className="ml-auto h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-[12.5px] text-red-600 hover:bg-red-50"
          >
            <Trash2 size={15} strokeWidth={1.75} />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function Dato({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between text-[12.5px] py-[3px]">
      <span className="text-gray-500">{k}</span>
      <span className={tone ?? "text-gray-900"}>{v}</span>
    </div>
  );
}

function BotonFicha({
  icon: Icono,
  label,
  onClick,
  principal,
  disabled,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  principal?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg text-[12.5px] disabled:opacity-35 disabled:pointer-events-none ${
        principal
          ? "bg-emerald-600 text-white font-medium shadow-sm hover:bg-emerald-700"
          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      <Icono size={15} strokeWidth={principal ? 2 : 1.75} />
      {label}
    </button>
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

/* ================= ventana de abono ================= */

function AbonarModal({
  noteId,
  defaultCurrency,
  defaultRate,
  onClose,
  onSaved,
}: {
  noteId: string;
  defaultCurrency: string;
  defaultRate: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [col, setCol] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [mon, setMon] = useState(defaultCurrency);
  const [monto, setMonto] = useState("");
  const [tasa, setTasa] = useState(defaultRate > 0 ? String(defaultRate) : "");
  const [metodo, setMetodo] = useState("");
  const [refe, setRefe] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc("note_collection", { p_note_id: noteId });
    if (error) {
      setErr(error.message);
      return;
    }
    setCol(data as Collection);
  }, [noteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const montoNum = Number(monto.replace(",", ".")) || 0;
  const tasaNum = Number(tasa.replace(",", ".")) || 0;
  const equivale = mon === "USD" ? montoNum : tasaNum > 0 ? montoNum / tasaNum : 0;
  const quedaria = col ? Math.max(col.pending - equivale, 0) : 0;

  async function guardar() {
    setErr(null);
    if (montoNum <= 0) {
      setErr("Escribe el monto del abono.");
      return;
    }
    if (mon !== "USD" && tasaNum <= 0) {
      setErr("Falta la tasa de cambio.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("add_note_payment", {
      p_note_id: noteId,
      p_payment_date: fecha,
      p_currency_mode: mon,
      p_amount_currency: montoNum,
      p_exchange_rate: mon === "USD" ? null : tasaNum,
      p_method: metodo || null,
      p_reference: refe || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved();
  }

  async function anular(id: string) {
    const ok = await confirmar({
      titulo: "¿Anular este abono?",
      mensaje: "Queda registrado en el historial pero deja de contar para el pago de la nota.",
      textoSi: "Si, anular",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("void_note_payment", { p_payment_id: id });
    if (error) {
      setErr(error.message);
      return;
    }
    cargar();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            Abonar {col ? `· nota ${col.sequence_number}` : ""}
          </h2>
          {col && (
            <span className="text-xs text-gray-500">
              falta <b className="text-red-600 font-medium">${money(col.pending)}</b> de $
              {money(col.total)}
            </span>
          )}
        </div>

        {col && <p className="text-sm text-gray-700 mb-4">{col.display_name}</p>}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Recibí en</label>
            <select
              value={mon}
              onChange={(e) => setMon(e.target.value)}
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            >
              {MONEDAS.map((c) => (
                <option key={c.key} value={c.key}>{c.largo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Monto recibido</label>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Tasa {mon === "USD" && <span className="text-gray-300">(no aplica)</span>}
            </label>
            <input
              value={mon === "USD" ? "" : tasa}
              onChange={(e) => setTasa(e.target.value)}
              disabled={mon === "USD"}
              placeholder="0"
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
            />
          </div>
        </div>

        {montoNum > 0 && col && (
          <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 text-sm text-emerald-800">
            Equivale a <b className="font-medium">${money(equivale)}</b> — la nota quedaría en{" "}
            <b className="font-medium">${money(quedaria)}</b> pendiente
            {quedaria <= 0.005 && <span className="ml-1">(cobrada completa)</span>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <input
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            placeholder="Metodo (efectivo, pago movil...)"
            className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
          />
          <input
            value={refe}
            onChange={(e) => setRefe(e.target.value)}
            placeholder="Referencia"
            className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 mb-5">
          <button
            onClick={guardar}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Registrar abono"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        {col && col.payments.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] text-gray-400 mb-2">Abonos anteriores</p>
            {col.payments.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between text-[13px] py-1.5"
              >
                <span className={p.voided ? "text-gray-300 line-through" : "text-gray-500"}>
                  {p.payment_date} · {moneda(p.currency_mode).corto}{" "}
                  {money(p.amount_currency)}
                  {p.method ? ` · ${p.method}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span className={p.voided ? "text-gray-300 line-through" : "text-gray-900"}>
                    ${money(p.amount_usd)}
                  </span>
                  {!p.voided && (
                    <button
                      onClick={() => anular(p.id)}
                      className="text-[11px] text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100"
                    >
                      anular
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
