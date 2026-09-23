"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  History,
  Package,
  PackagePlus,
  Pencil,
  Percent,
  Search,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
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
import { Barra, Campo, Encabezado, IconBtn, Segmento, Ventana, descargarExcel, inputCls } from "@/components/Ventana";
import { comoObjetos, leerFilas } from "@/components/Excel";

type ProductRow = {
  id: string;
  code: string;
  description: string;
  brand: string | null;
  category: string | null;
  price_1: number;
  price_2: number | null;
  price_3: number | null;
  price_4: number | null;
  has_stock_control: boolean;
  stock_quantity: number | null;
  price_list: string | null;
  cost: number | null;
  purchase_price: number | null;
  discount_percent: number | null;
  supplier_id: string | null;
};

type PriceList = { price_list: string; total: number };
type Category = { category: string; total: number };
type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  contact: string | null;
  notes: string | null;
  total: number;
};

type SaleItem = {
  code: string;
  description: string;
  brand: string;
  category: string;
  price_1: string;
  price_2: string;
};

type CostItem = {
  code: string;
  purchase_price: string;
  discount_percent: string;
};

type SalePreview = {
  file_total: number;
  matched: number;
  new: number;
  existing_total: number;
  untouched: number;
};

type CostPreview = {
  file_total: number;
  matched: number;
  orphans: number;
  products: number;
  with_cost_before: number;
  without_cost_after: number;
};

type CostHistory = {
  invoice_date: string;
  supplier: string;
  list_price: number;
  discount_percent: number;
  unit_cost: number;
  quantity: number;
};

const emptyForm = {
  code: "",
  description: "",
  brand: "",
  category: "",
  price_1: "0",
  price_2: "",
  price_3: "",
  price_4: "",
  price_list: "Lista principal",
  purchase_price: "",
  discount_percent: "0",
  cost: "0",
};

const TIER_LABELS: Record<number, string> = {
  1: "Contado",
  2: "Credito",
  3: "Tarifa 3",
  4: "Tarifa 4",
};

const POR_PAGINA = 300;

