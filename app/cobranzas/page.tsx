"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Deudor = {
  display_name: string;
  client_id: string | null;
  notas: number;
  total: number;
  abonado: number;
  pendiente: number;
  dias_mas_viejo: number;
};

type Cobro = {
  id: string;
  payment_date: string;
  display_name: string;
  sequence_number: number;
  amount_usd: number;
  currency_mode: string;
  amount_currency: number;
  exchange_rate: number | null;
  method: string | null;
  reference: string | null;
};

type Reporte = {
  from: string;
  to: string;
  cobrado_rango: number;
  cobros_count: number;
  por_cobrar: number;
  vencido: number;
  clientes_deben: number;
  deudores: Deudor[];
  cobros: Cobro[];
  cobros_por_dia: { dia: string; monto: number }[];
};

type NotaCuenta = {
  id: string;
  sequence_number: number;
  note_date: string;
  due_date: string;
  currency_mode: string;
  total: number;
  abonado: number;
  pendiente: number;
  dias_vencido: number;
};

type Cuenta = {
  client_id: string;
  display_name: string;
  credit_days: number;
  total: number;
  abonado: number;
  pendiente: number;
  notas: NotaCuenta[];
};

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencyShort(mode: string) {
  return mode === "COP" ? "COP" : mode === "USD" ? "USD" : "Bs";
}

