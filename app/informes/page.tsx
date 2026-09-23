"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FileSpreadsheet, Printer, RefreshCw, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SkeletonRows, ToolbarButton, ToolbarSeparator, notify } from "@/components/ui";
import { Barra, Campo, Encabezado, Segmento, descargarExcel } from "@/components/Ventana";

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
  const [armar, setArmar] = useState(false);

  useEffect(() => {
    if (kind === "personalizado") return;
    const r = periodRange(kind);
    setFrom(r.from);
    setTo(r.to);
  }, [kind]);

  function toggleSection(k: SectionKey) {
    setSections((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  const generate = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("report_data", { p_from: from, p_to: to });
    setLoading(false);
    if (error) return setError(error.message);
    setReport(data as Report);
  }, [from, to]);

  // el informe se arma solo al cambiar el periodo
  useEffect(() => {
    const t = setTimeout(generate, 300);
    return () => clearTimeout(t);
  }, [generate]);

  const active = (k: SectionKey) => sections.includes(k);
  const t = report?.totals;
  const margin = t ? marginOf(t.sales, t.cost) : null;
  const maxDay = report?.by_day?.length
    ? Math.max(...report.by_day.map((d) => Number(d.total)))
    : 0;

  const presetActivo = PRESETS.find(
    (p) => p.sections.length === sections.length && p.sections.every((s) => sections.includes(s))
  )?.label;

  function exportar() {
    if (!report) return;
    const filas: (string | number)[][] = [];
    const bloque = (titulo: string, head: string[], rows: (string | number)[][]) => {
      filas.push([titulo], head, ...rows, []);
    };
    if (active("by_day"))
      bloque("Por dia", ["Fecha", "Notas", "Vendido"], report.by_day.map((d) => [d.date, d.notes, Number(d.total).toFixed(2)]));
    if (active("by_product"))
      bloque(
        "Por producto",
        ["Codigo", "Descripcion", "Cantidad", "Vendido", "Costo"],
        report.by_product.map((p) => [p.code, p.description, Number(p.quantity), Number(p.total).toFixed(2), Number(p.cost).toFixed(2)])
      );
    if (active("by_client"))
      bloque(
        "Por cliente",
        ["Cliente", "Ciudad", "Notas", "Vendido", "Por cobrar"],
        report.by_client.map((c) => [c.name, c.city ?? "", c.notes, Number(c.total).toFixed(2), Number(c.pending).toFixed(2)])
      );
    if (active("by_category"))
      bloque("Por grupo", ["Grupo", "Unidades", "Vendido"], report.by_category.map((c) => [c.name, Number(c.quantity), Number(c.total).toFixed(2)]));
    if (active("by_city"))
      bloque("Por ciudad", ["Ciudad", "Clientes", "Notas", "Vendido"], report.by_city.map((c) => [c.name, c.clients, c.notes, Number(c.total).toFixed(2)]));
    if (active("by_state"))
      bloque("Por estado", ["Estado", "Clientes", "Notas", "Vendido"], report.by_state.map((c) => [c.name, c.clients, c.notes, Number(c.total).toFixed(2)]));
    if (active("by_status"))
      bloque("Por cobro", ["Estado", "Notas", "Monto"], report.by_status.map((c) => [c.name, c.notes, Number(c.total).toFixed(2)]));
    if (active("by_currency"))
      bloque("Por moneda", ["Moneda", "Notas", "Monto USD"], report.by_currency.map((c) => [c.name, c.notes, Number(c.total).toFixed(2)]));
    if (active("notes_list"))
      bloque(
        "Listado de notas",
        ["N", "Fecha", "Cliente", "Cobro", "Total"],
        report.notes_list.map((n) => [n.number, n.date, n.client, n.status, Number(n.total).toFixed(2)])
      );
    descargarExcel(`informe-${from}-a-${to}`, ["Informe de ventas", `Del ${from} al ${to}`], filas);
    notify.ok("Archivo descargado");
  }

  return (
    <main className="p-6 max-w-[1180px] print:p-0">
      {/* ---------- controles ---------- */}
      <div className="print:hidden">
        <Encabezado titulo="Informes">Elige el periodo y lo que quieres ver. Se arma solo.</Encabezado>

        <Barra>
          <ToolbarButton icon={RefreshCw} label="actualizar" tone="brand" onClick={generate} />
          <ToolbarButton
            icon={SlidersHorizontal}
            label={armar ? "ocultar opciones" : "armar el mio"}
            active={armar}
            onClick={() => setArmar((v) => !v)}
          />
          <ToolbarSeparator />
          <ToolbarButton icon={FileSpreadsheet} label="excel" onClick={exportar} disabled={!report} />
          <ToolbarButton icon={Printer} label="imprimir o pdf" onClick={() => window.print()} disabled={!report} />
        </Barra>

        <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Campo label="Periodo">
              <Segmento
                valor={kind}
                onChange={setKind}
                opciones={[
                  { k: "hoy", l: "Hoy" },
                  { k: "semana", l: "Esta semana" },
                  { k: "mes", l: "Este mes" },
                  { k: "ano", l: "Este año" },
                  { k: "personalizado", l: "Personalizado" },
                ]}
              />
            </Campo>
            <Campo label="Desde">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setKind("personalizado");
                  setFrom(e.target.value);
                }}
                className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </Campo>
            <Campo label="Hasta">
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setKind("personalizado");
                  setTo(e.target.value);
                }}
                className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </Campo>
          </div>

          <p className="text-[11px] text-gray-500 mb-2">Informes listos</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PRESETS.map((p) => {
              const on = presetActivo === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => setSections(p.sections)}
                  className={`text-left rounded-lg px-3 py-2.5 border ${
                    on ? "border-brand-300 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className={`text-[13px] block ${on ? "text-brand-800 font-medium" : "text-gray-800"}`}>{p.label}</span>
                  <span className="text-[11px] text-gray-400">{p.hint}</span>
                </button>
              );
            })}
          </div>

          {armar && (
            <>
              <p className="text-[11px] text-gray-500 mt-4 mb-2">Marca las partes que quieres ver</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => toggleSection(s.key)}
                    className={`text-left rounded-lg px-3 py-2 border flex items-start gap-2 ${
                      active(s.key) ? "border-brand-300 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                        active(s.key) ? "bg-brand-700 text-white" : "border border-gray-300"
                      }`}
                    >
                      {active(s.key) && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span>
                      <span className={`text-[13px] block ${active(s.key) ? "text-brand-900" : "text-gray-700"}`}>{s.label}</span>
                      <span className="text-[11px] text-gray-400">{s.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}
        {loading && !report && <SkeletonRows rows={6} />}
      </div>

      {/* ---------- informe ---------- */}
      {report && t && (
        <div className={`bg-white border border-gray-200 rounded-xl shadow-card p-6 print:border-0 print:shadow-none print:p-0 ${loading ? "opacity-60" : ""}`}>
          <div className="border-b border-gray-200 pb-4 mb-6">
            <p className="text-xs text-gray-400 mb-1">Sistema Save Notas</p>
            <h2 className="text-xl font-semibold text-gray-900">Informe de ventas</h2>
            <p className="text-sm text-gray-500">
              {from === to
                ? prettyDate(from)
                : `Del ${prettyDate(from)} al ${prettyDate(to)}`}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              ["Vendido", money(t.sales), `${t.notes} notas`, "text-brand-700", "bg-brand-50"],
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
                <p className={`text-xl font-semibold tracking-tight ${color}`}>{value}</p>
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
                        className="w-full bg-brand-300 group-hover:bg-brand-600 rounded-t transition-colors"
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

      {!report && !loading && !error && (
        <p className="text-sm text-gray-400 print:hidden">Preparando el informe...</p>
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
          <tr key={i} className="border-t border-gray-100 hover:bg-brand-50/40 transition-colors">
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
