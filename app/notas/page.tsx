"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ClientePicker, { type ClienteHit } from "@/components/ClientePicker";

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

export default function NotasPage() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [year, setYear] = useState<string>("");
  const [month, setMonth] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<number | null>(null);
  const [estados, setEstados] = useState<string[]>(["PENDIENTE", "ABONADA", "COBRADO"]);
  const [verGanancia, setVerGanancia] = useState(false);
  const [showCols, setShowCols] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dragging = useRef(false);
  const dragAdds = useRef(true);

  const [abonarId, setAbonarId] = useState<string | null>(null);
  const [devolverId, setDevolverId] = useState<string | null>(null);
  const [showBuscar, setShowBuscar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_notes");
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
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

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) s.add(n.note_date.slice(0, 4));
    return Array.from(s).sort().reverse();
  }, [notes]);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta nota? Esta accion no se puede deshacer.")) return;
    const { error } = await supabase.rpc("delete_note", { p_note_id: id });
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
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

  return (
    <main className="p-6 max-w-[1150px]">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notas</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} notas · {etiquetaPeriodo}
          </p>
        </div>
        <Link
          href="/notas/nueva"
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700"
        >
          Nueva nota
        </Link>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
        {/* ---------- columna de periodos ---------- */}
        <aside className="w-[118px] shrink-0 border-r border-gray-100 p-2.5 select-none">
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setMonth(null);
              setQuarter(null);
              setSelected(new Set());
            }}
            className="w-full h-7 px-1.5 border border-gray-200 rounded-lg text-xs mb-2.5"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
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
                      ? "bg-gray-900 text-white"
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
                      ? "bg-gray-900 text-white"
                      : "text-gray-400 hover:bg-gray-100"
                  }`}
                  style={{ marginTop: q === 0 ? 11 : 31 }}
                >
                  {q + 1}T
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-100 my-2.5" />

          {ESTADOS.map((e) => (
            <label
              key={e.key}
              className="flex items-center gap-1.5 text-[11.5px] mb-1 cursor-pointer text-gray-600"
            >
              <input
                type="checkbox"
                checked={estados.includes(e.key)}
                onChange={() => toggleEstado(e.key)}
                className="w-3 h-3"
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
          <div className="flex gap-2 p-2.5 border-b border-gray-100">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente o numero de nota"
              className="flex-1 h-7 px-2.5 border border-gray-200 rounded-lg text-[12.5px]"
            />
            <button
              onClick={() => setShowBuscar(true)}
              className="h-7 px-2.5 rounded-lg border border-gray-200 text-[11.5px] text-gray-700 hover:bg-gray-50"
            >
              busqueda profunda
            </button>
            <div className="relative">
              <button
                onClick={() => setShowCols((v) => !v)}
                className="h-7 px-2.5 rounded-lg border border-gray-200 text-[11.5px] text-gray-700 hover:bg-gray-50"
              >
                columnas
              </button>
              {showCols && (
                <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 w-44">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={verGanancia}
                      onChange={(e) => setVerGanancia(e.target.checked)}
                      className="w-3 h-3"
                    />
                    mostrar ganancia
                  </label>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Se guarda apagada. La rentabilidad tambien esta dentro de cada nota.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 px-3 py-1.5 border-b border-gray-100 text-[10.5px] text-gray-400">
            <span className="w-3.5" />
            <span className="w-8">nº</span>
            <span className="w-12">fecha</span>
            <span className="flex-1 min-w-0">cliente</span>
            <span className="w-14">cobro</span>
            {verGanancia && <span className="w-14 text-right">ganancia</span>}
            <span className="w-[124px] text-right">monto</span>
          </div>

          {loading && <p className="text-sm text-gray-400 p-4">Cargando...</p>}

          {!loading && filtered.length === 0 && (
            <p className="text-sm text-gray-400 p-6">No hay notas que coincidan.</p>
          )}

          <div className="select-none">
            {filtered.map((n, idx) => {
              const m = moneda(n.currency_mode);
              const pct = n.total > 0 ? Math.min((n.paid_usd / n.total) * 100, 100) : 0;
              const anulada = n.effective_status === "ANULADO";
              const d = new Date(n.note_date + "T00:00:00");
              const tasa = effectiveRate(n.currency_mode, n.exchange_rate, n.exchange_gap_percent);
              const profit = n.total - n.total_cost;
              const isSel = selected.has(n.id);
              // en las ultimas filas el cuadro se abre hacia arriba
              const haciaArriba = filtered.length > 4 && idx >= filtered.length - 4;
              return (
                <div
                  key={n.id}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    dragging.current = true;
                    dragAdds.current = !isSel;
                    setSel(n.id, !isSel);
                  }}
                  onMouseEnter={() => {
                    if (dragging.current) setSel(n.id, dragAdds.current);
                  }}
                  className={`group relative flex gap-2.5 items-center px-3 py-[7px] border-b border-gray-50 text-[12.5px] cursor-default ${
                    isSel ? "bg-indigo-50/60" : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => setSel(n.id, !isSel)}
                    className="w-3 h-3 shrink-0"
                  />
                  <span className="w-8 text-[10.5px] text-gray-400 font-mono shrink-0">
                    {n.sequence_number}
                  </span>
                  <span className="w-12 text-gray-500 shrink-0">
                    {DIAS_CORTOS[d.getDay()]} {d.getDate()}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    <Link
                      href={`/notas/nueva?id=${n.id}`}
                      className={
                        anulada
                          ? "text-gray-400 line-through"
                          : "text-gray-800 hover:text-indigo-700 hover:underline"
                      }
                    >
                      {n.display_name}
                    </Link>
                    {n.days_overdue > 0 && (
                      <span className="ml-2 text-[10px] text-red-600">
                        vencida {n.days_overdue}d
                      </span>
                    )}
                    {n.returned_usd > 0 && (
                      <span className="ml-2 text-[10px] text-orange-700">
                        −{money(n.returned_usd)} dev
                      </span>
                    )}
                  </span>
                  <span className="w-14 shrink-0 h-[3px] bg-gray-100 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  {verGanancia && (
                    <span
                      className={`w-14 text-right shrink-0 ${
                        profit < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {money(profit)}
                    </span>
                  )}
                  <span className="w-[124px] shrink-0 flex items-center justify-end gap-1.5">
                    <span className={`text-[10.5px] px-1.5 py-[1px] rounded-full ${m.pill}`}>
                      {m.label}
                    </span>
                    <span className={`w-14 text-right ${anulada ? "text-gray-400" : ""}`}>
                      {money(n.total)}
                    </span>
                  </span>

                  {/* cuadro de detalle */}
                  <div
                    className={`hidden group-hover:block absolute right-3 z-30 w-[290px] bg-gray-800 rounded-xl px-3.5 py-3 shadow-xl ${
                      haciaArriba ? "bottom-full mb-1" : "top-full mt-1"
                    }`}
                  >
                    <Fila k="Fecha" v={fechaLarga(n.note_date)} />
                    <Fila k="Moneda" v={m.largo} />
                    {n.currency_mode !== "USD" && (
                      <>
                        <Fila
                          k="Tasa usada"
                          v={
                            tasa > 0
                              ? tasa.toLocaleString("en-US", { maximumFractionDigits: 4 })
                              : "sin tasa"
                          }
                        />
                        <Fila
                          k={`Cobrado en ${m.corto}`}
                          v={tasa > 0 ? miles(n.total * tasa) : "—"}
                        />
                      </>
                    )}
                    {n.discount > 0 && <Fila k="Descuento" v={`$${money(n.discount)}`} />}
                    {n.returned_usd > 0 && (
                      <Fila
                        k="Devuelto"
                        v={`−$${money(n.returned_usd)}`}
                        tone="text-orange-300"
                      />
                    )}
                    {n.credit_usd > 0 && (
                      <Fila
                        k="Saldo a favor"
                        v={`$${money(n.credit_usd)}`}
                        tone="text-sky-300"
                      />
                    )}
                    <div className="h-px bg-gray-600 my-1.5" />
                    <Fila k="Abonado" v={`$${money(n.paid_usd)}`} tone="text-emerald-300" />
                    <Fila
                      k="Falta"
                      v={n.pending_usd > 0.005 ? `$${money(n.pending_usd)}` : "nada, cobrada"}
                      tone={n.pending_usd > 0.005 ? "text-red-300" : "text-emerald-300"}
                    />
                    {n.due_date && n.pending_usd > 0.005 && (
                      <Fila
                        k="Vence"
                        v={
                          n.days_overdue > 0
                            ? `${n.due_date} · vencida ${n.days_overdue}d`
                            : n.due_date
                        }
                        tone={n.days_overdue > 0 ? "text-red-300" : "text-gray-200"}
                      />
                    )}
                    <div className="flex gap-3 mt-2">
                      {!anulada && n.pending_usd > 0.005 && (
                        <button
                          onClick={() => setAbonarId(n.id)}
                          className="text-[11px] text-emerald-300 hover:text-emerald-200"
                        >
                          abonar
                        </button>
                      )}
                      <Link
                        href={`/notas/ver?id=${n.id}`}
                        className="text-[11px] text-gray-300 hover:text-white"
                      >
                        ver
                      </Link>
                      <Link
                        href={`/notas/nueva?id=${n.id}`}
                        className="text-[11px] text-gray-300 hover:text-white"
                      >
                        editar
                      </Link>
                      {!anulada && (
                        <button
                          onClick={() => setDevolverId(n.id)}
                          className="text-[11px] text-orange-300 hover:text-orange-200"
                        >
                          devolver
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="text-[11px] text-gray-500 hover:text-red-300 ml-auto"
                      >
                        borrar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---------- pie ---------- */}
          <div className="flex items-center gap-3 px-3 py-2 border-t border-gray-200 bg-gray-50 text-[11.5px]">
            {totals.selCount > 0 ? (
              <span className="text-indigo-700">
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
                arrastra sobre las filas para ir sumando
              </span>
            )}
            <span className="ml-auto text-gray-500">
              {month !== null ? MESES_CORTOS[month] : quarter !== null ? `${quarter + 1}T` : "periodo"}{" "}
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
            load();
          }}
        />
      )}

      {showBuscar && <BusquedaModal onClose={() => setShowBuscar(false)} />}
    </main>
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
    if (!confirm("¿Eliminar esta devolucion? La mercancia vuelve a contarse como vendida."))
      return;
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
    if (!confirm("¿Anular este abono? Queda registrado pero deja de contar.")) return;
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
