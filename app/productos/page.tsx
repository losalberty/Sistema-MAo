"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

function marginColor(m: number | null) {
  if (m == null) return "text-gray-300";
  if (m < 15) return "text-red-600";
  if (m < 30) return "text-amber-600";
  return "text-green-600";
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
  const [info, setInfo] = useState<string | null>(null);

  const [view, setView] = useState<"venta" | "compra">("venta");
  const [tier, setTier] = useState(1);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  // descuento
  const [discount, setDiscount] = useState("0");

  // proveedores
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", contact: "" });
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  // importacion
  const [showImport, setShowImport] = useState(false);
  const [importListName, setImportListName] = useState("");
  const [importMode, setImportMode] = useState<"update" | "replace">("update");
  const [onlyExisting, setOnlyExisting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [salePreview, setSalePreview] = useState<SalePreview | null>(null);
  const [costPreview, setCostPreview] = useState<CostPreview | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    load();
    loadLists();
  }, []);

  async function load(text = search, list = listFilter, cat = catFilter) {
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
    setProducts(data ?? []);
    setSelected(new Set());
  }

  async function loadLists() {
    const [{ data: pl }, { data: ct }, { data: sp }] = await Promise.all([
      supabase.rpc("list_price_lists"),
      supabase.rpc("list_categories"),
      supabase.rpc("list_suppliers"),
    ]);
    setPriceLists(pl ?? []);
    setCategories(ct ?? []);
    setSuppliers(sp ?? []);
  }

  const supplierName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of suppliers) map[s.id] = s.name;
    return map;
  }, [suppliers]);

  async function createSupplier() {
    if (!newSupplier.name.trim()) return;
    setWorking(true);
    const { data, error } = await supabase.rpc("upsert_supplier", {
      p_id: null,
      p_name: newSupplier.name.trim(),
      p_phone: newSupplier.phone || null,
      p_contact: newSupplier.contact || null,
      p_notes: null,
    });
    setWorking(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSupplierId(data as string);
    setNewSupplier({ name: "", phone: "", contact: "" });
    setShowNewSupplier(false);
    loadLists();
  }

  async function assignSupplier() {
    if (!supplierId || selected.size === 0) return;
    setWorking(true);
    const { data, error } = await supabase.rpc("set_supplier", {
      p_ids: Array.from(selected),
      p_supplier_id: supplierId,
    });
    setWorking(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`${data} producto(s) asignados a ${supplierName[supplierId]}.`);
    load();
    loadLists();
  }

  // ---------- resumen de margen (se calcula aqui, no en la base) ----------

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

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`¿Eliminar ${ids.length} producto(s)? Esta accion no se puede deshacer.`)) return;
    setWorking(true);
    setError(null);
    const { data, error } = await supabase.rpc("delete_products", { p_ids: ids });
    setWorking(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`${data} producto(s) eliminado(s).`);
    load();
    loadLists();
  }

  async function deleteEverything() {
    const answer = prompt(
      `Esto borra TODA la lista de productos.\n\nEscribe BORRAR para confirmar:`
    );
    if (answer !== "BORRAR") return;
    setWorking(true);
    const { data, error } = await supabase.rpc("delete_all_products");
    setWorking(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`${data} productos eliminados. La lista quedo vacia.`);
    load();
    loadLists();
  }

  // ---------- descuento ----------

  async function applyDiscount(scope: "selected" | "category" | "all") {
    const pct = Number(discount);
    if (Number.isNaN(pct) || pct < 0 || pct > 99) {
      setError("El descuento debe ser un numero entre 0 y 99.");
      return;
    }
    const target =
      scope === "selected"
        ? `${selected.size} producto(s) seleccionado(s)`
        : scope === "category"
        ? `todo el grupo "${catFilter}"`
        : "TODOS los productos";
    if (!confirm(`Aplicar ${pct}% de descuento a ${target}?`)) return;

    setWorking(true);
    setError(null);
    const { data, error } = await supabase.rpc("apply_discount", {
      p_scope: scope,
      p_ids: scope === "selected" ? Array.from(selected) : null,
      p_category: scope === "category" ? catFilter : null,
      p_percent: pct,
    });
    setWorking(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`Descuento de ${pct}% aplicado a ${data} producto(s).`);
    load();
  }

  // ---------- ficha ----------

  function startCreate() {
    setForm(emptyForm);
    setEditing(null);
    setCreating(true);
  }

  function startEdit(p: ProductRow) {
    setForm({
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
    });
    setEditing(p);
    setCreating(false);
  }

  const formCost = useMemo(() => {
    const lista = Number(form.purchase_price);
    const dto = Number(form.discount_percent) || 0;
    if (!lista) return Number(form.cost) || 0;
    return lista * (1 - dto / 100);
  }, [form.purchase_price, form.discount_percent, form.cost]);

  async function save() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("upsert_product", {
      p_id: editing?.id ?? null,
      p_code: form.code,
      p_description: form.description,
      p_brand: form.brand || null,
      p_category: form.category || null,
      p_price_1: Number(form.price_1) || 0,
      p_price_2: form.price_2 ? Number(form.price_2) : null,
      p_price_3: form.price_3 ? Number(form.price_3) : null,
      p_price_4: form.price_4 ? Number(form.price_4) : null,
      p_has_stock_control: true,
      p_stock_quantity: 0,
      p_price_list: form.price_list || "Lista principal",
      p_cost: Number(form.cost) || 0,
      p_purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
      p_discount_percent: Number(form.discount_percent) || 0,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    setCreating(false);
    load();
    loadLists();
  }

  async function remove(p: ProductRow) {
    if (!confirm(`¿Eliminar el producto ${p.code}?`)) return;
    const { error } = await supabase.rpc("delete_product", { p_id: p.id });
    if (error) {
      setError(error.message);
      return;
    }
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    loadLists();
  }

  // ---------- importacion ----------

  function splitLine(line: string) {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if ((ch === "," || ch === ";") && !inQuotes) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseRows(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = splitLine(lines[0]).map((h) =>
      h.replace(/^﻿/, "").trim().toLowerCase()
    );
    return lines.slice(1).map((line) => {
      const cells = splitLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
      return row;
    });
  }

  function resetImport() {
    setFileName("");
    setSaleItems([]);
    setCostItems([]);
    setSalePreview(null);
    setCostPreview(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    const rows = parseRows(await file.text());
    e.target.value = "";

    if (view === "venta") {
      const items: SaleItem[] = rows
        .map((row) => ({
          code: row["code"] ?? row["codigo"] ?? row["código"] ?? "",
          description: row["description"] ?? row["descripcion"] ?? row["descripción"] ?? "",
          brand: row["brand"] ?? row["marca"] ?? "",
          category: row["category"] ?? row["categoria"] ?? row["grupo"] ?? "",
          price_1: row["price_1"] ?? row["precio"] ?? row["contado"] ?? "",
          price_2: row["price_2"] ?? row["credito"] ?? row["crédito"] ?? "",
        }))
        .filter((r) => r.code.trim());
      if (items.length === 0) {
        resetImport();
        setError("No se encontraron codigos en el archivo. Revisa que tenga una fila de encabezados.");
        return;
      }
      setFileName(file.name);
      setSaleItems(items);
      const { data, error } = await supabase.rpc("preview_import", {
        p_codes: items.map((i) => i.code),
      });
      if (error) return setError(error.message);
      setSalePreview(data as SalePreview);
    } else {
      const items: CostItem[] = rows
        .map((row) => ({
          code: row["code"] ?? row["codigo"] ?? row["código"] ?? "",
          purchase_price:
            row["compra"] ??
            row["purchase_price"] ??
            row["precio_compra"] ??
            row["costo"] ??
            row["precio"] ??
            "",
          discount_percent:
            row["descuento"] ?? row["dto"] ?? row["discount_percent"] ?? row["dscto"] ?? "",
        }))
        .filter((r) => r.code.trim());
      if (items.length === 0) {
        resetImport();
        setError("No se encontraron codigos en el archivo. Necesita al menos las columnas codigo y compra.");
        return;
      }
      setFileName(file.name);
      setCostItems(items);
      const { data, error } = await supabase.rpc("preview_costs", {
        p_codes: items.map((i) => i.code),
      });
      if (error) return setError(error.message);
      setCostPreview(data as CostPreview);
    }
  }

  async function confirmImport() {
    setImporting(true);
    setError(null);
    if (view === "venta") {
      const { data, error } = await supabase.rpc("import_products_v2", {
        p_mode: importMode,
        p_only_existing: importMode === "update" && onlyExisting,
        p_price_list: importListName.trim(),
        p_items: saleItems,
      });
      setImporting(false);
      if (error) return setError(error.message);
      const r = data as { updated: number; created: number; skipped: number; deleted: number };
      setInfo(
        `Listo. ${r.updated} actualizados, ${r.created} creados` +
          (r.skipped ? `, ${r.skipped} omitidos` : "") +
          (r.deleted ? `, ${r.deleted} borrados antes de cargar` : "") +
          "."
      );
    } else {
      const { data, error } = await supabase.rpc("import_costs", {
        p_items: costItems,
        p_supplier_id: supplierId || null,
      });
      setImporting(false);
      if (error) return setError(error.message);
      const r = data as { updated: number; orphans: number; ignored: number };
      setInfo(
        `Listo. Costo cargado en ${r.updated} producto(s)` +
          (supplierId ? ` de ${supplierName[supplierId]}` : "") +
          (r.orphans ? `, ${r.orphans} codigo(s) del archivo no existen aqui` : "") +
          "."
      );
    }
    setShowImport(false);
    resetImport();
    setImportListName("");
    load();
    loadLists();
  }

  const willDelete =
    view === "venta" && importMode === "replace" ? salePreview?.existing_total ?? 0 : 0;

  // ---------- render ----------

  const compra = view === "compra";

  return (
    <main className="max-w-6xl mx-auto p-8 pb-24">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-2">
            ← Volver al panel
          </Link>
          <h1 className="text-lg font-medium">Productos</h1>
          <p className="text-sm text-gray-500">
            {products.length} productos
            {compra && (
              <>
                {" · "}
                {summary.avg != null ? (
                  <span>margen promedio {summary.avg.toFixed(0)}%</span>
                ) : (
                  <span>sin costos cargados</span>
                )}
                {summary.without > 0 && (
                  <span className="text-amber-700"> · {summary.without} sin costo</span>
                )}
                {summary.low > 0 && (
                  <span className="text-red-600"> · {summary.low} bajo 15%</span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex border border-gray-300 rounded-md overflow-hidden">
            {(["venta", "compra"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  resetImport();
                }}
                className={`text-sm px-4 py-2 transition-colors ${
                  view === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {v === "venta" ? "Venta" : "Compra"}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowImport((s) => !s);
              resetImport();
            }}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
          >
            Importar
          </button>
          <button
            onClick={startCreate}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            + Nuevo
          </button>
        </div>
      </div>

      {showImport && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium mb-1">
            {compra ? "Importar lista de compra" : "Importar lista de venta"}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {compra
              ? "Columnas: codigo, compra, descuento (opcional). Empareja por codigo."
              : "Columnas: codigo, descripcion, marca, grupo, contado, credito. Empareja por codigo."}
          </p>

          {!compra ? (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Como aplicar</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={importMode === "update"}
                      onChange={() => setImportMode("update")}
                    />
                    <span>
                      Actualizar
                      <span className="block text-xs text-gray-500">
                        Cambia los que coincidan y agrega los nuevos.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                    />
                    <span>
                      Reemplazar todo
                      <span className="block text-xs text-gray-500">
                        Borra la lista actual y deja solo este archivo.
                      </span>
                    </span>
                  </label>
                </div>
                {importMode === "update" && (
                  <label className="flex items-center gap-2 text-xs text-gray-600 mt-3">
                    <input
                      type="checkbox"
                      checked={onlyExisting}
                      onChange={(e) => setOnlyExisting(e.target.checked)}
                    />
                    No crear productos nuevos
                  </label>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Nombre de la lista <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-3"
                  placeholder="Ej: Agosto 2026"
                  value={importListName}
                  onChange={(e) => setImportListName(e.target.value)}
                />
                <label className="text-xs text-gray-500 block mb-1">Archivo CSV</label>
                <input type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Proveedor de esta lista</label>
                <select
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Sin especificar</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.total})
                    </option>
                  ))}
                </select>
                {!showNewSupplier ? (
                  <button
                    onClick={() => setShowNewSupplier(true)}
                    className="text-xs text-gray-500 hover:text-gray-900 mt-2"
                  >
                    + Registrar proveedor nuevo
                  </button>
                ) : (
                  <div className="mt-2 border border-gray-200 rounded-md p-2">
                    <input
                      className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm mb-1"
                      placeholder="Nombre del proveedor"
                      value={newSupplier.name}
                      onChange={(e) =>
                        setNewSupplier((s) => ({ ...s, name: e.target.value }))
                      }
                    />
                    <div className="flex gap-1 mb-2">
                      <input
                        className="w-1/2 border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                        placeholder="Telefono"
                        value={newSupplier.phone}
                        onChange={(e) =>
                          setNewSupplier((s) => ({ ...s, phone: e.target.value }))
                        }
                      />
                      <input
                        className="w-1/2 border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                        placeholder="Contacto"
                        value={newSupplier.contact}
                        onChange={(e) =>
                          setNewSupplier((s) => ({ ...s, contact: e.target.value }))
                        }
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowNewSupplier(false)}
                        className="text-xs text-gray-500 px-2"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={createSupplier}
                        disabled={working || !newSupplier.name.trim()}
                        className="text-xs bg-gray-900 text-white rounded-md px-3 py-1 disabled:opacity-40"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  Solo actualiza costos de productos que ya existen. No crea ni borra nada. Si el
                  archivo no trae columna de descuento, cada producto conserva el suyo y lo aplicas
                  despues con la barra de arriba.
                </p>
                <label className="text-xs text-gray-500 block mb-1">Archivo CSV</label>
                <input type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm" />
              </div>
            </div>
          )}

          {salePreview && !compra && (
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
              <p className="text-xs text-gray-500 mb-2">
                {fileName} · {salePreview.file_total} codigos leidos
              </p>
              <div className="grid grid-cols-4 gap-3 text-center mb-3">
                <div>
                  <p className="text-lg">{salePreview.matched}</p>
                  <p className="text-xs text-gray-500">se actualizan</p>
                </div>
                <div>
                  <p className="text-lg">
                    {importMode === "update" && onlyExisting ? 0 : salePreview.new}
                  </p>
                  <p className="text-xs text-gray-500">se crean</p>
                </div>
                <div>
                  <p className="text-lg text-gray-400">
                    {importMode === "replace" ? 0 : salePreview.untouched}
                  </p>
                  <p className="text-xs text-gray-500">quedan igual</p>
                </div>
                <div>
                  <p className={`text-lg ${willDelete ? "text-red-500" : "text-gray-400"}`}>
                    {willDelete}
                  </p>
                  <p className="text-xs text-gray-500">se borran</p>
                </div>
              </div>
              {importMode === "replace" && (
                <p className="text-xs text-red-600 mb-3">
                  Se borran los {salePreview.existing_total} productos actuales, con sus costos.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={resetImport} className="text-sm text-gray-500 px-3 py-1.5">
                  Cancelar
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="text-sm bg-gray-900 text-white rounded-md px-4 py-1.5 disabled:opacity-40"
                >
                  {importing ? "Importando..." : "Confirmar"}
                </button>
              </div>
            </div>
          )}

          {costPreview && compra && (
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
              <p className="text-xs text-gray-500 mb-2">
                {fileName} · {costPreview.file_total} codigos leidos
              </p>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div>
                  <p className="text-lg">{costPreview.matched}</p>
                  <p className="text-xs text-gray-500">reciben costo</p>
                </div>
                <div>
                  <p className={`text-lg ${costPreview.orphans ? "text-amber-600" : "text-gray-400"}`}>
                    {costPreview.orphans}
                  </p>
                  <p className="text-xs text-gray-500">no existen aqui</p>
                </div>
                <div>
                  <p
                    className={`text-lg ${
                      costPreview.without_cost_after ? "text-amber-600" : "text-gray-400"
                    }`}
                  >
                    {costPreview.without_cost_after}
                  </p>
                  <p className="text-xs text-gray-500">quedan sin costo</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={resetImport} className="text-sm text-gray-500 px-3 py-1.5">
                  Cancelar
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="text-sm bg-gray-900 text-white rounded-md px-4 py-1.5 disabled:opacity-40"
                >
                  {importing ? "Cargando..." : "Confirmar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {compra && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-600">Descuento del proveedor</span>
            <input
              type="number"
              min={0}
              max={99}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-20 border border-gray-200 rounded-md px-2 py-1.5 text-sm text-right"
            />
            <span className="text-sm text-gray-500">%</span>
            <span className="text-xs text-gray-400">aplicar a:</span>
            <button
              onClick={() => applyDiscount("selected")}
              disabled={working || selected.size === 0}
              className="text-xs border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-600"
            >
              seleccionados ({selected.size})
            </button>
            <button
              onClick={() => applyDiscount("category")}
              disabled={working || !catFilter}
              className="text-xs border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-600"
            >
              grupo {catFilter ? `"${catFilter}"` : "(elige uno)"}
            </button>
            <button
              onClick={() => applyDiscount("all")}
              disabled={working}
              className="text-xs border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors disabled:opacity-30"
            >
              toda la lista
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">Margen contra:</span>
            {[1, 2, 3, 4].map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  tier === t
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-300 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {TIER_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {priceLists.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          <button
            onClick={() => {
              setListFilter("");
              load(search, "", catFilter);
            }}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              listFilter === ""
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-300 text-gray-600 hover:bg-gray-100"
            }`}
          >
            Todas ({priceLists.reduce((s, l) => s + Number(l.total), 0)})
          </button>
          {priceLists.map((l) => (
            <button
              key={l.price_list}
              onClick={() => {
                setListFilter(l.price_list);
                load(search, l.price_list, catFilter);
              }}
              className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                listFilter === l.price_list
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {l.price_list} ({l.total})
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
          placeholder="Buscar por codigo, descripcion, marca o grupo"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            load(e.target.value, listFilter, catFilter);
          }}
        />
        <select
          className="border border-gray-200 rounded-md px-3 py-2 text-sm max-w-xs"
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            load(search, listFilter, e.target.value);
          }}
        >
          <option value="">Todos los grupos</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category} ({c.total})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {info && <p className="text-green-600 text-sm mb-4">{info}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {(creating || editing) && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium mb-3">
            {editing ? `Editar ${editing.code}` : "Nuevo producto"}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["code", "Codigo"],
                ["description", "Descripcion"],
                ["brand", "Marca"],
                ["category", "Grupo"],
                ["price_list", "Lista de precios"],
                ["purchase_price", "Precio de compra (lista)"],
                ["discount_percent", "Descuento %"],
                ["price_1", "Contado"],
                ["price_2", "Credito"],
                ["price_3", "Tarifa 3"],
                ["price_4", "Tarifa 4"],
              ] as [keyof typeof emptyForm, string][]
            ).map(([field, label]) => (
              <div key={field}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Costo real</label>
              <div className="border border-gray-100 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600">
                ${formCost.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              className="text-sm text-gray-500 px-3 py-1.5"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !form.code || !form.description}
              className="text-sm bg-gray-900 text-white rounded-md px-3 py-1.5 disabled:opacity-40"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 text-left bg-gray-50">
              <th className="font-normal px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todo"
                />
              </th>
              <th className="font-normal px-3 py-2 w-28">Codigo</th>
              <th className="font-normal px-3 py-2">Descripcion</th>
              {compra ? (
                <>
                  <th className="font-normal px-3 py-2 w-32">Proveedor</th>
                  <th className="font-normal px-3 py-2 w-20 text-right">Lista</th>
                  <th className="font-normal px-3 py-2 w-16 text-right">Dto</th>
                  <th className="font-normal px-3 py-2 w-20 text-right">Costo</th>
                  <th className="font-normal px-3 py-2 w-20 text-right">
                    {TIER_LABELS[tier]}
                  </th>
                  <th className="font-normal px-3 py-2 w-20 text-right">Margen</th>
                </>
              ) : (
                <>
                  <th className="font-normal px-3 py-2 w-24">Marca</th>
                  <th className="font-normal px-3 py-2 w-40">Grupo</th>
                  <th className="font-normal px-3 py-2 w-20 text-right">Contado</th>
                  <th className="font-normal px-3 py-2 w-20 text-right">Credito</th>
                </>
              )}
              <th className="font-normal px-3 py-2 w-28 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const isSel = selected.has(p.id);
              const m = marginOf(p, tier);
              const sale = priceFor(p, tier);
              return (
                <tr
                  key={p.id}
                  className={`border-t border-gray-100 transition-colors ${
                    isSel ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOne(p.id)}
                      aria-label={`Seleccionar ${p.code}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{p.code}</td>
                  <td className="px-3 py-2">{p.description}</td>
                  {compra ? (
                    <>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {p.supplier_id ? supplierName[p.supplier_id] ?? "-" : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {p.purchase_price ? `$${Number(p.purchase_price).toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {Number(p.discount_percent) > 0 ? `${Number(p.discount_percent)}%` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number(p.cost) > 0 ? `$${Number(p.cost).toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {sale != null ? `$${sale.toFixed(2)}` : "-"}
                      </td>
                      <td className={`px-3 py-2 text-right ${marginColor(m)}`}>
                        {m != null ? `${m.toFixed(0)}%` : "sin costo"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-gray-600 text-xs">{p.brand || "-"}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{p.category || "-"}</td>
                      <td className="px-3 py-2 text-right">${Number(p.price_1).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {p.price_2 != null ? `$${Number(p.price_2).toFixed(2)}` : "-"}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => startEdit(p)}
                      className="text-xs text-gray-500 hover:text-gray-900 mr-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => remove(p)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && products.length === 0 && (
        <p className="text-sm text-gray-400 mt-4">No hay productos que coincidan.</p>
      )}

      {!loading && products.length > 0 && selected.size === 0 && (
        <div className="mt-4 text-right">
          <button
            onClick={deleteEverything}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Eliminar toda la lista de productos
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-5 bg-gray-900 text-white rounded-full pl-5 pr-3 py-2.5 shadow-lg">
            <span className="text-sm">{selected.size} seleccionados</span>
            {compra && suppliers.length > 0 && (
              <span className="flex items-center gap-2">
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
                  className="text-sm text-gray-300 hover:text-white disabled:opacity-30"
                >
                  Asignar
                </button>
              </span>
            )}
            <button
              onClick={deleteSelected}
              disabled={working}
              className="text-sm text-red-300 hover:text-red-200 disabled:opacity-40"
            >
              {working ? "..." : "Eliminar"}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-gray-400 hover:text-white rounded-full px-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
