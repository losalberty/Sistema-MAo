"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ClienteHit = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  notes_count: number;
  last_note: string | null;
};

export default function ClientePicker({
  value,
  onChange,
  placeholder = "Escribe el nombre del cliente",
  todosLabel = "Todos los clientes",
  autoFocus = false,
}: {
  value: ClienteHit | null;
  onChange: (c: ClienteHit | null) => void;
  placeholder?: string;
  todosLabel?: string;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [hits, setHits] = useState<ClienteHit[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async (q: string) => {
    setBuscando(true);
    const { data } = await supabase.rpc("search_clients", {
      p_text: q,
      p_limit: 10,
    });
    setBuscando(false);
    setHits((data ?? []) as ClienteHit[]);
    setActivo(0);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => buscar(texto), 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [texto, abierto, buscar]);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  function elegir(c: ClienteHit) {
    onChange(c);
    setTexto("");
    setAbierto(false);
  }

  function limpiar() {
    onChange(null);
    setTexto("");
    setHits([]);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto) {
      if (e.key === "ArrowDown") {
        setAbierto(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[activo]) elegir(hits[activo]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  if (value) {
    return (
      <div className="h-9 px-2.5 border border-indigo-300 bg-indigo-50/40 rounded-lg text-sm flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-gray-900">{value.name}</span>
        {value.city && (
          <span className="text-[11px] text-gray-500 shrink-0">{value.city}</span>
        )}
        <button
          onClick={limpiar}
          className="text-gray-400 hover:text-gray-900 shrink-0 text-base leading-none"
          aria-label="Quitar cliente"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div ref={caja} className="relative">
      <input
        value={texto}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
      />

      {abierto && (
        <div className="absolute left-0 right-0 top-10 z-40 bg-white border border-gray-200 rounded-xl shadow-xl p-1 max-h-72 overflow-y-auto">
          {buscando && hits.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-gray-400">Buscando...</p>
          )}

          {!buscando && hits.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-gray-400">
              Ningun cliente coincide con &quot;{texto}&quot;
            </p>
          )}

          {hits.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(c)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg ${
                i === activo ? "bg-indigo-50" : ""
              }`}
            >
              <div
                className={`text-[12.5px] ${
                  i === activo ? "text-indigo-800" : "text-gray-800"
                }`}
              >
                {c.name}
              </div>
              <div className="text-[10.5px] text-gray-500">
                {[
                  c.city,
                  c.phone,
                  `${c.notes_count} ${c.notes_count === 1 ? "nota" : "notas"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </button>
          ))}

          {hits.length > 0 && (
            <div className="px-2.5 pt-1.5 pb-1 border-t border-gray-100 mt-1 flex items-center gap-2">
              <span className="text-[10.5px] text-gray-400">
                ↑↓ para moverte · Enter para elegir
              </span>
              <button
                onClick={() => {
                  limpiar();
                  setAbierto(false);
                }}
                className="ml-auto text-[10.5px] text-gray-400 hover:text-gray-700 underline"
              >
                {todosLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
