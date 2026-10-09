"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  ChevronDown,
  Coins,
  Download,
  FilePlus2,
  HandCoins,
  MessageCircle,
  Receipt,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EmptyState, Pill, notify } from "@/components/ui";
import { descargarExcel } from "@/components/Ventana";
import { colorDe, iniciales } from "@/components/Paleta";
import { sonDeHoy, useTasas } from "@/components/Tasas";
import { useAlClicFuera } from "@/components/useFuera";

/* ============================================================
   Panel principal: como va el negocio, de un vistazo
   ============================================================ */

type Punto = { fecha: string; ventas: number; ganancia: number; notas: number; cobrado: number };

type Resumen = {
  desde: string;
  hasta: string;
  mensual: boolean;
  ventas: number;
  ganancia: number;
  costo: number;
  notas: number;
  clientes: number;
  cobrado: number;
  ventas_antes: number;
  ganancia_antes: number;
  notas_antes: number;
  cobrado_antes: number;
  serie: Punto[];
  por_cobrar: number;
  por_cobrar_notas: number;
  vencido: number;
  antiguedad: { tramo: string; monto: number; notas: number }[];
  cobrar_hoy: { id: string; sequence_number: number; cliente: string; phone: string | null; falta: number; dias: number }[];
  top_productos: { code: string; description: string; unidades: number; total: number }[];
  top_clientes: { nombre: string; total: number; notas: number }[];
  por_moneda: { moneda: string; total: number; notas: number }[];
  productos_sin_costo: number;
  productos_total: number;
  notas_margen_bajo: number;
};

type Periodo = "hoy" | "7d" | "30d" | "mes" | "12m" | "rango";

const PERIODOS: { k: Periodo; l: string }[] = [
  { k: "hoy", l: "Hoy" },
  { k: "7d", l: "7 dias" },
  { k: "30d", l: "30 dias" },
  { k: "mes", l: "Este mes" },
  { k: "12m", l: "12 meses" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const TRAMOS: Record<string, { l: string; color: string }> = {
  al_dia: { l: "Al dia", color: "#4568a8" },
  "1_15": { l: "1 a 15 dias", color: "#e0a43a" },
  "16_30": { l: "16 a 30 dias", color: "#e2703a" },
  "31_mas": { l: "Mas de 30 dias", color: "#d23a3a" },
};

const MONEDA: Record<string, { l: string; color: string }> = {
  USD: { l: "Dolares", color: "#10b981" },
  BS_BCV: { l: "Bs BCV", color: "#0ea5e9" },
  BS_BINANCE: { l: "Bs Binance", color: "#f59e0b" },
  COP: { l: "Pesos", color: "#8b5cf6" },
};

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function corto(n: number) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1000) return "$" + (v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
  return "$" + Math.round(v).toLocaleString("en-US");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangoDe(k: Periodo): { desde: string; hasta: string } {
  const hoy = new Date();
  const h = iso(hoy);
  if (k === "hoy") return { desde: h, hasta: h };
  if (k === "7d" || k === "30d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - (k === "7d" ? 6 : 29));
    return { desde: iso(d), hasta: h };
  }
  if (k === "mes") return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: h };
  return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)), hasta: h };
}

