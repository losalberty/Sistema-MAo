"use client";

/* ============================================================
   PEDIDOS A PROVEEDORES
   Tres pasos, siempre en el mismo orden:
     1. Por pedir  -> se llena solo con lo que le falta a cada nota
     2. Hojas      -> tu eliges que va en cada hoja y a que proveedor
     3. Llego      -> se reparte a los clientes de esa hoja
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  FileText,
  History,
  Hourglass,
  Link2,
  MessageCircle,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EmptyState, NumInput, Pill, SkeletonRows, confirmar, notify, type PillTone } from "@/components/ui";
import { Lateral, Segmento, Ventana, inputCls } from "@/components/Ventana";
import { colorDe, iniciales } from "@/components/Paleta";

/* ---------------- tipos ---------------- */

type LineaCliente = {
  note_id: string;
  numero: number;
  fecha: string;
  cliente: string;
  telefono: string | null;
  product_id: string;
  code: string;
  description: string;
  supplier_id: string | null;
  proveedor: string | null;
  pidio: number;
  recibido: number;
  en_hoja: number;
  falta: number;
};

type LineaAlmacen = {
  product_id: string;
  code: string;
  description: string;
  supplier_id: string | null;
  proveedor: string | null;
  stock: number;
  minimo: number;
  cantidad: number;
};

type HojaAbierta = {
  id: string;
  numero: number;
  fecha: string;
  proveedor: string | null;
  supplier_id: string | null;
  en_camino: number;
};

type PorPedir = { clientes: LineaCliente[]; almacen: LineaAlmacen[]; hojas_abiertas: HojaAbierta[] };

type HojaLista = {
  id: string;
  numero: number;
  fecha: string;
  status: string;
  supplier_id: string | null;
  proveedor: string | null;
  invoice_id: string | null;
  lineas: number;
  unidades: number;
  llegaron: number;
  clientes: number;
  nombres: string | null;
};

type Para = {
  link_id: string;
  note_id: string;
  numero: number;
  fecha: string;
  cliente: string;
  cantidad: number;
  recibido: number;
};

type Otro = { note_id: string; numero: number; fecha: string; cliente: string; falta: number };

type ItemHoja = {
  id: string;
  product_id: string;
  code: string;
  description: string;
  cantidad: number;
  llegaron: number;
  falta: number;
  para: Para[];
  otros: Otro[];
};

type Hoja = {
  id: string;
  numero: number;
  fecha: string;
  status: string;
  supplier_id: string | null;
  proveedor: string | null;
  telefono_proveedor: string | null;
  nota: string | null;
  invoice_id: string | null;
  factura: string | null;
  items: ItemHoja[];
};

type Proveedor = { id: string; name: string; phone?: string | null };

/* lo que se eligio en Por pedir, agrupado por repuesto */
type Elegido = {
  product_id: string;
  code: string;
  description: string;
  supplier_id: string | null;
  proveedor: string | null;
  notas: { note_id: string; numero: number; fecha: string; cliente: string; falta: number }[];
  estante: number;
};

