"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Printer,
  RefreshCw,
  ScrollText,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EmptyState, Pill, SkeletonRows, ToolbarButton, ToolbarSeparator, notify, type PillTone } from "@/components/ui";
import { Barra, Campo, Encabezado, Segmento, Tarjeta, Ventana, descargarExcel } from "@/components/Ventana";

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

const MONEDA: Record<string, { l: string; tone: PillTone }> = {
  USD: { l: "Dolares", tone: "success" },
  COP: { l: "Pesos", tone: "violet" },
  BS_BINANCE: { l: "Bs Binance", tone: "warning" },
  BS_BCV: { l: "Bs BCV", tone: "sky" },
};

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencyShort(mode: string) {
  return mode === "COP" ? "COP" : mode === "USD" ? "$" : "Bs";
}

function isoHace(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function fechaCorta(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" });
}

const PRESETS = [
  { d: 7, l: "7 dias" },
  { d: 30, l: "30 dias" },
  { d: 90, l: "3 meses" },
  { d: 365, l: "1 año" },
];

export default function CobranzasPage() {
  const router = useRouter();
  const [from, setFrom] = useState(isoHace(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rep, setRep] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"deben" | "cobros">("deben");
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [soloVencidos, setSoloVencidos] = useState(false);

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
    if (!clientId) {
      notify.info("Cliente eventual", "Las notas sin cliente registrado no tienen estado de cuenta.");
      return;
    }
    const { data, error } = await supabase.rpc("client_statement", {
      p_client_id: clientId,
    });
    if (error) {
      notify.error("No se pudo abrir el estado de cuenta", error.message);
      return;
    }
    setCuenta(data as Cuenta);
  }

  function preset(dias: number) {
    setFrom(isoHace(dias));
    setTo(new Date().toISOString().slice(0, 10));
  }

  const presetActivo = PRESETS.find(
    (p) => from === isoHace(p.d) && to === new Date().toISOString().slice(0, 10)
  )?.d;

  const maxDia = useMemo(() => {
    if (!rep || rep.cobros_por_dia.length === 0) return 0;
    return Math.max(...rep.cobros_por_dia.map((d) => d.monto));
  }, [rep]);

  const deudores = useMemo(
    () => (rep?.deudores ?? []).filter((d) => !soloVencidos || d.dias_mas_viejo > 0),
    [rep, soloVencidos]
  );

  function exportar() {
    if (!rep) return;
    if (tab === "deben") {
      descargarExcel(
        "quien-me-debe",
        ["Cliente", "Notas", "Total", "Abonado", "Debe", "Dias vencido"],
        deudores.map((d) => [d.display_name, d.notas, money(d.total), money(d.abonado), money(d.pendiente), d.dias_mas_viejo])
      );
    } else {
      descargarExcel(
        "cobros",
        ["Fecha", "Nota", "Cliente", "Moneda", "Monto recibido", "Tasa", "Metodo", "Referencia", "En dolares"],
        rep.cobros.map((c) => [
          c.payment_date,
          c.sequence_number,
          c.display_name,
          MONEDA[c.currency_mode]?.l ?? c.currency_mode,
          money(c.amount_currency),
          c.exchange_rate ?? "",
          c.method ?? "",
          c.reference ?? "",
          money(c.amount_usd),
        ])
      );
    }
    notify.ok("Archivo descargado");
  }

  return (
    <main className="p-6 max-w-[1180px] print:p-0">
      <Encabezado titulo="Cobranzas">Quien te debe y a quien le cobraste</Encabezado>

      <Barra>
        <ToolbarButton
          icon={Users}
          label="quien me debe"
          active={tab === "deben"}
          onClick={() => setTab("deben")}
        />
        <ToolbarButton
          icon={HandCoins}
          label="lo cobrado"
          active={tab === "cobros"}
          onClick={() => setTab("cobros")}
        />
        <ToolbarButton
          icon={AlarmClock}
          label={soloVencidos ? "ver todos" : "solo vencidos"}
          tone="danger"
          active={soloVencidos}
          onClick={() => {
            setTab("deben");
            setSoloVencidos((v) => !v);
          }}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={ScrollText} label="ir a notas" onClick={() => router.push("/notas")} />
        <ToolbarButton icon={RefreshCw} label="actualizar" onClick={cargar} />
        <ToolbarSeparator />
        <ToolbarButton icon={FileSpreadsheet} label="excel" onClick={exportar} />
        <ToolbarButton icon={Printer} label="imprimir" onClick={() => window.print()} />
      </Barra>

      <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
        <Campo label="Cobros desde">
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
            valor={String(presetActivo ?? "")}
            onChange={(k) => preset(Number(k))}
            opciones={PRESETS.map((p) => ({ k: String(p.d), l: p.l }))}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading && !rep && <SkeletonRows rows={6} />}

      {rep && (
        <div className={cuenta ? "print:hidden" : ""}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Tarjeta
              label="Cobrado en el rango"
              valor={`$${money(rep.cobrado_rango)}`}
              sub={`${rep.cobros_count} abonos`}
              tono="text-emerald-700"
              icono={Wallet}
              acento="bg-emerald-50 text-emerald-700"
            />
            <Tarjeta
              label="Por cobrar"
              valor={`$${money(rep.por_cobrar)}`}
              sub="de todas las notas"
              icono={CircleDollarSign}
              acento="bg-amber-50 text-amber-700"
            />
            <Tarjeta
              label="Vencido"
              valor={`$${money(rep.vencido)}`}
              sub="ya paso la fecha"
              tono="text-red-600"
              icono={AlarmClock}
              acento="bg-red-50 text-red-600"
            />
            <Tarjeta
              label="Clientes que deben"
              valor={String(rep.clientes_deben)}
              sub="con saldo abierto"
              icono={Users}
              acento="bg-brand-50 text-brand-700"
            />
          </div>

          {rep.cobros_por_dia.length > 0 && (
            <div className="mb-4 p-4 rounded-xl bg-white border border-gray-200 shadow-card">
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
                      {fechaCorta(d.dia)} · ${money(d.monto)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "deben" && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
              <div className="px-4 pt-3 pb-2 text-[13px] font-medium text-gray-800">
                Quien me debe{" "}
                <span className="text-gray-400 font-normal">
                  ({deudores.length}
                  {soloVencidos && " con algo vencido"})
                </span>
              </div>
              <div className="flex gap-3 px-4 py-1.5 border-y border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
                <span className="flex-1">cliente</span>
                <span className="w-12 text-right">notas</span>
                <span className="w-24 text-right">total</span>
                <span className="w-24 text-right">abonado</span>
                <span className="w-24 text-right">debe</span>
                <span className="w-24 text-right">mas viejo</span>
              </div>
              {deudores.length === 0 && (
                <EmptyState icon={HandCoins} title={soloVencidos ? "Nada vencido" : "Nadie te debe"}>
                  {soloVencidos ? "Todos los saldos estan dentro de su plazo." : "No hay saldos pendientes."}
                </EmptyState>
              )}
              {deudores.map((d, i) => (
                <button
                  key={d.display_name + i}
                  onClick={() => verCuenta(d.client_id)}
                  className={`w-full flex gap-3 items-center px-4 h-10 border-b border-gray-50 text-[13px] text-left hover:bg-brand-50/50 ${
                    i % 2 ? "bg-gray-50/40" : ""
                  }`}
                >
                  <span className="flex-1 truncate text-gray-800">{d.display_name}</span>
                  <span className="w-12 text-right text-gray-500">{d.notas}</span>
                  <span className="w-24 text-right">${money(d.total)}</span>
                  <span className="w-24 text-right text-gray-500">${money(d.abonado)}</span>
                  <span
                    className={`w-24 text-right font-medium ${
                      d.dias_mas_viejo > 30 ? "text-red-600" : d.dias_mas_viejo > 0 ? "text-amber-700" : "text-gray-900"
                    }`}
                  >
                    ${money(d.pendiente)}
                  </span>
                  <span className="w-24 text-right">
                    {d.dias_mas_viejo > 0 ? (
                      <Pill tone={d.dias_mas_viejo > 30 ? "danger" : "warning"}>{d.dias_mas_viejo} dias</Pill>
                    ) : (
                      <Pill tone="success">al dia</Pill>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === "cobros" && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
              <div className="px-4 pt-3 pb-2 text-[13px] font-medium text-gray-800">
                Lo que cobraste <span className="text-gray-400 font-normal">({rep.cobros.length})</span>
              </div>
              <div className="flex gap-3 px-4 py-1.5 border-y border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
                <span className="w-20">fecha</span>
                <span className="w-12">nota</span>
                <span className="flex-1">cliente</span>
                <span className="w-[86px]">moneda</span>
                <span className="w-28 text-right">recibido</span>
                <span className="w-28">metodo</span>
                <span className="w-24 text-right">en dolares</span>
              </div>
              {rep.cobros.length === 0 && (
                <EmptyState icon={Wallet} title="Sin abonos en este rango">
                  Cambia las fechas de arriba para ver otro periodo.
                </EmptyState>
              )}
              {rep.cobros.map((c, i) => {
                const m = MONEDA[c.currency_mode] ?? { l: c.currency_mode, tone: "neutral" as PillTone };
                return (
                  <div
                    key={c.id}
                    title={c.reference ? `Referencia ${c.reference}` : undefined}
                    className={`flex gap-3 items-center px-4 h-10 border-b border-gray-50 text-[13px] ${
                      i % 2 ? "bg-gray-50/40" : ""
                    }`}
                  >
                    <span className="w-20 text-gray-500">{fechaCorta(c.payment_date)}</span>
                    <span className="w-12 text-gray-400 font-mono text-[11px]">{c.sequence_number}</span>
                    <span className="flex-1 truncate text-gray-800">{c.display_name}</span>
                    <span className="w-[86px]">
                      <Pill tone={m.tone}>{m.l}</Pill>
                    </span>
                    <span className="w-28 text-right text-gray-600">
                      {currencyShort(c.currency_mode)} {money(c.amount_currency)}
                    </span>
                    <span className="w-28 truncate text-gray-500 text-xs">{c.method ?? "—"}</span>
                    <span className="w-24 text-right text-emerald-700 font-medium">${money(c.amount_usd)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {cuenta && (
        <Ventana
          titulo={`Estado de cuenta · ${cuenta.display_name}`}
          subtitulo={
            cuenta.credit_days > 0 ? `${cuenta.credit_days} dias de credito` : "sin dias de credito configurados"
          }
          icono={FileText}
          ancho="max-w-2xl"
          onClose={() => setCuenta(null)}
          pie={
            <>
              <button
                onClick={() => setCuenta(null)}
                className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
              >
                Cerrar
              </button>
              <button
                onClick={() => window.print()}
                className="h-9 px-4 inline-flex items-center gap-1.5 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm"
              >
                <Printer size={15} /> Imprimir o guardar PDF
              </button>
            </>
          }
        >
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-[11px] text-gray-500">Total facturado</p>
              <p className="text-lg font-semibold">${money(cuenta.total)}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-[11px] text-gray-500">Abonado</p>
              <p className="text-lg font-semibold text-emerald-700">${money(cuenta.abonado)}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-[11px] text-gray-500">Debe</p>
              <p className="text-lg font-semibold text-red-600">${money(cuenta.pendiente)}</p>
            </div>
          </div>

          <div className="flex gap-3 px-1 py-1.5 border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
            <span className="w-12">nota</span>
            <span className="w-20">fecha</span>
            <span className="w-20">vence</span>
            <span className="flex-1 text-right">total</span>
            <span className="w-20 text-right">abonado</span>
            <span className="w-20 text-right">debe</span>
          </div>
          {cuenta.notas.map((n) => (
            <button
              key={n.id}
              onClick={() => router.push(`/notas/nueva?id=${n.id}`)}
              title="Abrir la nota"
              className="w-full flex gap-3 px-1 py-2 border-b border-gray-50 text-[13px] text-left hover:bg-gray-50"
            >
              <span className="w-12 text-brand-700 font-mono text-[11px]">{n.sequence_number}</span>
              <span className="w-20 text-gray-500">{fechaCorta(n.note_date)}</span>
              <span className={`w-20 ${n.dias_vencido > 0 ? "text-red-600" : "text-gray-500"}`}>
                {fechaCorta(n.due_date)}
              </span>
              <span className="flex-1 text-right">${money(n.total)}</span>
              <span className="w-20 text-right text-gray-500">${money(n.abonado)}</span>
              <span
                className={`w-20 text-right ${n.pendiente > 0.005 ? "text-red-600 font-medium" : "text-gray-300"}`}
              >
                ${money(n.pendiente)}
              </span>
            </button>
          ))}
        </Ventana>
      )}
    </main>
  );
}
