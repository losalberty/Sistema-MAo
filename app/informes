"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Totals = {
  sales: number;
  cost: number;
  profit: number;
  discount: number;
  notes: number;
  clients: number;
  units: number;
};

type Report = {
  from: string;
  to: string;
  totals: Totals;
  by_product: { code: string; description: string; quantity: number; total: number; cost: number; notes: number }[];
  by_client: { name: string; client_number: number | null; city: string | null; state: string | null; total: number; cost: number; notes: number; pending: number }[];
  by_city: { name: string; total: number; notes: number; clients: number }[];
  by_state: { name: string; total: number; notes: number; clients: number }[];
  by_category: { name: string; quantity: number; total: number }[];
  by_status: { name: string; total: number; notes: number }[];
  by_currency: { name: string; total: number; notes: number }[];
  by_day: { date: string; total: number; notes: number }[];
  notes_list: {
    id: string; number: number; date: string; client: string; currency: string;
    subtotal: number; discount: number; total: number; cost: number;
    status: string; due_date: string | null;
  }[];
};

type SectionKey =
  | "by_day" | "by_product" | "by_client" | "by_city" | "by_state"
  | "by_category" | "by_status" | "by_currency" | "notes_list";

const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
  { key: "by_day", label: "Por dia", hint: "Cuanto se vendio cada dia" },
  { key: "by_product", label: "Por producto", hint: "Que repuestos se movieron" },
  { key: "by_client", label: "Por cliente", hint: "Quien compro y cuanto debe" },
  { key: "by_category", label: "Por grupo", hint: "Crucetas, yokes, rodamientos" },
  { key: "by_city", label: "Por ciudad", hint: "De donde vienen las ventas" },
  { key: "by_state", label: "Por estado", hint: "Zonas del pais" },
  { key: "by_status", label: "Por cobro", hint: "Cobrado, pendiente, anulado" },
  { key: "by_currency", label: "Por moneda", hint: "Dolares, pesos, bolivares" },
  { key: "notes_list", label: "Listado de notas", hint: "Nota por nota, con numero" },
];

const PRESETS: { label: string; hint: string; sections: SectionKey[] }[] = [
  { label: "Resumen de ventas", hint: "Lo esencial del periodo", sections: ["by_day", "by_product", "by_client"] },
  { label: "Cobranza", hint: "A quien hay que cobrarle", sections: ["by_status", "by_client", "notes_list"] },
  { label: "Rentabilidad", hint: "Donde se gana y donde no", sections: ["by_product", "by_category", "by_client"] },
  { label: "Geografico", hint: "Ventas por zona", sections: ["by_state", "by_city", "by_client"] },
  { label: "Completo", hint: "Todo, para archivar", sections: SECTIONS.map((s) => s.key) },
];

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function prettyDate(s: string) {
  const d = new Date(s + "T00:00:00");
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function marginOf(total: number, cost: number) {
  if (!cost || cost <= 0) return null;
  return ((total - cost) / cost) * 100;
}

function periodRange(kind: string) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "hoy") return { from: iso(t), to: iso(t) };
  if (kind === "semana") {
    const dow = (t.getDay() + 6) % 7;
    const start = new Date(t);
    start.setDate(t.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: iso(start), to: iso(end) };
  }
  if (kind === "mes") {
    const start = new Date(t.getFullYear(), t.getMonth(), 1);
    const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    return { from: iso(start), to: iso(end) };
  }
  if (kind === "ano") {
    return { from: `${t.getFullYear()}-01-01`, to: `${t.getFullYear()}-12-31` };
  }
  return { from: iso(t), to: iso(t) };
}

