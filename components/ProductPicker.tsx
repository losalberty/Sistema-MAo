"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PickerProduct = {
  id: string;
  code: string;
  description: string;
  brand: string | null;
  category: string | null;
  price_1: number;
  price_2: number | null;
  price_3: number | null;
  price_4: number | null;
  cost: number | null;
  stock_quantity: number | null;
  has_stock_control: boolean;
  price_list: string | null;
};

type Category = { category: string; total: number };

export default function ProductPicker({
  tier,
  onPick,
  onClose,
}: {
  tier: number;
  onPick: (p: PickerProduct, tierUsed: number) => void;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc("list_categories").then(({ data }) => setCategories(data ?? []));
    load("", "");
  }, []);

  async function load(text: string, cat: string) {
    setLoading(true);
    if (text.trim().length >= 2) {
      const { data } = await supabase.rpc("search_products", { search_text: text.trim() });
      setRows(
        (data ?? []).filter((p: PickerProduct) => !cat || p.category === cat)
      );
    } else {
      const { data } = await supabase.rpc("list_products", {
        search_text: "",
        p_price_list: "",
        p_category: cat,
      });
      setRows((data ?? []).slice(0, 500));
    }
    setLoading(false);
  }

  function priceFor(p: PickerProduct, t: number) {
    const v = t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
    return v ?? p.price_1 ?? 0;
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <p className="text-base font-medium">Catalogo de productos</p>
            <p className="text-xs text-gray-500">
              {rows.length} mostrados · precio segun tarifa {tier}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            Cerrar
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-56 border-r border-gray-200 overflow-y-auto p-3">
            <p className="text-xs text-gray-400 mb-2">Grupos</p>
            <button
              onClick={() => {
                setActiveCat("");
                load(search, "");
              }}
              className={`block w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                activeCat === "" ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.category}
                onClick={() => {
                  setActiveCat(c.category);
                  load(search, c.category);
                }}
                className={`block w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                  activeCat === c.category
                    ? "bg-gray-900 text-white"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <span className="truncate block">{c.category}</span>
                <span className={`text-xs ${activeCat === c.category ? "text-gray-300" : "text-gray-400"}`}>
                  {c.total}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-3 border-b border-gray-200">
              <input
                autoFocus
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="Buscar por codigo, descripcion, marca o grupo (acepta errores de tipeo)"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  load(e.target.value, activeCat);
                }}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-xs text-gray-400 text-left">
                    <th className="font-normal px-3 py-2 w-28">Codigo</th>
                    <th className="font-normal px-3 py-2">Descripcion</th>
                    <th className="font-normal px-3 py-2 w-20 text-right">Stock</th>
                    <th className="font-normal px-3 py-2 w-20 text-right">P1</th>
                    <th className="font-normal px-3 py-2 w-20 text-right">P2</th>
                    <th className="font-normal px-3 py-2 w-24 text-right">Agregar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const stock = Number(p.stock_quantity ?? 0);
                    return (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{p.code}</td>
                        <td className="px-3 py-2">
                          {p.description}
                          <span className="text-gray-400 text-xs ml-2">{p.category}</span>
                        </td>
                        <td
                          className={`px-3 py-2 text-right ${
                            stock < 0 ? "text-red-500" : "text-gray-600"
                          }`}
                        >
                          {p.has_stock_control ? stock.toFixed(0) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right">${Number(p.price_1 ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {p.price_2 != null ? `$${Number(p.price_2).toFixed(2)}` : "-"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => onPick(p, tier)}
                            className="text-xs bg-gray-900 text-white rounded px-2 py-1 hover:bg-gray-700 transition-colors"
                          >
                            T{tier} ${priceFor(p, tier).toFixed(2)}
                          </button>
                          {[1, 2, 3, 4]
                            .filter((t) => t !== tier)
                            .map((t) => {
                              const v =
                                t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
                              if (v == null) return null;
                              return (
                                <button
                                  key={t}
                                  onClick={() => onPick(p, t)}
                                  title={`Agregar con precio ${t}`}
                                  className="text-xs border border-gray-300 rounded px-1.5 py-1 ml-1 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
                                >
                                  T{t}
                                </button>
                              );
                            })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {loading && <p className="text-sm text-gray-400 p-4">Cargando...</p>}
              {!loading && rows.length === 0 && (
                <p className="text-sm text-gray-400 p-4">Sin coincidencias.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
