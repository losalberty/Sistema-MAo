"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type NoteRow = {
  id: string;
  sequence_number: number;
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
  created_at: string;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DIAS_SEMANA = [
  "domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado",
];

const CURRENCY_LABELS: Record<string, string> = {
  USD: "USD",
  COP: "COP",
  BS_BINANCE: "Bs Binance",
  BS_BCV: "Bs BCV",
};

function currencyShort(mode: string) {
  return mode === "COP" ? "COP" : mode === "USD" ? "USD" : "Bs";
}

function effectiveRate(n: NoteRow) {
  if (n.currency_mode === "BS_BCV") {
    return (n.exchange_rate ?? 0) * (1 + (n.exchange_gap_percent ?? 0) / 100);
  }
  return n.exchange_rate ?? 0;
}

export default function NotasPage() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [search, setSearch] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("date_desc");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_notes");
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes(data ?? []);
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta nota? Esta accion no se puede deshacer.")) return;
    const { error } = await supabase.rpc("delete_note", { p_note_id: id });
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  const filtered = useMemo(() => {
    let list = [...notes];
    if (currencyFilter !== "ALL") {
      list =
        currencyFilter === "NON_USD"
          ? list.filter((n) => n.currency_mode !== "USD")
          : list.filter((n) => n.currency_mode === currencyFilter);
    }
    if (statusFilter !== "ALL") {
      list = list.filter((n) => (n.payment_status ?? "PENDIENTE") === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.display_name.toLowerCase().includes(q) ||
          String(n.sequence_number).includes(q)
      );
    }
    switch (sortBy) {
      case "date_asc":
        list.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case "amount_desc":
        list.sort((a, b) => b.total - a.total);
        break;
      case "amount_asc":
        list.sort((a, b) => a.total - b.total);
        break;
      case "name_asc":
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        break;
      default:
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return list;
  }, [notes, search, currencyFilter, statusFilter, sortBy]);

  const isCustomOrder =
    sortBy !== "date_desc" || search.trim() || currencyFilter !== "ALL" || statusFilter !== "ALL";

  const todayIso = new Date().toISOString().slice(0, 10);

  const totalPendiente = notes
    .filter((n) => (n.payment_status ?? "PENDIENTE") === "PENDIENTE")
    .reduce((s, n) => s + n.total, 0);

  // Agrupar por año > mes > dia (solo cuando no hay filtros/orden custom)
  const years: Record<string, Record<string, Record<string, NoteRow[]>>> = {};
  for (const n of filtered) {
    const d = new Date(n.note_date + "T00:00:00");
    const y = String(d.getFullYear());
    const m = MESES[d.getMonth()];
    const day = n.note_date;
    years[y] ??= {};
    years[y][m] ??= {};
    years[y][m][day] ??= [];
    years[y][m][day].push(n);
  }
  const yearKeys = Object.keys(years).sort().reverse();

  function NoteLine({ n }: { n: NoteRow }) {
    const foreign = n.currency_mode !== "USD";
    const rate = effectiveRate(n);
    const converted = n.total * rate;
    const status = n.payment_status ?? "PENDIENTE";
    const profit = n.total - (n.total_cost ?? 0);
    const margin = n.total_cost > 0 ? (profit / n.total_cost) * 100 : null;

    // un color por moneda, sobrio, solo en un punto y en el monto
    const tone = !foreign
      ? { dot: "bg-emerald-500", text: "text-emerald-700", soft: "group-hover:bg-emerald-50/40" }
      : n.currency_mode === "COP"
      ? { dot: "bg-violet-500", text: "text-violet-700", soft: "group-hover:bg-violet-50/50" }
      : n.currency_mode === "BS_BCV"
      ? { dot: "bg-blue-500", text: "text-blue-700", soft: "group-hover:bg-blue-50/50" }
      : { dot: "bg-yellow-400", text: "text-yellow-700", soft: "group-hover:bg-yellow-50/50" };

    return (
      <div className={`group relative border-t first:border-t-0 border-gray-100 ${tone.soft}`}>
        <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />

          <Link
            href={`/notas/nueva?id=${n.id}`}
            className="flex-1 min-w-0 flex items-baseline gap-2 hover:text-indigo-700 transition-colors"
          >
            <span className="text-gray-300 text-xs tabular-nums shrink-0">
              {String(n.sequence_number).padStart(4, "0")}
            </span>
            <span className="truncate">{n.display_name}</span>
          </Link>

          {status !== "PENDIENTE" && (
            <span
              className={`text-[10px] rounded-full px-2 py-0.5 shrink-0 ${
                status === "COBRADO"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-gray-100 text-gray-400 line-through"
              }`}
            >
              {status === "COBRADO" ? "cobrado" : "anulada"}
            </span>
          )}

          <span className={`tabular-nums shrink-0 ${tone.text}`}>${n.total.toFixed(2)}</span>

          <span className="flex gap-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link href={`/notas/ver?id=${n.id}`} className="text-xs text-gray-400 hover:text-gray-900">
              ver
            </Link>
            <button
              onClick={() => handleDelete(n.id)}
              className="text-xs text-gray-300 hover:text-red-500"
            >
              eliminar
            </button>
          </span>
        </div>

        {/* Detalle al pasar el puntero */}
        <div className="pointer-events-none absolute right-3 top-full -mt-1 z-20 hidden group-hover:block">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
            <div className="flex justify-between gap-6">
              <span className="text-gray-400">Fecha</span>
              <span>{n.note_date}</span>
            </div>
            {foreign && (
              <>
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">Moneda</span>
                  <span>{CURRENCY_LABELS[n.currency_mode] ?? n.currency_mode}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">Tasa usada</span>
                  <span>
                    {rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {n.currency_mode === "BS_BCV" && (n.exchange_gap_percent ?? 0) > 0 && (
                      <span className="text-gray-400"> (BCV +{n.exchange_gap_percent}%)</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-6 border-t border-gray-700 mt-1 pt-1">
                  <span className="text-gray-400">Cobrado en</span>
                  <span>
                    {converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                    {currencyShort(n.currency_mode)}
                  </span>
                </div>
              </>
            )}
            {n.discount > 0 && (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Descuento</span>
                <span>${n.discount.toFixed(2)}</span>
              </div>
            )}
            {margin != null && (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Ganancia</span>
                <span className={profit >= 0 ? "text-emerald-300" : "text-red-300"}>
                  ${profit.toFixed(2)} ({margin.toFixed(0)}%)
                </span>
              </div>
            )}
            {status === "PENDIENTE" && n.due_date && (
              <div className="flex justify-between gap-6">
                <span className="text-gray-400">Vence</span>
                <span className={n.due_date < todayIso ? "text-red-300" : ""}>{n.due_date}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-2">
            ← Volver al panel
          </Link>
          <h1 className="text-lg font-medium">Notas</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} de {notes.length} notas
            {totalPendiente > 0 && (
              <span className="text-amber-700 ml-2">
                · ${totalPendiente.toFixed(2)} por cobrar
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
          >
            Filtros
          </button>
          <Link
            href="/notas/nueva"
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md transition-colors hover:bg-gray-700"
          >
            + Nueva nota
          </Link>
        </div>
      </div>

      {showFilters && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6 grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Buscar</label>
            <input
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              placeholder="Cliente o numero"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Moneda</label>
            <select
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
            >
              <option value="ALL">Todas</option>
              <option value="USD">Solo dolares</option>
              <option value="NON_USD">Solo otras monedas</option>
              <option value="COP">Pesos (COP)</option>
              <option value="BS_BINANCE">Bs Binance</option>
              <option value="BS_BCV">Bs BCV</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Cobro</label>
            <select
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Todas</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="COBRADO">Cobradas</option>
              <option value="ANULADO">Anuladas</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Ordenar por</label>
            <select
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date_desc">Fecha (mas reciente)</option>
              <option value="date_asc">Fecha (mas antigua)</option>
              <option value="amount_desc">Monto (mayor)</option>
              <option value="amount_asc">Monto (menor)</option>
              <option value="name_asc">Cliente (A-Z)</option>
            </select>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      <div className="flex items-center gap-4 mb-4 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> dolares
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> pesos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Bs Binance
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Bs BCV
        </span>
        <span className="ml-auto">pasa el puntero sobre una nota para ver el detalle</span>
      </div>

      {isCustomOrder ? (
        <div className="border border-gray-200 rounded-lg bg-white">
          {filtered.map((n) => (
            <NoteLine key={n.id} n={n} />
          ))}
        </div>
      ) : (
        yearKeys.map((year) => {
          const months = years[year];
          const monthKeys = Object.keys(months).sort(
            (a, b) => MESES.indexOf(b) - MESES.indexOf(a)
          );
          return (
            <div key={year}>
              {monthKeys.map((month) => {
                const days = months[month];
                const dayKeys = Object.keys(days).sort().reverse();
                const monthTotal = dayKeys.reduce(
                  (s, d) => s + days[d].reduce((x, n) => x + n.total, 0),
                  0
                );
                const monthCount = dayKeys.reduce((s, d) => s + days[d].length, 0);
                return (
                  <details key={month} open className="mb-6 group/mes">
                    <summary className="flex items-baseline justify-between cursor-pointer list-none py-2 border-b border-gray-200 mb-1">
                      <span className="text-sm font-medium">
                        {month} <span className="text-gray-400 font-normal">{year}</span>
                      </span>
                      <span className="text-xs text-gray-400">
                        {monthCount} notas · ${monthTotal.toFixed(2)}
                      </span>
                    </summary>
                    {dayKeys.map((day) => {
                      const d = new Date(day + "T00:00:00");
                      return (
                        <div key={day} className="mb-4">
                          <p className="text-xs text-gray-400 mb-1 pl-3">
                            {DIAS_SEMANA[d.getDay()]} {d.getDate()}
                          </p>
                          <div className="border border-gray-200 rounded-lg bg-white">
                            {days[day].map((n) => (
                              <NoteLine key={n.id} n={n} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </details>
                );
              })}
            </div>
          );
        })
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-gray-400">No hay notas que coincidan.</p>
      )}
    </main>
  );
}
