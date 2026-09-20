"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

const DESTINOS: Record<string, { l: string; c: string }> = {
  ALMACEN: { l: "volvio al almacen", c: "bg-emerald-50 text-emerald-800" },
  PROVEEDOR: { l: "al proveedor", c: "bg-violet-50 text-violet-800" },
  PERDIDA: { l: "perdida", c: "bg-red-50 text-red-800" },
};

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function anioIso(a: number, m: number, d: number) {
  return new Date(a, m, d).toISOString().slice(0, 10);
}

export default function DevolucionesPage() {
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

  function anio(delta: number) {
    const a = hoy.getFullYear() + delta;
    setFrom(anioIso(a, 0, 1));
    setTo(anioIso(a, 11, 31));
  }

  return (
    <main className="p-8 max-w-5xl print:p-0">
      <div className="flex items-end justify-between mb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Devoluciones</h1>
          <p className="text-sm text-gray-500">
            Cuanto vuelve, por que, y cuanto se pierde de verdad
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Imprimir
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-5 print:hidden">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={() => anio(0)}
          className="px-2.5 h-9 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
        >
          este año
        </button>
        <button
          onClick={() => anio(-1)}
          className="px-2.5 h-9 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
        >
          año pasado
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando && <p className="text-sm text-gray-400">Cargando...</p>}

      {rep && rep.lineas === 0 && (
        <div className="p-8 text-center bg-white border border-gray-200 rounded-xl">
          <p className="text-sm text-gray-700 mb-1">
            No hay devoluciones registradas en este periodo.
          </p>
          <p className="text-xs text-gray-500">
            Para registrar una, entra a{" "}
            <Link href="/notas" className="text-indigo-600 hover:underline">
              Notas
            </Link>
            , pasa el cursor sobre la nota y dale a &quot;devolver&quot;.
          </p>
        </div>
      )}

      {rep && rep.lineas > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card
              label="Devoluciones"
              valor={String(rep.devoluciones)}
              sub={`${rep.unidades} unidades`}
              borde="border-t-gray-400"
            />
            <Card
              label="Monto devuelto"
              valor={`$${money(rep.monto_devuelto)}`}
              sub={`${rep.porcentaje}% de tus ventas`}
              borde="border-t-orange-500"
            />
            <Card
              label="Volvio al almacen"
              valor={`$${money(rep.volvio_almacen)}`}
              sub="se vuelve a vender"
              tono="text-emerald-700"
              borde="border-t-emerald-500"
            />
            <Card
              label="Perdida real"
              valor={`$${money(rep.perdida_real)}`}
              sub="dañado, no recuperado"
              tono="text-red-600"
              borde="border-t-red-500"
            />
          </div>

          {rep.devuelto_proveedor > 0 && (
            <div className="mb-5 p-3 rounded-xl bg-violet-50 border border-violet-100 text-[13px] text-violet-900">
              ${money(rep.devuelto_proveedor)} en mercancia devuelta a proveedores —
              revisa que te la hayan repuesto o acreditado.
            </div>
          )}

          {rep.por_mes.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-white border border-gray-200">
              <p className="text-xs text-gray-500 mb-3">
                Cuando te las devolvieron, y de que mes venian
              </p>
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
                        style={{
                          height: `${hViejo}px`,
                          minHeight: m.meses_anteriores > 0 ? 2 : 0,
                        }}
                      />
                      <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {m.mes} · ${money(m.total)}
                        {m.meses_anteriores > 0 &&
                          ` · $${money(m.meses_anteriores)} de meses viejos`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mt-1">
                {rep.por_mes.map((m) => (
                  <div
                    key={m.mes}
                    className="flex-1 text-center text-[9.5px] text-gray-400"
                  >
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

          <div className="flex gap-2 mb-3 print:hidden">
            {[
              { k: "productos", l: `Por producto (${rep.por_producto.length})` },
              { k: "motivos", l: `Por motivo (${rep.por_motivo.length})` },
              { k: "detalle", l: `Detalle (${rep.detalle.length})` },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k as typeof tab)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  tab === t.k
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {tab === "productos" && (
              <>
                <div className="flex gap-3 px-4 py-2 border-b border-gray-100 text-[10.5px] text-gray-400">
                  <span className="flex-1">producto</span>
                  <span className="w-12 text-right">veces</span>
                  <span className="w-14 text-right">unidades</span>
                  <span className="w-20 text-right">monto</span>
                  <span className="w-36">motivo principal</span>
                </div>
                {rep.por_producto.map((p) => (
                  <div
                    key={p.code}
                    className="flex gap-3 px-4 py-2.5 border-b border-gray-50 text-[13px]"
                  >
                    <span className="flex-1 min-w-0 truncate">
                      <span className="text-gray-400 font-mono text-[10.5px] mr-1.5">
                        {p.code}
                      </span>
                      {p.description}
                    </span>
                    <span className="w-12 text-right">{p.veces}</span>
                    <span className="w-14 text-right text-gray-500">{p.unidades}</span>
                    <span className="w-20 text-right">${money(p.monto)}</span>
                    <span className="w-36">
                      <span className="text-[10.5px] px-1.5 py-[1px] rounded-full bg-gray-100 text-gray-700">
                        {p.motivo_principal ?? "sin motivo"}
                      </span>
                    </span>
                  </div>
                ))}
              </>
            )}

            {tab === "motivos" && (
              <>
                <div className="flex gap-3 px-4 py-2 border-b border-gray-100 text-[10.5px] text-gray-400">
                  <span className="flex-1">motivo</span>
                  <span className="w-12 text-right">veces</span>
                  <span className="w-14 text-right">unidades</span>
                  <span className="w-20 text-right">monto</span>
                  <span className="w-28">peso</span>
                </div>
                {rep.por_motivo.map((m) => {
                  const pct =
                    rep.monto_devuelto > 0 ? (m.monto / rep.monto_devuelto) * 100 : 0;
                  return (
                    <div
                      key={m.reason}
                      className="flex gap-3 px-4 py-2.5 border-b border-gray-50 text-[13px] items-center"
                    >
                      <span className="flex-1 min-w-0 truncate">{m.reason}</span>
                      <span className="w-12 text-right">{m.veces}</span>
                      <span className="w-14 text-right text-gray-500">{m.unidades}</span>
                      <span className="w-20 text-right">${money(m.monto)}</span>
                      <span className="w-28 flex items-center gap-2">
                        <span className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <span
                            className="block h-full bg-orange-400"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="text-[10.5px] text-gray-400">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {tab === "detalle" && (
              <>
                <div className="flex gap-3 px-4 py-2 border-b border-gray-100 text-[10.5px] text-gray-400">
                  <span className="w-16">fecha</span>
                  <span className="w-12">nota</span>
                  <span className="w-28">cliente</span>
                  <span className="flex-1">producto</span>
                  <span className="w-10 text-right">cant</span>
                  <span className="w-16 text-right">monto</span>
                  <span className="w-28">destino</span>
                </div>
                {rep.detalle.map((d, i) => (
                  <div
                    key={`${d.return_id}-${i}`}
                    className="flex gap-3 px-4 py-2 border-b border-gray-50 text-[12.5px]"
                    title={d.observation ?? ""}
                  >
                    <span className="w-16 text-gray-500">{d.return_date.slice(5)}</span>
                    <Link
                      href={`/notas/nueva?id=${d.note_id}`}
                      className="w-12 text-indigo-600 hover:underline font-mono text-[10.5px]"
                    >
                      {d.sequence_number}
                    </Link>
                    <span className="w-28 truncate text-gray-600">{d.display_name}</span>
                    <span className="flex-1 min-w-0 truncate">
                      {d.description}
                      <span className="text-gray-400 ml-1.5">· {d.reason}</span>
                    </span>
                    <span className="w-10 text-right">{d.quantity}</span>
                    <span className="w-16 text-right">${money(d.line_total)}</span>
                    <span className="w-28">
                      <span
                        className={`text-[10px] px-1.5 py-[1px] rounded-full ${
                          DESTINOS[d.destination]?.c ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {DESTINOS[d.destination]?.l ?? d.destination}
                      </span>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Card({
  label,
  valor,
  sub,
  tono,
  borde,
}: {
  label: string;
  valor: string;
  sub?: string;
  tono?: string;
  borde?: string;
}) {
  return (
    <div
      className={`p-4 rounded-xl bg-white border border-gray-200 border-t-2 ${
        borde ?? "border-t-gray-400"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${tono ?? "text-gray-900"}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}
