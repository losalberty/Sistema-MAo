"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  FileText,
  MapPin,
  Maximize2,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  EmptyState,
  NumInput,
  Pill,
  SkeletonRows,
  ToolbarButton,
  ToolbarSeparator,
  confirmar,
  notify,
} from "@/components/ui";
import {
  Barra,
  Campo,
  Encabezado,
  IconBtn,
  Segmento,
  Ventana,
  descargarExcel,
  inputCls,
} from "@/components/Ventana";

type ClientRow = {
  id: string;
  client_number: number;
  name: string;
  tax_id: string | null;
  fiscal_address: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  salesperson: string | null;
  price_tier: number | null;
  balance_due: number | null;
  created_at: string;
  credit_days: number | null;
  notes_count: number | null;
  last_note_date: string | null;
  overdue: number | null;
};

type NotaCuenta = {
  id: string;
  sequence_number: number;
  note_date: string;
  due_date: string;
  currency_mode: string;
  total: number;
  devuelto?: number;
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

const emptyForm = {
  name: "",
  tax_id: "",
  fiscal_address: "",
  phone: "",
  city: "",
  state: "",
  salesperson: "",
  price_tier: 1,
  credit_days: 0,
};

const TARIFAS: Record<number, string> = {
  1: "Contado",
  2: "Credito",
  3: "Tarifa 3",
  4: "Tarifa 4",
};

const POR_PAGINA = 200;

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fechaCorta(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" });
}

// telefono venezolano -> formato internacional para WhatsApp
function telWhatsapp(tel: string | null) {
  if (!tel) return null;
  let t = tel.replace(/\D/g, "");
  if (!t) return null;
  if (t.startsWith("0")) t = "58" + t.slice(1);
  else if (t.length === 10) t = "58" + t;
  return t;
}

export default function ClientesPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "saldo" | "vencidos">("todos");
  const [marcado, setMarcado] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(POR_PAGINA);

  const [fichaId, setFichaId] = useState<string | null>(null);
  const [form, setForm] = useState<{ cliente: ClientRow | null } | null>(null);

  const load = useCallback(async (text: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_clients", { search_text: text });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setClients((data ?? []) as ClientRow[]);
  }, []);

  // espera a que termines de escribir antes de buscar
  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  useEffect(() => {
    setVisibles(POR_PAGINA);
  }, [search, filtro]);

  const lista = useMemo(() => {
    if (filtro === "saldo") return clients.filter((c) => Number(c.balance_due) > 0.005);
    if (filtro === "vencidos") return clients.filter((c) => Number(c.overdue) > 0.005);
    return clients;
  }, [clients, filtro]);

  const totales = useMemo(() => {
    let saldo = 0;
    let vencido = 0;
    let conSaldo = 0;
    let conVencido = 0;
    for (const c of clients) {
      const b = Number(c.balance_due) || 0;
      const v = Number(c.overdue) || 0;
      saldo += b;
      vencido += v;
      if (b > 0.005) conSaldo++;
      if (v > 0.005) conVencido++;
    }
    return { saldo, vencido, conSaldo, conVencido };
  }, [clients]);

  const actual = clients.find((c) => c.id === marcado) ?? null;

  function elegido(accion: string): ClientRow | null {
    if (actual) return actual;
    notify.info("Marca un cliente primero", `Para ${accion}, toca la fila del cliente en la lista.`);
    return null;
  }

  async function remove(c: ClientRow) {
    if (Number(c.notes_count) > 0) {
      await confirmar({
        titulo: `${c.name} tiene ${c.notes_count} nota(s)`,
        mensaje:
          "No se puede eliminar un cliente con notas, porque se perderia su historial de ventas y cobros. Si ya no le vendes, simplemente dejalo en la lista.",
        textoSi: "Entendido",
        textoNo: "Cerrar",
      });
      return;
    }
    const ok = await confirmar({
      titulo: `¿Eliminar a ${c.name}?`,
      mensaje: "No tiene notas. Esta accion no se puede deshacer.",
      detalle: [c.tax_id, c.city].filter(Boolean).join(" · ") || undefined,
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_client_safe", { p_id: c.id });
    if (error) return notify.error("No se pudo eliminar", error.message);
    setClients((prev) => prev.filter((x) => x.id !== c.id));
    setFichaId(null);
    setMarcado(null);
    notify.ok(`${c.name} eliminado`);
  }

  function exportar() {
    descargarExcel(
      "clientes",
      ["N", "Nombre", "RIF/Cedula", "Direccion", "Telefono", "Ciudad", "Estado", "Vendedor", "Tarifa", "Dias credito", "Notas", "Ultima compra", "Saldo", "Vencido"],
      lista.map((c) => [
        c.client_number,
        c.name,
        c.tax_id ?? "",
        c.fiscal_address ?? "",
        c.phone ?? "",
        c.city ?? "",
        c.state ?? "",
        c.salesperson ?? "",
        TARIFAS[c.price_tier ?? 1] ?? "",
        c.credit_days ?? 0,
        c.notes_count ?? 0,
        c.last_note_date ?? "",
        Number(c.balance_due ?? 0).toFixed(2),
        Number(c.overdue ?? 0).toFixed(2),
      ])
    );
    notify.ok("Archivo descargado", `${lista.length} clientes`);
  }

  function whatsappListado() {
    const text = lista
      .map(
        (c) =>
          `#${c.client_number} ${c.name}${c.phone ? ` - ${c.phone}` : ""}${
            c.city ? ` (${c.city})` : ""
          }`
      )
      .join("\n");
    const message = `Listado de clientes (${lista.length}):\n\n${text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  function whatsappCliente(c: ClientRow) {
    const t = telWhatsapp(c.phone);
    if (!t) return notify.info("Este cliente no tiene telefono guardado");
    window.open(`https://wa.me/${t}`, "_blank");
  }

  return (
    <main className="p-6 max-w-[1180px]">
      <Encabezado titulo="Clientes">
        {clients.length} clientes
        {totales.saldo > 0.005 && (
          <>
            {" · "}
            <span className="text-amber-700">{money(totales.saldo)} por cobrar</span>
          </>
        )}
        {totales.vencido > 0.005 && (
          <>
            {" · "}
            <span className="text-red-600">{money(totales.vencido)} vencido</span>
          </>
        )}
      </Encabezado>

      <Barra>
        <ToolbarButton icon={UserPlus} label="nuevo cliente" tone="brand" onClick={() => setForm({ cliente: null })} />
        <ToolbarSeparator />
        <ToolbarButton
          icon={Maximize2}
          label="ver ficha"
          onClick={() => {
            const c = elegido("ver su ficha");
            if (c) setFichaId(c.id);
          }}
        />
        <ToolbarButton
          icon={Pencil}
          label="editar"
          onClick={() => {
            const c = elegido("editarlo");
            if (c) setForm({ cliente: c });
          }}
        />
        <ToolbarButton
          icon={MessageCircle}
          label="escribirle"
          tone="success"
          onClick={() => {
            const c = elegido("escribirle por WhatsApp");
            if (c) whatsappCliente(c);
          }}
        />
        <ToolbarButton
          icon={Trash2}
          label="eliminar"
          tone="danger"
          onClick={() => {
            const c = elegido("eliminarlo");
            if (c) remove(c);
          }}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={FileSpreadsheet} label="excel" onClick={exportar} />
        <ToolbarButton icon={Printer} label="imprimir" onClick={() => window.print()} />
        <ToolbarButton icon={MessageCircle} label="enviar listado" onClick={whatsappListado} />
      </Barra>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <div
        className={`bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden print:border-0 print:shadow-none ${
          fichaId ? "print:hidden" : ""
        }`}
      >
        <div className="flex items-center gap-2 p-2.5 border-b border-gray-100 print:hidden">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, RIF, telefono, ciudad o estado"
              className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[13px]"
            />
          </div>
          <Segmento
            valor={filtro}
            onChange={setFiltro}
            opciones={[
              { k: "todos", l: `Todos (${clients.length})` },
              { k: "saldo", l: `Con saldo (${totales.conSaldo})` },
              { k: "vencidos", l: `Vencidos (${totales.conVencido})` },
            ]}
          />
        </div>

        <div className="flex gap-3 px-3 py-1.5 border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
          <span className="w-10">n</span>
          <span className="flex-1 min-w-0">cliente</span>
          <span className="w-28">ciudad</span>
          <span className="w-28">telefono</span>
          <span className="w-[72px]">tarifa</span>
          <span className="w-14 text-right">notas</span>
          <span className="w-20">ult. compra</span>
          <span className="w-24 text-right">saldo</span>
          <span className="w-[88px] print:hidden" />
        </div>

        {loading && clients.length === 0 && <SkeletonRows rows={8} />}

        {!loading && lista.length === 0 && (
          <EmptyState icon={Users} title={clients.length === 0 && !search ? "Aun no hay clientes" : "Ningun cliente coincide"}>
            {clients.length === 0 && !search
              ? "Registra el primero con el boton nuevo cliente."
              : "Prueba con otra palabra o cambia el filtro."}
          </EmptyState>
        )}

        {lista.slice(0, visibles).map((c, idx) => {
          const saldo = Number(c.balance_due) || 0;
          const venc = Number(c.overdue) || 0;
          const on = marcado === c.id;
          return (
            <div
              key={c.id}
              onClick={() => setMarcado(on ? null : c.id)}
              onDoubleClick={() => setFichaId(c.id)}
              className={`group flex gap-3 items-center px-3 h-10 border-b border-gray-100 text-[12.5px] cursor-default ${
                on ? "bg-brand-50/70" : idx % 2 ? "bg-gray-50/40 hover:bg-gray-50" : "hover:bg-gray-50"
              }`}
            >
              <span className="w-10 text-[11px] text-gray-400 font-mono">{c.client_number}</span>
              <span className="flex-1 min-w-0 truncate">
                <span className="text-gray-900">{c.name}</span>
                {c.tax_id && <span className="text-gray-400 text-[11px] ml-2">{c.tax_id}</span>}
              </span>
              <span className="w-28 truncate text-gray-600">{c.city || "—"}</span>
              <span className="w-28 truncate text-gray-600">{c.phone || "—"}</span>
              <span className="w-[72px]">
                <Pill tone={(c.price_tier ?? 1) === 1 ? "neutral" : "brand"}>{TARIFAS[c.price_tier ?? 1]}</Pill>
              </span>
              <span className="w-14 text-right text-gray-500">{c.notes_count ?? 0}</span>
              <span className="w-20 text-gray-500">{fechaCorta(c.last_note_date)}</span>
              <span
                className={`w-24 text-right ${
                  venc > 0.005 ? "text-red-600 font-medium" : saldo > 0.005 ? "text-amber-700" : "text-gray-300"
                }`}
                title={venc > 0.005 ? `${money(venc)} vencido` : undefined}
              >
                {saldo > 0.005 ? money(saldo) : "—"}
              </span>
              <span className="w-[88px] flex justify-end gap-0.5 opacity-50 group-hover:opacity-100 print:hidden">
                {c.phone && (
                  <IconBtn title="WhatsApp" tone="success" onClick={() => whatsappCliente(c)}>
                    <MessageCircle size={14} />
                  </IconBtn>
                )}
                <IconBtn title="Editar" onClick={() => setForm({ cliente: c })}>
                  <Pencil size={14} />
                </IconBtn>
                <IconBtn title="Abrir ficha" onClick={() => setFichaId(c.id)}>
                  <Maximize2 size={14} />
                </IconBtn>
              </span>
            </div>
          );
        })}

        {lista.length > visibles && (
          <div className="flex justify-center py-2.5 border-b border-gray-100 print:hidden">
            <button
              onClick={() => setVisibles((v) => v + POR_PAGINA)}
              className="h-8 px-4 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700 shadow-sm"
            >
              Mostrar {Math.min(POR_PAGINA, lista.length - visibles)} más
              <span className="text-gray-400"> · faltan {lista.length - visibles}</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 text-[11.5px] print:hidden">
          <span className="text-gray-400">toca una fila para marcarla · doble clic abre la ficha</span>
          <span className="ml-auto text-gray-500">
            por cobrar <b className="font-medium text-amber-700">{money(totales.saldo)}</b>
          </span>
        </div>
      </div>

      {fichaId && (
        <FichaCliente
          cliente={clients.find((c) => c.id === fichaId) ?? null}
          onClose={() => setFichaId(null)}
          onEditar={(c) => {
            setFichaId(null);
            setForm({ cliente: c });
          }}
          onEliminar={remove}
          onWhatsapp={whatsappCliente}
          onVerNota={(id) => router.push(`/notas/nueva?id=${id}`)}
        />
      )}

      {form && (
        <FormCliente
          cliente={form.cliente}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            setMarcado(id);
            load(search.trim());
          }}
        />
      )}
    </main>
  );
}

/* ============================================================
   Ficha del cliente con su estado de cuenta
   ============================================================ */

function FichaCliente({
  cliente: c,
  onClose,
  onEditar,
  onEliminar,
  onWhatsapp,
  onVerNota,
}: {
  cliente: ClientRow | null;
  onClose: () => void;
  onEditar: (c: ClientRow) => void;
  onEliminar: (c: ClientRow) => void;
  onWhatsapp: (c: ClientRow) => void;
  onVerNota: (id: string) => void;
}) {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [soloPend, setSoloPend] = useState(true);

  useEffect(() => {
    if (!c) return;
    supabase.rpc("client_statement", { p_client_id: c.id }).then(({ data, error }) => {
      if (error) return notify.error("No se pudo cargar el estado de cuenta", error.message);
      setCuenta(data as Cuenta);
    });
  }, [c]);

  if (!c) return null;

  const notas = (cuenta?.notas ?? []).filter((n) => !soloPend || n.pendiente > 0.005);

  return (
    <Ventana
      titulo={c.name}
      subtitulo={
        <span className="inline-flex items-center gap-2">
          Cliente #{c.client_number}
          <Pill tone={(c.price_tier ?? 1) === 1 ? "neutral" : "brand"}>{TARIFAS[c.price_tier ?? 1]}</Pill>
          {Number(c.credit_days) > 0 ? `${c.credit_days} dias de credito` : "de contado"}
        </span>
      }
      icono={Users}
      ancho="max-w-3xl"
      onClose={onClose}
      pie={
        <>
          <button
            onClick={() => onEliminar(c)}
            className="h-9 px-3 mr-auto inline-flex items-center gap-1.5 text-sm text-red-600 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={15} /> Eliminar
          </button>
          <button
            onClick={() => window.print()}
            className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-gray-700 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            <Printer size={15} /> Imprimir estado de cuenta
          </button>
          {c.phone && (
            <button
              onClick={() => onWhatsapp(c)}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-emerald-700 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50"
            >
              <MessageCircle size={15} /> WhatsApp
            </button>
          )}
          <button
            onClick={() => onEditar(c)}
            className="h-9 px-4 inline-flex items-center gap-1.5 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm"
          >
            <Pencil size={15} /> Editar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] mb-4">
        {(
          [
            ["RIF / Cedula", c.tax_id],
            ["Telefono", c.phone],
            ["Direccion fiscal", c.fiscal_address],
            ["Ciudad / Estado", [c.city, c.state].filter(Boolean).join(", ")],
            ["Vendedor", c.salesperson],
            ["Cliente desde", fechaCorta(c.created_at)],
          ] as [string, string | null][]
        ).map(([k, v]) => (
          <div key={k} className="flex gap-2 border-b border-gray-50 py-1">
            <span className="w-32 shrink-0 text-gray-400">{k}</span>
            <span className="text-gray-800 min-w-0 truncate">{v || "—"}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { k: "Facturado", v: money(cuenta?.total ?? 0), t: "text-gray-900" },
          { k: "Abonado", v: money(cuenta?.abonado ?? 0), t: "text-emerald-700" },
          { k: "Debe", v: money(cuenta?.pendiente ?? 0), t: (cuenta?.pendiente ?? 0) > 0.005 ? "text-amber-700" : "text-gray-400" },
          { k: "Vencido", v: money(Number(c.overdue) || 0), t: Number(c.overdue) > 0.005 ? "text-red-600" : "text-gray-400" },
        ].map((x) => (
          <div key={x.k} className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">{x.k}</p>
            <p className={`text-[15px] font-semibold ${x.t}`}>{x.v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] font-medium text-gray-700 flex items-center gap-1.5">
          <FileText size={14} className="text-gray-400" /> Estado de cuenta
        </p>
        <Segmento
          valor={soloPend ? "p" : "t"}
          onChange={(k) => setSoloPend(k === "p")}
          opciones={[
            { k: "p", l: "Lo que debe" },
            { k: "t", l: "Todas las notas" },
          ]}
        />
      </div>

      <div className="flex gap-3 px-1 py-1.5 border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
        <span className="w-12">nota</span>
        <span className="w-20">fecha</span>
        <span className="w-20">vence</span>
        <span className="flex-1 text-right">total</span>
        <span className="w-20 text-right">abonado</span>
        <span className="w-20 text-right">debe</span>
      </div>
      {!cuenta && <SkeletonRows rows={3} />}
      {cuenta && notas.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">
          {soloPend ? "No debe nada. Todo cobrado." : "Todavia no tiene notas."}
        </p>
      )}
      {notas.map((n) => (
        <button
          key={n.id}
          onClick={() => onVerNota(n.id)}
          title="Abrir la nota"
          className="w-full flex gap-3 px-1 py-2 border-b border-gray-50 text-[13px] text-left hover:bg-gray-50"
        >
          <span className="w-12 text-brand-700 font-mono text-[11px]">{n.sequence_number}</span>
          <span className="w-20 text-gray-500">{fechaCorta(n.note_date)}</span>
          <span className={`w-20 ${n.dias_vencido > 0 ? "text-red-600" : "text-gray-500"}`}>
            {fechaCorta(n.due_date)}
          </span>
          <span className="flex-1 text-right">{money(n.total)}</span>
          <span className="w-20 text-right text-gray-500">{money(n.abonado)}</span>
          <span className={`w-20 text-right ${n.pendiente > 0.005 ? "text-red-600 font-medium" : "text-gray-300"}`}>
            {money(n.pendiente)}
          </span>
        </button>
      ))}

      {(c.fiscal_address || c.city) && (
        <p className="mt-3 text-[11px] text-gray-400 flex items-center gap-1">
          <MapPin size={12} /> {[c.fiscal_address, c.city, c.state].filter(Boolean).join(", ")}
        </p>
      )}
    </Ventana>
  );
}

/* ============================================================
   Crear / editar cliente
   ============================================================ */

function FormCliente({
  cliente,
  onClose,
  onSaved,
}: {
  cliente: ClientRow | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState(() =>
    cliente
      ? {
          name: cliente.name ?? "",
          tax_id: cliente.tax_id ?? "",
          fiscal_address: cliente.fiscal_address ?? "",
          phone: cliente.phone ?? "",
          city: cliente.city ?? "",
          state: cliente.state ?? "",
          salesperson: cliente.salesperson ?? "",
          price_tier: cliente.price_tier ?? 1,
          credit_days: Number(cliente.credit_days) || 0,
        }
      : { ...emptyForm }
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((x) => ({ ...x, [k]: v }));
  }

  async function guardar() {
    if (!f.name.trim()) return setErr("El cliente necesita un nombre.");
    setBusy(true);
    setErr(null);
    const base = {
      p_name: f.name.trim(),
      p_tax_id: f.tax_id.trim(),
      p_fiscal_address: f.fiscal_address.trim(),
      p_phone: f.phone.trim(),
      p_city: f.city.trim(),
      p_state: f.state.trim(),
      p_salesperson: f.salesperson.trim(),
      p_price_tier: Number(f.price_tier) || 1,
    };
    const { data, error } = cliente
      ? await supabase.rpc("update_client", { p_id: cliente.id, ...base })
      : await supabase.rpc("create_client", base);
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { id: string } | null;
    const id = row?.id ?? cliente?.id ?? "";
    if (id && Math.round(f.credit_days) !== (Number(cliente?.credit_days) || 0)) {
      await supabase.rpc("update_client_credit_days", { p_id: id, p_days: Math.round(f.credit_days) });
    }
    setBusy(false);
    notify.ok(cliente ? "Cliente actualizado" : "Cliente registrado", f.name.trim());
    onSaved(id);
  }

  return (
    <Ventana
      titulo={cliente ? `Editar cliente #${cliente.client_number}` : "Nuevo cliente"}
      subtitulo="La tarifa decide que precio le sale en cada nota"
      icono={cliente ? Pencil : UserPlus}
      ancho="max-w-xl"
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={busy || !f.name.trim()}
            className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
          >
            {busy ? "Guardando..." : cliente ? "Guardar cambios" : "Registrar cliente"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nombre o empresa" className="col-span-2">
          <input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="RIF o cedula">
          <input value={f.tax_id} onChange={(e) => set("tax_id", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label={<span className="inline-flex items-center gap-1"><Phone size={11} /> Telefono</span>}>
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0414-1234567" className={inputCls} />
        </Campo>
        <Campo label="Direccion fiscal" className="col-span-2">
          <input value={f.fiscal_address} onChange={(e) => set("fiscal_address", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Ciudad">
          <input value={f.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Estado">
          <input value={f.state} onChange={(e) => set("state", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Vendedor">
          <input value={f.salesperson} onChange={(e) => set("salesperson", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Dias de credito">
          <NumInput
            value={f.credit_days}
            onChange={(n) => set("credit_days", n)}
            placeholder="0 = contado"
            className={`${inputCls} text-right`}
          />
        </Campo>
        <Campo label="Tarifa de precios" className="col-span-2">
          <Segmento
            valor={String(f.price_tier)}
            onChange={(k) => set("price_tier", Number(k))}
            opciones={[1, 2, 3, 4].map((t) => ({ k: String(t), l: TARIFAS[t] }))}
          />
        </Campo>
      </div>
      {err && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}
    </Ventana>
  );
}
