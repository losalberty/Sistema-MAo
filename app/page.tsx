"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  FilePlus2,
  HandCoins,
  Package,
  Receipt,
  ScrollText,
  ShoppingCart,
  Undo2,
  UserPlus,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ToolbarButton, ToolbarSeparator } from "@/components/ui";
import { Barra } from "@/components/Ventana";

type Daily = { date: string; total: number; notes: number };
type TopClient = { name: string; total: number; notes: number };
type TopProduct = { code: string; description: string; quantity: number; total: number };

type Resumen = {
  start: string;
  end: string;
  days?: number;
  granularity?: string;
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
const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function miles(n: number) {
  return "$" + Math.round(Number(n || 0)).toLocaleString("en-US");
}

function shortMoney(n: number) {
  const v = Number(n || 0);
  if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
  return "$" + v.toFixed(0);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function rangeLabel(start: string, end: string) {
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()} al ${b.getDate()} de ${MESES[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MESES_CORTOS[a.getMonth()]} al ${b.getDate()} ${MESES_CORTOS[b.getMonth()]}`;
}

const ACCESOS: {
  href: string;
  titulo: string;
  sub: string;
  icono: LucideIcon;
  chip: string;
}[] = [
  { href: "/notas/nueva", titulo: "Nueva nota", sub: "vender y entregar", icono: FilePlus2, chip: "bg-brand-50 text-brand-700" },
  { href: "/notas", titulo: "Ver notas", sub: "historial y busqueda", icono: ScrollText, chip: "bg-gray-100 text-gray-700" },
  { href: "/cobranzas", titulo: "Cobranzas", sub: "quien debe y abonos", icono: HandCoins, chip: "bg-emerald-50 text-emerald-700" },
  { href: "/compras", titulo: "Compras", sub: "facturas de proveedor", icono: Receipt, chip: "bg-orange-50 text-orange-700" },
  { href: "/productos", titulo: "Productos", sub: "precios y costos", icono: Package, chip: "bg-violet-50 text-violet-700" },
  { href: "/informes", titulo: "Informes", sub: "arma el tuyo por fechas", icono: BarChart3, chip: "bg-sky-50 text-sky-700" },
];

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modo, setModo] = useState<"semana" | "rango">("semana");
  const [offset, setOffset] = useState(0);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [abreCal, setAbreCal] = useState(false);

  // carrusel
  const [panel, setPanel] = useState(0);
  const [quieto, setQuieto] = useState(false);
  const quietoRef = useRef(false);
  quietoRef.current = quieto;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res =
      modo === "semana"
        ? await supabase.rpc("dashboard_week", { p_offset: offset })
        : await supabase.rpc("dashboard_range", { p_from: desde, p_to: hasta });
    setCargando(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setData(res.data as Resumen);
  }, [modo, offset, desde, hasta]);

  useEffect(() => {
    if (modo === "rango" && (!desde || !hasta)) return;
    cargar();
  }, [cargar, modo, desde, hasta]);

  useEffect(() => {
    const t = setInterval(() => {
      if (!quietoRef.current) setPanel((p) => (p === 0 ? 1 : 0));
    }, 9000);
    return () => clearInterval(t);
  }, []);

  const maxDia = useMemo(() => {
    if (!data || data.daily.length === 0) return 0;
    return Math.max(...data.daily.map((d) => d.total));
  }, [data]);

  function preset(dias: number) {
    const hoy = new Date();
    const ini = new Date();
    ini.setDate(hoy.getDate() - (dias - 1));
    setDesde(iso(ini));
    setHasta(iso(hoy));
    setModo("rango");
    setAbreCal(false);
  }

  function presetMes(atras: number) {
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() - atras + 1, 0);
    setDesde(iso(ini));
    setHasta(iso(fin));
    setModo("rango");
    setAbreCal(false);
  }

  const ganancia = data ? data.sales - data.cost : 0;
  const margen = data && data.cost > 0 ? (ganancia / data.cost) * 100 : null;
  const variacion =
    data && data.prev_sales > 0
      ? ((data.sales - data.prev_sales) / data.prev_sales) * 100
      : null;

  const etiqueta = data
    ? modo === "semana" && offset === 0
      ? "Esta semana"
      : modo === "semana"
      ? "Semana"
      : "Periodo"
    : "";

  return (
    <main className="p-6 max-w-[1180px]">
      <Barra>
        <ToolbarButton icon={FilePlus2} label="nueva nota" tone="brand" onClick={() => router.push("/notas/nueva")} />
        <ToolbarButton icon={HandCoins} label="cobrar" tone="success" onClick={() => router.push("/cobranzas")} />
        <ToolbarButton icon={ScrollText} label="notas" onClick={() => router.push("/notas")} />
        <ToolbarSeparator />
        <ToolbarButton icon={Receipt} label="factura compra" onClick={() => router.push("/compras")} />
        <ToolbarButton icon={ShoppingCart} label="pedidos" onClick={() => router.push("/pedidos")} />
        <ToolbarButton icon={Warehouse} label="inventario" onClick={() => router.push("/inventario")} />
        <ToolbarSeparator />
        <ToolbarButton icon={UserPlus} label="clientes" onClick={() => router.push("/clientes")} />
        <ToolbarButton icon={Undo2} label="devoluciones" onClick={() => router.push("/devoluciones")} />
        <ToolbarButton icon={BarChart3} label="informes" onClick={() => router.push("/informes")} />
      </Barra>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ===================== carrusel ===================== */}
      <div
        onMouseEnter={() => setQuieto(true)}
        onMouseLeave={() => setQuieto(false)}
        className="bg-white border border-gray-200 rounded-xl shadow-card p-5 mb-5"
      >
        <div className="relative min-h-[296px]">
          {/* ---------- panel 1: resumen ---------- */}
          <div
            className={`transition-opacity duration-500 ${
              panel === 0 ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{etiqueta}</h1>
                <p className="text-xs text-gray-500">
                  {data ? rangeLabel(data.start, data.end) : "cargando..."}
                </p>
              </div>

              <div className="flex items-center gap-1.5 relative">
                <button
                  onClick={() => {
                    setModo("semana");
                    setOffset((o) => o - 1);
                  }}
                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center"
                  aria-label="Anterior"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  onClick={() => setAbreCal((v) => !v)}
                  className="h-7 px-2.5 rounded-lg border border-gray-200 text-[12px] text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
                >
                  <CalendarDays size={13} className="text-gray-400" />
                  {data ? rangeLabel(data.start, data.end) : "fechas"}
                </button>
                <button
                  onClick={() => {
                    setModo("semana");
                    setOffset((o) => Math.min(o + 1, 0));
                  }}
                  disabled={modo === "semana" && offset === 0}
                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 flex items-center justify-center"
                  aria-label="Siguiente"
                >
                  <ChevronRight size={15} />
                </button>

                {abreCal && (
                  <div className="absolute right-0 top-9 z-30 bg-white border border-gray-200 rounded-xl shadow-pop p-3 w-72">
                    <div className="flex gap-2 mb-2.5">
                      <div className="flex-1">
                        <label className="block text-[10.5px] text-gray-500 mb-1">Desde</label>
                        <input
                          type="date"
                          value={desde}
                          onChange={(e) => setDesde(e.target.value)}
                          className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10.5px] text-gray-500 mb-1">Hasta</label>
                        <input
                          type="date"
                          value={hasta}
                          onChange={(e) => setHasta(e.target.value)}
                          className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (desde && hasta) {
                          setModo("rango");
                          setAbreCal(false);
                        }
                      }}
                      className="w-full h-8 rounded-lg bg-brand-700 text-white text-xs mb-3 hover:bg-brand-800"
                    >
                      Ver este periodo
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      <Preset onClick={() => { setModo("semana"); setOffset(0); setAbreCal(false); }}>
                        esta semana
                      </Preset>
                      <Preset onClick={() => preset(30)}>ultimos 30 dias</Preset>
                      <Preset onClick={() => presetMes(0)}>este mes</Preset>
                      <Preset onClick={() => presetMes(1)}>mes pasado</Preset>
                      <Preset onClick={() => preset(365)}>ultimo año</Preset>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {cargando && !data && (
              <p className="text-sm text-gray-400">Cargando resumen...</p>
            )}

            {data && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                  <Stat
                    label="Ventas"
                    valor={miles(data.sales)}
                    nota={
                      variacion !== null
                        ? `${variacion >= 0 ? "+" : ""}${variacion.toFixed(0)}% vs antes`
                        : "sin comparacion"
                    }
                    tono={variacion !== null && variacion < 0 ? "text-red-600" : "text-emerald-700"}
                  />
                  <Stat
                    label="Ganancia"
                    valor={miles(ganancia)}
                    nota={margen !== null ? `margen ${margen.toFixed(1)}%` : "sin costo cargado"}
                    valorTono="text-emerald-700"
                  />
                  <Stat
                    label="Notas"
                    valor={String(data.notes_count)}
                    nota={`${data.clients_count} clientes`}
                  />
                  <Stat
                    label="Por cobrar"
                    valor={miles(data.pending_total)}
                    valorTono="text-amber-700"
                    nota={
                      data.overdue_total > 0
                        ? `${miles(data.overdue_total)} vencido`
                        : "nada vencido"
                    }
                    tono={data.overdue_total > 0 ? "text-red-600" : "text-gray-400"}
                  />
                </div>

                <div className="flex items-end gap-1.5 h-[86px]">
                  {data.daily.map((d) => {
                    const alto = maxDia > 0 ? (d.total / maxDia) * 66 : 0;
                    const dd = new Date(d.date + "T00:00:00");
                    const etq =
                      data.granularity === "month"
                        ? MESES_CORTOS[dd.getMonth()]
                        : DIAS[(dd.getDay() + 6) % 7];
                    return (
                      <div key={d.date} className="flex-1 text-center group relative">
                        <div
                          className="bg-brand-200 group-hover:bg-brand-600 rounded-t transition-colors"
                          style={{ height: `${Math.max(alto, 2)}px` }}
                        />
                        <div className="text-[10px] text-gray-400 mt-1">{etq}</div>
                        {d.total > 0 && (
                          <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                            {shortMoney(d.total)} · {d.notes} notas
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ---------- panel 2: accesos ---------- */}
          <div
            className={`transition-opacity duration-500 ${
              panel === 1 ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold text-gray-900">¿Que vas a hacer?</h1>
                <p className="text-xs text-gray-500">accesos rapidos</p>
              </div>
              {data && data.overdue_count > 0 && (
                <span className="text-[11.5px] text-red-600">
                  {data.overdue_count} notas vencidas
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {ACCESOS.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="border border-gray-200 rounded-xl p-3 hover:border-brand-200 hover:bg-brand-50/30 hover:shadow-card transition-all"
                >
                  <span
                    className={`w-8 h-8 rounded-[9px] ${a.chip} flex items-center justify-center mb-1.5`}
                  >
                    <a.icono size={16} />
                  </span>
                  <div className="text-[13.5px] text-gray-900">{a.titulo}</div>
                  <div className="text-[11px] text-gray-500">{a.sub}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-4">
          {[0, 1].map((i) => (
            <button
              key={i}
              onClick={() => setPanel(i)}
              aria-label={`Ver panel ${i + 1}`}
              className={`w-[7px] h-[7px] rounded-full ${
                panel === i ? "bg-brand-700" : "bg-gray-300"
              }`}
            />
          ))}
          <span className="ml-2 text-[10.5px] text-gray-400">
            {quieto ? "detenido" : "se detiene al pasar el cursor"}
          </span>
        </div>
      </div>

      {/* ===================== detalle ===================== */}
      {data && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl shadow-card p-5">
            <p className="text-xs text-gray-500 mb-3">Mejores clientes</p>
            {data.top_clients.length === 0 && (
              <p className="text-sm text-gray-400">Sin ventas en este periodo.</p>
            )}
            {data.top_clients.map((c) => {
              const pct = data.sales > 0 ? (c.total / data.sales) * 100 : 0;
              return (
                <div key={c.name} className="mb-2.5">
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="truncate pr-2 text-gray-800">{c.name}</span>
                    <span className="text-gray-900 shrink-0">{money(c.total)}</span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-card p-5">
            <p className="text-xs text-gray-500 mb-3">Lo que mas se movio</p>
            {data.top_products.length === 0 && (
              <p className="text-sm text-gray-400">Sin ventas en este periodo.</p>
            )}
            {data.top_products.map((p) => (
              <div
                key={p.code}
                className="flex justify-between items-baseline text-[13px] py-1.5 border-b border-gray-50 last:border-0"
              >
                <span className="truncate pr-2">
                  <span className="text-gray-400 font-mono text-[10.5px] mr-1.5">
                    {p.code}
                  </span>
                  <span className="text-gray-700">{p.description}</span>
                </span>
                <span className="shrink-0 text-gray-900">
                  {p.quantity} · {money(p.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (data.products_no_cost > 0 || data.low_margin_notes > 0) && (
        <div className="mt-5 bg-white border border-gray-200 rounded-xl shadow-card p-5">
          <p className="text-xs text-gray-500 mb-2.5">Cosas que revisar</p>
          {data.products_no_cost > 0 && (
            <Link
              href="/productos"
              className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-gray-950 py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {data.products_no_cost} de {data.products_total} productos sin costo cargado —
              su ganancia sale mal
            </Link>
          )}
          {data.low_margin_notes > 0 && (
            <Link
              href="/notas"
              className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-gray-950 py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {data.low_margin_notes} notas con margen bajo 15% en este periodo
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  valor,
  nota,
  tono,
  valorTono,
}: {
  label: string;
  valor: string;
  nota?: string;
  tono?: string;
  valorTono?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl px-3.5 py-3">
      <p className="text-[11.5px] text-gray-500">{label}</p>
      <p className={`text-[21px] font-semibold ${valorTono ?? "text-gray-900"}`}>{valor}</p>
      {nota && <p className={`text-[10.5px] ${tono ?? "text-gray-400"}`}>{nota}</p>}
    </div>
  );
}

function Preset({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
    >
      {children}
    </button>
  );
}
