"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
  paid: number;
  pending: number;
  currency_mode: string;
  exchange_rate: number | null;
  display_name: string;
  sequence_number: number;
  payments: Payment[];
};

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const DIAS_CORTOS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

const CURRENCIES = [
  { key: "USD", label: "dolares", dot: "bg-emerald-500", text: "text-emerald-700" },
  { key: "COP", label: "pesos", dot: "bg-violet-500", text: "text-violet-700" },
  { key: "BS_BINANCE", label: "Bs Binance", dot: "bg-yellow-400", text: "text-yellow-700" },
  { key: "BS_BCV", label: "Bs BCV", dot: "bg-blue-500", text: "text-blue-700" },
];

const ESTADOS = [
  { key: "PENDIENTE", label: "pendientes" },
  { key: "ABONADA", label: "abonadas" },
  { key: "COBRADO", label: "cobradas" },
  { key: "ANULADO", label: "anuladas" },
];

function tone(mode: string) {
  return CURRENCIES.find((c) => c.key === mode) ?? CURRENCIES[0];
}

function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencyShort(mode: string) {
  return mode === "COP" ? "COP" : mode === "USD" ? "USD" : "Bs";
}

function effectiveRate(mode: string, rate: number | null, gap: number | null) {
  if (mode === "BS_BCV") return (rate ?? 0) * (1 + (gap ?? 0) / 100);
  return rate ?? 0;
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
  const [monedas, setMonedas] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [abonarId, setAbonarId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_notes");
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data ?? []) as NoteRow[];
    setNotes(rows);
    if (!year && rows.length > 0) {
      setYear(rows[0].note_date.slice(0, 4));
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

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

  function toggleMoneda(k: string) {
    setMonedas((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let list = notes;
    if (year) list = list.filter((n) => n.note_date.slice(0, 4) === year);
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
    if (monedas.length > 0) {
      list = list.filter((n) => monedas.includes(n.currency_mode));
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
  }, [notes, year, month, quarter, estados, monedas, search]);

  const totals = useMemo(() => {
    let total = 0;
    let pendiente = 0;
    let ganancia = 0;
    for (const n of filtered) {
      if (n.effective_status === "ANULADO") continue;
      total += n.total;
      pendiente += n.pending_usd;
      ganancia += n.total - n.total_cost;
    }
    let sel = 0;
    for (const n of filtered) if (selected.has(n.id)) sel += n.total;
    return { total, pendiente, ganancia, sel };
  }, [filtered, selected]);

  const abonarNote = notes.find((n) => n.id === abonarId) ?? null;

  return (
    <main className="p-6 max-w-[1180px]">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notas</h1>
          <p className="text-sm text-gray-500">{filtered.length} notas en la vista</p>
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
        {/* ---------- barra lateral ---------- */}
        <aside className="w-[140px] shrink-0 border-r border-gray-100 p-3">
          <p className="text-[11px] text-gray-400 mb-1.5">Año</p>
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setMonth(null);
              setQuarter(null);
            }}
            className="w-full h-8 px-2 border border-gray-200 rounded-lg text-[13px] mb-4"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <p className="text-[11px] text-gray-400 mb-1.5">Mes</p>
          <div className="grid grid-cols-3 gap-[3px] mb-2">
            {MESES_CORTOS.map((m, i) => (
              <button
                key={m}
                onClick={() => {
                  setQuarter(null);
                  setMonth(month === i ? null : i);
                }}
                className={`text-[11px] py-1 rounded ${
                  month === i
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-[3px] mb-4">
            {[0, 1, 2, 3].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setMonth(null);
                  setQuarter(quarter === q ? null : q);
                }}
                className={`text-[11px] py-1 rounded ${
                  quarter === q
                    ? "bg-gray-900 text-white"
                    : "text-gray-400 hover:bg-gray-100"
                }`}
              >
                {q + 1}T
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mb-1.5">Estado</p>
          {ESTADOS.map((e) => (
            <label key={e.key} className="flex items-center gap-2 text-xs mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={estados.includes(e.key)}
                onChange={() => toggleEstado(e.key)}
                className="w-3.5 h-3.5"
              />
              <span className="text-gray-600">{e.label}</span>
            </label>
          ))}

          <p className="text-[11px] text-gray-400 mt-4 mb-1.5">Moneda</p>
          <div className="flex gap-1.5">
            {CURRENCIES.map((c) => (
              <button
                key={c.key}
                onClick={() => toggleMoneda(c.key)}
                title={c.label}
                className={`w-4 h-4 rounded-full ${c.dot} ${
                  monedas.length === 0 || monedas.includes(c.key)
                    ? "opacity-100"
                    : "opacity-25"
                }`}
              />
            ))}
          </div>

          {(month !== null || quarter !== null || monedas.length > 0) && (
            <button
              onClick={() => {
                setMonth(null);
                setQuarter(null);
                setMonedas([]);
              }}
              className="mt-4 text-[11px] text-gray-400 hover:text-gray-700 underline"
            >
              limpiar filtros
            </button>
          )}
        </aside>

        {/* ---------- tabla ---------- */}
        <section className="flex-1 min-w-0 p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o numero de nota"
            className="w-full h-8 px-3 border border-gray-200 rounded-lg text-[13px] mb-2"
          />

          <div className="flex gap-2 px-1.5 py-1.5 border-b border-gray-100 text-[11px] text-gray-400">
            <span className="w-4" />
            <span className="w-10">nº</span>
            <span className="w-14">fecha</span>
            <span className="flex-1 min-w-0">cliente</span>
            <span className="w-20 text-right">total</span>
            <span className="w-24">cobro</span>
            <span className="w-16 text-right">ganancia</span>
          </div>

          {loading && <p className="text-sm text-gray-400 py-4">Cargando...</p>}

          {!loading && filtered.length === 0 && (
            <p className="text-sm text-gray-400 py-6">No hay notas que coincidan.</p>
          )}

          {filtered.map((n) => {
            const t = tone(n.currency_mode);
            const profit = n.total - n.total_cost;
            const pct = n.total > 0 ? Math.min((n.paid_usd / n.total) * 100, 100) : 0;
            const anulada = n.effective_status === "ANULADO";
            const d = new Date(n.note_date + "T00:00:00");
            return (
              <div
                key={n.id}
                className={`group flex gap-2 items-center px-1.5 py-1.5 border-b border-gray-50 text-[12.5px] hover:bg-gray-50 ${
                  selected.has(n.id) ? "bg-gray-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(n.id)}
                  onChange={() => toggleSel(n.id)}
                  className="w-3.5 h-3.5 shrink-0"
                />
                <span className="w-10 text-[11px] text-gray-400 font-mono shrink-0">
                  {n.sequence_number}
                </span>
                <span className="w-14 text-gray-500 shrink-0">
                  {DIAS_CORTOS[d.getDay()]} {d.getDate()}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  <Link
                    href={`/notas/nueva?id=${n.id}`}
                    className={
                      anulada
                        ? "text-gray-400 line-through"
                        : "text-gray-800 hover:text-gray-950 hover:underline"
                    }
                  >
                    {n.display_name}
                  </Link>
                  {n.days_overdue > 0 && (
                    <span className="ml-2 text-[10px] text-red-600">
                      vencida {n.days_overdue}d
                    </span>
                  )}
                </span>
                <span className={`w-20 text-right shrink-0 ${anulada ? "text-gray-400" : t.text}`}>
                  {money(n.total)}
                </span>
                <span className="w-24 shrink-0 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
                  <span className="flex-1 h-[3px] bg-gray-100 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  {n.pending_usd > 0.005 && !anulada && (
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {Math.round(pct)}%
                    </span>
                  )}
                </span>
                <span
                  className={`w-16 text-right shrink-0 ${
                    anulada
                      ? "text-gray-400"
                      : profit < 0
                      ? "text-red-600"
                      : "text-emerald-700"
                  }`}
                >
                  {money(profit)}
                </span>
                <span className="w-24 shrink-0 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  {!anulada && n.pending_usd > 0.005 && (
                    <button
                      onClick={() => setAbonarId(n.id)}
                      className="text-[11px] text-emerald-700 hover:underline"
                    >
                      abonar
                    </button>
                  )}
                  <Link
                    href={`/notas/ver?id=${n.id}`}
                    className="text-[11px] text-gray-400 hover:text-gray-900"
                  >
                    ver
                  </Link>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="text-[11px] text-gray-300 hover:text-red-600"
                  >
                    borrar
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      </div>

      {/* ---------- pie de totales ---------- */}
      <div className="flex items-center gap-5 px-4 py-2.5 text-xs text-gray-500">
        {selected.size > 0 ? (
          <span>
            {selected.size} seleccionadas ·{" "}
            <span className="text-gray-900 font-medium">${money(totals.sel)}</span>
          </span>
        ) : (
          <span>pasa el puntero sobre una nota para abonar o ver</span>
        )}
        <span className="ml-auto">
          total <span className="text-gray-900 font-medium">${money(totals.total)}</span>
        </span>
        <span>
          por cobrar{" "}
          <span className="text-amber-700 font-medium">${money(totals.pendiente)}</span>
        </span>
        <span>
          ganancia{" "}
          <span className="text-emerald-700 font-medium">${money(totals.ganancia)}</span>
        </span>
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
    </main>
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
  const [moneda, setMoneda] = useState(defaultCurrency);
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
  const equivale = moneda === "USD" ? montoNum : tasaNum > 0 ? montoNum / tasaNum : 0;
  const quedaria = col ? Math.max(col.pending - equivale, 0) : 0;

  async function guardar() {
    setErr(null);
    if (montoNum <= 0) {
      setErr("Escribe el monto del abono.");
      return;
    }
    if (moneda !== "USD" && tasaNum <= 0) {
      setErr("Falta la tasa de cambio.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("add_note_payment", {
      p_note_id: noteId,
      p_payment_date: fecha,
      p_currency_mode: moneda,
      p_amount_currency: montoNum,
      p_exchange_rate: moneda === "USD" ? null : tasaNum,
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
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Abonar {col ? `· nota ${col.sequence_number}` : ""}
          </h2>
          {col && (
            <span className="text-xs text-gray-500">
              falta{" "}
              <b className="text-red-600 font-medium">${money(col.pending)}</b> de $
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
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
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
              Tasa {moneda === "USD" && <span className="text-gray-300">(no aplica)</span>}
            </label>
            <input
              value={moneda === "USD" ? "" : tasa}
              onChange={(e) => setTasa(e.target.value)}
              disabled={moneda === "USD"}
              placeholder="0"
              className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
            />
          </div>
        </div>

        {montoNum > 0 && col && (
          <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 text-sm text-emerald-800">
            Equivale a <b className="font-medium">${money(equivale)}</b> — la nota quedaría
            en <b className="font-medium">${money(quedaria)}</b> pendiente
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

        {err && (
          <p className="mb-3 text-sm text-red-600">{err}</p>
        )}

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
                  {p.payment_date} · {currencyShort(p.currency_mode)}{" "}
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