function etiquetaFecha(f: string, mensual: boolean) {
  const d = new Date(f.slice(0, 10) + "T00:00:00");
  return mensual ? `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function variacion(ahora: number, antes: number): number | null {
  if (!antes || antes <= 0) return null;
  return ((ahora - antes) / antes) * 100;
}

// telefono venezolano -> formato internacional para WhatsApp
function telWhatsapp(tel: string | null | undefined) {
  if (!tel) return null;
  let t = tel.replace(/\D/g, "");
  if (!t) return null;
  if (t.startsWith("0")) t = "58" + t.slice(1);
  else if (t.length === 10) t = "58" + t;
  return t;
}

/* ---------- numero que sube animado ---------- */
function useContar(valor: number, ms = 800) {
  const [v, setV] = useState(0);
  const desde = useRef(0);
  useEffect(() => {
    const inicio = desde.current;
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setV(inicio + (valor - inicio) * e);
      if (p < 1) raf = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    raf = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(raf);
      desde.current = valor;
    };
  }, [valor, ms]);
  return v;
}

/* ============================================================ */

export default function Panel() {
  const router = useRouter();
  const tasas = useTasas();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [rango, setRango] = useState(rangoDe("30d"));
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serieVer, setSerieVer] = useState<"ventas" | "ganancia" | "cobrado">("ventas");
  const [verCal, setVerCal] = useState(false);
  const [calDesde, setCalDesde] = useState(rango.desde);
  const [calHasta, setCalHasta] = useState(rango.hasta);
  const cajaCal = useRef<HTMLDivElement>(null);
  const cerrarCal = useCallback(() => setVerCal(false), []);
  useAlClicFuera(cajaCal, verCal, cerrarCal);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc("panel_resumen", { p_desde: rango.desde, p_hasta: rango.hasta });
    setCargando(false);
    if (error) return setError(error.message);
    setError(null);
    setData(data as Resumen);
  }, [rango]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function elegirPeriodo(k: Periodo) {
    setPeriodo(k);
    const r = rangoDe(k);
    setRango(r);
    setCalDesde(r.desde);
    setCalHasta(r.hasta);
  }

  function aplicarRango() {
    if (!calDesde || !calHasta) return;
    const [a, b] = calDesde <= calHasta ? [calDesde, calHasta] : [calHasta, calDesde];
    setPeriodo("rango");
    setRango({ desde: a, hasta: b });
    setVerCal(false);
  }

  function exportar() {
    if (!data) return;
    descargarExcel(
      `panel-${data.desde}-a-${data.hasta}`,
      [data.mensual ? "Mes" : "Dia", "Ventas $", "Ganancia $", "Cobrado $", "Notas"],
      data.serie.map((p) => [p.fecha, p.ventas.toFixed(2), p.ganancia.toFixed(2), p.cobrado.toFixed(2), p.notas])
    );
    notify.ok("Archivo descargado");
  }

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos dias" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const hoyLargo = new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
  const etiquetaRango =
    periodo === "rango" && data
      ? `${etiquetaFecha(data.desde, false)} – ${etiquetaFecha(data.hasta, false)}`
      : PERIODOS.find((p) => p.k === periodo)?.l ?? "";

  const margen = data && data.ventas > 0 ? (data.ganancia / data.ventas) * 100 : null;
  const revisar = (
    data
      ? [
          !sonDeHoy(tasas) && { t: "Todavia no pusiste las tasas de hoy", sub: "abajo a la izquierda, en el menu", href: null },
          data.productos_sin_costo > 0 && {
            t: `${data.productos_sin_costo} de ${data.productos_total} productos sin costo cargado`,
            sub: "su ganancia sale mal en los informes",
            href: "/productos",
          },
          data.notas_margen_bajo > 0 && {
            t: `${data.notas_margen_bajo} notas con margen bajo 15% en este periodo`,
            sub: "revisa los precios de venta",
            href: "/notas",
          },
        ].filter(Boolean)
      : []
  ) as { t: string; sub: string; href: string | null }[];

  return (
    <main className="p-6 max-w-[1240px] pb-16">
      {/* ---------- saludo y periodo ---------- */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold text-gray-900 tracking-tight">{saludo}</h1>
          <p className="text-[13px] text-gray-500 first-letter:uppercase">{hoyLargo} · asi va tu negocio</p>
        </div>
        <div className="flex-1" />
        <div className="inline-flex p-[3px] rounded-[10px] bg-gray-200/60 gap-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.k}
              onClick={() => elegirPeriodo(p.k)}
              className={`h-7 px-2.5 rounded-[7px] text-[12.5px] whitespace-nowrap transition-colors ${
                periodo === p.k
                  ? "bg-white text-gray-900 font-medium shadow-[0_1px_2px_rgba(16,24,40,.08)]"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div className="relative" ref={cajaCal}>
          <button
            onClick={() => setVerCal((v) => !v)}
            className={`h-[34px] px-3 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] border shadow-[0_1px_2px_rgba(16,24,40,.05)] whitespace-nowrap ${
              periodo === "rango"
                ? "border-brand-200 bg-brand-50 text-brand-800 font-medium"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <CalendarDays size={15} />
            {periodo === "rango" ? etiquetaRango : "Fechas"}
            <ChevronDown size={14} />
          </button>
          {verCal && (
            <div className="absolute right-0 top-10 z-30 w-72 rounded-xl bg-white border border-gray-200 shadow-pop p-3">
              <p className="text-[12px] font-medium text-gray-700 mb-2">Elige un rango de fechas</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="block">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Desde</span>
                  <input
                    type="date"
                    value={calDesde}
                    onChange={(e) => setCalDesde(e.target.value)}
                    className="w-full h-8 px-2 border border-gray-300 rounded-lg text-[12.5px]"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Hasta</span>
                  <input
                    type="date"
                    value={calHasta}
                    onChange={(e) => setCalHasta(e.target.value)}
                    className="w-full h-8 px-2 border border-gray-300 rounded-lg text-[12.5px]"
                  />
                </label>
              </div>
              <button
                onClick={aplicarRango}
                className="w-full h-8 rounded-lg bg-brand-700 text-white text-[12.5px] font-medium hover:bg-brand-800"
              >
                Ver este periodo
              </button>
            </div>
          )}
        </div>
        <button
          onClick={exportar}
          className="h-[34px] px-3 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] border border-gray-200 bg-white text-gray-700 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:border-gray-300"
        >
          <Download size={15} /> Exportar
        </button>
      </div>

      {/* ---------- accesos rapidos ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mt-5">
        <Acceso icon={FilePlus2} titulo="Nueva nota" sub="tecla N" tono="bg-brand-50 text-brand-700" onClick={() => router.push("/notas/nueva")} />
        <Acceso icon={HandCoins} titulo="Cobrar" sub="quien me debe" tono="bg-emerald-50 text-emerald-700" onClick={() => router.push("/cobranzas")} />
        <Acceso icon={Receipt} titulo="Factura de compra" sub="de un proveedor" tono="bg-orange-50 text-orange-700" onClick={() => router.push("/compras")} />
        <Acceso icon={Boxes} titulo="Inventario" sub="cargar cantidades" tono="bg-violet-50 text-violet-700" onClick={() => router.push("/inventario")} />
        <Acceso
          icon={Search}
          titulo="Buscar"
          sub="Ctrl + K"
          tono="bg-sky-50 text-sky-700"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        />
      </div>

      {error && <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {/* ---------- numeros grandes ---------- */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4 transition-opacity ${cargando && data ? "opacity-60" : ""}`}>
        <Kpi
          label="Ventas"
          icon={TrendingUp}
          tono="bg-brand-50 text-brand-700"
          valor={data?.ventas}
          cambio={data ? variacion(data.ventas, data.ventas_antes) : null}
          serie={data?.serie.map((p) => p.ventas)}
          color="#4568a8"
          pie={data ? `${data.notas} notas · ${data.clientes} clientes` : ""}
        />
        <Kpi
          label="Ganancia"
          icon={Sparkles}
          tono="bg-emerald-50 text-emerald-700"
          valor={data?.ganancia}
          cambio={data ? variacion(data.ganancia, data.ganancia_antes) : null}
          serie={data?.serie.map((p) => p.ganancia)}
          color="#10b981"
          pie={margen !== null ? `margen ${margen.toFixed(1)}%` : "sin ventas"}
        />
        <Kpi
          label="Cobrado"
          icon={Wallet}
          tono="bg-sky-50 text-sky-700"
          valor={data?.cobrado}
          cambio={data ? variacion(data.cobrado, data.cobrado_antes) : null}
          serie={data?.serie.map((p) => p.cobrado)}
          color="#0ea5e9"
          pie="abonos recibidos"
        />
        <Kpi
          label="Por cobrar"
          icon={HandCoins}
          tono="bg-amber-50 text-amber-700"
          valor={data?.por_cobrar}
          valorTono="text-amber-700"
          pie={
            data ? (
              data.vencido > 0.005 ? <span className="text-red-600">{money(data.vencido)} vencido</span> : "nada vencido"
            ) : (
              ""
            )
          }
          onClick={() => router.push("/cobranzas")}
        />
      </div>

      {/* ---------- grafico + deuda ---------- */}
      <div className="grid lg:grid-cols-3 gap-3.5 mt-3.5">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-card min-w-0">
          <div className="flex items-center gap-2 px-4 pt-3.5 flex-wrap">
            <h3 className="text-[14px] font-semibold text-gray-900">
              {serieVer === "ventas" ? "Ventas" : serieVer === "ganancia" ? "Ganancia" : "Cobrado"}
            </h3>
            <span className="text-[12.5px] text-gray-400">
              · {etiquetaRango.toLowerCase()} · {data?.mensual ? "por mes" : "por dia"}
            </span>
            <div className="flex-1" />
            <div className="inline-flex p-[3px] rounded-[9px] bg-gray-100 gap-0.5">
              {(["ventas", "ganancia", "cobrado"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSerieVer(k)}
                  className={`h-6 px-2.5 rounded-md text-[12px] capitalize ${
                    serieVer === k ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="px-2 pb-2 pt-1">
            {data ? (
              <GraficoArea
                key={`${data.desde}-${data.hasta}-${serieVer}`}
                puntos={data.serie}
                campo={serieVer}
                mensual={data.mensual}
                color={serieVer === "ventas" ? "#4568a8" : serieVer === "ganancia" ? "#10b981" : "#0ea5e9"}
              />
            ) : (
              <div className="skeleton h-[240px] m-2" />
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-card flex flex-col">
          <div className="flex items-center gap-2 px-4 pt-3.5">
            <h3 className="text-[14px] font-semibold text-gray-900">Lo que te deben</h3>
            <div className="flex-1" />
            <Link href="/cobranzas" className="text-[12.5px] text-brand-700 hover:underline inline-flex items-center gap-1">
              Ver todo <ArrowRight size={13} />
            </Link>
          </div>
          {data ? (
            <Deuda data={data} />
          ) : (
            <div className="p-4 space-y-2">
              <div className="skeleton h-7 w-1/2" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-3/4" />
            </div>
          )}
        </div>
      </div>

      {/* ---------- cobrar hoy + lo que mas se vende ---------- */}
      <div className="grid lg:grid-cols-3 gap-3.5 mt-3.5">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-card min-w-0">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
            <h3 className="text-[14px] font-semibold text-gray-900">Para cobrar hoy</h3>
            {data && data.cobrar_hoy.length > 0 && <Pill tone="danger">{data.cobrar_hoy.length} vencidas</Pill>}
            <div className="flex-1" />
            <span className="text-[12px] text-gray-400">las mas atrasadas primero</span>
          </div>
          {data && data.cobrar_hoy.length === 0 && (
            <EmptyState icon={HandCoins} title="No hay notas vencidas">
              Todos tus clientes estan al dia. Bien ahi.
            </EmptyState>
          )}
          {data?.cobrar_hoy.map((n) => (
            <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 hover:bg-gray-50/80">
              <span
                className="w-8 h-8 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0"
                style={{ background: colorDe(n.cliente) }}
              >
                {iniciales(n.cliente)}
              </span>
              <button onClick={() => router.push(`/notas?nota=${n.id}`)} className="flex-1 min-w-0 text-left" title="Abrir la nota">
                <span className="block text-[13.5px] font-medium text-gray-900 truncate hover:text-brand-700">{n.cliente}</span>
                <span className="block text-[12px] text-gray-500">
                  Nota #{n.sequence_number} ·{" "}
                  <span className={n.dias > 30 ? "text-red-600" : "text-amber-700"}>
                    vencio hace {n.dias} dia{n.dias === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
              <span className="text-[14px] font-semibold text-gray-900 whitespace-nowrap">{money(n.falta)}</span>
              <button
                onClick={() => {
                  const tel = telWhatsapp(n.phone);
                  const txt = encodeURIComponent(
                    `Hola ${n.cliente.split(" ")[0]}, le escribo por la nota #${n.sequence_number}. Tiene un saldo pendiente de ${money(n.falta)}. ¡Gracias!`
                  );
                  if (!tel) notify.info("Este cliente no tiene telefono guardado", "Elige el contacto en WhatsApp.");
                  window.open(tel ? `https://wa.me/${tel}?text=${txt}` : `https://wa.me/?text=${txt}`, "_blank");
                }}
                title="Recordarle por WhatsApp"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-600 border border-gray-200 bg-white hover:bg-emerald-50 hover:border-emerald-200"
              >
                <MessageCircle size={15} />
              </button>
              <button
                onClick={() => router.push(`/notas?nota=${n.id}&abonar=1`)}
                className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[12.5px] font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              >
                <HandCoins size={14} /> Abonar
              </button>
            </div>
          ))}
          {!data && (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-9 w-full" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-card">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
            <h3 className="text-[14px] font-semibold text-gray-900">Lo que mas se vende</h3>
          </div>
          <div className="px-4 pb-4">
            {data && data.top_productos.length === 0 && (
              <p className="py-6 text-center text-[13px] text-gray-400">Sin ventas en el periodo</p>
            )}
            {data?.top_productos.map((t) => {
              const max = data.top_productos[0]?.total || 1;
              return (
                <div key={t.code + t.description} className="py-2">
                  <div className="flex justify-between gap-3 text-[12.5px]">
                    <span className="truncate text-gray-700" title={t.description}>
                      {t.description}
                    </span>
                    <b className="font-semibold text-gray-900 whitespace-nowrap">{money(t.total)}</b>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex-1 h-[6px] rounded-full bg-gray-100 overflow-hidden">
                      <Barra pct={(t.total / max) * 100} className="bg-gradient-to-r from-brand-600 to-brand-300" />
                    </span>
                    <span className="text-[11px] text-gray-400 w-14 text-right">{Number(t.unidades)} uds</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- mejores clientes + monedas ---------- */}
      <div className="grid lg:grid-cols-2 gap-3.5 mt-3.5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-card">
          <div className="px-4 pt-3.5 pb-1">
            <h3 className="text-[14px] font-semibold text-gray-900">Mejores clientes</h3>
          </div>
          <div className="px-4 pb-3">
            {data && data.top_clientes.length === 0 && (
              <p className="py-6 text-center text-[13px] text-gray-400">Sin ventas en el periodo</p>
            )}
            {data?.top_clientes.map((c, i) => {
              const pct = data.ventas > 0 ? (c.total / data.ventas) * 100 : 0;
              return (
                <div key={c.nombre} className="flex items-center gap-3 py-2">
                  <span className="w-5 text-[12px] text-gray-400 text-right">{i + 1}</span>
                  <span
                    className="w-7 h-7 rounded-full text-white text-[10.5px] font-semibold flex items-center justify-center shrink-0"
                    style={{ background: colorDe(c.nombre) }}
                  >
                    {iniciales(c.nombre)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="truncate text-gray-800">{c.nombre}</span>
                      <b className="font-semibold text-gray-900 whitespace-nowrap">{money(c.total)}</b>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex-1 h-[4px] rounded-full bg-gray-100 overflow-hidden">
                        <Barra pct={pct} className="bg-emerald-500" />
                      </span>
                      <span className="text-[11px] text-gray-400 w-24 text-right">
                        {pct.toFixed(0)}% · {c.notas} nota{c.notas === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-card">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
            <h3 className="text-[14px] font-semibold text-gray-900">En que moneda vendes</h3>
            <Coins size={14} className="text-gray-400" />
          </div>
          <div className="px-4 pb-4">
            {data && data.por_moneda.length === 0 && (
              <p className="py-6 text-center text-[13px] text-gray-400">Sin ventas en el periodo</p>
            )}
            {data && data.por_moneda.length > 0 && (
              <>
                <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mt-3 mb-3">
                  {data.por_moneda.map((m) => (
                    <div
                      key={m.moneda}
                      title={`${MONEDA[m.moneda]?.l ?? m.moneda}: ${money(m.total)}`}
                      style={{ flex: Math.max(m.total, 0.0001), background: MONEDA[m.moneda]?.color ?? "#9ca3af" }}
                    />
                  ))}
                </div>
                {data.por_moneda.map((m) => {
                  const pct = data.ventas > 0 ? (m.total / data.ventas) * 100 : 0;
                  return (
                    <div key={m.moneda} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: MONEDA[m.moneda]?.color ?? "#9ca3af" }} />
                      <span className="flex-1 text-gray-700">{MONEDA[m.moneda]?.l ?? m.moneda}</span>
                      <span className="text-[12px] text-gray-400">{m.notas} notas</span>
                      <b className="w-24 text-right font-semibold text-gray-900">{money(m.total)}</b>
                      <span className="w-10 text-right text-[12px] text-gray-400">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---------- cosas que revisar ---------- */}
      {revisar.length > 0 && (
        <div className="mt-3.5 bg-white border border-gray-200 rounded-xl shadow-card px-4 py-3">
          <p className="text-[12px] font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-500" /> Cosas que revisar
          </p>
          {revisar.map((r) =>
            r.href ? (
              <Link key={r.t} href={r.href} className="flex items-center gap-2.5 py-1.5 text-[13px] text-gray-700 hover:text-gray-950 group">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {r.t}
                <span className="text-gray-400">— {r.sub}</span>
                <ArrowRight size={13} className="text-gray-300 group-hover:text-gray-600" />
              </Link>
            ) : (
              <p key={r.t} className="flex items-center gap-2.5 py-1.5 text-[13px] text-gray-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {r.t}
                <span className="text-gray-400">— {r.sub}</span>
              </p>
            )
          )}
        </div>
      )}
    </main>
  );
}

/* ============================================================
   Piezas
   ============================================================ */

function Acceso({
  icon: Icono,
  titulo,
  sub,
  tono,
  onClick,
}: {
  icon: LucideIcon;
  titulo: string;
  sub: string;
  tono: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,.04)] hover:border-gray-300 hover:shadow-card hover:-translate-y-px transition-all"
    >
      <span className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${tono}`}>
        <Icono size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-gray-900 truncate">{titulo}</span>
        <span className="block text-[11.5px] text-gray-400 truncate">{sub}</span>
      </span>
    </button>
  );
}

function Barra({ pct, className }: { pct: number; className: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  return (
    <span
      className={`block h-full rounded-full ${className}`}
      style={{ width: `${Math.max(0, Math.min(w, 100))}%`, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }}
    />
  );
}

function Kpi({
  label,
  icon: Icono,
  tono,
  valor,
  valorTono = "text-gray-900",
  cambio,
  serie,
  color,
  pie,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tono: string;
  valor: number | undefined;
  valorTono?: string;
  cambio?: number | null;
  serie?: number[];
  color?: string;
  pie?: React.ReactNode;
  onClick?: () => void;
}) {
  const v = useContar(valor ?? 0);
  const cargado = valor !== undefined;
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden bg-white border border-gray-200 rounded-xl shadow-card px-4 pt-3.5 pb-3 transition-all hover:-translate-y-0.5 hover:shadow-pop ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <p className="flex items-center gap-2 text-[12.5px] text-gray-500">
        <span className={`w-6 h-6 rounded-[7px] flex items-center justify-center ${tono}`}>
          <Icono size={13} />
        </span>
        {label}
      </p>
      {cargado ? (
        <p className={`text-[26px] font-semibold tracking-tight mt-2 leading-none ${valorTono}`}>{money(v)}</p>
      ) : (
        <div className="skeleton h-7 w-2/3 mt-2" />
      )}
      <div className="flex items-center gap-1.5 mt-2 min-h-[20px] text-[12px] text-gray-500">
        {cambio !== undefined && cambio !== null && (
          <span
            title="contra el periodo anterior del mismo largo"
            className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md text-[11.5px] font-medium ${
              cambio >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}
          >
            {cambio >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(cambio).toFixed(0)}%
          </span>
        )}
        <span className="truncate">{pie}</span>
      </div>
      {serie && serie.length > 1 && color && <Mini valores={serie} color={color} />}
    </div>
  );
}

function Mini({ valores, color }: { valores: number[]; color: string }) {
  const w = 88;
  const h = 30;
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const pts = valores
    .map((v, i) => `${((i / (valores.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  const [ver, setVer] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setVer(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute right-3 top-3.5 opacity-90" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={ver ? 0 : 1}
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(.3,.7,.2,1)" }}
      />
    </svg>
  );
}

/* ---------- lo que te deben, por antiguedad ---------- */

function Deuda({ data }: { data: Resumen }) {
  const total = data.antiguedad.reduce((s, t) => s + t.monto, 0) || 1;
  const v = useContar(data.por_cobrar);
  return (
    <div className="px-4 pb-4 pt-2 flex-1 flex flex-col">
      <p className="text-[26px] font-semibold tracking-tight text-gray-900 leading-tight">{money(v)}</p>
      <p className="text-[12px] text-gray-500">
        {data.por_cobrar_notas} nota{data.por_cobrar_notas === 1 ? "" : "s"} abiertas
        {data.vencido > 0.005 && (
          <>
            {" · "}
            <span className="text-red-600">{money(data.vencido)} vencido</span>
          </>
        )}
      </p>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] my-3.5 bg-gray-100">
        {data.antiguedad.map((t) => (
          <div
            key={t.tramo}
            title={`${TRAMOS[t.tramo]?.l}: ${money(t.monto)}`}
            style={{ flex: Math.max(t.monto, 0.0001), background: TRAMOS[t.tramo]?.color, transition: "flex .6s" }}
          />
        ))}
      </div>
      {data.antiguedad.map((t) => (
        <div key={t.tramo} className="flex items-center gap-2.5 py-[5px] text-[13px]">
          <span className="w-2 h-2 rounded-full" style={{ background: TRAMOS[t.tramo]?.color }} />
          <span className="flex-1 text-gray-700">{TRAMOS[t.tramo]?.l}</span>
          <span className="text-[11.5px] text-gray-400">{t.notas}</span>
          <b className="w-24 text-right font-semibold text-gray-900">{money(t.monto)}</b>
          <span className="w-9 text-right text-[11.5px] text-gray-400">{Math.round((t.monto / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- grafico de area con tooltip ---------- */

function curva(pts: [number, number][]) {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function GraficoArea({
  puntos,
  campo,
  mensual,
  color,
}: {
  puntos: Punto[];
  campo: "ventas" | "ganancia" | "cobrado";
  mensual: boolean;
  color: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(680);
  const [sobre, setSobre] = useState<number | null>(null);
  const [dibujado, setDibujado] = useState(false);
  const H = 240;
  const pl = 48;
  const pr = 12;
  const pt = 12;
  const pb = 26;

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(el.clientWidth, 280));
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => setDibujado(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const valores = puntos.map((p) => Number(p[campo]) || 0);
  const maxV = Math.max(...valores, 0);
  const minV = Math.min(...valores, 0);
  const tope = maxV <= 0 ? 1 : maxV * 1.12;
  const piso = minV < 0 ? minV * 1.12 : 0;
  const W = ancho;
  const n = puntos.length;
  const x = (i: number) => (n <= 1 ? pl + (W - pl - pr) / 2 : pl + (i / (n - 1)) * (W - pl - pr));
  const y = (v: number) => pt + (1 - (v - piso) / (tope - piso)) * (H - pt - pb);
  const xy = valores.map((v, i) => [x(i), y(v)] as [number, number]);
  const linea = curva(xy);
  const area = n > 0 ? `${linea} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z` : "";
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((t) => piso + (tope - piso) * t);
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 80))));
  const hayAlgo = valores.some((v) => v !== 0);
  const idGrad = `g-${campo}`;

  function mover(e: React.MouseEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const i = n <= 1 ? 0 : Math.round(((sx - pl) / (W - pl - pr)) * (n - 1));
    setSobre(Math.max(0, Math.min(n - 1, i)));
  }

  if (n === 0 || !hayAlgo) {
    return (
      <div ref={caja} className="h-[240px] flex items-center justify-center text-[13px] text-gray-400">
        Sin movimiento en este periodo
      </div>
    );
  }

  const p = sobre !== null ? puntos[sobre] : null;

  return (
    <div ref={caja} className="relative">
      <svg width={W} height={H} className="block overflow-visible">
        <defs>
          <linearGradient id={idGrad} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {marcas.map((m, i) => (
          <g key={i}>
            <line x1={pl} x2={W - pr} y1={y(m)} y2={y(m)} stroke="#eef0f4" strokeDasharray={i ? "3 4" : undefined} />
            <text x={pl - 8} y={y(m) + 4} textAnchor="end" fontSize="10.5" fill="#9aa1b1">
              {corto(m)}
            </text>
          </g>
        ))}
        {puntos.map((q, i) =>
          i % cada === 0 || i === n - 1 ? (
            <text key={q.fecha} x={x(i)} y={H - 7} textAnchor="middle" fontSize="10.5" fill="#9aa1b1">
              {etiquetaFecha(q.fecha, mensual)}
            </text>
          ) : null
        )}
        <path d={area} fill={`url(#${idGrad})`} style={{ opacity: dibujado ? 1 : 0, transition: "opacity .8s ease .2s" }} />
        <path
          d={linea}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={dibujado ? 0 : 1}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.3,.7,.2,1)" }}
        />
        {sobre !== null && (
          <>
            <line x1={x(sobre)} x2={x(sobre)} y1={pt} y2={H - pb} stroke="#9aa1b1" strokeDasharray="3 3" />
            <circle cx={x(sobre)} cy={y(valores[sobre])} r="5" fill="white" stroke={color} strokeWidth="2.5" />
          </>
        )}
        <rect
          x={pl}
          y={0}
          width={Math.max(W - pl - pr, 1)}
          height={H}
          fill="transparent"
          onMouseMove={mover}
          onMouseLeave={() => setSobre(null)}
        />
      </svg>
      {p && sobre !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-[10px] bg-gray-900 text-white px-3 py-2 text-[12px] shadow-pop whitespace-nowrap"
          style={{ left: Math.min(x(sobre) + 14, W - 160), top: Math.max(y(valores[sobre]) - 34, 0) }}
        >
          <span className="block text-gray-400">{etiquetaFecha(p.fecha, mensual)}</span>
          <b className="block text-[14px]">{money(Number(p[campo]))}</b>
          <span className="block text-gray-400">
            {p.notas} nota{p.notas === 1 ? "" : "s"}
            {campo !== "cobrado" && p.cobrado > 0 && ` · cobrado ${money(p.cobrado)}`}
          </span>
        </div>
      )}
    </div>
  );
}
