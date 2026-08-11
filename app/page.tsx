"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Daily = { date: string; total: number; notes: number };
type TopClient = { name: string; total: number; notes: number };
type TopProduct = { code: string; description: string; quantity: number; total: number };

type Week = {
  start: string;
  end: string;
  sales: number;
  cost: number;
  notes_count: number;
  clients_count: number;
  prev_sales: number;
  prev_notes_count: number;
  daily: Daily[];
  pending_total: number;
  pending_count: number;
  overdue_total: number;
  overdue_count: number;
  top_clients: TopClient[];
  top_products: TopProduct[];
  products_no_cost: number;
  products_total: number;
  low_margin_notes: number;
};

const DIAS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortMoney(n: number) {
  const v = Number(n || 0);
  if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
  return "$" + v.toFixed(0);
}

function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return DIAS[(d.getDay() + 6) % 7];
}

function rangeLabel(start: string, end: string) {
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} al ${b.getDate()} de ${MESES[a.getMonth()]}`;
  }
  return `${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos dias";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function Home() {
  const [week, setWeek] = useState<Week | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase.rpc("dashboard_week", { p_offset: offset }).then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) return setError(error.message);
      setWeek(data as Week);
    });
    return () => {
      alive = false;
    };
  }, [offset]);

  const profit = week ? week.sales - week.cost : 0;
  const margin = week && week.cost > 0 ? (profit / week.cost) * 100 : null;
  const delta =
    week && week.prev_sales > 0 ? ((week.sales - week.prev_sales) / week.prev_sales) * 100 : null;

  const maxDaily = useMemo(() => {
    if (!week?.daily?.length) return 0;
    return Math.max(...week.daily.map((d) => Number(d.total)));
  }, [week]);

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <main className="p-10 max-w-6xl">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-xl font-medium mb-1">{greeting()}, Mao</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOffset((o) => o - 1)}
                className="text-gray-400 hover:text-gray-900 text-sm w-5"
                aria-label="Semana anterior"
              >
                ‹
              </button>
              <p className="text-sm text-gray-500 min-w-[190px] text-center">
                {week ? rangeLabel(week.start, week.end) : "Cargando..."}
                {offset === 0 && <span className="text-gray-400"> · esta semana</span>}
              </p>
              <button
                onClick={() => setOffset((o) => Math.min(0, o + 1))}
                disabled={offset === 0}
                className="text-gray-400 hover:text-gray-900 text-sm w-5 disabled:opacity-25"
                aria-label="Semana siguiente"
              >
                ›
              </button>
            </div>
          </div>
          <Link
            href="/notas/nueva"
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg transition-all hover:bg-indigo-700 hover:shadow-md active:scale-[0.98]"
          >
            + Nueva nota
          </Link>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading && !week && <p className="text-sm text-gray-400">Cargando resumen...</p>}

        {week && (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 border-t-2 border-t-indigo-500 hover:shadow-md hover:border-gray-300 transition-all">
                <p className="text-xs text-gray-400 mb-2">Ventas</p>
                <p className="text-2xl font-medium tracking-tight text-indigo-700">
                  {money(week.sales)}
                </p>
                <p className="text-xs mt-2">
                  {delta == null ? (
                    <span className="text-gray-400">sin semana previa</span>
                  ) : (
                    <span className={delta >= 0 ? "text-green-600" : "text-red-500"}>
                      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
                      <span className="text-gray-400"> vs semana pasada</span>
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5 border-t-2 border-t-emerald-500 hover:shadow-md hover:border-gray-300 transition-all">
                <p className="text-xs text-gray-400 mb-2">Ganancia</p>
                <p
                  className={`text-2xl font-medium tracking-tight ${
                    profit < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {money(profit)}
                </p>
                <p className="text-xs mt-2 text-gray-400">
                  {margin == null ? "sin costos cargados" : `margen ${margin.toFixed(0)}%`}
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5 border-t-2 border-t-sky-500 hover:shadow-md hover:border-gray-300 transition-all">
                <p className="text-xs text-gray-400 mb-2">Notas</p>
                <p className="text-2xl font-medium tracking-tight text-sky-700">
                  {week.notes_count}
                </p>
                <p className="text-xs mt-2 text-gray-400">
                  {week.clients_count} cliente{week.clients_count === 1 ? "" : "s"}
                  {week.notes_count > 0 && ` · ${money(week.sales / week.notes_count)} promedio`}
                </p>
              </div>

              <Link
                href="/notas"
                className="bg-white border border-gray-200 rounded-xl p-5 border-t-2 border-t-amber-500 transition-all hover:shadow-md hover:border-gray-300"
              >
                <p className="text-xs text-gray-400 mb-2">Por cobrar</p>
                <p
                  className={`text-2xl font-medium tracking-tight ${
                    week.pending_total > 0 ? "text-amber-600" : "text-gray-400"
                  }`}
                >
                  {money(week.pending_total)}
                </p>
                <p className="text-xs mt-2">
                  {week.overdue_count > 0 ? (
                    <span className="text-red-500">
                      {week.overdue_count} vencida{week.overdue_count === 1 ? "" : "s"} ·{" "}
                      {money(week.overdue_total)}
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      {week.pending_count} nota{week.pending_count === 1 ? "" : "s"} pendiente
                      {week.pending_count === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </Link>
            </div>

            {/* Grafico por dia */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
              <div className="flex items-baseline justify-between mb-6">
                <p className="text-sm font-medium">Ventas por dia</p>
                <p className="text-xs text-gray-400">
                  {maxDaily > 0 ? `mejor dia ${money(maxDaily)}` : "sin movimiento esta semana"}
                </p>
              </div>
              <div className="flex items-end gap-3 h-40">
                {week.daily.map((d) => {
                  const v = Number(d.total);
                  const pct = maxDaily > 0 ? (v / maxDaily) * 100 : 0;
                  const isToday = d.date === todayIso;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full">
                      {v > 0 && (
                        <span className="text-[11px] text-gray-500 mb-1.5">{shortMoney(v)}</span>
                      )}
                      <div
                        title={`${money(v)} · ${d.notes} nota(s)`}
                        style={{ height: `${Math.max(pct, v > 0 ? 4 : 1)}%` }}
                        className={`w-full rounded-lg transition-all cursor-default ${
                          v === 0
                            ? "bg-gray-100"
                            : isToday
                            ? "bg-indigo-600 hover:bg-indigo-700"
                            : "bg-indigo-300 hover:bg-indigo-500"
                        }`}
                      />
                      <span
                        className={`text-[11px] mt-2 ${
                          isToday ? "text-indigo-700 font-medium" : "text-gray-400"
                        }`}
                      >
                        {dayLabel(d.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Listas */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <p className="text-sm font-medium mb-4">Mejores clientes</p>
                {week.top_clients.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin ventas esta semana.</p>
                ) : (
                  <div className="flex flex-col">
                    {week.top_clients.map((c, i) => {
                      const pct = week.sales > 0 ? (Number(c.total) / week.sales) * 100 : 0;
                      return (
                        <div
                          key={c.name + i}
                          className="py-2 border-b border-gray-100 last:border-0 group"
                        >
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-sm truncate pr-3 group-hover:text-teal-800 transition-colors">
                              {c.name}
                            </span>
                            <span className="text-sm text-gray-600 whitespace-nowrap">
                              {money(c.total)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-500 group-hover:bg-teal-600 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-gray-400 w-16 text-right">
                              {c.notes} nota{c.notes === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <p className="text-sm font-medium mb-4">Lo que mas se movio</p>
                {week.top_products.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin ventas esta semana.</p>
                ) : (
                  <div className="flex flex-col">
                    {week.top_products.map((p, i) => (
                      <div
                        key={p.code + i}
                        className="flex items-baseline justify-between py-2 border-b border-gray-100 last:border-0 group hover:bg-violet-50/60 -mx-2 px-2 rounded transition-colors"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-sm truncate group-hover:text-violet-900 transition-colors">
                            {p.description}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {p.code} · {Number(p.quantity)} unidad
                            {Number(p.quantity) === 1 ? "" : "es"}
                          </p>
                        </div>
                        <span className="text-sm text-gray-600 whitespace-nowrap">
                          {money(p.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Avisos */}
            {(week.products_no_cost > 0 || week.low_margin_notes > 0) && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-400 mb-3">Cosas que revisar</p>
                <div className="flex flex-col gap-2">
                  {week.products_no_cost > 0 && (
                    <Link
                      href="/productos"
                      className="flex items-baseline justify-between group py-1"
                    >
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">
                        <span className="text-amber-600 mr-2">●</span>
                        {week.products_no_cost} de {week.products_total} productos sin costo
                        cargado
                      </span>
                      <span className="text-xs text-gray-400 group-hover:text-gray-700">
                        cargar costos →
                      </span>
                    </Link>
                  )}
                  {week.low_margin_notes > 0 && (
                    <Link href="/notas" className="flex items-baseline justify-between group py-1">
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">
                        <span className="text-red-500 mr-2">●</span>
                        {week.low_margin_notes} nota{week.low_margin_notes === 1 ? "" : "s"} de esta
                        semana con margen bajo 15%
                      </span>
                      <span className="text-xs text-gray-400 group-hover:text-gray-700">
                        ver notas →
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
    </main>
  );
}
