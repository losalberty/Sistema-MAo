"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  ArrowDownToLine,
  Boxes,
  Calculator,
  ClipboardList,
  DollarSign,
  FileSpreadsheet,
  History,
  Package,
  PackageSearch,
  Printer,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Undo2,
  Upload,
  Warehouse,
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
  type PillTone,
} from "@/components/ui";
import { Barra, Campo, Encabezado, Lateral, Segmento, Tarjeta, Ventana, descargarExcel, inputCls } from "@/components/Ventana";
import { leerFilas } from "@/components/Excel";
import { useStockVivo } from "@/components/StockVivo";

type StockRow = {
  id: string;
  code: string;
  description: string;
  brand: string | null;
  category: string | null;
  supply_type: string;
  stock: number;
  apartado: number;
  en_camino: number;
  min_stock: number;
  cost: number;
  valor: number;
  supplier_id: string | null;
  supplier_name: string | null;
  estado: string;
};

type Resumen = {
  total: number;
  almacen: number;
  pedido: number;
  reponer: number;
  agotados: number;
  sin_stock?: number;
  esperando?: number;
  apartado_unidades?: number;
  valor: number;
};

type Movimiento = {
  id: string;
  move_date: string;
  kind: string;
  quantity: number;
  saldo: number;
  reason: string | null;
  sequence_number: number | null;
  cliente: string | null;
  factura: string | null;
  proveedor: string | null;
};

type Kardex = {
  stock: number;
  apartado?: number;
  en_camino?: number;
  min_stock: number;
  supply_type: string;
  description: string;
  code: string;
  vendido_90d: number;
  movimientos: Movimiento[];
};

type ProvInfo = {
  habitual: { id: string; name: string } | null;
  historial: {
    supplier_id: string;
    name: string;
    veces: number;
    ultima_fecha: string;
    ultimo_costo: number;
    unidades: number;
  }[];
};

type PreviewRow = {
  code: string;
  quantity: number;
  found: boolean;
  description: string | null;
  current_stock: number;
};

const ESTADOS: Record<string, { label: string; tone: PillTone }> = {
  OK: { label: "suficiente", tone: "success" },
  REPONER: { label: "reponer", tone: "warning" },
  AGOTADO: { label: "agotado", tone: "danger" },
  SIN_STOCK: { label: "sin stock", tone: "neutral" },
  PEDIDO: { label: "bajo pedido", tone: "violet" },
};

const TIPOS_MOV: Record<string, PillTone> = {
  VENTA: "danger",
  COMPRA: "success",
  RECEPCION: "success",
  AJUSTE: "violet",
  INICIAL: "neutral",
  DEVOLUCION: "orange",
};