// acepta "12,50" y "12.50"
function toNum(s: string) {
  const n = Number(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function priceFor(p: ProductRow, tier: number): number | null {
  const v = tier === 4 ? p.price_4 : tier === 3 ? p.price_3 : tier === 2 ? p.price_2 : p.price_1;
  return v == null ? null : Number(v);
}

function marginOf(p: ProductRow, tier: number): number | null {
  const cost = Number(p.cost ?? 0);
  const sale = priceFor(p, tier);
  if (cost <= 0 || sale == null || sale <= 0) return null;
  return ((sale - cost) / cost) * 100;
}

function marginTone(m: number | null) {
  if (m == null) return "text-gray-300";
  if (m < 15) return "text-red-600";
  if (m < 30) return "text-amber-600";
  return "text-emerald-700";
}

function m2(n: number | null | undefined) {
  return n == null ? "—" : `$${Number(n).toFixed(2)}`;
}

export default function ProductosPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(POR_PAGINA);

  const [view, setView] = useState<"venta" | "compra">("venta");
  const [tier, setTier] = useState(1);

  const [form, setForm] = useState<{ p: ProductRow | null } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showDescuento, setShowDescuento] = useState(false);
  const [showBorrarTodo, setShowBorrarTodo] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  // proveedores
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");

  const load = useCallback(async (text: string, list: string, cat: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_products", {
      search_text: text,
      p_price_list: list,
      p_category: cat,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setProducts((data ?? []) as ProductRow[]);
    setSelected(new Set());
  }, []);

  const loadLists = useCallback(async () => {
    const [{ data: pl }, { data: ct }, { data: sp }] = await Promise.all([
      supabase.rpc("list_price_lists"),
      supabase.rpc("list_categories"),
      supabase.rpc("list_suppliers"),
    ]);
    setPriceLists((pl ?? []) as PriceList[]);
    setCategories((ct ?? []) as Category[]);
    setSuppliers((sp ?? []) as Supplier[]);
  }, []);

  const recargar = useCallback(() => {
    load(search.trim(), listFilter, catFilter);
    loadLists();
  }, [load, loadLists, search, listFilter, catFilter]);

  // espera a que termines de escribir antes de buscar
  const primera = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load(search.trim(), listFilter, catFilter), primera.current ? 0 : 250);
    primera.current = false;
    return () => clearTimeout(t);
  }, [search, listFilter, catFilter, load]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    setVisibles(POR_PAGINA);
  }, [search, listFilter, catFilter]);

  const supplierName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of suppliers) map[s.id] = s.name;
    return map;
  }, [suppliers]);

  async function assignSupplier() {
    if (!supplierId || selected.size === 0) return;
    setWorking(true);
    const { data, error } = await supabase.rpc("set_supplier", {
      p_ids: Array.from(selected),
      p_supplier_id: supplierId,
    });
    setWorking(false);
    if (error) return notify.error("No se pudo asignar", error.message);
    notify.ok(`${data} producto(s) asignados a ${supplierName[supplierId]}`);
    recargar();
  }

  // ---------- resumen de margen ----------

  const summary = useMemo(() => {
    let withCost = 0;
    let low = 0;
    const margins: number[] = [];
    for (const p of products) {
      const m = marginOf(p, tier);
      if (Number(p.cost ?? 0) > 0) withCost++;
      if (m != null) {
        margins.push(m);
        if (m < 15) low++;
      }
    }
    const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
    return { withCost, without: products.length - withCost, avg, low };
  }, [products, tier]);

  // ---------- seleccion ----------

  const allSelected = products.length > 0 && selected.size === products.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  }

  function unoMarcado(accion: string): ProductRow | null {
    const marcados = products.filter((p) => selected.has(p.id));
    if (marcados.length === 1) return marcados[0];
    notify.info(
      marcados.length === 0 ? "Marca un producto primero" : "Marca solo un producto",
      `Para ${accion}, marca la casilla del producto (o haz doble clic en la fila).`
    );
    return null;
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      notify.info("Marca los productos que quieres eliminar");
      return;
    }
    const ok = await confirmar({
      titulo: `¿Eliminar ${ids.length} producto(s)?`,
      mensaje: "Las notas y facturas viejas los conservan con su codigo y descripcion. Esta accion no se puede deshacer.",
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    setWorking(true);
    const { data, error } = await supabase.rpc("delete_products", { p_ids: ids });
    setWorking(false);
    if (error) return notify.error("No se pudo eliminar", error.message);
    notify.ok(`${data} producto(s) eliminado(s)`);
    recargar();
  }

  async function remove(p: ProductRow) {
    const ok = await confirmar({
      titulo: `¿Eliminar ${p.code}?`,
      mensaje: "Las notas viejas lo conservan con su codigo y descripcion.",
      detalle: p.description,
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_product", { p_id: p.id });
    if (error) return notify.error("No se pudo eliminar", error.message);
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    notify.ok(`${p.code} eliminado`);
    loadLists();
  }

  function exportar() {
    descargarExcel(
      "productos",
      [
        "codigo",
        "descripcion",
        "marca",
        "grupo",
        "lista",
        "contado",
        "credito",
        "tarifa 3",
        "tarifa 4",
        "compra",
        "descuento",
        "costo",
        "proveedor",
      ],
      products.map((p) => [
        p.code,
        p.description,
        p.brand ?? "",
        p.category ?? "",
        p.price_list ?? "",
        Number(p.price_1 ?? 0).toFixed(2),
        p.price_2 != null ? Number(p.price_2).toFixed(2) : "",
        p.price_3 != null ? Number(p.price_3).toFixed(2) : "",
        p.price_4 != null ? Number(p.price_4).toFixed(2) : "",
        p.purchase_price != null ? Number(p.purchase_price).toFixed(2) : "",
        Number(p.discount_percent ?? 0),
        Number(p.cost ?? 0).toFixed(2),
        p.supplier_id ? supplierName[p.supplier_id] ?? "" : "",
      ])
    );
    notify.ok("Archivo descargado", `${products.length} productos`);
  }

  const compra = view === "compra";

  return (
    <main className="p-6 max-w-[1180px] pb-24">
      <Encabezado
        titulo="Productos"
        derecha={
          <Segmento
            valor={view}
            onChange={setView}
            opciones={[
              { k: "venta", l: "Precios de venta" },
              { k: "compra", l: "Costos y margen" },
            ]}
          />
        }
      >
        {products.length} productos
        {compra && (
          <>
            {" · "}
            {summary.avg != null ? <span>margen promedio {summary.avg.toFixed(0)}%</span> : <span>sin costos cargados</span>}
            {summary.without > 0 && <span className="text-amber-700"> · {summary.without} sin costo</span>}
            {summary.low > 0 && <span className="text-red-600"> · {summary.low} bajo 15%</span>}
          </>
        )}
      </Encabezado>

      <Barra>
        <ToolbarButton icon={PackagePlus} label="nuevo producto" tone="brand" onClick={() => setForm({ p: null })} />
        <ToolbarButton
          icon={Pencil}
          label="editar"
          onClick={() => {
            const p = unoMarcado("editarlo");
            if (p) setForm({ p });
          }}
        />
        <ToolbarButton icon={Trash2} label="eliminar" tone="danger" onClick={deleteSelected} />
        <ToolbarSeparator />
        <ToolbarButton icon={Upload} label={compra ? "importar costos" : "importar lista"} onClick={() => setShowImport(true)} />
        <ToolbarButton icon={FileSpreadsheet} label="exportar excel" onClick={exportar} />
        <ToolbarSeparator />
        <ToolbarButton
          icon={Percent}
          label="descuento proveedor"
          active={showDescuento}
          onClick={() => {
            setView("compra");
            setShowDescuento((v) => !v);
          }}
        />
      </Barra>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {compra && showDescuento && (
        <DescuentoPanel
          seleccionados={selected}
          catFilter={catFilter}
          onListo={() => load(search.trim(), listFilter, catFilter)}
        />
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <div className="flex flex-wrap gap-2 items-center p-2.5 border-b border-gray-100">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por codigo, descripcion, marca o grupo"
              className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[13px]"
            />
          </div>
          <select
            className="h-8 px-2 border border-gray-200 rounded-lg text-[12.5px] max-w-[220px] bg-white"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="">Todos los grupos</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.total})
              </option>
            ))}
          </select>
          {priceLists.length > 1 && (
            <select
              className="h-8 px-2 border border-gray-200 rounded-lg text-[12.5px] max-w-[200px] bg-white"
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
            >
              <option value="">Todas las listas ({priceLists.reduce((s, l) => s + Number(l.total), 0)})</option>
              {priceLists.map((l) => (
                <option key={l.price_list} value={l.price_list}>
                  {l.price_list} ({l.total})
                </option>
              ))}
            </select>
          )}
          {compra && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
              margen contra
              <Segmento
                valor={String(tier)}
                onChange={(k) => setTier(Number(k))}
                opciones={[1, 2, 3, 4].map((t) => ({ k: String(t), l: TIER_LABELS[t] }))}
              />
            </span>
          )}
        </div>

        <div className="flex gap-2.5 items-center px-3 py-1.5 border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-3 h-3 shrink-0 accent-brand-700"
            aria-label="Seleccionar todo"
          />
          <span className="w-28">codigo</span>
          <span className="flex-1 min-w-0">descripcion</span>
          {compra ? (
            <>
              <span className="w-32">proveedor</span>
              <span className="w-20 text-right">lista</span>
              <span className="w-12 text-right">dto</span>
              <span className="w-20 text-right">costo</span>
              <span className="w-20 text-right">{TIER_LABELS[tier]}</span>
              <span className="w-16 text-right">margen</span>
            </>
          ) : (
            <>
              <span className="w-24">marca</span>
              <span className="w-36">grupo</span>
              <span className="w-20 text-right">contado</span>
              <span className="w-20 text-right">credito</span>
            </>
          )}
          <span className="w-[60px]" />
        </div>

        {loading && products.length === 0 && <SkeletonRows rows={8} />}

        {!loading && products.length === 0 && (
          <EmptyState icon={Package} title={search || catFilter ? "No hay productos que coincidan" : "Aun no hay productos"}>
            {search || catFilter
              ? "Prueba con otra palabra o quita el filtro de grupo."
              : "Crea uno con el boton nuevo producto, o importa tu lista de Excel."}
          </EmptyState>
        )}

        {products.slice(0, visibles).map((p, idx) => {
          const isSel = selected.has(p.id);
          const m = marginOf(p, tier);
          const sale = priceFor(p, tier);
          return (
            <div
              key={p.id}
              onDoubleClick={() => setForm({ p })}
              className={`group flex gap-2.5 items-center px-3 h-9 border-b border-gray-50 text-[12.5px] ${
                isSel ? "bg-brand-50/70" : idx % 2 ? "bg-gray-50/40 hover:bg-gray-50" : "hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggleOne(p.id)}
                className="w-3 h-3 shrink-0 accent-brand-700"
                aria-label={`Seleccionar ${p.code}`}
              />
              <span className="w-28 font-mono text-[10.5px] text-gray-500 truncate">{p.code}</span>
              <span className="flex-1 min-w-0 truncate text-gray-800">{p.description}</span>
              {compra ? (
                <>
                  <span className="w-32 truncate text-[11.5px] text-gray-500">
                    {p.supplier_id ? supplierName[p.supplier_id] ?? "—" : "—"}
                  </span>
                  <span className="w-20 text-right text-gray-500">{p.purchase_price ? m2(p.purchase_price) : "—"}</span>
                  <span className="w-12 text-right text-gray-500">
                    {Number(p.discount_percent) > 0 ? `${Number(p.discount_percent)}%` : "—"}
                  </span>
                  <span className="w-20 text-right">{Number(p.cost) > 0 ? m2(p.cost) : "—"}</span>
                  <span className="w-20 text-right text-gray-500">{sale != null ? m2(sale) : "—"}</span>
                  <span className={`w-16 text-right font-medium ${marginTone(m)}`}>
                    {m != null ? `${m.toFixed(0)}%` : "sin costo"}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-24 truncate text-gray-600 text-[11.5px]">{p.brand || "—"}</span>
                  <span className="w-36 truncate text-gray-500 text-[11.5px]">{p.category || "—"}</span>
                  <span className="w-20 text-right font-medium text-gray-900">{m2(p.price_1)}</span>
                  <span className="w-20 text-right text-gray-500">{p.price_2 != null ? m2(p.price_2) : "—"}</span>
                </>
              )}
              <span className="w-[60px] flex justify-end gap-0.5 opacity-40 group-hover:opacity-100">
                <IconBtn title="Editar" onClick={() => setForm({ p })}>
                  <Pencil size={13} />
                </IconBtn>
                <IconBtn title="Eliminar" tone="danger" onClick={() => remove(p)}>
                  <Trash2 size={13} />
                </IconBtn>
              </span>
            </div>
          );
        })}

        {products.length > visibles && (
          <div className="flex justify-center py-2.5 border-b border-gray-100">
            <button
              onClick={() => setVisibles((v) => v + POR_PAGINA)}
              className="h-8 px-4 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700 shadow-sm"
            >
              Mostrar {Math.min(POR_PAGINA, products.length - visibles)} más
              <span className="text-gray-400"> · faltan {products.length - visibles}</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 text-[11.5px]">
          <span className="text-gray-400">doble clic en una fila para editar</span>
          {products.length > 0 && selected.size === 0 && (
            <button
              onClick={() => setShowBorrarTodo(true)}
              className="ml-auto text-gray-400 hover:text-red-600"
            >
              Eliminar toda la lista de productos
            </button>
          )}
        </div>
      </div>

      {/* barra flotante de seleccion */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-full pl-5 pr-2 py-2 shadow-pop">
            <span className="text-sm">{selected.size} seleccionados</span>
            {compra && suppliers.length > 0 && (
              <span className="flex items-center gap-2 pl-3 border-l border-gray-700">
                <Truck size={14} className="text-gray-400" />
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="text-sm bg-gray-800 border border-gray-700 rounded-md px-2 py-1"
                >
                  <option value="">Proveedor...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={assignSupplier}
                  disabled={working || !supplierId}
                  className="text-sm text-gray-200 hover:text-white disabled:opacity-30"
                >
                  Asignar
                </button>
              </span>
            )}
            <button
              onClick={deleteSelected}
              disabled={working}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-sm text-red-300 hover:text-red-200 hover:bg-white/5 disabled:opacity-40"
            >
              <Trash2 size={14} /> Eliminar
            </button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Quitar seleccion"
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {form && (
        <FormProducto
          p={form.p}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            recargar();
          }}
        />
      )}

      {showImport && (
        <ImportarModal
          compra={compra}
          suppliers={suppliers}
          supplierName={supplierName}
          onSupplierCreated={loadLists}
          onClose={() => setShowImport(false)}
          onListo={() => {
            setShowImport(false);
            recargar();
          }}
        />
      )}

      {showBorrarTodo && (
        <BorrarTodo
          total={products.length}
          onClose={() => setShowBorrarTodo(false)}
          onListo={() => {
            setShowBorrarTodo(false);
            recargar();
          }}
        />
      )}
    </main>
  );
}

/* ============================================================
   Descuento del proveedor (vista de costos)
   ============================================================ */

function DescuentoPanel({
  seleccionados,
  catFilter,
  onListo,
}: {
  seleccionados: Set<string>;
  catFilter: string;
  onListo: () => void;
}) {
  const [pct, setPct] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  async function aplicar(scope: "selected" | "category" | "all") {
    if (pct < 0 || pct > 99) return notify.error("El descuento debe estar entre 0 y 99");
    const target =
      scope === "selected"
        ? `${seleccionados.size} producto(s) marcados`
        : scope === "category"
        ? `todo el grupo "${catFilter}"`
        : "TODOS los productos";
    const ok = await confirmar({
      titulo: `¿Aplicar ${pct}% de descuento?`,
      mensaje: `Se aplica a ${target}. El costo de cada uno se recalcula con su precio de lista.`,
      textoSi: "Si, aplicar",
      peligro: scope === "all",
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("apply_discount", {
      p_scope: scope,
      p_ids: scope === "selected" ? Array.from(seleccionados) : null,
      p_category: scope === "category" ? catFilter : null,
      p_percent: pct,
    });
    setBusy(false);
    if (error) return notify.error("No se pudo aplicar", error.message);
    notify.ok(`Descuento de ${pct}% aplicado a ${data} producto(s)`);
    onListo();
  }

  const btn =
    "h-9 px-3 rounded-lg border border-gray-300 bg-white text-[12.5px] text-gray-700 hover:bg-gray-50 disabled:opacity-40";

  return (
    <div className="mb-3 bg-white border border-gray-200 rounded-xl shadow-card p-4 flex flex-wrap items-end gap-3">
      <div className="mr-2">
        <p className="text-[13px] font-medium text-gray-900 flex items-center gap-1.5">
          <Percent size={14} className="text-brand-700" /> Descuento del proveedor
        </p>
        <p className="text-[11.5px] text-gray-500">Cambia el costo real de los productos que elijas.</p>
      </div>
      <Campo label="Descuento %">
        <NumInput value={pct} onChange={setPct} className={`${inputCls} w-24 text-right`} />
      </Campo>
      <button onClick={() => aplicar("selected")} disabled={busy || seleccionados.size === 0} className={btn}>
        a los marcados ({seleccionados.size})
      </button>
      <button onClick={() => aplicar("category")} disabled={busy || !catFilter} className={btn}>
        al grupo {catFilter ? `"${catFilter}"` : "(elige uno arriba)"}
      </button>
      <button onClick={() => aplicar("all")} disabled={busy} className={btn}>
        a toda la lista
      </button>
    </div>
  );
}

/* ============================================================
   Crear / editar producto
   ============================================================ */

function FormProducto({
  p,
  onClose,
  onSaved,
}: {
  p: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() =>
    p
      ? {
          code: p.code,
          description: p.description,
          brand: p.brand ?? "",
          category: p.category ?? "",
          price_1: String(p.price_1 ?? 0),
          price_2: p.price_2 != null ? String(p.price_2) : "",
          price_3: p.price_3 != null ? String(p.price_3) : "",
          price_4: p.price_4 != null ? String(p.price_4) : "",
          price_list: p.price_list ?? "Lista principal",
          purchase_price: p.purchase_price != null ? String(p.purchase_price) : "",
          discount_percent: String(p.discount_percent ?? 0),
          cost: p.cost != null ? String(p.cost) : "0",
        }
      : { ...emptyForm }
  );
  const [hist, setHist] = useState<CostHistory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!p) return;
    supabase.rpc("product_cost_history", { p_code: p.code }).then(({ data }) => {
      setHist((data ?? []) as CostHistory[]);
    });
  }, [p]);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const costo = useMemo(() => {
    const lista = toNum(form.purchase_price);
    const dto = toNum(form.discount_percent);
    if (!lista) return toNum(form.cost);
    return lista * (1 - dto / 100);
  }, [form.purchase_price, form.discount_percent, form.cost]);

  function margen(v: string) {
    const s = toNum(v);
    if (!s || costo <= 0) return null;
    return ((s - costo) / costo) * 100;
  }

  async function guardar() {
    if (!form.code.trim() || !form.description.trim()) return setErr("Falta el codigo o la descripcion.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("upsert_product", {
      p_id: p?.id ?? null,
      p_code: form.code.trim(),
      p_description: form.description.trim(),
      p_brand: form.brand.trim() || null,
      p_category: form.category.trim() || null,
      p_price_1: toNum(form.price_1),
      p_price_2: form.price_2.trim() ? toNum(form.price_2) : null,
      p_price_3: form.price_3.trim() ? toNum(form.price_3) : null,
      p_price_4: form.price_4.trim() ? toNum(form.price_4) : null,
      p_has_stock_control: true,
      p_stock_quantity: 0,
      p_price_list: form.price_list.trim() || "Lista principal",
      p_cost: toNum(form.cost),
      p_purchase_price: form.purchase_price.trim() ? toNum(form.purchase_price) : null,
      p_discount_percent: toNum(form.discount_percent),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    notify.ok(p ? "Producto actualizado" : "Producto creado", form.code.trim());
    onSaved();
  }

  const precio = (k: "price_1" | "price_2" | "price_3" | "price_4", label: string) => {
    const m = margen(form[k]);
    return (
      <Campo
        label={
          <span className="flex justify-between">
            {label}
            {m != null && <span className={marginTone(m)}>{m.toFixed(0)}%</span>}
          </span>
        }
      >
        <input
          inputMode="decimal"
          value={form[k]}
          onChange={(e) => set(k, e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder={k === "price_1" ? "0" : "—"}
          className={`${inputCls} text-right`}
        />
      </Campo>
    );
  };

  return (
    <Ventana
      titulo={p ? `Editar ${p.code}` : "Nuevo producto"}
      subtitulo={p ? p.description : "El codigo no se puede repetir"}
      icono={p ? Pencil : PackagePlus}
      ancho="max-w-2xl"
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={busy || !form.code.trim() || !form.description.trim()}
            className="h-9 px-4 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 shadow-sm disabled:opacity-40"
          >
            {busy ? "Guardando..." : p ? "Guardar cambios" : "Crear producto"}
          </button>
        </>
      }
    >
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Tag size={12} /> Identificacion
      </p>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <Campo label="Codigo">
          <input autoFocus={!p} value={form.code} onChange={(e) => set("code", e.target.value)} className={`${inputCls} font-mono`} />
        </Campo>
        <Campo label="Descripcion" className="col-span-3">
          <input value={form.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Marca">
          <input value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Grupo" className="col-span-2">
          <input value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Lista de precios">
          <input value={form.price_list} onChange={(e) => set("price_list", e.target.value)} className={inputCls} />
        </Campo>
      </div>

      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Precios de venta (el % es la ganancia sobre el costo)</p>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {precio("price_1", "Contado")}
        {precio("price_2", "Credito")}
        {precio("price_3", "Tarifa 3")}
        {precio("price_4", "Tarifa 4")}
      </div>

      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Compra</p>
      <div className="grid grid-cols-4 gap-3">
        <Campo label="Precio de lista del proveedor">
          <input
            inputMode="decimal"
            value={form.purchase_price}
            onChange={(e) => set("purchase_price", e.target.value)}
            placeholder="—"
            className={`${inputCls} text-right`}
          />
        </Campo>
        <Campo label="Descuento %">
          <input
            inputMode="decimal"
            value={form.discount_percent}
            onChange={(e) => set("discount_percent", e.target.value)}
            className={`${inputCls} text-right`}
          />
        </Campo>
        {!toNum(form.purchase_price) ? (
          <Campo label="Costo (si no hay lista)">
            <input
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
              className={`${inputCls} text-right`}
            />
          </Campo>
        ) : (
          <div />
        )}
        <Campo label="Costo real">
          <div className="h-9 px-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-900 font-medium flex items-center justify-end">
            ${costo.toFixed(2)}
          </div>
        </Campo>
      </div>

      {p && (
        <div className="mt-5">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <History size={12} /> Ultimas compras de este codigo
          </p>
          {!hist && <SkeletonRows rows={2} />}
          {hist && hist.length === 0 && (
            <p className="text-[12px] text-gray-400">Todavia no hay facturas de compra con este codigo.</p>
          )}
          {hist && hist.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {hist.slice(0, 6).map((h, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 text-[12px] border-b border-gray-50 last:border-0">
                  <span className="w-20 text-gray-500">{h.invoice_date}</span>
                  <span className="flex-1 min-w-0 truncate">{h.supplier}</span>
                  <span className="w-12 text-right text-gray-500">{Number(h.quantity)} u</span>
                  <span className="w-20 text-right text-gray-500">lista ${Number(h.list_price).toFixed(2)}</span>
                  <span className="w-20 text-right font-medium">costo ${Number(h.unit_cost).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}
    </Ventana>
  );
}

/* ============================================================
   Importar lista de venta o de costos (Excel o CSV)
   ============================================================ */

function ImportarModal({
  compra,
  suppliers,
  supplierName,
  onSupplierCreated,
  onClose,
  onListo,
}: {
  compra: boolean;
  suppliers: Supplier[];
  supplierName: Record<string, string>;
  onSupplierCreated: () => void;
  onClose: () => void;
  onListo: () => void;
}) {
  const [importListName, setImportListName] = useState("");
  const [importMode, setImportMode] = useState<"update" | "replace">("update");
  const [onlyExisting, setOnlyExisting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [salePreview, setSalePreview] = useState<SalePreview | null>(null);
  const [costPreview, setCostPreview] = useState<CostPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", contact: "" });
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  function resetImport() {
    setFileName("");
    setSaleItems([]);
    setCostItems([]);
    setSalePreview(null);
    setCostPreview(null);
  }

  async function createSupplier() {
    if (!newSupplier.name.trim()) return;
    const { data, error } = await supabase.rpc("upsert_supplier", {
      p_id: null,
      p_name: newSupplier.name.trim(),
      p_phone: newSupplier.phone || null,
      p_contact: newSupplier.contact || null,
      p_notes: null,
    });
    if (error) return setErr(error.message);
    setSupplierId(data as string);
    setNewSupplier({ name: "", phone: "", contact: "" });
    setShowNewSupplier(false);
    notify.ok("Proveedor registrado");
    onSupplierCreated();
  }

  async function handleFile(file: File) {
    setErr(null);
    setLeyendo(true);
    let rows: Record<string, string>[] = [];
    try {
      rows = comoObjetos(await leerFilas(file));
    } catch (e) {
      setLeyendo(false);
      resetImport();
      return setErr(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
    setLeyendo(false);

    if (!compra) {
      const items: SaleItem[] = rows
        .map((row) => ({
          code: row["code"] ?? row["codigo"] ?? row["código"] ?? "",
          description: row["description"] ?? row["descripcion"] ?? row["descripción"] ?? "",
          brand: row["brand"] ?? row["marca"] ?? "",
          category: row["category"] ?? row["categoria"] ?? row["categoría"] ?? row["grupo"] ?? "",
          price_1: row["price_1"] ?? row["precio"] ?? row["contado"] ?? "",
          price_2: row["price_2"] ?? row["credito"] ?? row["crédito"] ?? "",
        }))
        .filter((r) => r.code.trim());
      if (items.length === 0) {
        resetImport();
        return setErr("No se encontraron codigos. Revisa que la primera fila tenga los nombres de las columnas (codigo, descripcion...).");
      }
      setFileName(file.name);
      setSaleItems(items);
      const { data, error } = await supabase.rpc("preview_import", { p_codes: items.map((i) => i.code) });
      if (error) return setErr(error.message);
      setSalePreview(data as SalePreview);
    } else {
      const items: CostItem[] = rows
        .map((row) => ({
          code: row["code"] ?? row["codigo"] ?? row["código"] ?? "",
          purchase_price:
            row["compra"] ?? row["purchase_price"] ?? row["precio_compra"] ?? row["costo"] ?? row["precio"] ?? "",
          discount_percent: row["descuento"] ?? row["dto"] ?? row["discount_percent"] ?? row["dscto"] ?? "",
        }))
        .filter((r) => r.code.trim());
      if (items.length === 0) {
        resetImport();
        return setErr("No se encontraron codigos. Necesita al menos las columnas codigo y compra.");
      }
      setFileName(file.name);
      setCostItems(items);
      const { data, error } = await supabase.rpc("preview_costs", { p_codes: items.map((i) => i.code) });
      if (error) return setErr(error.message);
      setCostPreview(data as CostPreview);
    }
  }

  async function confirmImport() {
    if (!compra && importMode === "replace") {
      const ok = await confirmar({
        titulo: "¿Reemplazar toda la lista?",
        mensaje: `Se borran los ${salePreview?.existing_total ?? 0} productos actuales con sus costos, y queda solo lo del archivo.`,
        textoSi: "Si, reemplazar",
        peligro: true,
      });
      if (!ok) return;
    }
    setImporting(true);
    setErr(null);
    if (!compra) {
      const { data, error } = await supabase.rpc("import_products_v2", {
        p_mode: importMode,
        p_only_existing: importMode === "update" && onlyExisting,
        p_price_list: importListName.trim(),
        p_items: saleItems,
      });
      setImporting(false);
      if (error) return setErr(error.message);
      const r = data as { updated: number; created: number; skipped: number; deleted: number };
      notify.ok(
        "Lista importada",
        `${r.updated} actualizados, ${r.created} creados` +
          (r.skipped ? `, ${r.skipped} omitidos` : "") +
          (r.deleted ? `, ${r.deleted} borrados antes de cargar` : "")
      );
    } else {
      const { data, error } = await supabase.rpc("import_costs", {
        p_items: costItems,
        p_supplier_id: supplierId || null,
      });
      setImporting(false);
      if (error) return setErr(error.message);
      const r = data as { updated: number; orphans: number; ignored: number };
      notify.ok(
        "Costos cargados",
        `${r.updated} producto(s)` +
          (supplierId ? ` de ${supplierName[supplierId]}` : "") +
          (r.orphans ? `, ${r.orphans} codigo(s) del archivo no existen aqui` : "")
      );
    }
    onListo();
  }

  const willDelete = !compra && importMode === "replace" ? salePreview?.existing_total ?? 0 : 0;
  const listo = compra ? !!costPreview : !!salePreview;

  return (
    <Ventana
      titulo={compra ? "Importar lista de costos" : "Importar lista de venta"}
      subtitulo={
        compra
          ? "Columnas: codigo, compra, descuento (opcional). Empareja por codigo."
          : "Columnas: codigo, descripcion, marca, grupo, contado, credito. Empareja por codigo."
      }
      icono={Upload}
      ancho="max-w-2xl"
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={confirmImport}
            disabled={!listo || importing}
            className={`h-9 px-4 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-40 ${
              willDelete ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {importing ? "Importando..." : "Confirmar"}
          </button>
        </>
      }
    >
      {!compra ? (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[11px] text-gray-500 mb-1.5">Como aplicar</p>
            <div className="flex flex-col gap-2">
              {(
                [
                  ["update", "Actualizar", "Cambia los que coincidan y agrega los nuevos."],
                  ["replace", "Reemplazar todo", "Borra la lista actual y deja solo este archivo."],
                ] as const
              ).map(([k, t, d]) => (
                <label
                  key={k}
                  className={`flex items-start gap-2 text-sm cursor-pointer p-2.5 rounded-lg border ${
                    importMode === k
                      ? k === "replace"
                        ? "border-red-200 bg-red-50/60"
                        : "border-brand-200 bg-brand-50/60"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-1 accent-brand-700"
                    checked={importMode === k}
                    onChange={() => setImportMode(k)}
                  />
                  <span>
                    {t}
                    <span className="block text-xs text-gray-500">{d}</span>
                  </span>
                </label>
              ))}
            </div>
            {importMode === "update" && (
              <label className="flex items-center gap-2 text-xs text-gray-600 mt-3">
                <input
                  type="checkbox"
                  className="accent-brand-700"
                  checked={onlyExisting}
                  onChange={(e) => setOnlyExisting(e.target.checked)}
                />
                No crear productos nuevos
              </label>
            )}
          </div>
          <div>
            <Campo label={<>Nombre de la lista <span className="text-gray-400">(opcional)</span></>}>
              <input
                className={inputCls}
                placeholder="Ej: Agosto 2026"
                value={importListName}
                onChange={(e) => setImportListName(e.target.value)}
              />
            </Campo>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Campo label="Proveedor de esta lista">
              <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Sin especificar</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.total})
                  </option>
                ))}
              </select>
            </Campo>
            {!showNewSupplier ? (
              <button
                onClick={() => setShowNewSupplier(true)}
                className="text-xs text-gray-500 hover:text-brand-700 mt-2"
              >
                + Registrar proveedor nuevo
              </button>
            ) : (
              <div className="mt-2 border border-gray-200 rounded-lg p-2">
                <input
                  className="w-full h-8 border border-gray-200 rounded-md px-2 text-sm mb-1"
                  placeholder="Nombre del proveedor"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))}
                />
                <div className="flex gap-1 mb-2">
                  <input
                    className="w-1/2 h-8 border border-gray-200 rounded-md px-2 text-sm"
                    placeholder="Telefono"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))}
                  />
                  <input
                    className="w-1/2 h-8 border border-gray-200 rounded-md px-2 text-sm"
                    placeholder="Contacto"
                    value={newSupplier.contact}
                    onChange={(e) => setNewSupplier((s) => ({ ...s, contact: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowNewSupplier(false)} className="text-xs text-gray-500 px-2">
                    Cancelar
                  </button>
                  <button
                    onClick={createSupplier}
                    disabled={!newSupplier.name.trim()}
                    className="text-xs bg-brand-700 text-white rounded-md px-3 py-1 disabled:opacity-40"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Solo actualiza costos de productos que ya existen. No crea ni borra nada. Si el archivo no trae
            columna de descuento, cada producto conserva el suyo.
          </p>
        </div>
      )}

      <label className="flex items-center justify-center gap-2 h-14 rounded-lg border border-dashed border-gray-300 text-[13px] text-gray-500 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50/40 cursor-pointer">
        <FileSpreadsheet size={17} />
        {leyendo ? "Leyendo archivo..." : fileName ? `${fileName} · elegir otro` : "Elegir archivo de Excel (.xlsx) o CSV"}
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      </label>

      {salePreview && !compra && (
        <div className="mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">
            {fileName} · {salePreview.file_total} codigos leidos
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <Cifra n={salePreview.matched} l="se actualizan" />
            <Cifra n={importMode === "update" && onlyExisting ? 0 : salePreview.new} l="se crean" />
            <Cifra n={importMode === "replace" ? 0 : salePreview.untouched} l="quedan igual" tono="text-gray-400" />
            <Cifra n={willDelete} l="se borran" tono={willDelete ? "text-red-600" : "text-gray-400"} />
          </div>
          {importMode === "replace" && (
            <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
              <AlertTriangle size={13} /> Se borran los {salePreview.existing_total} productos actuales, con sus costos.
            </p>
          )}
        </div>
      )}

      {costPreview && compra && (
        <div className="mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">
            {fileName} · {costPreview.file_total} codigos leidos
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Cifra n={costPreview.matched} l="reciben costo" />
            <Cifra n={costPreview.orphans} l="no existen aqui" tono={costPreview.orphans ? "text-amber-600" : "text-gray-400"} />
            <Cifra
              n={costPreview.without_cost_after}
              l="quedan sin costo"
              tono={costPreview.without_cost_after ? "text-amber-600" : "text-gray-400"}
            />
          </div>
        </div>
      )}

      {err && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
      )}
    </Ventana>
  );
}

function Cifra({ n, l, tono = "text-gray-900" }: { n: number; l: string; tono?: string }) {
  return (
    <div>
      <p className={`text-lg font-semibold ${tono}`}>{n}</p>
      <p className="text-xs text-gray-500">{l}</p>
    </div>
  );
}

/* ============================================================
   Borrar toda la lista (pide escribir BORRAR)
   ============================================================ */

function BorrarTodo({ total, onClose, onListo }: { total: number; onClose: () => void; onListo: () => void }) {
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);

  async function borrar() {
    setBusy(true);
    const { data, error } = await supabase.rpc("delete_all_products");
    setBusy(false);
    if (error) return notify.error("No se pudo borrar", error.message);
    notify.ok(`${data} productos eliminados`, "La lista quedo vacia.");
    onListo();
  }

  return (
    <Ventana
      titulo="Eliminar toda la lista de productos"
      subtitulo="Esto no se puede deshacer"
      icono={AlertTriangle}
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={borrar}
            disabled={busy || txt.trim().toUpperCase() !== "BORRAR"}
            className="h-9 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-sm disabled:opacity-40"
          >
            {busy ? "Borrando..." : "Eliminar todo"}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700 mb-3">
        Se borran <b>todos</b> los productos (en la vista hay {total}), con sus precios y costos. Las notas y facturas
        viejas conservan el codigo y la descripcion.
      </p>
      <Campo label='Para confirmar, escribe BORRAR'>
        <input autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} className={inputCls} />
      </Campo>
      <p className="mt-3">
        <Pill tone="danger">accion permanente</Pill>
      </p>
    </Ventana>
  );
}
