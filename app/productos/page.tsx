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
};

type PriceList = { price_list: string; total: number };

type ParsedItem = {
  code: string;
  description: string;
  brand: string;
  category: string;
  price_1: string;
  price_2: string;
};

type Preview = {
  file_total: number;
  matched: number;
  new: number;
  existing_total: number;
  untouched: number;
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

  // seleccion multiple
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  // importacion
  const [showImport, setShowImport] = useState(false);
  const [importListName, setImportListName] = useState("");
  const [importMode, setImportMode] = useState<"update" | "replace">("update");
  const [onlyExisting, setOnlyExisting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
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
    setSelected(new Set());
  }

  async function loadLists() {
    const { data } = await supabase.rpc("list_price_lists");
    setPriceLists(data ?? []);
  }

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
      `Esto borra los ${products.length} productos visibles y TODA la lista completa.\n\nEscribe BORRAR para confirmar:`
    );
    if (answer !== "BORRAR") return;
    setWorking(true);
    setError(null);
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

  // ---------- importacion ----------

  function parseCsv(text: string): ParsedItem[] {
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
        } else if ((ch === "," || ch === ";") && !inQuotes) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const headers = split(lines[0]).map((h) => h.trim().toLowerCase());
    return lines
      .slice(1)
      .map((line) => {
        const cells = split(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
        return {
          code: row["code"] ?? row["codigo"] ?? row["código"] ?? "",
          description: row["description"] ?? row["descripcion"] ?? row["descripción"] ?? "",
          brand: row["brand"] ?? row["marca"] ?? "",
          category: row["category"] ?? row["categoria"] ?? row["grupo"] ?? "",
          price_1: row["price_1"] ?? row["precio"] ?? row["contado"] ?? "",
          price_2: row["price_2"] ?? row["credito"] ?? row["crédito"] ?? "",
        };
      })
      .filter((r) => r.code.trim());
  }

  function resetImport() {
    setFileName("");
    setParsed([]);
    setPreview(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    const text = await file.text();
    const items = parseCsv(text);
    e.target.value = "";
    if (items.length === 0) {
      resetImport();
      setError("No se encontraron productos validos en el archivo. Revisa que tenga una fila de encabezados con al menos la columna codigo.");
      return;
    }
    setFileName(file.name);
    setParsed(items);
    const { data, error } = await supabase.rpc("preview_import", {
      p_codes: items.map((i) => i.code),
    });
    if (error) {
      setError(error.message);
      return;
    }
    setPreview(data as Preview);
  }

  async function confirmImport() {
    if (parsed.length === 0) return;
    setImporting(true);
    setError(null);
    const { data, error } = await supabase.rpc("import_products_v2", {
      p_mode: importMode,
      p_only_existing: importMode === "update" && onlyExisting,
      p_price_list: importListName.trim(),
      p_items: parsed,
    });
    setImporting(false);
    if (error) {
      setError(error.message);
      return;
    }
    const r = data as { updated: number; created: number; skipped: number; deleted: number };
    setInfo(
      `Listo. ${r.updated} actualizados, ${r.created} creados` +
        (r.skipped ? `, ${r.skipped} omitidos` : "") +
        (r.deleted ? `, ${r.deleted} borrados antes de cargar` : "") +
        "."
    );
    setShowImport(false);
    resetImport();
    setImportListName("");
    load();
    loadLists();
  }

  const willDelete = useMemo(
    () => (importMode === "replace" ? preview?.existing_total ?? 0 : 0),
    [importMode, preview]
  );

  return (
    <main className="max-w-5xl mx-auto p-8 pb-24">
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
            + Nuevo producto
          </button>
        </div>
      </div>

      {showImport && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium mb-1">Importar lista desde archivo</p>
          <p className="text-xs text-gray-500 mb-4">
            Columnas reconocidas: codigo, descripcion, marca, grupo, contado, credito. El
            emparejamiento es por codigo, no por nombre.
          </p>

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
                      Cambia los que coincidan y agrega los nuevos. No borra nada.
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
                placeholder="Ej: Lista Agosto 2026"
                value={importListName}
                onChange={(e) => setImportListName(e.target.value)}
              />
              <label className="text-xs text-gray-500 block mb-1">Archivo CSV</label>
              <input type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm" />
            </div>
          </div>

          {preview && (
            <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
              <p className="text-xs text-gray-500 mb-2">
                {fileName} · {preview.file_total} codigos leidos
              </p>
              <div className="grid grid-cols-4 gap-3 text-center mb-3">
                <div>
                  <p className="text-lg">{preview.matched}</p>
                  <p className="text-xs text-gray-500">se actualizan</p>
                </div>
                <div>
                  <p className="text-lg">{importMode === "update" && onlyExisting ? 0 : preview.new}</p>
                  <p className="text-xs text-gray-500">se crean</p>
                </div>
                <div>
                  <p className="text-lg text-gray-400">
                    {importMode === "replace" ? 0 : preview.untouched}
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
                  Ojo: se borran los {preview.existing_total} productos actuales antes de cargar el
                  archivo. Las notas ya guardadas conservan sus codigos y descripciones.
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
                  {importing ? "Importando..." : "Confirmar importacion"}
                </button>
              </div>
            </div>
          )}
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
            <button
              key={l.price_list}
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
              <th className="font-normal px-3 py-2 w-24">Marca</th>
              <th className="font-normal px-3 py-2 w-40">Grupo</th>
              <th className="font-normal px-3 py-2 w-20 text-right">Costo</th>
              <th className="font-normal px-3 py-2 w-20 text-right">P1</th>
              <th className="font-normal px-3 py-2 w-20 text-right">P2</th>
              <th className="font-normal px-3 py-2 w-28 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const isSel = selected.has(p.id);
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
            <button
              onClick={deleteSelected}
              disabled={working}
              className="text-sm text-red-300 hover:text-red-200 disabled:opacity-40"
            >
              {working ? "Eliminando..." : "Eliminar"}
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
