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
  created_at: string;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
  }, [notes, search, currencyFilter, sortBy]);

  const isCustomOrder = sortBy !== "date_desc" || search.trim() || currencyFilter !== "ALL";

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
    return (
      <div className="flex items-center justify-between px-3 py-2 text-sm border-t first:border-t-0 border-gray-100 hover:bg-gray-50 transition-colors">
        <div>
          <span className="text-gray-400 mr-2">
            #{String(n.sequence_number).padStart(4, "0")}
          </span>
          {n.display_name}
        </div>
        <div className="flex items-center gap-3">
          {foreign ? (
            <span
              title={`${converted.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })} ${currencyShort(n.currency_mode)} - tasa ${rate.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`}
              className="group relative border border-amber-300 bg-amber-50 text-amber-800 rounded px-2 py-0.5 cursor-default transition-colors hover:bg-amber-100"
            >
              ${n.total.toFixed(2)}
              <span className="ml-1 text-[10px] uppercase">
                {CURRENCY_LABELS[n.currency_mode] ?? n.currency_mode}
              </span>
              <span className="pointer-events-none absolute right-0 -top-8 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-10">
                {converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                {currencyShort(n.currency_mode)}
              </span>
            </span>
          ) : (
            <span className="text-gray-600">${n.total.toFixed(2)}</span>
          )}
          <Link href={`/notas/ver?id=${n.id}`} className="text-xs text-gray-500 hover:text-gray-900">
            Ver
          </Link>
          <Link href={`/notas/nueva?id=${n.id}`} className="text-xs text-gray-500 hover:text-gray-900">
            Editar
          </Link>
          <button
            onClick={() => handleDelete(n.id)}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Eliminar
          </button>
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
        <div className="border border-gray-200 rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
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

      {isCustomOrder ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
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
            <details key={year} open className="mb-4">
              <summary className="text-sm font-medium cursor-pointer py-2">{year}</summary>
              {monthKeys.map((month) => {
                const days = months[month];
                const dayKeys = Object.keys(days).sort().reverse();
                return (
                  <details key={month} open className="mb-2 ml-2">
                    <summary className="text-sm text-gray-600 cursor-pointer py-1">
                      {month} {year}
                    </summary>
                    {dayKeys.map((day) => (
                      <div key={day} className="mb-3 ml-2">
                        <p className="text-xs text-gray-400 mb-1">{day}</p>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          {days[day].map((n) => (
                            <NoteLine key={n.id} n={n} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </details>
                );
              })}
            </details>
          );
        })
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-gray-400">No hay notas que coincidan.</p>
      )}
    </main>
  );
}