const POR_PAGINA = 300;

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(n: number) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function InventarioPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("TODOS");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [visibles, setVisibles] = useState(POR_PAGINA);

  const [kardexId, setKardexId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showMinimos, setShowMinimos] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);
  const [minimo, setMinimo] = useState<number>(0);

  const [grupos, setGrupos] = useState<{ category: string; total: number }[]>([]);
  const [provs, setProvs] = useState<{ id: string; name: string; total: number }[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [r1, r2] = await Promise.all([
      supabase.rpc("list_stock", { p_search: search, p_filter: filtro }),
      supabase.rpc("stock_summary"),
    ]);
    setCargando(false);
    if (r1.error) {
      setError(r1.error.message);
      return;
    }
    setError(null);
    setRows((r1.data ?? []) as StockRow[]);
    if (!r2.error) setResumen(r2.data as Resumen);
  }, [search, filtro]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  // en vivo: si alguien vende o llega mercancia, la fila cambia sola
  const resumenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useStockVivo((c) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === c.product_id
          ? {
              ...r,
              stock: c.estante,
              apartado: c.apartado,
              valor: Math.round(Math.max(c.estante, 0) * r.cost * 100) / 100,
              estado:
                r.supply_type === "PEDIDO"
                  ? "PEDIDO"
                  : r.min_stock > 0 && c.estante < r.min_stock
                  ? "REPONER"
                  : c.estante <= 0
                  ? "SIN_STOCK"
                  : "OK",
            }
          : r
      )
    );
    if (resumenTimer.current) clearTimeout(resumenTimer.current);
    resumenTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc("stock_summary");
      if (data) setResumen(data as Resumen);
    }, 800);
  });

  useEffect(() => {
    setVisibles(POR_PAGINA);
  }, [search, filtro]);

  useEffect(() => {
    supabase.rpc("list_categories").then(({ data }) => {
      setGrupos((data ?? []) as { category: string; total: number }[]);
    });
    supabase.rpc("list_suppliers").then(({ data }) => {
      setProvs((data ?? []) as { id: string; name: string; total: number }[]);
    });
  }, []);

  async function seleccionarPor(campo: "grupo" | "proveedor", valor: string) {
    if (!valor) return;
    const { data, error } = await supabase.rpc("stock_ids_by", {
      p_category: campo === "grupo" ? valor : null,
      p_supplier_id: campo === "proveedor" ? valor : null,
      p_supply_type: null,
    });
    if (error) {
      notify.error("No se pudo seleccionar", error.message);
      return;
    }
    const ids = ((data ?? []) as { id: string }[]).map((x) => x.id);
    setSel(new Set(ids));
    notify.info(`${ids.length} productos seleccionados`);
  }

  function toggleSel(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function necesitaSeleccion(accion: string) {
    if (sel.size > 0) return true;
    notify.info("Marca productos primero", `Para ${accion}, marca las casillas de la lista o usa "seleccionar".`);
    return false;
  }

  async function cambiarTipo(tipo: string) {
    if (!necesitaSeleccion(tipo === "PEDIDO" ? "marcarlos bajo pedido" : "marcarlos de almacen")) return;
    const { error } = await supabase.rpc("set_supply_type", {
      p_ids: Array.from(sel),
      p_type: tipo,
    });
    if (error) return notify.error("No se pudo cambiar", error.message);
    notify.ok(
      `${sel.size} productos ahora son ${tipo === "PEDIDO" ? "bajo pedido" : "de almacén"}`,
      tipo === "PEDIDO"
        ? "Lo que vendas y no haya en el estante va solo a Pedidos → Por pedir. No avisan agotado."
        : "Se guardan en el estante y avisan cuando bajan de su mínimo."
    );
    setSel(new Set());
    cargar();
  }

  async function aplicarMinimo() {
    // con marcados: a esos; sin marcados: a todos los de la lista (el filtro que ves)
    const ids = sel.size > 0 ? Array.from(sel) : rows.map((r) => r.id);
    if (ids.length === 0) return notify.info("No hay productos en la lista");
    if (sel.size === 0) {
      const ok = await confirmar({
        titulo: `¿Poner mínimo ${num(minimo)} a los ${ids.length} de la lista?`,
        mensaje: "Se aplica a todos los repuestos que estás viendo con este filtro y esta búsqueda.",
        textoSi: "Sí, aplicar",
      });
      if (!ok) return;
    }
    const { error } = await supabase.rpc("set_min_stock", {
      p_ids: ids,
      p_min: minimo,
    });
    if (error) return notify.error("No se pudo aplicar", error.message);
    notify.ok(`Mínimo de ${num(minimo)} puesto en ${ids.length} productos`);
    setMinimo(0);
    setSel(new Set());
    cargar();
  }

  function verHistorial() {
    if (sel.size !== 1) {
      notify.info(sel.size === 0 ? "Marca un producto" : "Marca solo un producto", "O haz clic en su descripcion.");
      return;
    }
    setKardexId(Array.from(sel)[0]);
  }

  function exportar() {
    descargarExcel(
      "inventario",
      ["Codigo", "Descripcion", "Marca", "Grupo", "Proveedor", "Tipo", "Existencia", "Minimo", "Estado", "Costo", "Valor"],
      rows.map((r) => [
        r.code,
        r.description,
        r.brand ?? "",
        r.category ?? "",
        r.supplier_name ?? "",
        r.supply_type === "PEDIDO" ? "bajo pedido" : "almacen",
        num(r.stock),
        num(r.min_stock),
        ESTADOS[r.estado]?.label ?? r.estado,
        money(r.cost),
        money(r.valor),
      ])
    );
    notify.ok("Archivo descargado", `${rows.length} productos`);
  }

  const totalVista = useMemo(() => rows.reduce((s, r) => s + r.valor, 0), [rows]);
  const todoMarcado = rows.length > 0 && rows.every((r) => sel.has(r.id));

  return (
    <main className="p-6 max-w-[1180px]">
      <Encabezado titulo="Inventario">Cuánto tienes de cada repuesto y cuáles le pides al proveedor cuando los vendes.</Encabezado>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex gap-3">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Warehouse size={17} />
          </span>
          <div className="text-[12.5px] text-gray-600 leading-relaxed">
            <p className="text-[13.5px] font-medium text-gray-900">De almacén</p>
            Lo tienes guardado en el estante. Al vender baja; al llegar compra sube. Te avisa cuando baja de su mínimo.
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex gap-3">
          <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
            <ClipboardList size={17} />
          </span>
          <div className="text-[12.5px] text-gray-600 leading-relaxed">
            <p className="text-[13.5px] font-medium text-gray-900">Bajo pedido</p>
            No lo guardas: lo pides cuando lo vendes. Cada nota lo manda sola a <b className="font-medium">Pedidos → Por pedir</b>, con el nombre del cliente.
          </div>
        </div>
      </div>

      <div className="sticky top-[52px] z-20 -mx-6 px-6 pt-2 bg-[#f5f6f8]/85 backdrop-blur-md print:static">
      <Barra>
        <ToolbarButton icon={SlidersHorizontal} label="ajustar stock" tone="brand" onClick={() => setShowAjuste(true)} />
        <ToolbarButton icon={Upload} label="cargar desde Excel" onClick={() => setShowImport(true)} />
        <ToolbarButton
          icon={Calculator}
          label="minimos"
          active={showMinimos}
          onClick={() => setShowMinimos((v) => !v)}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={ShoppingCart} label="pedidos" tone="success" onClick={() => router.push("/pedidos")} />
        <ToolbarButton icon={Package} label="productos" onClick={() => router.push("/productos")} />
        <ToolbarSeparator />
        <ToolbarButton icon={FileSpreadsheet} label="excel" onClick={exportar} />
        <ToolbarButton icon={Printer} label="imprimir" onClick={() => window.print()} />
      </Barra>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Tarjeta
            label="Valor en el estante"
            valor={`$${money(resumen.valor)}`}
            sub="lo que tienes en físico, a costo"
            icono={DollarSign}
            acento="bg-brand-50 text-brand-700"
          />
          <button onClick={() => setFiltro("ESPERANDO")} className="text-left">
            <Tarjeta
              label="Clientes esperando"
              valor={String(resumen.esperando ?? 0)}
              tono="text-violet-700"
              sub={`${num(resumen.apartado_unidades ?? 0)} unidades apartadas`}
              icono={ClipboardList}
              acento="bg-violet-50 text-violet-700"
            />
          </button>
          <button onClick={() => setFiltro("REPONER")} className="text-left">
            <Tarjeta
              label="Por reponer"
              valor={String(resumen.reponer)}
              tono="text-amber-700"
              sub={resumen.agotados ? `${resumen.agotados} de ellos en 0` : "bajo su mínimo"}
              icono={ArrowDownToLine}
              acento="bg-amber-50 text-amber-700"
            />
          </button>
          <button onClick={() => setFiltro("PEDIDO")} className="text-left">
            <Tarjeta
              label="Bajo pedido"
              valor={String(resumen.pedido)}
              sub={`${resumen.almacen} son de almacén`}
              icono={Warehouse}
              acento="bg-gray-100 text-gray-600"
            />
          </button>
        </div>
      )}

      {showMinimos && (
        <MinimosPanel
          seleccionados={sel.size}
          minimo={minimo}
          setMinimo={setMinimo}
          onAplicar={aplicarMinimo}
          enLista={rows.length}
          onSugerido={(r) => {
            notify.ok(`Minimos puestos en ${r.actualizados} productos`, `Para aguantar ${r.dias} dias de venta.`);
            cargar();
          }}
          ids={sel.size > 0 ? Array.from(sel) : null}
        />
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <div className="flex gap-2 items-center p-2.5 border-b border-gray-100">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Codigo, descripcion o marca"
              className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[13px]"
            />
          </div>
          <Segmento
            valor={filtro}
            onChange={setFiltro}
            opciones={[
              { k: "TODOS", l: "Todos", title: "toda tu lista" },
              { k: "ESPERANDO", l: "Clientes esperando", title: "vendidos y todavía sin entregar" },
              { k: "REPONER", l: "Por reponer", title: "de almacén, por debajo de su mínimo (incluye los que están en 0)" },
              { k: "SIN_STOCK", l: "Sin stock", title: "de almacén, en 0 y sin mínimo puesto" },
              { k: "PEDIDO", l: "Bajo pedido", title: "los que pides cuando los vendes" },
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center px-2.5 py-2 border-b border-gray-100 text-[12px]">
          <span className="text-gray-400">seleccionar:</span>
          <select
            onChange={(e) => {
              seleccionarPor("grupo", e.target.value);
              e.target.value = "";
            }}
            defaultValue=""
            className="h-7 px-2 border border-gray-200 rounded-lg text-[12px] text-gray-600 bg-white"
          >
            <option value="">por grupo...</option>
            {grupos.map((g) => (
              <option key={g.category} value={g.category}>
                {g.category} ({g.total})
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              seleccionarPor("proveedor", e.target.value);
              e.target.value = "";
            }}
            defaultValue=""
            className="h-7 px-2 border border-gray-200 rounded-lg text-[12px] text-gray-600 bg-white"
          >
            <option value="">por proveedor...</option>
            {provs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.total})
              </option>
            ))}
          </select>
          {sel.size > 0 && (
            <span className="ml-auto flex items-center gap-2">
              <Pill tone="brand">{sel.size} seleccionados</Pill>
              <button onClick={() => setSel(new Set())} className="text-gray-500 hover:text-gray-900 underline">
                quitar
              </button>
            </span>
          )}
        </div>

        <div className="flex gap-2.5 items-center px-3 py-1.5 border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
          <input
            type="checkbox"
            checked={todoMarcado}
            onChange={() => setSel(todoMarcado ? new Set() : new Set(rows.map((r) => r.id)))}
            className="w-3 h-3 shrink-0 accent-brand-700"
            aria-label="Seleccionar todos los de la lista"
            title={`Marcar los ${rows.length} de la lista`}
          />
          <span className="w-[92px]">codigo</span>
          <span className="flex-1 min-w-0">descripcion</span>
          <span className="w-14 text-right" title="lo que tienes en físico">hay</span>
          <span className="w-16 text-right" title="vendido y sin entregar">apartado</span>
          <span className="w-16 text-right" title="en hojas de pedido abiertas">en camino</span>
          <span className="w-12 text-right">mínimo</span>
          <span className="w-[96px]">estado</span>
          <span className="w-16 text-right">costo</span>
          <span className="w-20 text-right">valor</span>
          <span className="w-7" />
        </div>

        {cargando && rows.length === 0 && <SkeletonRows rows={8} />}

        {!cargando && rows.length === 0 && (
          <EmptyState
            icon={filtro === "SIN_STOCK" ? Boxes : PackageSearch}
            title={
              filtro === "REPONER"
                ? "Ningún repuesto está por debajo de su mínimo"
                : filtro === "SIN_STOCK"
                ? "No hay repuestos de almacén en 0 sin mínimo"
                : filtro === "ESPERANDO"
                ? "Ningún cliente está esperando"
                : filtro === "PEDIDO"
                ? "Todavía no hay repuestos bajo pedido"
                : "No hay repuestos que coincidan"
            }
          >
            {filtro === "REPONER"
              ? "Aquí salen los repuestos de almacén que tienen un mínimo puesto y están por debajo (también los que están en 0)."
              : filtro === "ESPERANDO"
              ? "Cuando una nota pide más de lo que hay en el estante, lo que falta aparece aquí y en Pedidos → Por pedir."
              : filtro === "PEDIDO"
              ? "Marca los repuestos que no guardas y le pides al proveedor cuando los vendes, y pulsa «Bajo pedido» abajo."
              : filtro === "SIN_STOCK"
              ? "Bien: todo lo de almacén tiene existencia o un mínimo."
              : "Revisa la búsqueda o cambia el filtro."}
          </EmptyState>
        )}

        {rows.slice(0, visibles).map((r, idx) => {
          const e = r.estado === "REPONER" && r.stock <= 0 ? ESTADOS.AGOTADO : ESTADOS[r.estado] ?? ESTADOS.OK;
          const on = sel.has(r.id);
          return (
            <div
              key={r.id}
              onDoubleClick={() => setKardexId(r.id)}
              className={`group flex gap-2.5 items-center px-3 h-9 border-b border-gray-50 text-[12.5px] ${
                on ? "bg-brand-50/70" : idx % 2 ? "bg-gray-50/40 hover:bg-gray-50" : "hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggleSel(r.id)}
                className="w-3 h-3 shrink-0 accent-brand-700"
                aria-label={`Marcar ${r.code}`}
              />
              <span className="w-[92px] font-mono text-[10.5px] text-gray-500 shrink-0 truncate">{r.code}</span>
              <span className="flex-1 min-w-0 truncate">
                <button
                  onClick={() => setKardexId(r.id)}
                  className="text-gray-800 hover:text-brand-700 hover:underline"
                >
                  {r.description}
                </button>
                {r.supplier_name && <span className="ml-2 text-[10.5px] text-gray-400">{r.supplier_name}</span>}
              </span>
              <span
                className={`w-14 text-right shrink-0 font-medium ${
                  r.estado === "REPONER" && r.stock <= 0
                    ? "text-red-600"
                    : r.estado === "REPONER"
                    ? "text-amber-700"
                    : r.stock > 0
                    ? "text-gray-900"
                    : "text-gray-400"
                }`}
              >
                {num(r.stock)}
              </span>
              <span className={`w-16 text-right shrink-0 ${r.apartado > 0 ? "text-violet-700 font-medium" : "text-gray-300"}`}>
                {r.apartado > 0 ? num(r.apartado) : "—"}
              </span>
              <span className={`w-16 text-right shrink-0 ${r.en_camino > 0 ? "text-sky-700" : "text-gray-300"}`}>
                {r.en_camino > 0 ? num(r.en_camino) : "—"}
              </span>
              <span className="w-12 text-right text-gray-400 shrink-0">
                {r.supply_type === "PEDIDO" ? "—" : num(r.min_stock)}
              </span>
              <span className="w-[96px] shrink-0">
                <Pill tone={e.tone}>{e.label}</Pill>
              </span>
              <span className="w-16 text-right text-gray-500 shrink-0">{r.cost > 0 ? money(r.cost) : "—"}</span>
              <span className="w-20 text-right shrink-0">{r.supply_type === "PEDIDO" ? "—" : money(r.valor)}</span>
              <span className="w-7 flex justify-end">
                <button
                  onClick={() => setKardexId(r.id)}
                  title="Historial y ajuste"
                  aria-label={`Historial de ${r.code}`}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 group-hover:text-gray-500 hover:!text-brand-700 hover:bg-brand-50"
                >
                  <History size={13} />
                </button>
              </span>
            </div>
          );
        })}

        {rows.length > visibles && (
          <div className="flex justify-center py-2.5 border-b border-gray-100">
            <button
              onClick={() => setVisibles((v) => v + POR_PAGINA)}
              className="h-8 px-4 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700 shadow-sm"
            >
              Mostrar {Math.min(POR_PAGINA, rows.length - visibles)} más
              <span className="text-gray-400"> · faltan {rows.length - visibles}</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 text-[11.5px]">
          <span className="text-gray-400">clic en la descripcion abre el historial · ahi mismo ajustas la cantidad</span>
          <span className="ml-auto text-gray-500">
            valor en la vista <b className="font-medium text-gray-900">${money(totalVista)}</b>
          </span>
        </div>
      </div>

      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 pl-4 pr-1.5 py-1.5 rounded-2xl bg-gray-900 text-white shadow-pop print:hidden max-w-[calc(100vw-24px)] overflow-x-auto">
          <span className="text-[13px] whitespace-nowrap mr-2">
            <b className="font-semibold">{sel.size}</b> {sel.size === 1 ? "marcado" : "marcados"}
          </span>
          {sel.size === 1 && (
            <button onClick={verHistorial} className="h-8 px-2.5 rounded-lg text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap">
              <History size={14} /> Historial
            </button>
          )}
          <button
            onClick={() => cambiarTipo("ALMACEN")}
            title="Lo guardas en el estante: avisa cuando baja de su mínimo"
            className="h-8 px-2.5 rounded-lg text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Warehouse size={14} /> De almacén
          </button>
          <button
            onClick={() => cambiarTipo("PEDIDO")}
            title="Lo pides cuando lo vendes: no avisa agotado"
            className="h-8 px-2.5 rounded-lg text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ClipboardList size={14} /> Bajo pedido
          </button>
          <button
            onClick={() => setShowMinimos(true)}
            className="h-8 px-2.5 rounded-lg text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Calculator size={14} /> Mínimo
          </button>
          <button
            onClick={() => setShowAjuste(true)}
            className="h-8 px-2.5 rounded-lg text-[12.5px] hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <SlidersHorizontal size={14} /> Ajustar stock
          </button>
          <button onClick={() => setSel(new Set())} className="h-8 px-3 rounded-lg text-[12.5px] text-gray-300 hover:text-white hover:bg-white/10 whitespace-nowrap">
            Quitar
          </button>
        </div>
      )}

      {kardexId && (
        <KardexModal productId={kardexId} onClose={() => setKardexId(null)} onCambio={cargar} />
      )}

      {showAjuste && (
        <AjustarStock
          seleccion={Array.from(sel)}
          vista={rows}
          total={resumen?.total ?? rows.length}
          grupos={grupos}
          provs={provs}
          onClose={() => setShowAjuste(false)}
          onListo={() => {
            setSel(new Set());
            cargar();
          }}
        />
      )}

      {showImport && (
        <ImportarModal
          onClose={() => setShowImport(false)}
          onListo={() => {
            setShowImport(false);
            cargar();
          }}
        />
      )}
    </main>
  );
}

/* ================= minimos ================= */

function MinimosPanel({
  seleccionados,
  minimo,
  setMinimo,
  onAplicar,
  onSugerido,
  ids,
  enLista,
}: {
  seleccionados: number;
  minimo: number;
  setMinimo: (n: number) => void;
  onAplicar: () => void;
  onSugerido: (r: { actualizados: number; dias: number }) => void;
  ids: string[] | null;
  enLista: number;
}) {
  const [dias, setDias] = useState(15);
  const [busy, setBusy] = useState(false);

  async function sugerir() {
    setBusy(true);
    const d = Math.round(dias) || 15;
    const { data, error } = await supabase.rpc("suggest_min_stock", {
      p_ids: ids,
      p_dias_cobertura: d,
    });
    setBusy(false);
    if (error) return notify.error("No se pudieron calcular", error.message);
    const r = data as { actualizados: number };
    onSugerido({ actualizados: r.actualizados, dias: d });
  }

  return (
    <div className="mb-3 grid md:grid-cols-2 gap-3">
      <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4">
        <p className="text-[13px] font-medium text-gray-900 mb-0.5">Calcularlos solo</p>
        <p className="text-[11.5px] text-gray-500 mb-3">
          Mira lo que vendiste en los ultimos 90 dias y pone el minimo para que te alcance el tiempo que digas.
        </p>
        <div className="flex items-end gap-2">
          <Campo label="Que me alcance para (dias)">
            <NumInput value={dias} onChange={setDias} className={`${inputCls} w-28 text-right`} />
          </Campo>
          <button
            onClick={sugerir}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-brand-700 text-white text-sm hover:bg-brand-800 disabled:opacity-50"
          >
            {busy ? "Calculando..." : seleccionados > 0 ? `Calcular para ${seleccionados}` : "Calcular para todos"}
          </button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4">
        <p className="text-[13px] font-medium text-gray-900 mb-0.5">Ponerlo a mano</p>
        <p className="text-[11.5px] text-gray-500 mb-3">
          Se aplica a los que marques. Si no marcas ninguno, a todos los que estás viendo en la lista.
        </p>
        <div className="flex items-end gap-2">
          <Campo label="Minimo">
            <NumInput value={minimo} onChange={setMinimo} className={`${inputCls} w-28 text-right`} />
          </Campo>
          <button
            onClick={onAplicar}
            disabled={seleccionados === 0 && enLista === 0}
            className="h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            {seleccionados > 0 ? `Aplicar a ${seleccionados} marcados` : `Aplicar a los ${enLista} de la lista`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= historial del producto ================= */

function KardexModal({
  productId,
  onClose,
  onCambio,
}: {
  productId: string;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [k, setK] = useState<Kardex | null>(null);
  const [provs, setProvs] = useState<ProvInfo | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      supabase.rpc("product_moves", { p_product_id: productId, p_limit: 80 }),
      supabase.rpc("product_suppliers", { p_product_id: productId }),
    ]);
    if (r1.error) {
      setErr(r1.error.message);
      return;
    }
    setK(r1.data as Kardex);
    if (!r2.error) setProvs(r2.data as ProvInfo);
  }, [productId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ajustar() {
    const v = Number(nuevo.replace(",", "."));
    if (nuevo.trim() === "" || Number.isNaN(v)) {
      setErr("Escribe la cantidad real que contaste.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: productId,
      p_new_qty: v,
      p_reason: motivo || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setErr(null);
    notify.ok("Existencia ajustada", `Ahora hay ${num(v)}`);
    setNuevo("");
    setMotivo("");
    cargar();
    onCambio();
  }

  const dura = k && k.vendido_90d > 0 ? Math.round(k.stock / (k.vendido_90d / 90)) : null;

  return (
    <Lateral
      titulo={k?.description ?? "Cargando..."}
      arriba={
        k ? (
          <>
            <span className="text-[12px] font-mono text-gray-400">{k.code}</span>
            <Pill tone={k.supply_type === "PEDIDO" ? "violet" : "neutral"}>
              {k.supply_type === "PEDIDO" ? "bajo pedido" : "de almacen"}
            </Pill>
          </>
        ) : undefined
      }
      subtitulo="Existencia, ajuste y todos sus movimientos"
      icono={History}
      ancho="w-[620px]"
      onClose={onClose}
    >
      {k && (
        <div className="grid grid-cols-5 gap-2 mb-4">
          <Mini label="En el estante" valor={num(k.stock)} />
          <Mini label="Apartado / en camino" valor={`${num(k.apartado ?? 0)} / ${num(k.en_camino ?? 0)}`} />
          <Mini label="Mínimo" valor={k.supply_type === "PEDIDO" ? "—" : num(k.min_stock)} />
          <Mini label="Vendido 90 dias" valor={num(k.vendido_90d)} />
          <Mini
            label="Te alcanza para"
            valor={
              k.supply_type === "PEDIDO" ? "—" : dura !== null && dura >= 0 ? `${dura} dias` : "sin datos"
            }
            tono={dura !== null && dura < 15 ? "text-red-600" : undefined}
          />
        </div>
      )}

      <div className="flex gap-2 items-end mb-4 p-3 bg-gray-50 rounded-lg">
        <Campo label="Conte y hay">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-24 h-9 px-2.5 border border-gray-300 rounded-lg text-sm text-right bg-white"
          />
        </Campo>
        <Campo label="Motivo" className="flex-1">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="conteo fisico, rotura, regalo..."
            className={inputCls}
          />
        </Campo>
        <button
          onClick={ajustar}
          disabled={busy}
          className="h-9 px-4 rounded-lg bg-brand-700 text-white text-sm hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? "Ajustando..." : "Ajustar"}
        </button>
      </div>

      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

      {provs && (
        <div className="mb-4 border border-gray-200 rounded-lg p-3">
          <p className="text-[11px] text-gray-500 mb-2">A quien le compras este repuesto</p>
          {provs.habitual ? (
            <p className="text-[12.5px] mb-2">
              Habitual: <b className="font-medium">{provs.habitual.name}</b>
            </p>
          ) : (
            <p className="text-[12.5px] text-gray-400 mb-2">Sin proveedor habitual asignado</p>
          )}
          {provs.historial.length === 0 ? (
            <p className="text-[11.5px] text-gray-400">Todavia no hay compras registradas de este producto.</p>
          ) : (
            provs.historial.map((h) => (
              <div key={h.supplier_id} className="flex gap-2 text-[12px] py-1 border-t border-gray-50">
                <span className="flex-1 min-w-0 truncate">{h.name}</span>
                <span className="text-gray-500">{h.veces}x</span>
                <span className="text-gray-500 w-20 text-right">{h.ultima_fecha}</span>
                <span className="w-16 text-right">${money(h.ultimo_costo)}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex gap-2.5 px-1 py-1.5 border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
        <span className="w-14">fecha</span>
        <span className="w-[86px]">movimiento</span>
        <span className="flex-1 min-w-0">documento</span>
        <span className="w-10 text-right">entra</span>
        <span className="w-10 text-right">sale</span>
        <span className="w-12 text-right" title="estante menos apartado, después de cada movimiento">neto</span>
      </div>

      {!k && !err && <SkeletonRows rows={4} />}
      {k && k.movimientos.length === 0 && (
        <p className="py-6 text-sm text-gray-400 text-center">Todavia no hay movimientos de este producto.</p>
      )}

      {k?.movimientos.map((m) => (
        <div key={m.id} className="flex gap-2.5 items-center px-1 py-1.5 border-b border-gray-50 text-[12.5px]">
          <span className="w-14 text-gray-500">{m.move_date.slice(5)}</span>
          <span className="w-[86px]">
            <Pill tone={TIPOS_MOV[m.kind] ?? "neutral"}>{m.kind.toLowerCase()}</Pill>
          </span>
          <span className="flex-1 min-w-0 truncate text-gray-600">
            {m.sequence_number
              ? `nota ${m.sequence_number}${m.cliente ? ` · ${m.cliente}` : ""}`
              : m.factura
              ? `factura ${m.factura}${m.proveedor ? ` · ${m.proveedor}` : ""}`
              : m.reason ?? "—"}
          </span>
          <span className="w-10 text-right text-emerald-700">{m.quantity > 0 ? num(m.quantity) : "—"}</span>
          <span className="w-10 text-right text-red-600">{m.quantity < 0 ? num(-m.quantity) : "—"}</span>
          <span className="w-12 text-right">{num(m.saldo)}</span>
        </div>
      ))}
    </Lateral>
  );
}

function Mini({ label, valor, tono }: { label: string; valor: string; tono?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-[18px] font-semibold ${tono ?? "text-gray-900"}`}>{valor}</p>
    </div>
  );
}

/* ================= cargar cantidades ================= */

function ImportarModal({ onClose, onListo }: { onClose: () => void; onListo: () => void }) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"SET" | "ADD">("SET");
  const [prev, setPrev] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function lineas() {
    return texto
      .split("\n")
      .map((l) => l.replace(/[;,]/g, "\t").trimEnd())
      .filter((l) => l.trim() !== "");
  }

  // tambien se puede subir el archivo de Excel: se toman las dos primeras columnas
  async function subirArchivo(file: File) {
    setErr(null);
    try {
      const filas = await leerFilas(file);
      const datos = filas.filter((r) => r[0] && r[1] !== undefined);
      // si la primera fila es encabezado (la cantidad no es numero), se salta
      const inicio = datos.length > 0 && Number.isNaN(Number(String(datos[0][1]).replace(",", "."))) ? 1 : 0;
      setTexto(
        datos
          .slice(inicio)
          .map((r) => `${r[0]}\t${String(r[1]).replace(",", ".")}`)
          .join("\n")
      );
      setPrev(null);
      notify.ok("Archivo leido", `${datos.length - inicio} lineas`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  }

  async function revisar() {
    setErr(null);
    const ls = lineas();
    if (ls.length === 0) {
      setErr("Pega al menos una linea con codigo y cantidad, o sube el archivo.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("preview_stock_import", { p_lines: ls });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPrev((data ?? []) as PreviewRow[]);
  }

  async function aplicar() {
    if (!prev) return;
    const items = prev
      .filter((p) => p.found && p.quantity !== null)
      .map((p) => ({ code: p.code, quantity: p.quantity }));
    if (items.length === 0) {
      setErr("No hay ningun codigo reconocido para aplicar.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("import_stock", { p_items: items, p_mode: modo });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const r = data as { actualizados: number; no_encontrados: number };
    notify.ok(`${r.actualizados} productos actualizados`);
    onListo();
  }

  const encontrados = prev?.filter((p) => p.found).length ?? 0;
  const perdidos = prev?.filter((p) => !p.found).length ?? 0;

  return (
    <Ventana
      titulo="Cargar cantidades"
      subtitulo="Solo cambia los codigos que cargues; el resto de tu lista queda igual"
      icono={Upload}
      ancho="max-w-xl"
      onClose={onClose}
      pie={
        prev ? (
          <>
            <button
              onClick={() => setPrev(null)}
              className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
            >
              Volver
            </button>
            <button
              onClick={aplicar}
              disabled={busy || encontrados === 0}
              className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
            >
              {busy ? "Aplicando..." : `Aplicar a ${encontrados} productos`}
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
            <button
              onClick={revisar}
              disabled={busy}
              className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
            >
              {busy ? "Revisando..." : "Revisar antes de aplicar"}
            </button>
          </>
        )
      }
    >
      {!prev && (
        <>
          <label className="flex items-center justify-center gap-2 h-12 mb-3 rounded-lg border border-dashed border-gray-300 text-[13px] text-gray-500 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50/40 cursor-pointer">
            <FileSpreadsheet size={16} /> Subir archivo de Excel o CSV (codigo y cantidad)
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) subirArchivo(f);
              }}
            />
          </label>
          <p className="text-[11px] text-gray-500 mb-1">o copia dos columnas de Excel y pegalas aqui</p>
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPrev(null);
            }}
            rows={7}
            placeholder={"2-2-G20\t48\nY-E-GUT-20\t3\n706213-X\t0"}
            className="w-full p-2.5 border border-gray-300 rounded-lg text-[12.5px] font-mono mb-3"
          />

          <Campo label="Que hago con esa cantidad">
            <Segmento
              valor={modo}
              onChange={setModo}
              opciones={[
                { k: "SET", l: "dejar esa cantidad exacta" },
                { k: "ADD", l: "sumarla a lo que hay" },
              ]}
            />
          </Campo>
        </>
      )}

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {prev && (
        <>
          <div className="flex gap-2 mb-2">
            <Pill tone="success">{encontrados} encontrados</Pill>
            <Pill tone={perdidos > 0 ? "warning" : "neutral"}>{perdidos} no encontrados</Pill>
            <Pill tone="brand">{modo === "SET" ? "cantidad exacta" : "se suma"}</Pill>
          </div>
          <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
            {prev.map((p, i) => (
              <div
                key={`${p.code}-${i}`}
                className={`flex gap-2.5 px-2.5 py-1.5 text-[12px] border-b border-gray-50 last:border-0 ${
                  p.found ? "" : "bg-amber-50"
                }`}
              >
                <span className="w-[90px] font-mono text-[10.5px] text-gray-500 truncate">{p.code}</span>
                <span className="flex-1 min-w-0 truncate text-gray-700">
                  {p.found ? p.description : "no esta en tu lista de productos"}
                </span>
                {p.found && <span className="w-16 text-right text-gray-400">hoy {num(p.current_stock)}</span>}
                <span className="w-12 text-right font-medium">{num(p.quantity)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Ventana>
  );
}

/* ============================================================
   AJUSTAR STOCK DE MUCHOS A LA VEZ
   1) a cuales  2) que hacer  3) vista previa  -> aplicar
   Queda en el historial de cada repuesto y se puede deshacer.
   ============================================================ */

type Ajuste = { id: string; fecha: string; motivo: string; productos: number; deshecho: boolean };

function AjustarStock({
  seleccion,
  vista,
  total,
  grupos,
  provs,
  onClose,
  onListo,
}: {
  seleccion: string[];
  vista: StockRow[];
  total: number;
  grupos: { category: string; total: number }[];
  provs: { id: string; name: string; total: number }[];
  onClose: () => void;
  onListo: () => void;
}) {
  type Cuales = "marcados" | "vista" | "todos" | "grupo" | "proveedor" | "tipo";
  const [cuales, setCuales] = useState<Cuales>(seleccion.length ? "marcados" : "vista");
  const [valorFiltro, setValorFiltro] = useState("");
  const [idsFiltro, setIdsFiltro] = useState<string[] | null>(null);
  const [modo, setModo] = useState<"CERO" | "FIJAR" | "SUMAR">("CERO");
  const [cant, setCant] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);

  const cargarAjustes = useCallback(async () => {
    const { data } = await supabase.rpc("ultimos_ajustes_lote");
    setAjustes(((data ?? []) as Ajuste[]).slice(0, 4));
  }, []);
  useEffect(() => {
    cargarAjustes();
  }, [cargarAjustes]);

  // ids de grupo / proveedor / tipo
  useEffect(() => {
    setIdsFiltro(null);
    if (!["grupo", "proveedor", "tipo"].includes(cuales) || !valorFiltro) return;
    supabase
      .rpc("stock_ids_by", {
        p_category: cuales === "grupo" ? valorFiltro : null,
        p_supplier_id: cuales === "proveedor" ? valorFiltro : null,
        p_supply_type: cuales === "tipo" ? valorFiltro : null,
      })
      .then(({ data }) => setIdsFiltro(((data ?? []) as { id: string }[]).map((x) => x.id)));
  }, [cuales, valorFiltro]);

  const ids: string[] | null =
    cuales === "marcados"
      ? seleccion
      : cuales === "vista"
      ? vista.map((r) => r.id)
      : cuales === "todos"
      ? null
      : idsFiltro ?? [];
  const cuantos = ids === null ? total : ids.length;

  const nuevo = (r: StockRow) => (modo === "CERO" ? 0 : modo === "FIJAR" ? cant : r.stock + cant);
  const muestra = useMemo(() => {
    const set = ids ? new Set(ids) : null;
    return vista.filter((r) => !set || set.has(r.id)).slice(0, 4);
  }, [ids, vista]);

  async function aplicar() {
    if (cuantos === 0) return notify.aviso("No hay repuestos elegidos");
    if (modo === "FIJAR" && cant < 0) return notify.aviso("La cantidad no puede ser negativa");
    if (modo === "SUMAR" && cant === 0) return notify.aviso("Escribe cuánto sumar o restar");
    const que =
      modo === "CERO" ? "poner en 0" : modo === "FIJAR" ? `poner en ${num(cant)}` : `${cant > 0 ? "sumar" : "restar"} ${num(Math.abs(cant))}`;
    const ok = await confirmar({
      titulo: `¿${que.charAt(0).toUpperCase() + que.slice(1)} el stock de ${cuantos} repuestos?`,
      mensaje: "Queda anotado en el historial de cada repuesto. Si te equivocas, lo deshaces desde aquí mismo.",
      textoSi: "Sí, aplicar",
      peligro: modo === "CERO",
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("ajustar_stock_lote", {
      p_ids: ids ?? [],
      p_todos: ids === null,
      p_modo: modo,
      p_cantidad: modo === "CERO" ? 0 : cant,
      p_motivo: null,
    });
    setBusy(false);
    if (error) return notify.error("No se pudo ajustar", error.message);
    const r = data as { productos: number };
    notify.ok(r.productos ? `Stock ajustado en ${r.productos} repuestos` : "No había nada que cambiar");
    cargarAjustes();
    onListo();
  }

  async function deshacer(a: Ajuste) {
    const ok = await confirmar({
      titulo: "¿Deshacer este ajuste?",
      mensaje: `${a.motivo} · ${a.productos} repuestos vuelven a como estaban.`,
      textoSi: "Sí, deshacer",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("deshacer_ajuste_lote", { p_lote: a.id });
    if (error) return notify.error("No se pudo deshacer", error.message);
    notify.ok("Ajuste deshecho");
    cargarAjustes();
    onListo();
  }

  const opcion = (k: Cuales, t: string, n?: number) => (
    <button
      key={k}
      onClick={() => {
        setCuales(k);
        setValorFiltro("");
      }}
      className={`h-8 px-3 rounded-lg text-[12.5px] border whitespace-nowrap ${
        cuales === k ? "border-brand-300 bg-brand-50 text-brand-800 font-medium" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      }`}
    >
      {t}
      {n !== undefined && <span className="text-gray-400"> ({n})</span>}
    </button>
  );

  return (
    <Ventana
      titulo="Ajustar stock"
      subtitulo="Cambia la cantidad de muchos repuestos a la vez"
      icono={SlidersHorizontal}
      ancho="max-w-xl"
      onClose={onClose}
      pie={
        <>
          <span className="mr-auto text-[12.5px] text-gray-500">
            Cambia <b className="font-medium text-gray-900">{cuantos}</b> repuestos
          </span>
          <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
            Cerrar
          </button>
          <button
            onClick={aplicar}
            disabled={busy || cuantos === 0}
            className="h-9 px-4 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            Aplicar
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <p className="text-[13px] font-medium text-gray-900 mb-2">1. ¿A cuáles repuestos?</p>
          <div className="flex flex-wrap gap-1.5">
            {seleccion.length > 0 && opcion("marcados", "Los que marqué", seleccion.length)}
            {opcion("vista", "Los de la lista", vista.length)}
            {opcion("todos", "Todos", total)}
            {opcion("grupo", "Un grupo")}
            {opcion("proveedor", "Un proveedor")}
            {opcion("tipo", "Por tipo")}
          </div>
          {cuales === "grupo" && (
            <select value={valorFiltro} onChange={(e) => setValorFiltro(e.target.value)} className={`${inputCls} mt-2`}>
              <option value="">Elige el grupo…</option>
              {grupos.map((g) => (
                <option key={g.category} value={g.category}>
                  {g.category} ({g.total})
                </option>
              ))}
            </select>
          )}
          {cuales === "proveedor" && (
            <select value={valorFiltro} onChange={(e) => setValorFiltro(e.target.value)} className={`${inputCls} mt-2`}>
              <option value="">Elige el proveedor…</option>
              {provs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.total})
                </option>
              ))}
            </select>
          )}
          {cuales === "tipo" && (
            <select value={valorFiltro} onChange={(e) => setValorFiltro(e.target.value)} className={`${inputCls} mt-2`}>
              <option value="">Elige el tipo…</option>
              <option value="ALMACEN">De almacén</option>
              <option value="PEDIDO">Bajo pedido</option>
            </select>
          )}
        </section>

        <section>
          <p className="text-[13px] font-medium text-gray-900 mb-2">2. ¿Qué hacer?</p>
          <Segmento
            opciones={[
              { k: "CERO", l: "Poner en 0" },
              { k: "FIJAR", l: "Poner una cantidad" },
              { k: "SUMAR", l: "Sumar o restar" },
            ]}
            valor={modo}
            onChange={setModo}
          />
          {modo !== "CERO" && (
            <div className="mt-2 flex items-center gap-2">
              <NumInput
                value={cant}
                onChange={setCant}
                className="w-28 h-9 px-2 border border-gray-200 rounded-lg text-[14px] text-right"
                ariaLabel="Cantidad"
              />
              <span className="text-[12px] text-gray-500">
                {modo === "FIJAR" ? "cada repuesto queda con esta cantidad" : "usa un número negativo para restar"}
              </span>
            </div>
          )}
        </section>

        <section>
          <p className="text-[13px] font-medium text-gray-900 mb-2">3. Así quedaría</p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {muestra.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-gray-100 first:border-t-0 text-[12.5px]">
                <span className="font-mono text-[11px] text-gray-500 w-24 truncate">{r.code}</span>
                <span className="flex-1 min-w-0 truncate">{r.description}</span>
                <span className="text-gray-500">{num(r.stock)}</span>
                <span className="text-gray-300">→</span>
                <span className="font-medium text-gray-900 w-12 text-right">{num(nuevo(r))}</span>
              </div>
            ))}
            {cuantos > muestra.length && (
              <p className="px-3 py-2 border-t border-gray-100 text-[12px] text-gray-500">
                y {cuantos - muestra.length} repuestos más…
              </p>
            )}
            {cuantos === 0 && <p className="px-3 py-3 text-[12px] text-gray-500">Todavía no hay repuestos elegidos.</p>}
          </div>
        </section>

        {ajustes.length > 0 && (
          <section>
            <p className="text-[12px] text-gray-500 mb-1.5">Últimos ajustes</p>
            {ajustes.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1 text-[12px]">
                <span className="text-gray-400 w-24">{new Date(a.fecha).toLocaleDateString("es-VE")}</span>
                <span className="flex-1 min-w-0 truncate text-gray-700">
                  {a.motivo} · {a.productos} repuestos
                </span>
                {a.deshecho ? (
                  <span className="text-gray-400">deshecho</span>
                ) : (
                  <button onClick={() => deshacer(a)} className="text-brand-700 hover:underline inline-flex items-center gap-1">
                    <Undo2 size={12} /> Deshacer
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </Ventana>
  );
}
