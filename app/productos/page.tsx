"use client";

import { useEffect, useState } from "react";
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
};

type PriceList = { price_list: string; total: number };

const emptyForm = {
  code: "",
  description: "",
  brand: "",
  category: "",
  price_1: "0",
  price_2: "",
  price_3: "",
  price_4: "",
  cost: "0",
  price_list: "Lista principal",
};

export default function ProductosPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // importacion CSV
  const [showImport, setShowImport] = useState(false);
  const [importListName, setImportListName] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    load();
    loadLists();
  }, []);

  async function load(text = search, list = listFilter) {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_products", {
      search_text: text,
      p_price_list: list,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setProducts(data ?? []);
  }

  async function loadLists() {
    const { data } = await supabase.rpc("list_price_lists");
    setPriceLists(data ?? []);
  }

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
      cost: p.cost != null ? String(p.cost) : "0",
      price_list: p.price_list ?? "Lista principal",
    });
    setEditing(p);
    setCreating(false);
  }

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

  async function removeList(name: string) {
    if (!confirm(`¿Eliminar TODOS los productos de la lista "${name}"? No se puede deshacer.`))
      return;
    const { error } = await supabase.rpc("delete_price_list", { p_price_list: name });
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`Lista "${name}" eliminada.`);
    load();
    loadLists();
  }

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const split = (line: string) => {
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
        } else if (ch === "," && !inQuotes) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const headers = split(lines[0]).map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = split(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
      return {
        code: row["code"] ?? row["codigo"] ?? row["código"] ?? "",
        description: row["description"] ?? row["descripcion"] ?? row["descripción"] ?? "",
        brand: row["brand"] ?? row["marca"] ?? "",
        category: row["category"] ?? row["categoria"] ?? row["grupo"] ?? "",
        price_1: row["price_1"] ?? row["precio"] ?? row["contado"] ?? "0",
        price_2: row["price_2"] ?? row["credito"] ?? row["crédito"] ?? "",
      };
    }).filter((r) => r.code && r.description);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!importListName.trim()) {
      setError("Ponle un nombre a la lista antes de subir el archivo.");
      return;
    }
    setImporting(true);
    setError(null);
    setInfo(null);
    const text = await file.text();
    const items = parseCsv(text);
    if (items.length === 0) {
      setImporting(false);
      setError("No se encontraron productos validos en el archivo.");
      return;
    }
    const { data, error } = await supabase.rpc("import_products", {
      p_price_list: importListName.trim(),
      p_replace: replaceExisting,
      p_items: items,
    });
    setImporting(false);
    e.target.value = "";
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`${data} productos cargados en la lista "${importListName.trim()}".`);
    setShowImport(false);
    setImportListName("");
    load();
    loadLists();
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-2">
            ← Volver al panel
          </Link>
          <h1 className="text-lg font-medium">Productos</h1>
          <p className="text-sm text-gray-500">{products.length} productos mostrados</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport((s) => !s)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
          >
            Subir lista CSV
          </button>
          <button
            onClick={startCreate}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {showImport && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium mb-2">Cargar lista de precios desde CSV</p>
          <p className="text-xs text-gray-500 mb-3">
            El archivo debe tener columnas: code, description, brand, category, price_1, price_2.
          </p>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500 block mb-1">Nombre de la lista</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="Ej: Lista Agosto 2026"
                value={importListName}
                onChange={(e) => setImportListName(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Reemplazar si ya existe
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFile}
              disabled={importing}
              className="text-sm"
            />
          </div>
          {importing && <p className="text-xs text-gray-500 mt-2">Cargando productos...</p>}
        </div>
      )}

      {priceLists.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => {
              setListFilter("");
              load(search, "");
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
            <span key={l.price_list} className="inline-flex items-center">
              <button
                onClick={() => {
                  setListFilter(l.price_list);
                  load(search, l.price_list);
                }}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  listFilter === l.price_list
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-300 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {l.price_list} ({l.total})
              </button>
              <button
                onClick={() => removeList(l.price_list)}
                title="Eliminar esta lista"
                className="text-xs text-gray-300 hover:text-red-500 ml-1"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-4"
        placeholder="Buscar por codigo, descripcion, marca o grupo"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          load(e.target.value, listFilter);
        }}
      />

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {info && <p className="text-green-600 text-sm mb-4">{info}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {(creating || editing) && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium mb-3">
            {editing ? `Editar ${editing.code}` : "Nuevo producto"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["code", "Codigo"],
                ["description", "Descripcion"],
                ["brand", "Marca"],
                ["category", "Grupo / categoria"],
                ["price_list", "Lista de precios"],
                ["cost", "Costo"],
                ["price_1", "Precio 1 (contado)"],
                ["price_2", "Precio 2 (credito)"],
                ["price_3", "Precio 3"],
                ["price_4", "Precio 4"],
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
              <th className="font-normal px-3 py-2 w-28">Codigo</th>
              <th className="font-normal px-3 py-2">Descripcion</th>
              <th className="font-normal px-3 py-2 w-24">Marca</th>
              <th className="font-normal px-3 py-2 w-40">Grupo</th>
              <th className="font-normal px-3 py-2 w-20 text-right">Costo</th>
              <th className="font-normal px-3 py-2 w-20 text-right">P1</th>
              <th className="font-normal px-3 py-2 w-20 text-right">P2</th>
              <th className="font-normal px-3 py-2 w-28 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2 text-gray-400 text-xs">{p.code}</td>
                <td className="px-3 py-2">{p.description}</td>
                <td className="px-3 py-2 text-gray-600 text-xs">{p.brand || "-"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{p.category || "-"}</td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {p.cost ? `$${Number(p.cost).toFixed(2)}` : "-"}
                </td>
                <td className="px-3 py-2 text-right">${Number(p.price_1).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {p.price_2 != null ? `$${Number(p.price_2).toFixed(2)}` : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => startEdit(p)} className="text-xs text-gray-500 hover:text-gray-900 mr-2">
                    Editar
                  </button>
                  <button onClick={() => remove(p)} className="text-xs text-gray-400 hover:text-red-500">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && products.length === 0 && (
        <p className="text-sm text-gray-400 mt-4">No hay productos que coincidan.</p>
      )}
    </main>
  );
}