export default function InformesPage() {
  const [kind, setKind] = useState("mes");
  const [from, setFrom] = useState(periodRange("mes").from);
  const [to, setTo] = useState(periodRange("mes").to);
  const [sections, setSections] = useState<SectionKey[]>(["by_day", "by_product", "by_client"]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "personalizado") return;
    const r = periodRange(kind);
    setFrom(r.from);
    setTo(r.to);
  }, [kind]);

  function toggleSection(k: SectionKey) {
    setSections((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("report_data", { p_from: from, p_to: to });
    setLoading(false);
    if (error) return setError(error.message);
    setReport(data as Report);
  }

  const active = (k: SectionKey) => sections.includes(k);
  const t = report?.totals;
  const margin = t ? marginOf(t.sales, t.cost) : null;
  const maxDay = report?.by_day?.length
    ? Math.max(...report.by_day.map((d) => Number(d.total)))
    : 0;

  return (
    <main className="max-w-5xl mx-auto p-8">
      {/* ---------- controles ---------- */}
      <div className="print:hidden">
        <Link href="/" className="text-sm text-gray-500 hover:text-indigo-600 inline-block mb-2 transition-colors">
          ← Volver al panel
        </Link>
        <h1 className="text-lg font-medium mb-1">Informes</h1>
        <p className="text-sm text-gray-500 mb-6">
          Elige un periodo, marca lo que quieres ver, y genera.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <p className="text-xs text-gray-400 mb-3">Periodo</p>
          <div className="flex gap-2 flex-wrap mb-4">
            {[
              ["hoy", "Hoy"],
              ["semana", "Esta semana"],
              ["mes", "Este mes"],
              ["ano", "Este ano"],
              ["personalizado", "Personalizado"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`text-sm rounded-lg px-4 py-2 border transition-colors ${
                  kind === k
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Desde</label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setKind("personalizado");
                  setFrom(e.target.value);
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Hasta</label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setKind("personalizado");
                  setTo(e.target.value);
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <p className="text-xs text-gray-400 mb-3">Informes sugeridos</p>
          <div className="grid grid-cols-5 gap-2 mb-5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setSections(p.sections)}
                className="text-left border border-gray-200 rounded-lg px-3 py-2.5 hover:border-indigo-400 hover:bg-indigo-50 transition-colors group"
              >
                <span className="text-sm block group-hover:text-indigo-800">{p.label}</span>
                <span className="text-[11px] text-gray-400 group-hover:text-indigo-600">
                  {p.hint}
                </span>
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-3">O arma el tuyo</p>
          <div className="grid grid-cols-3 gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => toggleSection(s.key)}
                className={`text-left rounded-lg px-3 py-2.5 border transition-colors ${
                  active(s.key)
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`text-sm block ${active(s.key) ? "text-indigo-900" : "text-gray-700"}`}
                >
                  {active(s.key) ? "✓ " : ""}
                  {s.label}
                </span>
                <span
                  className={`text-[11px] ${active(s.key) ? "text-indigo-600" : "text-gray-400"}`}
                >
                  {s.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-8">
          <button
            onClick={generate}
            disabled={loading || sections.length === 0}
            className="bg-indigo-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            {loading ? "Generando..." : "Generar informe"}
          </button>
          {report && (
            <button
              onClick={() => window.print()}
              className="text-sm border border-gray-300 rounded-lg px-5 py-2.5 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
            >
              Imprimir o guardar PDF
            </button>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      </div>

      {/* ---------- informe ---------- */}
      {report && t && (
        <div>
          <div className="border-b border-gray-200 pb-4 mb-6">
            <p className="text-xs text-gray-400 mb-1">Sistema Save Notas</p>
            <h2 className="text-xl font-medium">Informe de ventas</h2>
            <p className="text-sm text-gray-500">
              {from === to
                ? prettyDate(from)
                : `Del ${prettyDate(from)} al ${prettyDate(to)}`}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              ["Vendido", money(t.sales), `${t.notes} notas`, "text-indigo-700", "bg-indigo-50"],
              [
                "Ganancia",
                money(t.profit),
                margin == null ? "sin costos" : `margen ${margin.toFixed(0)}%`,
                t.profit < 0 ? "text-red-600" : "text-emerald-700",
                t.profit < 0 ? "bg-red-50" : "bg-emerald-50",
              ],
              ["Clientes", String(t.clients), `${Number(t.units).toFixed(0)} unidades`, "text-sky-700", "bg-sky-50"],
              ["Descuentos", money(t.discount), "concedidos", "text-amber-700", "bg-amber-50"],
            ].map(([label, value, hint, color, bg]) => (
              <div key={label as string} className={`${bg} rounded-xl p-4`}>
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-xl font-medium tracking-tight ${color}`}>{value}</p>
                <p className="text-[11px] text-gray-500 mt-1">{hint}</p>
              </div>
            ))}
          </div>

          {active("by_day") && report.by_day.length > 0 && (
            <Section title="Ventas por dia">
              <div className="flex items-end gap-1.5 h-32 mb-3">
                {report.by_day.map((d) => {
                  const pct = maxDay > 0 ? (Number(d.total) / maxDay) * 100 : 0;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col justify-end h-full group">
                      <div
                        title={`${prettyDate(d.date)} · ${money(d.total)}`}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                        className="w-full bg-indigo-400 group-hover:bg-indigo-600 rounded-t transition-colors"
                      />
                    </div>
                  );
                })}
              </div>
              <Table
                head={["Fecha", "Notas", "Vendido"]}
                align={["left", "right", "right"]}
                rows={report.by_day.map((d) => [prettyDate(d.date), String(d.notes), money(d.total)])}
              />
            </Section>
          )}

          {active("by_product") && (
            <Section title="Por producto">
              <Table
                head={["Codigo", "Descripcion", "Cant.", "Vendido", "Margen"]}
                align={["left", "left", "right", "right", "right"]}
                rows={report.by_product.map((p) => {
                  const m = marginOf(Number(p.total), Number(p.cost));
                  return [
                    p.code,
                    p.description,
                    String(Number(p.quantity)),
                    money(p.total),
                    m == null ? "—" : `${m.toFixed(0)}%`,
                  ];
                })}
              />
            </Section>
          )}

          {active("by_client") && (
            <Section title="Por cliente">
              <Table
                head={["Cliente", "Ciudad", "Notas", "Vendido", "Por cobrar"]}
                align={["left", "left", "right", "right", "right"]}
                rows={report.by_client.map((c) => [
                  c.name,
                  c.city || "—",
                  String(c.notes),
                  money(c.total),
                  Number(c.pending) > 0 ? money(c.pending) : "—",
                ])}
              />
            </Section>
          )}

          {active("by_category") && (
            <Section title="Por grupo de producto">
              <Table
                head={["Grupo", "Unidades", "Vendido"]}
                align={["left", "right", "right"]}
                rows={report.by_category.map((c) => [
                  c.name,
                  String(Number(c.quantity)),
                  money(c.total),
                ])}
              />
            </Section>
          )}

          {active("by_city") && (
            <Section title="Por ciudad">
              <Table
                head={["Ciudad", "Clientes", "Notas", "Vendido"]}
                align={["left", "right", "right", "right"]}
                rows={report.by_city.map((c) => [
                  c.name,
                  String(c.clients),
                  String(c.notes),
                  money(c.total),
                ])}
              />
            </Section>
          )}

          {active("by_state") && (
            <Section title="Por estado">
              <Table
                head={["Estado", "Clientes", "Notas", "Vendido"]}
                align={["left", "right", "right", "right"]}
                rows={report.by_state.map((c) => [
                  c.name,
                  String(c.clients),
                  String(c.notes),
                  money(c.total),
                ])}
              />
            </Section>
          )}

          {active("by_status") && (
            <Section title="Por estado de cobro">
              <Table
                head={["Estado", "Notas", "Monto"]}
                align={["left", "right", "right"]}
                rows={report.by_status.map((c) => [c.name, String(c.notes), money(c.total)])}
              />
            </Section>
          )}

          {active("by_currency") && (
            <Section title="Por moneda">
              <Table
                head={["Moneda", "Notas", "Monto en USD"]}
                align={["left", "right", "right"]}
                rows={report.by_currency.map((c) => [c.name, String(c.notes), money(c.total)])}
              />
            </Section>
          )}

          {active("notes_list") && (
            <Section title="Listado de notas">
              <Table
                head={["N", "Fecha", "Cliente", "Cobro", "Total"]}
                align={["left", "left", "left", "left", "right"]}
                rows={report.notes_list.map((n) => [
                  String(n.number).padStart(4, "0"),
                  n.date,
                  n.client,
                  n.status,
                  money(n.total),
                ])}
              />
            </Section>
          )}

          <p className="text-[11px] text-gray-400 mt-8 pt-4 border-t border-gray-200">
            Generado el {prettyDate(iso(new Date()))} · Los montos estan en dolares. Las notas
            anuladas no cuentan como venta.
          </p>
        </div>
      )}

      {!report && !loading && (
        <p className="text-sm text-gray-400 print:hidden">
          Todavia no has generado ningun informe.
        </p>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 break-inside-avoid">
      <p className="text-sm font-medium mb-3 pb-2 border-b border-gray-200">{title}</p>
      {children}
    </div>
  );
}

function Table({
  head,
  rows,
  align,
}: {
  head: string[];
  rows: string[][];
  align: ("left" | "right")[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">Sin datos en este periodo.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-400">
          {head.map((h, i) => (
            <th
              key={h}
              className={`font-normal py-1.5 ${align[i] === "right" ? "text-right" : "text-left"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-gray-100 hover:bg-indigo-50/40 transition-colors">
            {r.map((cell, j) => (
              <td
                key={j}
                className={`py-1.5 ${align[j] === "right" ? "text-right" : "text-left"} ${
                  j === 0 ? "text-gray-500" : ""
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
