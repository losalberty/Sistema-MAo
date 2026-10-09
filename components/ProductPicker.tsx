"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ============================================================
   Catalogo de productos para la nota.
   - Tocar cualquier fila agrega el repuesto (con la tarifa del cliente).
   - Los botones T1..T4 lo agregan con otra tarifa.
   - El catalogo se queda abierto para agregar varios seguidos;
     se cierra con "Listo", con Esc o tocando afuera.
   ============================================================ */

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
  supply_type?: string | null;
};

type Category = { category: string; total: number };

const TARIFAS: Record<number, string> = { 1: "Contado", 2: "Credito", 3: "Tarifa 3", 4: "Tarifa 4" };

function precio(p: PickerProduct, t: number) {
  const v = t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
  return Number(v ?? p.price_1 ?? 0);
}

export default function ProductPicker({
  tier,
  onPick,
  onClose,
}: {
  tier: number;
  onPick: (p: PickerProduct, tierUsed: number) => void;
  onClose: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [marcado, setMarcado] = useState(0);
  // cuantas veces se agrego cada repuesto mientras el catalogo esta abierto
  const [agregados, setAgregados] = useState<Record<string, number>>({});
  const [ultimo, setUltimo] = useState<string | null>(null);
  const turno = useRef(0);

  const load = useCallback(async (text: string, cat: string) => {
    const mio = ++turno.current;
    setLoading(true);
    let data: PickerProduct[] = [];
    if (text.trim().length >= 2) {
      const r = await supabase.rpc("buscar_para_nota", { p_text: text.trim() });
      data = ((r.data ?? []) as PickerProduct[]).filter((p) => !cat || p.category === cat);
    } else {
      const r = await supabase.rpc("list_products", { search_text: "", p_price_list: "", p_category: cat });
      data = ((r.data ?? []) as PickerProduct[]).slice(0, 500);
    }
    if (mio !== turno.current) return;
    setRows(data);
    setMarcado(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.rpc("list_categories").then(({ data }) => setCategories((data ?? []) as Category[]));
    load("", "");
  }, [load]);

  // buscar mientras escribes (espera un instante)
  useEffect(() => {
    const t = setTimeout(() => load(search, activeCat), 220);
    return () => clearTimeout(t);
  }, [search, activeCat, load]);

  // Esc cierra el catalogo
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const abiertos = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"] *)')
      );
      if (abiertos[abiertos.length - 1] !== raiz.current) return;
      onClose();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onClose]);

  useEffect(() => {
    lista.current?.querySelector(`[data-i="${marcado}"]`)?.scrollIntoView({ block: "nearest" });
  }, [marcado]);

  function agregar(p: PickerProduct, t: number) {
    onPick(p, t);
    setAgregados((a) => ({ ...a, [p.id]: (a[p.id] ?? 0) + 1 }));
    setUltimo(p.id);
    setTimeout(() => setUltimo((u) => (u === p.id ? null : u)), 900);
  }

  function teclaBuscador(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcado((m) => Math.min(m + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcado((m) => Math.max(m - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = rows[marcado];
      if (p) agregar(p, tier);
    }
  }

  const total = Object.values(agregados).reduce((s, n) => s + n, 0);

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-modal="true"
      aria-label="Catalogo de productos"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-5xl h-[84vh] flex flex-col rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* cabecera */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
          <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
            <BookOpen size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-gray-900">Catalogo de productos</h2>
            <p className="text-[12.5px] text-gray-500">
              Toca un repuesto para agregarlo a la nota · precio de tarifa {TARIFAS[tier] ?? tier}
            </p>
          </div>
          {total > 0 && (
            <span className="h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-[12.5px] font-medium inline-flex items-center gap-1">
              <Check size={13} /> {total} agregado{total === 1 ? "" : "s"}
            </span>
          )}
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-[9px] text-[13px] font-medium text-white bg-gradient-to-b from-brand-600 to-brand-800 border border-brand-900 shadow-sm hover:brightness-110"
          >
            Listo
          </button>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* grupos */}
          <div className="w-56 shrink-0 border-r border-gray-100 overflow-y-auto p-2.5 bg-gray-50/50">
            <p className="px-2 pb-1.5 text-[11px] font-medium text-gray-400">Grupos</p>
            {[{ category: "", total: 0 }, ...categories].map((c) => {
              const on = activeCat === c.category;
              return (
                <button
                  key={c.category || "__todos"}
                  onClick={() => setActiveCat(c.category)}
                  className={`w-full flex items-center gap-2 text-left text-[13px] px-2.5 py-1.5 rounded-lg mb-px ${
                    on ? "bg-white text-gray-900 font-medium ring-1 ring-gray-200 shadow-sm" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">{c.category || "Todos"}</span>
                  {c.category && <span className="text-[11px] text-gray-400">{c.total}</span>}
                </button>
              );
            })}
          </div>

          {/* lista */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-[10px] text-[14px] bg-white focus:border-brand-500"
                  placeholder="Buscar por codigo, descripcion, marca o grupo (ej: cruceta 1410)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={teclaBuscador}
                />
              </div>
              <p className="mt-1.5 text-[11.5px] text-gray-400">
                ↑↓ para moverte · Enter agrega el marcado · puedes agregar varios antes de cerrar
              </p>
            </div>

            <div className="flex gap-3 items-center px-4 h-9 text-[11px] font-medium text-gray-400 bg-gray-50/60 border-b border-gray-100">
              <span className="w-28">Codigo</span>
              <span className="flex-1 min-w-0">Descripcion</span>
              <span className="w-24 text-center">Existencia</span>
              <span className="w-24 text-right">Precio</span>
              <span className="w-[140px] text-right">Otra tarifa</span>
            </div>

            <div ref={lista} className="flex-1 overflow-y-auto">
              {rows.map((p, i) => {
                const stock = Number(p.stock_quantity ?? 0);
                const pedido = p.supply_type === "PEDIDO";
                const veces = agregados[p.id] ?? 0;
                const recien = ultimo === p.id;
                return (
                  <div
                    key={p.id}
                    data-i={i}
                    role="button"
                    tabIndex={-1}
                    onMouseEnter={() => setMarcado(i)}
                    onClick={() => agregar(p, tier)}
                    title="Tocar para agregar a la nota"
                    className={`group flex gap-3 items-center px-4 py-2.5 border-b border-gray-50 cursor-pointer transition-colors ${
                      recien ? "bg-emerald-50" : i === marcado ? "bg-brand-50/50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-28 shrink-0 font-mono text-[11.5px] text-gray-500 truncate">{p.code}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-gray-900 truncate">{p.description}</span>
                      {(p.brand || p.category) && (
                        <span className="block text-[11px] text-gray-400 truncate">
                          {[p.brand, p.category].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="w-24 shrink-0 flex justify-center">
                      {pedido ? (
                        <span className="text-[11px] px-1.5 py-px rounded-md bg-violet-50 text-violet-700">bajo pedido</span>
                      ) : stock <= 0 ? (
                        <span className="text-[11px] px-1.5 py-px rounded-md bg-red-50 text-red-600">agotado</span>
                      ) : (
                        <span
                          className={`text-[11px] px-1.5 py-px rounded-md ${
                            stock <= 5 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {stock} en stock
                        </span>
                      )}
                    </span>
                    <span className="w-24 shrink-0 text-right">
                      <span className="block text-[13.5px] font-semibold text-gray-900">${precio(p, tier).toFixed(2)}</span>
                      {veces > 0 && (
                        <span className="text-[11px] text-emerald-700 inline-flex items-center gap-0.5">
                          <Check size={11} /> {veces} en la nota
                        </span>
                      )}
                    </span>
                    <span className="w-[140px] shrink-0 flex justify-end gap-1">
                      {[1, 2, 3, 4]
                        .filter((t) => t !== tier)
                        .map((t) => {
                          const v = t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
                          if (v == null) return null;
                          return (
                            <button
                              key={t}
                              onClick={(e) => {
                                e.stopPropagation();
                                agregar(p, t);
                              }}
                              title={`Agregar con ${TARIFAS[t]}: $${Number(v).toFixed(2)}`}
                              className="h-7 px-1.5 rounded-md text-[11px] border border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700"
                            >
                              T{t}
                            </button>
                          );
                        })}
                      <span className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 group-hover:text-brand-700 group-hover:bg-brand-50">
                        <Plus size={15} />
                      </span>
                    </span>
                  </div>
                );
              })}
              {loading && rows.length === 0 && <p className="text-sm text-gray-400 p-4">Cargando...</p>}
              {!loading && rows.length === 0 && <p className="text-sm text-gray-400 p-6 text-center">Sin coincidencias.</p>}
            </div>

            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-[12px] text-gray-500">
              <span>{rows.length} mostrados</span>
              <span className="ml-auto">
                {total > 0 ? `${total} agregado${total === 1 ? "" : "s"} a la nota` : "todavia no agregaste nada"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