function isoHace(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export default function CobranzasPage() {
  const [from, setFrom] = useState(isoHace(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rep, setRep] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"deben" | "cobros">("deben");
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("collections_report", {
      p_from: from,
      p_to: to,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRep(data as Reporte);
  }, [from, to]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verCuenta(clientId: string | null) {
    if (!clientId) return;
    const { data, error } = await supabase.rpc("client_statement", {
      p_client_id: clientId,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setCuenta(data as Cuenta);
  }

  function preset(dias: number) {
    setFrom(isoHace(dias));
    setTo(new Date().toISOString().slice(0, 10));
  }

  const maxDia = useMemo(() => {
    if (!rep || rep.cobros_por_dia.length === 0) return 0;
    return Math.max(...rep.cobros_por_dia.map((d) => d.monto));
  }, [rep]);

  return (
    <main className="p-8 max-w-5xl print:p-0">
      <div className="flex items-end justify-between mb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cobranzas</h1>
          <p className="text-sm text-gray-500">Quien debe y a quien le cobraste</p>
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
        <div className="flex gap-1.5">
          {[
            { d: 7, l: "7 dias" },
            { d: 30, l: "30 dias" },
            { d: 90, l: "3 meses" },
            { d: 365, l: "1 año" },
          ].map((p) => (
            <button
              key={p.d}
              onClick={() => preset(p.d)}
              className="px-2.5 h-9 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {rep && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="p-4 rounded-xl bg-white border border-gray-200 border-t-2 border-t-emerald-500">
              <p className="text-xs text-gray-500">Cobrado en el rango</p>
              <p className="text-2xl font-semibold text-emerald-700">
                ${money(rep.cobrado_rango)}
              </p>
              <p className="text-[11px] text-gray-400">{rep.cobros_count} abonos</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-gray-200 border-t-2 border-t-gray-400">
              <p className="text-xs text-gray-500">Por cobrar</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${money(rep.por_cobrar)}
              </p>
              <p className="text-[11px] text-gray-400">de todas las notas</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-gray-200 border-t-2 border-t-red-500">
              <p className="text-xs text-gray-500">Vencido</p>
              <p className="text-2xl font-semibold text-red-600">${money(rep.vencido)}</p>
              <p className="text-[11px] text-gray-400">ya paso la fecha</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-gray-200 border-t-2 border-t-amber-500">
              <p className="text-xs text-gray-500">Clientes que deben</p>
              <p className="text-2xl font-semibold text-gray-900">{rep.clientes_deben}</p>
              <p className="text-[11px] text-gray-400">con saldo abierto</p>
            </div>
          </div>

          {rep.cobros_por_dia.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-white border border-gray-200">
              <p className="text-xs text-gray-500 mb-3">Cobros por dia</p>
              <div className="flex items-end gap-1 h-24">
                {rep.cobros_por_dia.map((d) => (
                  <div key={d.dia} className="flex-1 group relative">
                    <div
                      className="bg-emerald-300 hover:bg-emerald-500 rounded-t transition-colors"
                      style={{
                        height: `${maxDia > 0 ? (d.monto / maxDia) * 90 : 0}px`,
                        minHeight: "2px",
                      }}
                    />
                    <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {d.dia} · ${money(d.monto)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-3 print:hidden">
            <button
              onClick={() => setTab("deben")}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tab === "deben"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Quien me debe ({rep.deudores.length})
            </button>
            <button
              onClick={() => setTab("cobros")}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tab === "cobros"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              A quien le cobre ({rep.cobros.length})
            </button>
          </div>

          {tab === "deben" && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex gap-3 px-4 py-2 border-b border-gray-100 text-[11px] text-gray-400">
                <span className="flex-1">cliente</span>
                <span className="w-12 text-right">notas</span>
                <span className="w-20 text-right">total</span>
                <span className="w-20 text-right">abonado</span>
                <span className="w-20 text-right">debe</span>
                <span className="w-16 text-right">mas viejo</span>
              </div>
              {rep.deudores.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400">
                  Nadie tiene saldo pendiente. Bien ahi.
                </p>
              )}
              {rep.deudores.map((d) => (
                <button
                  key={d.display_name}
                  onClick={() => verCuenta(d.client_id)}
                  className="w-full flex gap-3 px-4 py-2.5 border-b border-gray-50 text-[13px] text-left hover:bg-gray-50"
                >
                  <span className="flex-1 truncate text-gray-800">{d.display_name}</span>
                  <span className="w-12 text-right text-gray-500">{d.notas}</span>
                  <span className="w-20 text-right">${money(d.total)}</span>
                  <span className="w-20 text-right text-gray-500">${money(d.abonado)}</span>
                  <span
                    className={`w-20 text-right font-medium ${
                      d.dias_mas_viejo > 30
                        ? "text-red-600"
                        : d.dias_mas_viejo > 0
                        ? "text-amber-700"
                        : "text-gray-900"
                    }`}
                  >
                    ${money(d.pendiente)}
                  </span>
                  <span
                    className={`w-16 text-right ${
                      d.dias_mas_viejo > 30 ? "text-red-600" : "text-gray-500"
                    }`}
                  >
                    {d.dias_mas_viejo > 0 ? `${d.dias_mas_viejo} d` : "al dia"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === "cobros" && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex gap-3 px-4 py-2 border-b border-gray-100 text-[11px] text-gray-400">
                <span className="w-20">fecha</span>
                <span className="w-12">nota</span>
                <span className="flex-1">cliente</span>
                <span className="w-28">recibido</span>
                <span className="w-24">metodo</span>
                <span className="w-20 text-right">en dolares</span>
              </div>
              {rep.cobros.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400">
                  No hay abonos registrados en este rango.
                </p>
              )}
              {rep.cobros.map((c) => (
                <div
                  key={c.id}
                  className="flex gap-3 px-4 py-2.5 border-b border-gray-50 text-[13px]"
                >
                  <span className="w-20 text-gray-500">{c.payment_date}</span>
                  <span className="w-12 text-gray-400 font-mono text-[11px]">
                    {c.sequence_number}
                  </span>
                  <span className="flex-1 truncate text-gray-800">{c.display_name}</span>
                  <span className="w-28 text-gray-600">
                    {currencyShort(c.currency_mode)} {money(c.amount_currency)}
                  </span>
                  <span className="w-24 truncate text-gray-500 text-xs">
                    {c.method ?? "—"}
                  </span>
                  <span className="w-20 text-right text-emerald-700 font-medium">
                    ${money(c.amount_usd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {cuenta && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setCuenta(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-900">
                Estado de cuenta · {cuenta.display_name}
              </h2>
              <button
                onClick={() => setCuenta(null)}
                className="text-sm text-gray-400 hover:text-gray-900"
              >
                cerrar
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {cuenta.credit_days > 0
                ? `${cuenta.credit_days} dias de credito`
                : "sin dias de credito configurados"}
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-500">Total facturado</p>
                <p className="text-lg font-semibold">${money(cuenta.total)}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-500">Abonado</p>
                <p className="text-lg font-semibold text-emerald-700">
                  ${money(cuenta.abonado)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-[11px] text-gray-500">Debe</p>
                <p className="text-lg font-semibold text-red-600">
                  ${money(cuenta.pendiente)}
                </p>
              </div>
            </div>

            <div className="flex gap-3 px-1 py-2 border-b border-gray-100 text-[11px] text-gray-400">
              <span className="w-12">nota</span>
              <span className="w-20">fecha</span>
              <span className="w-20">vence</span>
              <span className="flex-1 text-right">total</span>
              <span className="w-20 text-right">abonado</span>
              <span className="w-20 text-right">debe</span>
            </div>
            {cuenta.notas.map((n) => (
              <div key={n.id} className="flex gap-3 px-1 py-2 border-b border-gray-50 text-[13px]">
                <span className="w-12 text-gray-400 font-mono text-[11px]">
                  {n.sequence_number}
                </span>
                <span className="w-20 text-gray-500">{n.note_date}</span>
                <span
                  className={`w-20 ${
                    n.dias_vencido > 0 ? "text-red-600" : "text-gray-500"
                  }`}
                >
                  {n.due_date}
                </span>
                <span className="flex-1 text-right">${money(n.total)}</span>
                <span className="w-20 text-right text-gray-500">${money(n.abonado)}</span>
                <span
                  className={`w-20 text-right ${
                    n.pendiente > 0.005 ? "text-red-600 font-medium" : "text-gray-300"
                  }`}
                >
                  ${money(n.pendiente)}
                </span>
              </div>
            ))}

            <button
              onClick={() => window.print()}
              className="mt-4 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              Imprimir o guardar en PDF
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
