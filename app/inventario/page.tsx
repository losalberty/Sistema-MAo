"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  notify,
  type PillTone,
} from "@/components/ui";
import { Barra, Campo, Encabezado, Segmento, Tarjeta, Ventana, descargarExcel, inputCls } from "@/components/Ventana";
import { leerFilas } from "@/components/Excel";

type StockRow = {
  id: string;
  code: string;
  description: string;
  brand: string | null;
  category: string | null;
  supply_type: string;
  stock: number;
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
    notify.ok(`${sel.size} productos marcados ${tipo === "PEDIDO" ? "bajo pedido" : "de almacen"}`);
    setSel(new Set());
    cargar();
  }

  async function aplicarMinimo() {
    if (!necesitaSeleccion("ponerles un minimo")) return;
    const { error } = await supabase.rpc("set_min_stock", {
      p_ids: Array.from(sel),
      p_min: minimo,
    });
    if (error) return notify.error("No se pudo aplicar", error.message);
    notify.ok(`Minimo de ${num(minimo)} puesto en ${sel.size} productos`);
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
      <Encabezado titulo="Inventario">{rows.length} productos en la vista</Encabezado>

      <Barra>
        <ToolbarButton icon={Upload} label="cargar cantidades" tone="brand" onClick={() => setShowImport(true)} />
        <ToolbarButton icon={History} label="ver historial" onClick={verHistorial} />
        <ToolbarSeparator />
        <ToolbarButton icon={Warehouse} label="de almacen" onClick={() => cambiarTipo("ALMACEN")} />
        <ToolbarButton icon={ClipboardList} label="bajo pedido" onClick={() => cambiarTipo("PEDIDO")} />
        <ToolbarButton
          icon={Calculator}
          label="minimos"
          active={showMinimos}
          onClick={() => setShowMinimos((v) => !v)}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={ShoppingCart} label="hacer pedido" tone="success" onClick={() => router.push("/pedidos")} />
        <ToolbarButton icon={Package} label="productos" onClick={() => router.push("/productos")} />
        <ToolbarSeparator />
        <ToolbarButton icon={FileSpreadsheet} label="excel" onClick={exportar} />
        <ToolbarButton icon={Printer} label="imprimir" onClick={() => window.print()} />
      </Barra>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Tarjeta
            label="Valor del inventario"
            valor={`$${money(resumen.valor)}`}
            sub={`${resumen.almacen} de almacen`}
            icono={DollarSign}
            acento="bg-brand-50 text-brand-700"
          />
          <Tarjeta
            label="Por reponer"
            valor={String(resumen.reponer)}
            tono="text-amber-700"
            sub="bajo el minimo"
            icono={ArrowDownToLine}
            acento="bg-amber-50 text-amber-700"
          />
          <Tarjeta
            label="Agotados"
            valor={String(resumen.agotados)}
            tono="text-red-600"
            sub="de almacen, en cero"
            icono={AlertOctagon}
            acento="bg-red-50 text-red-600"
          />
          <Tarjeta
            label="Bajo pedido"
            valor={String(resumen.pedido)}
            tono="text-violet-700"
            sub="no alertan"
            icono={ClipboardList}
            acento="bg-violet-50 text-violet-700"
          />
        </div>
      )}

      {showMinimos && (
        <MinimosPanel
          seleccionados={sel.size}
          minimo={minimo}
          setMinimo={setMinimo}
          onAplicar={aplicarMinimo}
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
              { k: "TODOS", l: "todos", title: "toda tu lista" },
              { k: "REPONER", l: "por reponer", title: "bajaron de su minimo — hay que comprar" },
              { k: "AGOTADO", l: "agotados", title: "de almacen y en cero" },
              { k: "PEDIDO", l: "bajo pedido", title: "los que le pides al proveedor" },
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
            aria-label="Seleccionar todo lo que veo"
          />
          <span className="w-[92px]">codigo</span>
          <span className="flex-1 min-w-0">descripcion</span>
          <span className="w-14 text-right">stock</span>
          <span className="w-12 text-right">min</span>
          <span className="w-[96px]">estado</span>
          <span className="w-16 text-right">costo</span>
          <span className="w-20 text-right">valor</span>
          <span className="w-7" />
        </div>

        {cargando && rows.length === 0 && <SkeletonRows rows={8} />}

        {!cargando && rows.length === 0 && (
          <EmptyState
            icon={filtro === "AGOTADO" ? Boxes : PackageSearch}
            title={
              filtro === "REPONER"
                ? "Ningun producto esta por debajo de su minimo"
                : filtro === "AGOTADO"
                ? "No tienes productos de almacen en cero"
                : filtro === "PEDIDO"
                ? "Todavia no hay productos bajo pedido"
                : "No hay productos que coincidan"
            }
          >
            {filtro === "REPONER"
              ? 'Si todos tus minimos estan en cero, este filtro nunca muestra nada. Usa el boton "minimos" y el sistema los calcula segun lo que vendes.'
              : filtro === "PEDIDO"
              ? 'Marca los que no tienes en fisico y le pides al proveedor, y dale a "bajo pedido". Esos dejan de alertarte por estar en cero.'
              : filtro === "AGOTADO"
              ? "Bien ahi."
              : 'Si aun no has cargado cantidades, usa el boton "cargar cantidades".'}
          </EmptyState>
        )}

        {rows.slice(0, visibles).map((r, idx) => {
          const e = ESTADOS[r.estado] ?? ESTADOS.OK;
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
                  r.estado === "AGOTADO"
                    ? "text-red-600"
                    : r.estado === "REPONER"
                    ? "text-amber-700"
                    : r.stock < 0
                    ? "text-violet-700"
                    : "text-gray-900"
                }`}
              >
                {num(r.stock)}
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

      {kardexId && (
        <KardexModal productId={kardexId} onClose={() => setKardexId(null)} onCambio={cargar} />
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
}: {
  seleccionados: number;
  minimo: number;
  setMinimo: (n: number) => void;
  onAplicar: () => void;
  onSugerido: (r: { actualizados: number; dias: number }) => void;
  ids: string[] | null;
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
          Marca los productos en la lista y escribe el minimo que quieres para todos ellos.
        </p>
        <div className="flex items-end gap-2">
          <Campo label="Minimo">
            <NumInput value={minimo} onChange={setMinimo} className={`${inputCls} w-28 text-right`} />
          </Campo>
          <button
            onClick={onAplicar}
            disabled={seleccionados === 0}
            className="h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            Aplicar a {seleccionados} marcados
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
    <Ventana
      titulo={k?.description ?? "Cargando..."}
      subtitulo={k ? `${k.code} · ${k.supply_type === "PEDIDO" ? "bajo pedido" : "de almacen"}` : undefined}
      icono={History}
      ancho="max-w-2xl"
      onClose={onClose}
    >
      {k && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Mini label="Existencia" valor={num(k.stock)} />
          <Mini label="Minimo" valor={k.supply_type === "PEDIDO" ? "—" : num(k.min_stock)} />
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
        <span className="w-12 text-right">saldo</span>
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
    </Ventana>
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