/* ---------------- ayudas ---------------- */

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function num(n: number) {
  const v = Math.round(Number(n ?? 0) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fechaCorta(f: string) {
  if (!f) return "";
  const d = new Date(f.slice(0, 10) + "T12:00:00");
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function haceDias(f: string) {
  const d = new Date(f.slice(0, 10) + "T12:00:00").getTime();
  const n = Math.floor((Date.now() - d) / 864e5);
  return n <= 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`;
}

const P = (n: number) => `P-${String(n).padStart(4, "0")}`;

function estadoHoja(h: { status: string; unidades: number; llegaron: number }): { l: string; t: PillTone } {
  if (h.status === "CANCELADO") return { l: "Cancelada", t: "neutral" };
  if (h.status === "RECIBIDO")
    return h.llegaron + 0.005 < h.unidades ? { l: "Cerrada · llegó una parte", t: "success" } : { l: "Recibida", t: "success" };
  if (h.llegaron > 0.005) return { l: "Llegó una parte", t: "sky" };
  return { l: "Esperando", t: "warning" };
}

function Avatar({ nombre, size = 28 }: { nombre: string; size?: number }) {
  return (
    <span
      className={`rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${colorDe(nombre)}`}
      style={{ width: size, height: size }}
    >
      {iniciales(nombre)}
    </span>
  );
}

function Check3({ estado, onClick, label }: { estado: "si" | "no" | "medio"; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={estado === "si" ? true : estado === "medio" ? "mixed" : false}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
        estado === "no" ? "border-gray-300 bg-white hover:border-brand-500" : "border-brand-700 bg-brand-700 text-white"
      }`}
    >
      {estado === "si" && <Check size={12} strokeWidth={3} />}
      {estado === "medio" && <span className="w-2 h-[2px] bg-white rounded" />}
    </button>
  );
}

/* ============================================================
   PANTALLA
   ============================================================ */

export default function PedidosPage() {
  const [data, setData] = useState<PorPedir | null>(null);
  const [hojas, setHojas] = useState<HojaLista[]>([]);
  const [provs, setProvs] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"pedir" | "hojas" | "historial">("pedir");
  const [vista, setVista] = useState<"repuesto" | "cliente">("repuesto");
  const [buscar, setBuscar] = useState("");
  const [provFiltro, setProvFiltro] = useState("TODOS");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [crear, setCrear] = useState(false);
  const [hojaId, setHojaId] = useState<string | null>(null);
  const [llegoId, setLlegoId] = useState<string | null>(null);
  const [nuevaVacia, setNuevaVacia] = useState(false);
  const [filtroHojas, setFiltroHojas] = useState<"ABIERTO" | "RECIBIDO" | "TODOS">("ABIERTO");

  const cargar = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      supabase.rpc("por_pedir"),
      supabase.rpc("lista_hojas", { p_status: "TODOS" }),
      supabase.rpc("list_suppliers"),
    ]);
    setCargando(false);
    if (r1.error) {
      setError(r1.error.message);
      return;
    }
    setError(null);
    setData(r1.data as PorPedir);
    if (!r2.error) setHojas((r2.data ?? []) as HojaLista[]);
    if (!r3.error) setProvs((r3.data ?? []) as Proveedor[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /* ---------- filtros ---------- */
  const coincide = useCallback(
    (x: { code: string; description: string; supplier_id: string | null; cliente?: string }) => {
      if (provFiltro !== "TODOS" && (x.supplier_id ?? "SIN") !== provFiltro) return false;
      const t = buscar.trim().toLowerCase();
      if (!t) return true;
      return (
        x.code.toLowerCase().includes(t) ||
        x.description.toLowerCase().includes(t) ||
        (x.cliente ?? "").toLowerCase().includes(t)
      );
    },
    [buscar, provFiltro]
  );

  const clientes = useMemo(() => (data?.clientes ?? []).filter((l) => coincide(l)), [data, coincide]);
  const almacen = useMemo(() => (data?.almacen ?? []).filter((l) => coincide(l)), [data, coincide]);

  const porRepuesto = useMemo(() => {
    const m = new Map<string, { info: LineaCliente; lineas: LineaCliente[]; total: number }>();
    for (const l of clientes) {
      const g = m.get(l.product_id) ?? { info: l, lineas: [], total: 0 };
      g.lineas.push(l);
      g.total += l.falta;
      m.set(l.product_id, g);
    }
    return Array.from(m.values());
  }, [clientes]);

  const porCliente = useMemo(() => {
    const m = new Map<string, { info: LineaCliente; lineas: LineaCliente[]; total: number }>();
    for (const l of clientes) {
      const g = m.get(l.note_id) ?? { info: l, lineas: [], total: 0 };
      g.lineas.push(l);
      g.total += l.falta;
      m.set(l.note_id, g);
    }
    return Array.from(m.values());
  }, [clientes]);

  const provsEnLista = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of [...(data?.clientes ?? []), ...(data?.almacen ?? [])])
      m.set(l.supplier_id ?? "SIN", l.proveedor ?? "Sin proveedor");
    return Array.from(m.entries());
  }, [data]);

  /* ---------- seleccion ---------- */
  const kC = (l: LineaCliente) => `${l.note_id}|${l.product_id}`;
  const kA = (l: LineaAlmacen) => `A|${l.product_id}`;

  function alternar(keys: string[]) {
    setSel((p) => {
      const n = new Set(p);
      const todos = keys.every((k) => n.has(k));
      keys.forEach((k) => (todos ? n.delete(k) : n.add(k)));
      return n;
    });
  }
  const estadoDe = (keys: string[]): "si" | "no" | "medio" => {
    const n = keys.filter((k) => sel.has(k)).length;
    return n === 0 ? "no" : n === keys.length ? "si" : "medio";
  };

  const elegidos: Elegido[] = useMemo(() => {
    const m = new Map<string, Elegido>();
    for (const l of data?.clientes ?? []) {
      if (!sel.has(kC(l))) continue;
      const e = m.get(l.product_id) ?? {
        product_id: l.product_id,
        code: l.code,
        description: l.description,
        supplier_id: l.supplier_id,
        proveedor: l.proveedor,
        notas: [],
        estante: 0,
      };
      e.notas.push({ note_id: l.note_id, numero: l.numero, fecha: l.fecha, cliente: l.cliente, falta: l.falta });
      m.set(l.product_id, e);
    }
    for (const l of data?.almacen ?? []) {
      if (!sel.has(kA(l))) continue;
      const e = m.get(l.product_id) ?? {
        product_id: l.product_id,
        code: l.code,
        description: l.description,
        supplier_id: l.supplier_id,
        proveedor: l.proveedor,
        notas: [],
        estante: 0,
      };
      e.estante = l.cantidad;
      m.set(l.product_id, e);
    }
    return Array.from(m.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sel]);

  const selUnidades = elegidos.reduce((s, e) => s + e.estante + e.notas.reduce((a, n) => a + n.falta, 0), 0);
  const selClientes = new Set(elegidos.flatMap((e) => e.notas.map((n) => n.note_id))).size;

  const todasLasClaves = [...clientes.map(kC), ...almacen.map(kA)];

  async function yaNoEspera(l: LineaCliente) {
    const ok = await confirmar({
      titulo: `¿${l.cliente} ya no espera ${l.code}?`,
      mensaje: `Sale de Por pedir y no se le va a pedir al proveedor. La nota #${l.numero} no se toca.`,
      textoSi: "Sí, ya no lo espera",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("cancel_demand", {
      p_note_id: l.note_id,
      p_product_id: l.product_id,
      p_cancel: true,
    });
    if (error) return notify.error(error.message);
    notify.ok("Listo", `${l.cliente} ya no espera ${l.code}`);
    cargar();
  }

  /* ---------- resumen ---------- */
  const totalUnidades = (data?.clientes ?? []).reduce((s, l) => s + l.falta, 0);
  const totalNotas = new Set((data?.clientes ?? []).map((l) => l.note_id)).size;
  const enCamino = (data?.hojas_abiertas ?? []).reduce((s, h) => s + h.en_camino, 0);
  const abiertas = hojas.filter((h) => h.status === "ABIERTO");
  const hojasVista = hojas.filter((h) => filtroHojas === "TODOS" || h.status === filtroHojas);

  return (
    <main className="p-6 max-w-[1240px] pb-28">
      {/* ---------- encabezado ---------- */}
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold text-gray-900 tracking-tight">Pedidos a proveedores</h1>
          <p className="text-[13px] text-gray-500">
            Lo que le falta a tus clientes, las hojas que le mandas al proveedor y lo que llegó.
          </p>
        </div>
        <button
          onClick={() => setNuevaVacia(true)}
          className="h-9 px-3 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300 whitespace-nowrap"
        >
          <Plus size={15} /> Hoja a mano
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex">
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>
      )}

      {/* ---------- los 3 pasos ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {(
          [
            {
              k: "pedir" as const,
              n: 1,
              t: "Por pedir",
              icon: ClipboardList,
              v: `${num(totalUnidades)} unidades`,
              s: totalNotas ? `de ${totalNotas} ${totalNotas === 1 ? "nota" : "notas"}` : "nadie espera nada",
            },
            {
              k: "hojas" as const,
              n: 2,
              t: "Hojas enviadas",
              icon: Truck,
              v: `${abiertas.length} ${abiertas.length === 1 ? "abierta" : "abiertas"}`,
              s: enCamino ? `${num(enCamino)} unidades en camino` : "nada en camino",
            },
            {
              k: "historial" as const,
              n: 3,
              t: "Lo que llegó",
              icon: History,
              v: "Historial",
              s: "qué entró y a quién se le dio",
            },
          ]
        ).map((p) => (
          <button
            key={p.k}
            onClick={() => setTab(p.k)}
            className={`text-left rounded-xl border px-4 py-3 transition-all ${
              tab === p.k
                ? "border-brand-300 bg-white ring-2 ring-brand-100 shadow-card"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <span className="flex items-center gap-2 text-[12.5px] text-gray-500">
              <span
                className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                  tab === p.k ? "bg-brand-700 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {p.n}
              </span>
              {p.t}
              <p.icon size={14} className="ml-auto text-gray-400" />
            </span>
            <span className="block text-[20px] font-semibold text-gray-900 tracking-tight mt-1">{p.v}</span>
            <span className="block text-[12px] text-gray-500">{p.s}</span>
          </button>
        ))}
      </div>

      {/* ================= 1. POR PEDIR ================= */}
      {tab === "pedir" && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Segmento
              opciones={[
                { k: "repuesto", l: "Por repuesto" },
                { k: "cliente", l: "Por cliente" },
              ]}
              valor={vista}
              onChange={setVista}
            />
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar repuesto o cliente"
                className="h-8 pl-8 pr-3 w-60 border border-gray-200 rounded-lg text-[13px] bg-white focus:border-brand-500"
              />
            </div>
            <select
              value={provFiltro}
              onChange={(e) => setProvFiltro(e.target.value)}
              className="h-8 px-2 border border-gray-200 rounded-lg text-[13px] bg-white"
              aria-label="Proveedor"
            >
              <option value="TODOS">Todos los proveedores</option>
              {provsEnLista.map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
            {todasLasClaves.length > 0 && (
              <button
                onClick={() => alternar(todasLasClaves)}
                className="ml-auto h-8 px-3 rounded-lg text-[12.5px] text-brand-700 hover:bg-brand-50"
              >
                {estadoDe(todasLasClaves) === "si" ? "Quitar todo" : "Marcar todo"}
              </button>
            )}
          </div>

          <p className="text-[12px] text-gray-500 mb-3 flex items-center gap-1.5">
            <Hourglass size={13} className="text-gray-400" />
            Esto se llena solo con cada nota que lleva repuestos bajo pedido. Marca lo que quieras pedir y pulsa{" "}
            <b className="font-medium text-gray-700">Crear hoja de pedido</b>.
          </p>

          {cargando && (
            <div className="bg-white border border-gray-200 rounded-xl">
              <SkeletonRows rows={6} />
            </div>
          )}

          {!cargando && clientes.length === 0 && almacen.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl">
              <EmptyState icon={PackageCheck} title="No hay nada por pedir">
                Cuando hagas una nota con un repuesto bajo pedido, aparece aquí sola, con el nombre del cliente.
              </EmptyState>
            </div>
          )}

          {/* ---- por repuesto ---- */}
          {vista === "repuesto" && porRepuesto.length > 0 && (
            <div className="space-y-2.5">
              {porRepuesto.map((g) => {
                const keys = g.lineas.map(kC);
                return (
                  <div key={g.info.product_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/70 border-b border-gray-100 cursor-pointer"
                      onClick={() => alternar(keys)}
                    >
                      <Check3 estado={estadoDe(keys)} onClick={() => alternar(keys)} label={`Marcar todo ${g.info.code}`} />
                      <Package size={16} className="text-gray-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-gray-900 truncate">
                          <span className="font-mono text-[12px] text-gray-500 mr-2">{g.info.code}</span>
                          {g.info.description}
                        </p>
                        <p className="text-[11.5px] text-gray-500">
                          {g.info.proveedor ?? "Sin proveedor habitual"} · {g.lineas.length}{" "}
                          {g.lineas.length === 1 ? "cliente espera" : "clientes esperan"}
                        </p>
                      </div>
                      <span className="text-right">
                        <span className="block text-[18px] font-semibold text-gray-900 leading-tight">{num(g.total)}</span>
                        <span className="block text-[11px] text-gray-500">por pedir</span>
                      </span>
                    </div>
                    {g.lineas.map((l) => (
                      <FilaCliente
                        key={kC(l)}
                        l={l}
                        marcada={sel.has(kC(l))}
                        onMarcar={() => alternar([kC(l)])}
                        onYaNo={() => yaNoEspera(l)}
                        mostrar="cliente"
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- por cliente ---- */}
          {vista === "cliente" && porCliente.length > 0 && (
            <div className="space-y-2.5">
              {porCliente.map((g) => {
                const keys = g.lineas.map(kC);
                return (
                  <div key={g.info.note_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/70 border-b border-gray-100 cursor-pointer"
                      onClick={() => alternar(keys)}
                    >
                      <Check3 estado={estadoDe(keys)} onClick={() => alternar(keys)} label={`Marcar todo de ${g.info.cliente}`} />
                      <Avatar nombre={g.info.cliente} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-gray-900 truncate">{g.info.cliente}</p>
                        <p className="text-[11.5px] text-gray-500">
                          Nota #{g.info.numero} · {fechaCorta(g.info.fecha)} · {haceDias(g.info.fecha)}
                        </p>
                      </div>
                      <span className="text-right">
                        <span className="block text-[18px] font-semibold text-gray-900 leading-tight">{num(g.total)}</span>
                        <span className="block text-[11px] text-gray-500">unidades</span>
                      </span>
                    </div>
                    {g.lineas.map((l) => (
                      <FilaCliente
                        key={kC(l)}
                        l={l}
                        marcada={sel.has(kC(l))}
                        onMarcar={() => alternar([kC(l)])}
                        onYaNo={() => yaNoEspera(l)}
                        mostrar="repuesto"
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- para el almacen ---- */}
          {almacen.length > 0 && (
            <div className="mt-5">
              <p className="text-[13px] font-medium text-gray-900 flex items-center gap-2 mb-1">
                <Warehouse size={15} className="text-gray-400" /> Para tu almacén
              </p>
              <p className="text-[12px] text-gray-500 mb-2">
                Repuestos que guardas en estante y bajaron de su mínimo (o quedaron en negativo). No son de ningún cliente.
              </p>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {almacen.map((l) => (
                  <div
                    key={kA(l)}
                    onClick={() => alternar([kA(l)])}
                    className={`flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 first:border-t-0 cursor-pointer ${
                      sel.has(kA(l)) ? "bg-brand-50/40" : "hover:bg-gray-50"
                    }`}
                  >
                    <Check3 estado={sel.has(kA(l)) ? "si" : "no"} onClick={() => alternar([kA(l)])} label={`Marcar ${l.code}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-gray-900 truncate">
                        <span className="font-mono text-[11.5px] text-gray-500 mr-2">{l.code}</span>
                        {l.description}
                      </p>
                      <p className="text-[11.5px] text-gray-500">
                        Hay {num(l.stock)} · mínimo {num(l.minimo)} · {l.proveedor ?? "sin proveedor"}
                      </p>
                    </div>
                    <span className="text-[14px] font-medium text-gray-900">{num(l.cantidad)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- barra de seleccion ---- */}
          {sel.size > 0 && (
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl bg-gray-900 text-white shadow-pop">
              <span className="text-[13px]">
                <b className="font-semibold">{num(selUnidades)}</b> unidades
                {selClientes > 0 && (
                  <span className="text-gray-300">
                    {" "}
                    · {selClientes} {selClientes === 1 ? "cliente" : "clientes"}
                  </span>
                )}
                <span className="text-gray-300">
                  {" "}
                  · {elegidos.length} {elegidos.length === 1 ? "repuesto" : "repuestos"}
                </span>
              </span>
              <button onClick={() => setSel(new Set())} className="h-8 px-3 rounded-lg text-[12.5px] text-gray-300 hover:text-white hover:bg-white/10">
                Quitar
              </button>
              <button
                onClick={() => setCrear(true)}
                className="h-9 px-4 rounded-xl bg-white text-gray-900 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-gray-100 whitespace-nowrap"
              >
                Crear hoja de pedido <ArrowRight size={15} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ================= 2. HOJAS ================= */}
      {tab === "hojas" && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Segmento
              opciones={[
                { k: "ABIERTO", l: `Abiertas (${abiertas.length})` },
                { k: "RECIBIDO", l: "Recibidas" },
                { k: "TODOS", l: "Todas" },
              ]}
              valor={filtroHojas}
              onChange={setFiltroHojas}
            />
          </div>
          {hojasVista.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl">
              <EmptyState icon={FileText} title={filtroHojas === "ABIERTO" ? "No hay hojas esperando" : "No hay hojas aquí"}>
                Las hojas se crean desde <b className="font-medium">Por pedir</b>: marcas lo que falta y eliges el proveedor.
              </EmptyState>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {hojasVista.map((h) => {
                const e = estadoHoja(h);
                const pct = h.unidades > 0 ? Math.min(100, Math.round((h.llegaron / h.unidades) * 100)) : 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => setHojaId(h.id)}
                    className="text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-card transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-gray-500">{P(h.numero)}</span>
                      <Pill tone={e.t}>{e.l}</Pill>
                      <span className="ml-auto text-[12px] text-gray-500 flex items-center gap-1">
                        <CalendarDays size={12} /> {fechaCorta(h.fecha)}
                      </span>
                    </div>
                    <p className="text-[15px] font-medium text-gray-900 mt-1 truncate">{h.proveedor ?? "Sin proveedor"}</p>
                    <p className="text-[12px] text-gray-500 truncate">
                      {h.clientes > 0 ? `Para ${h.nombres}` : "Para el estante"} · {h.lineas}{" "}
                      {h.lineas === 1 ? "repuesto" : "repuestos"}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11.5px] text-gray-600 whitespace-nowrap">
                        llegaron {num(h.llegaron)} de {num(h.unidades)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ================= 3. HISTORIAL ================= */}
      {tab === "historial" && <Historial />}

      {/* ================= ventanas ================= */}
      {crear && (
        <CrearHoja
          elegidos={elegidos}
          provs={provs}
          abiertas={data?.hojas_abiertas ?? []}
          onClose={() => setCrear(false)}
          onProvs={setProvs}
          onHecho={(ids) => {
            setCrear(false);
            setSel(new Set());
            cargar();
            if (ids.length === 1) setHojaId(ids[0]);
            else setTab("hojas");
          }}
        />
      )}

      {nuevaVacia && (
        <HojaAMano
          provs={provs}
          onProvs={setProvs}
          onClose={() => setNuevaVacia(false)}
          onHecho={(id) => {
            setNuevaVacia(false);
            cargar();
            setHojaId(id);
          }}
        />
      )}

      {hojaId && (
        <HojaDetalle
          key={hojaId}
          id={hojaId}
          provs={provs}
          onProvs={setProvs}
          onClose={() => setHojaId(null)}
          onCambio={cargar}
          onLlego={(id) => setLlegoId(id)}
        />
      )}

      {llegoId && (
        <Llego
          id={llegoId}
          onClose={() => setLlegoId(null)}
          onHecho={() => {
            setLlegoId(null);
            cargar();
            const id = hojaId;
            setHojaId(null);
            setTimeout(() => setHojaId(id), 0);
          }}
        />
      )}
    </main>
  );
}

/* ---------------- fila de una linea que espera ---------------- */

function FilaCliente({
  l,
  marcada,
  onMarcar,
  onYaNo,
  mostrar,
}: {
  l: LineaCliente;
  marcada: boolean;
  onMarcar: () => void;
  onYaNo: () => void;
  mostrar: "cliente" | "repuesto";
}) {
  return (
    <div
      onClick={onMarcar}
      className={`group flex items-center gap-3 pl-4 pr-3 py-2 border-t border-gray-100 first:border-t-0 cursor-pointer ${
        marcada ? "bg-brand-50/40" : "hover:bg-gray-50"
      }`}
    >
      <span className="w-[18px]" />
      <Check3 estado={marcada ? "si" : "no"} onClick={onMarcar} label="Marcar esta línea" />
      {mostrar === "cliente" ? (
        <>
          <Avatar nombre={l.cliente} size={24} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-gray-900 truncate">{l.cliente}</p>
            <p className="text-[11.5px] text-gray-500">
              Nota #{l.numero} · {fechaCorta(l.fecha)} · {haceDias(l.fecha)}
            </p>
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-gray-900 truncate">
            <span className="font-mono text-[11.5px] text-gray-500 mr-2">{l.code}</span>
            {l.description}
          </p>
          <p className="text-[11.5px] text-gray-500">{l.proveedor ?? "Sin proveedor habitual"}</p>
        </div>
      )}
      <span className="text-right">
        <span className="block text-[14px] font-medium text-gray-900">{num(l.falta)}</span>
        {(l.recibido > 0 || l.en_hoja > 0) && (
          <span className="block text-[10.5px] text-gray-500">
            de {num(l.pidio)}
            {l.recibido > 0 ? ` · recibió ${num(l.recibido)}` : ""}
            {l.en_hoja > 0 ? ` · ${num(l.en_hoja)} en hoja` : ""}
          </span>
        )}
      </span>
      <Link
        href={`/notas?nota=${l.note_id}`}
        onClick={(e) => e.stopPropagation()}
        className="h-7 px-2 rounded-md text-[11.5px] text-gray-500 hover:text-brand-700 hover:bg-brand-50 opacity-0 group-hover:opacity-100"
      >
        Ver nota
      </Link>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onYaNo();
        }}
        title="Ya no lo espera"
        aria-label="Ya no lo espera"
        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ---------------- elegir proveedor (o crear uno) ---------------- */

function ElegirProveedor({
  valor,
  onChange,
  provs,
  onProvs,
}: {
  valor: string;
  onChange: (id: string) => void;
  provs: Proveedor[];
  onProvs: (p: Proveedor[]) => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (!nombre.trim()) return notify.aviso("Escribe el nombre del proveedor");
    setBusy(true);
    const { data, error } = await supabase.rpc("save_supplier", {
      p_id: null,
      p_name: nombre.trim(),
      p_phone: tel.trim() || null,
    });
    setBusy(false);
    if (error) return notify.error(error.message);
    const id = data as string;
    const { data: lista } = await supabase.rpc("list_suppliers");
    onProvs(((lista ?? []) as Proveedor[]).length ? (lista as Proveedor[]) : [...provs, { id, name: nombre.trim() }]);
    onChange(id);
    setNuevo(false);
    setNombre("");
    setTel("");
    notify.ok("Proveedor agregado", nombre.trim());
  }

  if (nuevo)
    return (
      <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 space-y-2">
        <p className="text-[12px] font-medium text-gray-700">Nuevo proveedor</p>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className={inputCls} />
        <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Teléfono (para WhatsApp)" className={inputCls} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setNuevo(false)} className="h-8 px-3 rounded-lg text-[12.5px] text-gray-600 hover:bg-white">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={busy}
            className="h-8 px-3 rounded-lg text-[12.5px] font-medium bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Guardar proveedor
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex gap-2">
      <select value={valor} onChange={(e) => onChange(e.target.value)} className={`${inputCls} flex-1`} aria-label="Proveedor">
        <option value="">Elige un proveedor…</option>
        {provs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => setNuevo(true)}
        className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-[12.5px] text-gray-700 hover:border-gray-300 inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <UserPlus size={14} /> Nuevo
      </button>
    </div>
  );
}

/* ============================================================
   CREAR HOJA (desde Por pedir)
   ============================================================ */

function CrearHoja({
  elegidos,
  provs,
  abiertas,
  onClose,
  onProvs,
  onHecho,
}: {
  elegidos: Elegido[];
  provs: Proveedor[];
  abiertas: HojaAbierta[];
  onClose: () => void;
  onProvs: (p: Proveedor[]) => void;
  onHecho: (ids: string[]) => void;
}) {
  // el proveedor que mas se repite entre lo elegido
  const sugerido = useMemo(() => {
    const c = new Map<string, number>();
    elegidos.forEach((e) => e.supplier_id && c.set(e.supplier_id, (c.get(e.supplier_id) ?? 0) + 1));
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [elegidos]);

  const [prov, setProv] = useState(sugerido);
  const [modo, setModo] = useState<"una" | "cliente" | "sumar">("una");
  const [hojaDestino, setHojaDestino] = useState(abiertas[0]?.id ?? "");
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [guardarHabitual, setGuardarHabitual] = useState(false);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  const clientesUnicos = useMemo(() => {
    const m = new Map<string, { note_id: string; numero: number; cliente: string; fecha: string }>();
    elegidos.forEach((e) => e.notas.forEach((n) => m.set(n.note_id, n)));
    return Array.from(m.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  }, [elegidos]);

  const paraClientes = (e: Elegido) => e.notas.reduce((s, n) => s + n.falta, 0);
  const totalDe = (e: Elegido) => paraClientes(e) + (extra[e.product_id] ?? e.estante);
  const total = elegidos.reduce((s, e) => s + (modo === "cliente" ? paraClientes(e) + e.estante : totalDe(e)), 0);
  const distintos = elegidos.some((e) => e.supplier_id !== prov);

  const linea = (e: Elegido, notas: Elegido["notas"], cantidad: number) => ({
    product_id: e.product_id,
    cantidad,
    notas: notas.map((n) => ({ note_id: n.note_id, cantidad: n.falta })),
  });

  // como van a quedar las hojas (solo para mostrar)
  const previa = useMemo(() => {
    if (modo !== "cliente") return [];
    const hs = clientesUnicos.map((c) => ({
      titulo: `${c.cliente} · nota #${c.numero}`,
      lineas: elegidos
        .filter((e) => e.notas.some((n) => n.note_id === c.note_id))
        .map((e) => ({ code: e.code, q: e.notas.find((n) => n.note_id === c.note_id)!.falta })),
    }));
    const est = elegidos.filter((e) => e.estante > 0);
    if (est.length) hs.push({ titulo: "Para el estante", lineas: est.map((e) => ({ code: e.code, q: e.estante })) });
    return hs;
  }, [modo, clientesUnicos, elegidos]);

  async function crear() {
    if (modo !== "sumar" && !prov) return notify.aviso("Elige a qué proveedor le pides");
    if (modo === "sumar" && !hojaDestino) return notify.aviso("Elige la hoja abierta");
    setBusy(true);
    const ids: string[] = [];
    try {
      if (modo === "cliente") {
        for (const c of clientesUnicos) {
          const lineas = elegidos
            .filter((e) => e.notas.some((n) => n.note_id === c.note_id))
            .map((e) => {
              const ns = e.notas.filter((n) => n.note_id === c.note_id);
              return linea(e, ns, ns.reduce((s, n) => s + n.falta, 0));
            });
          const { data, error } = await supabase.rpc("crear_hoja_pedido", {
            p_supplier_id: prov,
            p_lineas: lineas,
            p_order_id: null,
            p_fecha: null,
            p_nota: `Para ${c.cliente} · nota #${c.numero}`,
          });
          if (error) throw new Error(error.message);
          ids.push((data as { order_id: string }).order_id);
        }
        const est = elegidos.filter((e) => e.estante > 0);
        if (est.length) {
          const { data, error } = await supabase.rpc("crear_hoja_pedido", {
            p_supplier_id: prov,
            p_lineas: est.map((e) => linea(e, [], e.estante)),
            p_order_id: null,
            p_fecha: null,
            p_nota: "Para el estante",
          });
          if (error) throw new Error(error.message);
          ids.push((data as { order_id: string }).order_id);
        }
      } else {
        const { data, error } = await supabase.rpc("crear_hoja_pedido", {
          p_supplier_id: modo === "sumar" ? null : prov,
          p_lineas: elegidos.map((e) => linea(e, e.notas, totalDe(e))),
          p_order_id: modo === "sumar" ? hojaDestino : null,
          p_fecha: null,
          p_nota: nota.trim() || null,
        });
        if (error) throw new Error(error.message);
        ids.push((data as { order_id: string }).order_id);
      }
      if (guardarHabitual && prov && modo !== "sumar") {
        await supabase.rpc("assign_product_supplier", {
          p_ids: elegidos.map((e) => e.product_id),
          p_supplier_id: prov,
        });
      }
      notify.ok(
        ids.length === 1 ? (modo === "sumar" ? "Agregado a la hoja" : "Hoja creada") : `${ids.length} hojas creadas`,
        `${num(total)} unidades`
      );
      onHecho(ids);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "No se pudo crear la hoja");
      if (ids.length) onHecho(ids);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ventana
      titulo="Crear hoja de pedido"
      subtitulo={`${num(total)} unidades · ${elegidos.length} ${elegidos.length === 1 ? "repuesto" : "repuestos"}${
        clientesUnicos.length ? ` · ${clientesUnicos.length} ${clientesUnicos.length === 1 ? "cliente" : "clientes"}` : ""
      }`}
      icono={FileText}
      ancho="max-w-2xl"
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={crear}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Check size={15} />
            {modo === "sumar" ? "Agregar a la hoja" : modo === "cliente" ? `Crear ${previa.length} hojas` : "Crear hoja"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* paso 1 */}
        <section>
          <p className="text-[13px] font-medium text-gray-900 mb-2">¿Cómo la quieres?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { k: "una", t: "Todo en una hoja", s: "Le pides todo junto", icon: FileText },
                { k: "cliente", t: "Una hoja por cliente", s: "Cada cliente por separado", icon: Users },
                { k: "sumar", t: "Sumar a una hoja abierta", s: "La que ya tienes armada", icon: PackagePlus },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                onClick={() => setModo(o.k)}
                disabled={o.k === "sumar" && abiertas.length === 0}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-40 ${
                  modo === o.k ? "border-brand-300 bg-brand-50/50 ring-2 ring-brand-100" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <o.icon size={16} className={modo === o.k ? "text-brand-700" : "text-gray-400"} />
                <span className="block text-[13px] font-medium text-gray-900 mt-1">{o.t}</span>
                <span className="block text-[11.5px] text-gray-500">
                  {o.k === "sumar" && abiertas.length === 0 ? "No hay hojas abiertas" : o.s}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* paso 2 */}
        <section>
          {modo === "sumar" ? (
            <>
              <p className="text-[13px] font-medium text-gray-900 mb-2">¿A cuál hoja?</p>
              <select value={hojaDestino} onChange={(e) => setHojaDestino(e.target.value)} className={inputCls}>
                {abiertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {P(h.numero)} · {h.proveedor ?? "Sin proveedor"} · {fechaCorta(h.fecha)} · {num(h.en_camino)} unidades
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium text-gray-900 mb-2">¿A qué proveedor se lo pides?</p>
              <ElegirProveedor valor={prov} onChange={setProv} provs={provs} onProvs={onProvs} />
              {prov && distintos && (
                <label className="mt-2 flex items-center gap-2 text-[12.5px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={guardarHabitual}
                    onChange={(e) => setGuardarHabitual(e.target.checked)}
                    className="w-4 h-4 accent-brand-700"
                  />
                  Usar este proveedor de ahora en adelante para estos repuestos
                </label>
              )}
            </>
          )}
        </section>

        {/* paso 3 */}
        <section>
          <p className="text-[13px] font-medium text-gray-900 mb-2">
            {modo === "cliente" ? "Así quedan las hojas" : "Lo que va en la hoja"}
          </p>

          {modo === "cliente" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {previa.map((h, i) => (
                <div key={i} className="rounded-xl border border-gray-200 px-3 py-2">
                  <p className="text-[12.5px] font-medium text-gray-900 flex items-center gap-1.5">
                    <FileText size={13} className="text-gray-400" /> Hoja {i + 1} · {h.titulo}
                  </p>
                  {h.lineas.map((l, j) => (
                    <p key={j} className="text-[12px] text-gray-600 flex justify-between mt-0.5">
                      <span className="font-mono">{l.code}</span>
                      <span>{num(l.q)}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {elegidos.map((e) => {
                const pc = paraClientes(e);
                const ex = extra[e.product_id] ?? e.estante;
                return (
                  <div key={e.product_id} className="px-3 py-2.5 border-t border-gray-100 first:border-t-0">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-gray-900 truncate">
                          <span className="font-mono text-[11.5px] text-gray-500 mr-2">{e.code}</span>
                          {e.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {e.notas.map((n) => (
                            <span key={n.note_id} className="text-[11px] px-1.5 py-px rounded-md bg-violet-50 text-violet-800">
                              {n.cliente} {num(n.falta)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-gray-500">Total a pedir</p>
                        <NumInput
                          value={pc + ex}
                          onChange={(v) => setExtra((p) => ({ ...p, [e.product_id]: Math.max(0, v - pc) }))}
                          className="w-20 h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-right bg-white"
                          ariaLabel={`Cantidad de ${e.code}`}
                        />
                      </div>
                    </div>
                    {ex > 0 && (
                      <p className="text-[11.5px] text-gray-500 mt-1 text-right">
                        {pc > 0 ? `${num(pc)} para clientes + ` : ""}
                        <b className="font-medium text-gray-700">{num(ex)} para el estante</b>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {modo === "una" && (
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota para la hoja (opcional)"
            className={inputCls}
          />
        )}
      </div>
    </Ventana>
  );
}

/* ============================================================
   HOJA A MANO (sin venir de una nota)
   ============================================================ */

type ProductoHit = { id: string; code: string; description: string };

function BuscarRepuesto({ onElegir }: { onElegir: (p: ProductoHit) => void }) {
  const [t, setT] = useState("");
  const [hits, setHits] = useState<ProductoHit[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const mio = ++seq.current;
    if (t.trim().length < 2) {
      setHits([]);
      return;
    }
    const h = setTimeout(async () => {
      const { data } = await supabase.rpc("buscar_para_nota", { p_text: t.trim() });
      if (mio !== seq.current) return;
      setHits(((data ?? []) as ProductoHit[]).slice(0, 8));
    }, 200);
    return () => clearTimeout(h);
  }, [t]);

  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-[11px] text-gray-400" />
      <input
        value={t}
        onChange={(e) => setT(e.target.value)}
        placeholder="Buscar repuesto por código o nombre"
        className={`${inputCls} pl-8`}
      />
      {hits.length > 0 && (
        <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                onElegir(h);
                setT("");
                setHits([]);
              }}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-brand-50 border-t border-gray-100 first:border-t-0"
            >
              <span className="font-mono text-[11.5px] text-gray-500 mr-2">{h.code}</span>
              {h.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HojaAMano({
  provs,
  onProvs,
  onClose,
  onHecho,
}: {
  provs: Proveedor[];
  onProvs: (p: Proveedor[]) => void;
  onClose: () => void;
  onHecho: (id: string) => void;
}) {
  const [prov, setProv] = useState("");
  const [lineas, setLineas] = useState<(ProductoHit & { q: number })[]>([]);
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (!prov) return notify.aviso("Elige el proveedor");
    const ls = lineas.filter((l) => l.q > 0);
    if (!ls.length) return notify.aviso("Agrega al menos un repuesto con cantidad");
    setBusy(true);
    const { data, error } = await supabase.rpc("crear_hoja_pedido", {
      p_supplier_id: prov,
      p_lineas: ls.map((l) => ({ product_id: l.id, cantidad: l.q, notas: [] })),
      p_order_id: null,
      p_fecha: null,
      p_nota: null,
    });
    setBusy(false);
    if (error) return notify.error(error.message);
    notify.ok("Hoja creada");
    onHecho((data as { order_id: string }).order_id);
  }

  return (
    <Ventana
      titulo="Hoja a mano"
      subtitulo="Para surtir el estante o pedir algo que no viene de una nota"
      icono={Plus}
      ancho="max-w-xl"
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={crear}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            Crear hoja
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-gray-900 mb-2">Proveedor</p>
          <ElegirProveedor valor={prov} onChange={setProv} provs={provs} onProvs={onProvs} />
        </div>
        <div>
          <p className="text-[13px] font-medium text-gray-900 mb-2">Repuestos</p>
          <BuscarRepuesto
            onElegir={(p) =>
              setLineas((ls) => (ls.some((l) => l.id === p.id) ? ls : [...ls, { ...p, q: 1 }]))
            }
          />
          {lineas.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
              {lineas.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2 border-t border-gray-100 first:border-t-0">
                  <p className="flex-1 min-w-0 text-[13px] truncate">
                    <span className="font-mono text-[11.5px] text-gray-500 mr-2">{l.code}</span>
                    {l.description}
                  </p>
                  <NumInput
                    value={l.q}
                    onChange={(v) => setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, q: v } : x)))}
                    className="w-20 h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-right"
                    ariaLabel={`Cantidad de ${l.code}`}
                  />
                  <button
                    onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                    aria-label="Quitar"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Ventana>
  );
}

/* ============================================================
   DETALLE DE UNA HOJA
   ============================================================ */

function textoHoja(h: Hoja, conClientes: boolean) {
  const l = [`*Pedido ${P(h.numero)}*`, `Fecha: ${fechaCorta(h.fecha)}`, ""];
  for (const it of h.items) {
    l.push(`${num(it.cantidad)} × ${it.code} — ${it.description}`);
    if (conClientes && it.para.length) l.push(`   (para ${it.para.map((p) => `${p.cliente} ${num(p.cantidad)}`).join(", ")})`);
  }
  l.push("", `Total: ${num(h.items.reduce((s, i) => s + i.cantidad, 0))} unidades`);
  return l.join("\n");
}

function imprimirHoja(h: Hoja, conClientes: boolean) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return notify.aviso("Permite las ventanas emergentes para imprimir");
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const filas = h.items
    .map(
      (it) =>
        `<tr><td class="c">${esc(it.code)}</td><td>${esc(it.description)}${
          conClientes && it.para.length
            ? `<div class="p">para ${esc(it.para.map((p) => `${p.cliente} (${num(p.cantidad)})`).join(", "))}</div>`
            : ""
        }</td><td class="n">${num(it.cantidad)}</td></tr>`
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${P(h.numero)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0}
.s{color:#555;font-size:13px;margin:4px 0 20px}table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;border-bottom:2px solid #111;padding:6px 4px;font-size:11px;text-transform:uppercase;color:#555}
td{border-bottom:1px solid #ddd;padding:7px 4px;vertical-align:top}.c{font-family:monospace;white-space:nowrap}
.n{text-align:right;font-weight:600;width:70px}.p{color:#666;font-size:11px;margin-top:2px}
.t{text-align:right;margin-top:14px;font-size:14px}</style></head><body>
<h1>Pedido ${P(h.numero)}</h1><div class="s">Para: <b>${esc(h.proveedor ?? "")}</b> · ${esc(fechaCorta(h.fecha))}${
    h.nota ? ` · ${esc(h.nota)}` : ""
  }</div>
<table><thead><tr><th>Código</th><th>Descripción</th><th style="text-align:right">Cant.</th></tr></thead><tbody>${filas}</tbody></table>
<div class="t">Total: <b>${num(h.items.reduce((s, i) => s + i.cantidad, 0))}</b> unidades</div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

type FacturaCompra = { id: string; numero: string; fecha: string; total: number };

/* cantidad que se guarda al salir del campo o con Enter */
function CantidadEditable({ valor, onGuardar, label }: { valor: number; onGuardar: (q: number) => void; label: string }) {
  const [v, setV] = useState(num(valor));
  useEffect(() => setV(num(valor)), [valor]);
  const guardar = () => {
    const q = Number(v.replace(",", "."));
    if (!Number.isFinite(q) || q < 0) return setV(num(valor));
    if (Math.abs(q - valor) > 0.005) onGuardar(q);
  };
  return (
    <input
      value={v}
      inputMode="decimal"
      aria-label={label}
      onChange={(e) => setV(e.target.value.replace(/[^0-9.,]/g, ""))}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setV(num(valor));
      }}
      className="w-20 h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-right bg-white focus:border-brand-500"
    />
  );
}

function HojaDetalle({
  id,
  provs,
  onProvs,
  onClose,
  onCambio,
  onLlego,
}: {
  id: string;
  provs: Proveedor[];
  onProvs: (p: Proveedor[]) => void;
  onClose: () => void;
  onCambio: () => void;
  onLlego: (id: string) => void;
}) {
  const [h, setH] = useState<Hoja | null>(null);
  const [agregar, setAgregar] = useState(false);
  const [cambiarProv, setCambiarProv] = useState(false);
  const [facturas, setFacturas] = useState<FacturaCompra[] | null>(null);
  const [conClientes, setConClientes] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc("hoja_pedido", { p_id: id });
    if (error) return notify.error(error.message);
    setH(data as Hoja);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const recargar = () => {
    cargar();
    onCambio();
  };

  if (!h)
    return (
      <Lateral titulo="Cargando…" icono={FileText} onClose={onClose}>
        <SkeletonRows rows={5} />
      </Lateral>
    );

  const abierta = h.status === "ABIERTO";
  const unidades = h.items.reduce((s, i) => s + i.cantidad, 0);
  const llegaron = h.items.reduce((s, i) => s + i.llegaron, 0);
  const e = estadoHoja({ status: h.status, unidades, llegaron });
  const falta = h.items.reduce((s, i) => s + i.falta, 0);

  async function editarLinea(it: ItemHoja, q: number) {
    if (Math.abs(q - it.cantidad) < 0.005) return;
    const { error } = await supabase.rpc("editar_linea_hoja", { p_item_id: it.id, p_cantidad: q });
    if (error) return notify.error(error.message);
    recargar();
  }

  async function quitarCliente(p: Para, it: ItemHoja) {
    const ok = await confirmar({
      titulo: `¿Sacar a ${p.cliente} de esta hoja?`,
      mensaje: `Sus ${num(p.cantidad)} de ${it.code} vuelven a Por pedir, para pedirlas en otra hoja.`,
      textoSi: "Sí, sacarlo",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("quitar_cliente_hoja", { p_link_id: p.link_id });
    if (error) return notify.error(error.message);
    recargar();
  }

  async function accion(rpc: string, titulo: string, mensaje: string, peligro = false) {
    const ok = await confirmar({ titulo, mensaje, textoSi: "Sí, continuar", peligro });
    if (!ok) return;
    const { error } = await supabase.rpc(rpc, { p_id: id });
    if (error) return notify.error(error.message);
    if (rpc === "delete_purchase_order") {
      onCambio();
      onClose();
      return;
    }
    recargar();
  }

  async function verFacturas() {
    if (!h?.supplier_id) return;
    const { data, error } = await supabase.rpc("invoices_for_supplier", { p_supplier_id: h.supplier_id });
    if (error) return notify.error(error.message);
    setFacturas((data ?? []) as FacturaCompra[]);
  }

  async function enlazar(invoiceId: string | null) {
    const { error } = await supabase.rpc("link_invoice_to_order", { p_order_id: id, p_invoice_id: invoiceId });
    if (error) return notify.error(error.message);
    setFacturas(null);
    recargar();
  }

  function whatsapp() {
    if (!h) return;
    const txt = textoHoja(h, conClientes);
    const tel = (h.telefono_proveedor ?? "").replace(/\D/g, "");
    if (tel) {
      window.open(`https://wa.me/${tel.startsWith("0") ? "58" + tel.slice(1) : tel}?text=${encodeURIComponent(txt)}`, "_blank");
    } else {
      navigator.clipboard?.writeText(txt);
      notify.ok("Copiado", "Pégalo en el chat del proveedor");
    }
  }

  return (
    <Lateral
      titulo={h.proveedor ?? "Sin proveedor"}
      subtitulo={`${fechaCorta(h.fecha)} · ${num(unidades)} unidades${h.nota ? ` · ${h.nota}` : ""}`}
      arriba={
        <>
          <span className="font-mono text-[12px] text-gray-500">{P(h.numero)}</span>
          <Pill tone={e.t}>{e.l}</Pill>
        </>
      }
      icono={Truck}
      ancho="w-[600px]"
      onClose={onClose}
      pie={
        <>
          {abierta && (
            <button
              onClick={() => accion("cancel_purchase_order", "¿Cancelar esta hoja?", "Lo que no llegó vuelve a Por pedir.", true)}
              className="h-9 px-3 rounded-lg text-[13px] text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5 mr-auto"
            >
              <Ban size={14} /> Cancelar hoja
            </button>
          )}
          {!abierta && (
            <button
              onClick={() =>
                accion("reopen_purchase_order", "¿Volver a abrir la hoja?", "Vuelve a esperar lo que no ha llegado.")
              }
              className="h-9 px-3 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1.5 mr-auto"
            >
              <RotateCcw size={14} /> Reabrir
            </button>
          )}
          {llegaron === 0 && (
            <button
              onClick={() =>
                accion("delete_purchase_order", "¿Borrar esta hoja?", "Se borra por completo. Lo de los clientes vuelve a Por pedir.", true)
              }
              className="h-9 px-3 rounded-lg text-[13px] text-gray-500 hover:text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Borrar
            </button>
          )}
          {abierta && falta > 0 && (
            <button
              onClick={() => onLlego(id)}
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 inline-flex items-center gap-1.5"
            >
              <PackageCheck size={15} /> Llegó la mercancía
            </button>
          )}
        </>
      }
    >
      {/* acciones */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => imprimirHoja(h, conClientes)}
          className="h-8 px-3 rounded-lg border border-gray-200 text-[12.5px] text-gray-700 hover:border-gray-300 inline-flex items-center gap-1.5"
        >
          <Printer size={14} /> Imprimir
        </button>
        <button
          onClick={whatsapp}
          className="h-8 px-3 rounded-lg border border-gray-200 text-[12.5px] text-gray-700 hover:border-gray-300 inline-flex items-center gap-1.5"
        >
          {h.telefono_proveedor ? <MessageCircle size={14} /> : <Copy size={14} />}
          {h.telefono_proveedor ? "WhatsApp" : "Copiar texto"}
        </button>
        {abierta && (
          <>
            <button
              onClick={() => setAgregar((v) => !v)}
              className="h-8 px-3 rounded-lg border border-gray-200 text-[12.5px] text-gray-700 hover:border-gray-300 inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Agregar repuesto
            </button>
            <button
              onClick={() => setCambiarProv((v) => !v)}
              className="h-8 px-3 rounded-lg border border-gray-200 text-[12.5px] text-gray-700 hover:border-gray-300 inline-flex items-center gap-1.5"
            >
              <Truck size={14} /> Cambiar proveedor
            </button>
          </>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-gray-500">
          <input
            type="checkbox"
            checked={conClientes}
            onChange={(e) => setConClientes(e.target.checked)}
            className="w-3.5 h-3.5 accent-brand-700"
          />
          con nombres de clientes
        </label>
      </div>

      {cambiarProv && (
        <div className="mb-4 rounded-xl border border-gray-200 p-3">
          <p className="text-[12.5px] text-gray-700 mb-2">¿A qué proveedor va esta hoja?</p>
          <ElegirProveedor
            valor={h.supplier_id ?? ""}
            provs={provs}
            onProvs={onProvs}
            onChange={async (sid) => {
              if (!sid) return;
              const { error } = await supabase.rpc("cambiar_proveedor_hoja", { p_order_id: id, p_supplier_id: sid });
              if (error) return notify.error(error.message);
              setCambiarProv(false);
              notify.ok("Proveedor cambiado");
              recargar();
            }}
          />
        </div>
      )}

      {agregar && (
        <div className="mb-4 rounded-xl border border-gray-200 p-3">
          <p className="text-[12.5px] text-gray-700 mb-2">Agregar un repuesto a esta hoja (1 unidad, luego cambias la cantidad)</p>
          <BuscarRepuesto
            onElegir={async (p) => {
              const { error } = await supabase.rpc("crear_hoja_pedido", {
                p_supplier_id: null,
                p_lineas: [{ product_id: p.id, cantidad: 1, notas: [] }],
                p_order_id: id,
                p_fecha: null,
                p_nota: null,
              });
              if (error) return notify.error(error.message);
              setAgregar(false);
              recargar();
            }}
          />
        </div>
      )}

      {/* lineas */}
      <div className="space-y-2.5">
        {h.items.map((it) => {
          const paraCli = it.para.reduce((s, p) => s + p.cantidad, 0);
          const estante = Math.max(0, it.cantidad - paraCli);
          return (
            <div key={it.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50/70">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-gray-900 truncate">
                    <span className="font-mono text-[11.5px] text-gray-500 mr-2">{it.code}</span>
                    {it.description}
                  </p>
                  <p className="text-[11.5px] text-gray-500">
                    {it.llegaron > 0 ? `llegaron ${num(it.llegaron)} de ${num(it.cantidad)}` : "todavía no llega"}
                  </p>
                </div>
                {abierta ? (
                  <CantidadEditable
                    valor={it.cantidad}
                    onGuardar={(q) => editarLinea(it, q)}
                    label={`Cantidad pedida de ${it.code}`}
                  />
                ) : (
                  <span className="text-[15px] font-semibold text-gray-900">{num(it.cantidad)}</span>
                )}
              </div>
              {it.para.map((p) => {
                const completo = p.recibido + 0.005 >= p.cantidad;
                return (
                  <div key={p.link_id} className="group flex items-center gap-2.5 px-3.5 py-2 border-t border-gray-100">
                    <Avatar nombre={p.cliente} size={22} />
                    <span className="text-[12.5px] text-gray-900 flex-1 min-w-0 truncate">
                      {p.cliente} <span className="text-gray-400">· nota #{p.numero}</span>
                    </span>
                    {p.recibido > 0 && (
                      <Pill tone={completo ? "success" : "sky"}>
                        {completo ? "recibió todo" : `recibió ${num(p.recibido)}`}
                      </Pill>
                    )}
                    {!abierta && !completo && (
                      <Pill tone="danger">le faltaron {num(p.cantidad - p.recibido)} · volvió a Por pedir</Pill>
                    )}
                    <span className="text-[13px] font-medium text-gray-900 w-12 text-right">{num(p.cantidad)}</span>
                    {abierta && p.recibido === 0 && (
                      <button
                        onClick={() => quitarCliente(p, it)}
                        title="Sacar de esta hoja"
                        aria-label="Sacar de esta hoja"
                        className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
              {estante > 0.005 && (
                <div className="flex items-center gap-2.5 px-3.5 py-2 border-t border-gray-100">
                  <span className="w-[22px] h-[22px] rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                    <Warehouse size={12} />
                  </span>
                  <span className="text-[12.5px] text-gray-600 flex-1">Para el estante</span>
                  <span className="text-[13px] font-medium text-gray-900 w-12 text-right">{num(estante)}</span>
                  {abierta && <span className="w-6" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* factura */}
      <div className="mt-5 rounded-xl border border-dashed border-gray-300 px-3.5 py-3">
        <p className="text-[12.5px] text-gray-700 flex items-center gap-2">
          <Link2 size={14} className="text-gray-400" />
          {h.factura ? (
            <>
              Factura de compra enlazada: <b className="font-medium">{h.factura}</b>
              <button onClick={() => enlazar(null)} className="ml-auto text-[12px] text-gray-500 hover:text-red-600">
                Quitar
              </button>
            </>
          ) : (
            <>
              ¿Ya cargaste la factura de esta compra?
              <button onClick={verFacturas} className="ml-auto text-[12px] text-brand-700 hover:underline">
                Enlazarla
              </button>
            </>
          )}
        </p>
        {!h.factura && (
          <p className="text-[11.5px] text-gray-500 mt-1">
            Si la enlazas antes de recibir, el stock lo suma la factura y no se cuenta dos veces.
          </p>
        )}
        {facturas && (
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
            {facturas.length === 0 && <p className="p-3 text-[12px] text-gray-500">Este proveedor no tiene facturas cargadas.</p>}
            {facturas.map((f) => (
              <button
                key={f.id}
                onClick={() => enlazar(f.id)}
                className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-brand-50 border-t border-gray-100 first:border-t-0 flex justify-between"
              >
                <span>Factura {f.numero}</span>
                <span className="text-gray-500">
                  {fechaCorta(f.fecha)} · ${num(f.total)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Lateral>
  );
}

/* ============================================================
   LLEGO LA MERCANCIA: cuanto llego y a quien se le da
   ============================================================ */

type Destino = { note_id: string; cliente: string; numero: number; espera: number; deEstaHoja: boolean };

function repartoAuto(llegaron: number, destinos: Destino[]) {
  let resto = llegaron;
  const r: Record<string, number> = {};
  for (const d of destinos) {
    const q = Math.max(0, Math.min(d.espera, resto));
    r[d.note_id] = Math.round(q * 100) / 100;
    resto -= q;
  }
  return r;
}

function Llego({ id, onClose, onHecho }: { id: string; onClose: () => void; onHecho: () => void }) {
  const [h, setH] = useState<Hoja | null>(null);
  const [llego, setLlego] = useState<Record<string, number>>({});
  const [rep, setRep] = useState<Record<string, Record<string, number>>>({});
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [cerrar, setCerrar] = useState<"esperar" | "cerrar">("esperar");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("hoja_pedido", { p_id: id });
      if (error) return notify.error(error.message);
      const hoja = data as Hoja;
      setH(hoja);
      const l: Record<string, number> = {};
      const r: Record<string, Record<string, number>> = {};
      for (const it of hoja.items.filter((i) => i.falta > 0.005)) {
        l[it.id] = it.falta;
        r[it.id] = repartoAuto(it.falta, destinosDe(it));
      }
      setLlego(l);
      setRep(r);
    })();
  }, [id]);

  function destinosDe(it: ItemHoja): Destino[] {
    return [
      ...it.para
        .filter((p) => p.cantidad - p.recibido > 0.005)
        .map((p) => ({ note_id: p.note_id, cliente: p.cliente, numero: p.numero, espera: p.cantidad - p.recibido, deEstaHoja: true })),
      ...it.otros.map((o) => ({ note_id: o.note_id, cliente: o.cliente, numero: o.numero, espera: o.falta, deEstaHoja: false })),
    ];
  }

  if (!h)
    return (
      <Ventana titulo="Llegó la mercancía" icono={PackageCheck} onClose={onClose}>
        <SkeletonRows rows={4} />
      </Ventana>
    );

  const items = h.items.filter((i) => i.falta > 0.005);
  const algunoCorto = items.some((it) => (llego[it.id] ?? 0) + 0.005 < it.falta);
  const totalLlego = items.reduce((s, it) => s + (llego[it.id] ?? 0), 0);

  function setLlegoDe(it: ItemHoja, v: number) {
    setLlego((p) => ({ ...p, [it.id]: v }));
    if (!manual[it.id]) setRep((p) => ({ ...p, [it.id]: repartoAuto(v, destinosDe(it)) }));
    setErr(null);
  }

  async function guardar() {
    if (!h) return;
    for (const it of items) {
      const sum = Object.values(rep[it.id] ?? {}).reduce((s, q) => s + q, 0);
      if (sum > (llego[it.id] ?? 0) + 0.005)
        return setErr(`En ${it.code} repartes ${num(sum)} pero llegaron ${num(llego[it.id] ?? 0)}.`);
      for (const d of destinosDe(it)) {
        if ((rep[it.id]?.[d.note_id] ?? 0) > d.espera + 0.005)
          return setErr(`A ${d.cliente} solo le faltan ${num(d.espera)} de ${it.code}.`);
      }
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("recibir_hoja", {
      p_order_id: id,
      p_lineas: items.map((it) => ({
        item_id: it.id,
        llegaron: llego[it.id] ?? 0,
        repartos: Object.entries(rep[it.id] ?? {})
          .filter(([, q]) => q > 0)
          .map(([note_id, cantidad]) => ({ note_id, cantidad })),
      })),
      p_cerrar: algunoCorto && cerrar === "cerrar",
      p_fecha: null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    const r = data as { llegaron: number; repartido: number; al_estante: number; notas: number };
    notify.ok(
      `Llegaron ${num(r.llegaron)} unidades`,
      `${num(r.repartido)} para ${r.notas} ${r.notas === 1 ? "cliente" : "clientes"}${
        r.al_estante > 0 ? ` · ${num(r.al_estante)} al estante` : ""
      }`
    );
    onHecho();
  }

  return (
    <Ventana
      titulo="Llegó la mercancía"
      subtitulo={`${P(h.numero)} · ${h.proveedor ?? ""} · pon cuántas llegaron de cada repuesto`}
      icono={PackageCheck}
      ancho="max-w-2xl"
      onClose={onClose}
      pie={
        <>
          <span className="mr-auto text-[12.5px] text-gray-500">
            Llegaron <b className="font-medium text-gray-900">{num(totalLlego)}</b> unidades
          </span>
          <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Check size={15} /> Guardar y repartir
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {items.map((it) => {
          const ds = destinosDe(it);
          const r = rep[it.id] ?? {};
          const l = llego[it.id] ?? 0;
          const repartido = Object.values(r).reduce((s, q) => s + q, 0);
          const estante = Math.max(0, l - repartido);
          return (
            <div key={it.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50/70">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-gray-900 truncate">
                    <span className="font-mono text-[11.5px] text-gray-500 mr-2">{it.code}</span>
                    {it.description}
                  </p>
                  <p className="text-[11.5px] text-gray-500">Esperabas {num(it.falta)}</p>
                </div>
                <label className="text-[12px] text-gray-600 flex items-center gap-2">
                  Llegaron
                  <NumInput
                    value={l}
                    onChange={(v) => setLlegoDe(it, Math.max(0, v))}
                    className={`w-20 h-9 px-2 border rounded-lg text-[14px] font-medium text-right bg-white ${
                      l + 0.005 < it.falta ? "border-amber-300" : "border-gray-200"
                    }`}
                    ariaLabel={`Llegaron de ${it.code}`}
                  />
                </label>
              </div>
              {ds.map((d) => {
                const q = r[d.note_id] ?? 0;
                const queda = d.espera - q;
                return (
                  <div key={d.note_id} className="flex items-center gap-2.5 px-3.5 py-2 border-t border-gray-100">
                    <Avatar nombre={d.cliente} size={22} />
                    <span className="text-[12.5px] text-gray-900 flex-1 min-w-0 truncate">
                      {d.cliente} <span className="text-gray-400">· nota #{d.numero} · esperaba {num(d.espera)}</span>
                      {!d.deEstaHoja && (
                        <span className="ml-1.5 text-[10.5px] px-1.5 py-px rounded bg-gray-100 text-gray-500">no estaba en esta hoja</span>
                      )}
                    </span>
                    {q > 0 && queda <= 0.005 && <Pill tone="success">completo</Pill>}
                    {queda > 0.005 && d.deEstaHoja && <Pill tone="danger">le faltan {num(queda)}</Pill>}
                    <NumInput
                      value={q}
                      onChange={(v) => {
                        setManual((p) => ({ ...p, [it.id]: true }));
                        setRep((p) => ({ ...p, [it.id]: { ...(p[it.id] ?? {}), [d.note_id]: Math.max(0, v) } }));
                        setErr(null);
                      }}
                      className="w-16 h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-right"
                      ariaLabel={`Para ${d.cliente}`}
                    />
                  </div>
                );
              })}
              <div className="flex items-center gap-2.5 px-3.5 py-2 border-t border-gray-100 bg-gray-50/40">
                <span className="w-[22px] h-[22px] rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                  <Warehouse size={12} />
                </span>
                <span className="text-[12.5px] text-gray-600 flex-1">Al estante (lo que sobra)</span>
                <span className="text-[13px] font-medium text-gray-900 w-16 text-right pr-2">{num(estante)}</span>
              </div>
            </div>
          );
        })}

        {algunoCorto && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-[13px] font-medium text-amber-900 mb-2">Llegó menos de lo que pediste. ¿Qué pasa con lo que falta?</p>
            {(
              [
                ["esperar", "Va a llegar después", "La hoja sigue abierta esperando el resto."],
                ["cerrar", "Ya no va a llegar", "Se cierra la hoja y lo que les falta a los clientes vuelve a Por pedir."],
              ] as const
            ).map(([k, t, s]) => (
              <label key={k} className="flex items-start gap-2 py-1 cursor-pointer">
                <input
                  type="radio"
                  name="cerrar"
                  checked={cerrar === k}
                  onChange={() => setCerrar(k)}
                  className="mt-1 accent-amber-700"
                />
                <span>
                  <span className="block text-[13px] text-gray-900">{t}</span>
                  <span className="block text-[11.5px] text-gray-600">{s}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {err && <p className="text-[13px] text-red-600">{err}</p>}
      </div>
    </Ventana>
  );
}

/* ============================================================
   HISTORIAL (igual que antes)
   ============================================================ */

type MovHist = {
  id: string;
  tipo: "LLEGADA" | "REPARTO";
  fecha: string;
  product_id: string;
  code: string;
  description: string;
  cantidad: number;
  nota: number | null;
  cliente: string | null;
  detalle: string | null;
  pedido: number | null;
};

type Hist = {
  desde: string;
  hasta: string;
  llegadas_unidades: number;
  repartidas_unidades: number;
  notas_servidas: number;
  movimientos: MovHist[];
};

function Historial() {
  const [h, setH] = useState<Hist | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc("orders_history", {
      p_from: desde || null,
      p_to: hasta || null,
      p_limit: 300,
    });
    setCargando(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setErr(null);
    setH(data as Hist);
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-100 text-[12px] text-gray-600 leading-relaxed">
        Cada mercancía que entró y a qué cliente se le dio. Si algo entró y salió el mismo día es porque era para un
        cliente que lo esperaba: por eso el estante no sube.
      </div>

      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-gray-100 flex-wrap">
        <span className="text-[11.5px] text-gray-400">desde</span>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="h-7 px-2 border border-gray-200 rounded-lg text-[12px]"
        />
        <span className="text-[11.5px] text-gray-400">hasta</span>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="h-7 px-2 border border-gray-200 rounded-lg text-[12px]"
        />
        {h && (
          <span className="ml-auto text-[12px] text-gray-500">
            entraron <b className="font-medium text-emerald-700">{num(h.llegadas_unidades)}</b> · se entregaron{" "}
            <b className="font-medium text-gray-900">{num(h.repartidas_unidades)}</b> · {h.notas_servidas} notas servidas
          </span>
        )}
      </div>

      {err && <p className="p-3 text-sm text-red-600">{err}</p>}
      {cargando && <SkeletonRows rows={5} />}

      {h && h.movimientos.length === 0 && !cargando && (
        <EmptyState icon={History} title="No hay movimientos en estas fechas">
          Aquí aparecen las llegadas de mercancía y lo que se le dio a cada cliente.
        </EmptyState>
      )}

      {h?.movimientos.map((m) => (
        <div key={`${m.tipo}-${m.id}`} className="flex gap-3 px-3.5 py-2 border-b border-gray-100 text-[12.5px] items-center">
          <span className="w-20 text-gray-500 shrink-0">{fechaCorta(m.fecha)}</span>
          <span className="w-[86px] shrink-0">
            <Pill tone={m.tipo === "LLEGADA" ? "success" : "violet"}>{m.tipo === "LLEGADA" ? "llegó" : "se entregó"}</Pill>
          </span>
          <span className="w-[86px] font-mono text-[11px] text-gray-500 shrink-0 truncate">{m.code}</span>
          <span className="flex-1 min-w-0 truncate">{m.description}</span>
          <span className="flex-1 min-w-0 truncate text-gray-600">
            {m.tipo === "LLEGADA"
              ? m.detalle ?? "entró al almacén"
              : `${m.cliente ?? "cliente"} · nota #${m.nota ?? "?"}${m.pedido ? ` · ${P(m.pedido)}` : ""}`}
          </span>
          <span className={`w-14 text-right shrink-0 ${m.cantidad > 0 ? "text-emerald-700" : "text-violet-700"}`}>
            {m.cantidad > 0 ? "+" : ""}
            {num(m.cantidad)}
          </span>
        </div>
      ))}
    </div>
  );
}
