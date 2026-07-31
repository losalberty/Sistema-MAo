"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  code: string;
  description: string;
  price_1: number;
};

type LineItem = {
  product_id: string;
  code_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
};

export default function NuevaNotaPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [quickClientName, setQuickClientName] = useState("");
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  const total = subtotal - discount;

  async function searchProducts(text: string) {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const { data, error } = await supabase.rpc("search_products", {
      search_text: text,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setResults(data ?? []);
  }

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        code_snapshot: p.code,
        description_snapshot: p.description,
        quantity: 1,
        unit_price: p.price_1,
        line_discount: 0,
        line_total: p.price_1,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  function updateItem(index: number, field: "quantity" | "unit_price", value: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const updated = { ...it, [field]: value };
        updated.line_total = updated.quantity * updated.unit_price - updated.line_discount;
        return updated;
      })
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveNote() {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_note", {
      p_client_id: null,
      p_quick_client_name: quickClientName || "Cliente eventual",
      p_currency_mode: "USD",
      p_exchange_rate: null,
      p_exchange_gap_percent: null,
      p_show_company_name: true,
      p_show_logo: true,
      p_discount: discount,
      p_items: items,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSavedNoteId(data as string);
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-lg font-medium mb-6">Nueva nota</h1>

      <div className="mb-4">
        <label className="text-xs text-gray-500 block mb-1">Cliente</label>
        <input
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          placeholder="Nombre del cliente eventual (o dejar en blanco)"
          value={quickClientName}
          onChange={(e) => setQuickClientName(e.target.value)}
        />
      </div>

      <div className="mb-2 relative">
        <label className="text-xs text-gray-500 block mb-1">Buscar producto</label>
        <input
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          placeholder="Codigo o descripcion"
          value={query}
          onChange={(e) => searchProducts(e.target.value)}
        />
        {results.length > 0 && (
          <div className="border border-gray-200 rounded-md mt-1 bg-white shadow-sm">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full flex justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <span>
                  {p.code} <span className="text-gray-400">- {p.description}</span>
                </span>
                <span className="text-gray-500">${p.price_1?.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-sm my-6">
        <thead>
          <tr className="text-xs text-gray-400 text-left">
            <th className="font-normal py-1">Producto</th>
            <th className="font-normal py-1 w-16">Cant.</th>
            <th className="font-normal py-1 w-20">Precio</th>
            <th className="font-normal py-1 w-20 text-right">Total</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, index) => (
            <tr key={index} className="border-t border-gray-100">
              <td className="py-2">{it.description_snapshot}</td>
              <td className="py-2">
                <input
                  type="number"
                  className="w-14 border border-gray-200 rounded px-2 py-1"
                  value={it.quantity}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                />
              </td>
              <td className="py-2">
                <input
                  type="number"
                  className="w-20 border border-gray-200 rounded px-2 py-1"
                  value={it.unit_price}
                  onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                />
              </td>
              <td className="py-2 text-right">${it.line_total.toFixed(2)}</td>
              <td className="py-2 text-right">
                <button onClick={() => removeItem(index)} className="text-gray-400 hover:text-red-500">
                  x
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mb-6">
        <div className="w-56 text-sm">
          <div className="flex justify-between text-gray-500 py-1">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-500">Descuento</span>
            <input
              type="number"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-right"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-between font-medium text-base border-t border-gray-200 mt-1 pt-2">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {savedNoteId ? (
        <p className="text-green-600 text-sm">Nota guardada correctamente (id: {savedNoteId}).</p>
      ) : (
        <div className="flex justify-end">
          <button
            disabled={saving || items.length === 0}
            onClick={saveNote}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Guardar nota"}
          </button>
        </div>
      )}
    </main>
  );
}
