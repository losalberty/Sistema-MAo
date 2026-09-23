"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  FileSpreadsheet,
  ListChecks,
  PackageCheck,
  PackageX,
  Printer,
  Tags,
  Truck,
  Undo2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EmptyState, Pill, SkeletonRows, ToolbarButton, ToolbarSeparator, notify, type PillTone } from "@/components/ui";
import { Barra, Campo, Encabezado, Segmento, Tarjeta, descargarExcel } from "@/components/Ventana";

type PorMes = {
  mes: string;
  mismo_mes: number;
  meses_anteriores: number;
  total: number;
};

type PorProducto = {
  code: string;
  description: string;
  veces: number;
  unidades: number;
  monto: number;
  motivo_principal: string | null;
};

type PorMotivo = {
  reason: string;
  veces: number;
  unidades: number;
  monto: number;
};

type Detalle = {
  return_id: string;
  numero: number;
  return_date: string;
  note_id: string;
  sequence_number: number;
  note_date: string;
  display_name: string;
  code: string;
  description: string;
  quantity: number;
  line_total: number;
  reason: string;
  destination: string;
  observation: string | null;
};

type Informe = {
  from: string;
  to: string;
  devoluciones: number;
  lineas: number;
  unidades: number;
  monto_devuelto: number;
  volvio_almacen: number;
  devuelto_proveedor: number;
  perdida_real: number;
  ventas_periodo: number;
  porcentaje: number;
  por_mes: PorMes[];
  por_producto: PorProducto[];
  por_motivo: PorMotivo[];
  detalle: Detalle[];
};

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const DESTINOS: Record<string, { l: string; tone: PillTone }> = {
  ALMACEN: { l: "volvio al almacen", tone: "success" },
  PROVEEDOR: { l: "al proveedor", tone: "violet" },
  PERDIDA: { l: "perdida", tone: "danger" },
};

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function anioIso(a: number, m: number, d: number) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${a}-${mm}-${dd}`;
}

function fechaCorta(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function DevolucionesPage() {
  const router = useRouter();
  const hoy = new Date();
  const [from, setFrom] = useState(anioIso(hoy.getFullYear(), 0, 1));
  const [to, setTo] = useState(hoy.toISOString().slice(0, 10));
  const [rep, setRep] = useState<Informe | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"productos" | "motivos" | "detalle">("productos");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error } = await supabase.rpc("returns_report", {
      p_from: from,
      p_to: to,
    });
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRep(data as Informe);
  }, [from, to]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const maxMes = useMemo(() => {
    if (!rep || rep.por_mes.length === 0) return 0;
    return Math.max(...rep.por_mes.map((m) => m.total));
  }, [rep]);

  const esteAnio = hoy.getFullYear();
  const periodo =
    from === anioIso(esteAnio, 0, 1) ? "este" : from === anioIso(esteAnio - 1, 0, 1) && to === anioIso(esteAnio - 1, 11, 31) ? "pasado" : "";

  function anio(delta: number) {
    const a = esteAnio + delta;
    setFrom(anioIso(a, 0, 1));
    setTo(delta === 0 ? hoy.toISOString().slice(0, 10) : anioIso(a, 11, 31));
  }

  function exportar() {
    if (!rep) return;
    if (tab === "productos") {
      descargarExcel(
        "devoluciones-por-producto",
        ["Codigo", "Descripcion", "Veces", "Unidades", "Monto", "Motivo principal"],
        rep.por_producto.map((p) => [p.code, p.description, p.veces, p.unidades, money(p.monto), p.motivo_principal ?? ""])
      );
    } else if (tab === "motivos") {
      descargarExcel(
        "devoluciones-por-motivo",
        ["Motivo", "Veces", "Unidades", "Monto"],
        rep.por_motivo.map((m) => [m.reason, m.veces, m.unidades, money(m.monto)])
      );
    } else {
      descargarExcel(
        "devoluciones-detalle",
        ["Fecha", "Nota", "Cliente", "Codigo", "Producto", "Cantidad", "Monto", "Motivo", "Destino", "Observacion"],
        rep.detalle.map((d) => [
          d.return_date,
          d.sequence_number,
          d.display_name,
          d.code,
          d.description,
          d.quantity,
          money(d.line_total),
          d.reason,
          DESTINOS[d.destination]?.l ?? d.destination,
          d.observation ?? "",
        ])
      );
    }
    notify.ok("Archivo descargado");
  }

  return (
    <main className="p-6 max-w-[1180px] print:p-0">
      <Encabezado titulo="Devoluciones">Cuanto vuelve, por que, y cuanto se pierde de verdad</Encabezado>

      <Barra>
        <ToolbarButton
          icon={Undo2}
          label="registrar"
          tone="brand"
          onClick={() => {
            notify.info("Las devoluciones se registran desde la nota", "Marca la nota en la lista y dale al boton devolver.");
            router.push("/notas");
          }}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={Boxes} label="por producto" active={tab === "productos"} onClick={() => setTab("productos")} />
        <ToolbarButton icon={Tags} label="por motivo" active={tab === "motivos"} onClick={() => setTab("motivos")} />
        <ToolbarButton icon={ListChecks} label="detalle" active={tab === "detalle"} onClick={() => setTab("detalle")} />
        <ToolbarSeparator />
        <ToolbarButton icon={FileSpreadsheet} label="excel" onClick={exportar} />
        <ToolbarButton icon={Printer} label="imprimir" onClick={() => window.print()} />
      </Barra>

      <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
        <Campo label="Desde">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          />
        </Campo>
        <Campo label="Hasta">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          />
        </Campo>
        <div className="pb-0.5">
          <Segmento
            valor={periodo}
            onChange={(k) => anio(k === "este" ? 0 : -1)}
            opciones={[
              { k: "este", l: "este año" },
              { k: "pasado", l: "año pasado" },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {cargando && !rep && <SkeletonRows rows={6} />}

      {rep && rep.lineas === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-card">
          <EmptyState icon={Undo2} title="No hay devoluciones en este periodo">
            Para registrar una, entra a{" "}
            <Link href="/notas" className="text-brand-700 hover:underline">
              Notas
            </Link>
            , marca la nota y dale a &quot;devolver&quot;.
          </EmptyState>
        </div>
      )}

      {rep && rep.lineas > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Tarjeta
              label="Devoluciones"
              valor={String(rep.devoluciones)}
              sub={`${rep.unidades} unidades`}
              icono={Undo2}
              acento="bg-gray-100 text-gray-600"
            />
            <Tarjeta
              label="Monto devuelto"
              valor={`$${money(rep.monto_devuelto)}`}
              sub={`${rep.porcentaje}% de tus ventas`}
              icono={Undo2}
              acento="bg-orange-50 text-orange-600"
            />
            <Tarjeta
              label="Volvio al almacen"
              valor={`$${money(rep.volvio_almacen)}`}
              sub="se vuelve a vender"
              tono="text-emerald-700"
              icono={PackageCheck}
              acento="bg-emerald-50 text-emerald-700"
            />
            <Tarjeta
              label="Perdida real"
              valor={`$${money(rep.perdida_real)}`}
              sub="dañado, no recuperado"
              tono="text-red-600"
              icono={PackageX}
              acento="bg-red-50 text-red-600"
            />
          </div>

          {rep.devuelto_proveedor > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-violet-50 border border-violet-100 text-[13px] text-violet-900 flex items-center gap-2">
              <Truck size={16} />
              ${money(rep.devuelto_proveedor)} en mercancia devuelta a proveedores — revisa que te la hayan
              repuesto o acreditado.
            </div>
          )}

          {rep.por_mes.length > 0 && (
            <div className="mb-4 p-4 rounded-xl bg-white border border-gray-200 shadow-card">
              <p className="text-xs text-gray-500 mb-3">Cuando te las devolvieron, y de que mes venian</p>
              <div className="flex items-end gap-1.5 h-24">
                {rep.por_mes.map((m) => {
                  const hMismo = maxMes > 0 ? (m.mismo_mes / maxMes) * 80 : 0;
                  const hViejo = maxMes > 0 ? (m.meses_anteriores / maxMes) * 80 : 0;
                  return (
                    <div key={m.mes} className="flex-1 group relative">
                      <div
                        className="bg-orange-300 rounded-t"
                        style={{ height: `${hMismo}px`, minHeight: m.mismo_mes > 0 ? 2 : 0 }}
                      />
                      <div
                        className="bg-orange-600"
                        style={{ height: `${hViejo}px`, minHeight: m.meses_anteriores > 0 ? 2 : 0 }}
                      />
                      <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {m.mes} · ${money(m.total)}
                        {m.meses_anteriores > 0 && ` · $${money(m.meses_anteriores)} de meses viejos`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mt-1">
                {rep.por_mes.map((m) => (
                  <div key={m.mes} className="flex-1 text-center text-[9.5px] text-gray-400">
                    {MESES_CORTOS[Number(m.mes.slice(5, 7)) - 1]}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-3 text-[10.5px] text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-orange-300" />
                  devueltas del mismo mes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-orange-600" />
                  de notas de meses anteriores
                </span>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
            {tab === "productos" && (
              <>
                <Titulo>Por producto ({rep.por_producto.length})</Titulo>
                <div className="flex gap-3 px-4 py-1.5 border-y border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
                  <span className="flex-1">producto</span>
                  <span className="w-12 text-right">veces</span>
                  <span className="w-16 text-right">unidades</span>
                  <span className="w-24 text-right">monto</span>
                  <span className="w-40">motivo principal</span>
                </div>
                {rep.por_producto.map((p, i) => (
                  <div
                    key={p.code}
                    className={`flex gap-3 items-center px-4 h-10 border-b border-gray-50 text-[13px] ${i % 2 ? "bg-gray-50/40" : ""}`}
                  >
                    <span className="flex-1 min-w-0 truncate">
                      <span className="text-gray-400 font-mono text-[10.5px] mr-1.5">{p.code}</span>
                      {p.description}
                    </span>
                    <span className="w-12 text-right">{p.veces}</span>
                    <span className="w-16 text-right text-gray-500">{p.unidades}</span>
                    <span className="w-24 text-right">${money(p.monto)}</span>
                    <span className="w-40 truncate">
                      <Pill tone="neutral">{p.motivo_principal ?? "sin motivo"}</Pill>
                    </span>
                  </div>
                ))}
              </>
            )}

            {tab === "motivos" && (
              <>
                <Titulo>Por motivo ({rep.por_motivo.length})</Titulo>
                <div className="flex gap-3 px-4 py-1.5 border-y border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
                  <span className="flex-1">motivo</span>
                  <span className="w-12 text-right">veces</span>
                  <span className="w-16 text-right">unidades</span>
                  <span className="w-24 text-right">monto</span>
                  <span className="w-32">peso</span>
                </div>
                {rep.por_motivo.map((m, i) => {
                  const pct = rep.monto_devuelto > 0 ? (m.monto / rep.monto_devuelto) * 100 : 0;
                  return (
                    <div
                      key={m.reason}
                      className={`flex gap-3 items-center px-4 h-10 border-b border-gray-50 text-[13px] ${i % 2 ? "bg-gray-50/40" : ""}`}
                    >
                      <span className="flex-1 min-w-0 truncate">{m.reason}</span>
                      <span className="w-12 text-right">{m.veces}</span>
                      <span className="w-16 text-right text-gray-500">{m.unidades}</span>
                      <span className="w-24 text-right">${money(m.monto)}</span>
                      <span className="w-32 flex items-center gap-2">
                        <span className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <span className="block h-full bg-orange-400" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-[10.5px] text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {tab === "detalle" && (
              <>
                <Titulo>Detalle ({rep.detalle.length})</Titulo>
                <div className="flex gap-3 px-4 py-1.5 border-y border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
                  <span className="w-20">fecha</span>
                  <span className="w-12">nota</span>
                  <span className="w-32">cliente</span>
                  <span className="flex-1">producto</span>
                  <span className="w-10 text-right">cant</span>
                  <span className="w-20 text-right">monto</span>
                  <span className="w-32">destino</span>
                </div>
                {rep.detalle.map((d, i) => {
                  const dst = DESTINOS[d.destination] ?? { l: d.destination, tone: "neutral" as PillTone };
                  return (
                    <div
                      key={`${d.return_id}-${i}`}
                      className={`flex gap-3 items-center px-4 h-10 border-b border-gray-50 text-[12.5px] ${i % 2 ? "bg-gray-50/40" : ""}`}
                      title={d.observation ?? ""}
                    >
                      <span className="w-20 text-gray-500">{fechaCorta(d.return_date)}</span>
                      <Link
                        href={`/notas/nueva?id=${d.note_id}`}
                        className="w-12 text-brand-700 hover:underline font-mono text-[11px]"
                      >
                        {d.sequence_number}
                      </Link>
                      <span className="w-32 truncate text-gray-600">{d.display_name}</span>
                      <span className="flex-1 min-w-0 truncate">
                        {d.description}
                        <span className="text-gray-400 ml-1.5">· {d.reason}</span>
                      </span>
                      <span className="w-10 text-right">{d.quantity}</span>
                      <span className="w-20 text-right">${money(d.line_total)}</span>
                      <span className="w-32">
                        <Pill tone={dst.tone}>{dst.l}</Pill>
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-3 pb-2 text-[13px] font-medium text-gray-800">{children}</div>;
}
