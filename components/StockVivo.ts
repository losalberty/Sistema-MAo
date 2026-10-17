"use client";

/* ============================================================
   STOCK EN VIVO
   Cada vez que cambia el estante de un repuesto (alguien guarda
   una nota, llega mercancia, un ajuste...), la base de datos lo
   avisa al momento a todas las pantallas abiertas.
   Usa Supabase Realtime sobre la tabla "stock_vivo" (v39).
   ============================================================ */

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export type CambioStock = { product_id: string; estante: number; apartado: number };

export function useStockVivo(alCambiar: (c: CambioStock) => void) {
  const ref = useRef(alCambiar);
  ref.current = alCambiar;

  useEffect(() => {
    const nombre = `stock-vivo-${Math.random().toString(36).slice(2, 9)}`;
    const canal = supabase
      .channel(nombre)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_vivo" },
        (p: { new?: Record<string, unknown> }) => {
          const r = p.new;
          if (!r || !r.product_id) return;
          ref.current({
            product_id: String(r.product_id),
            estante: Number(r.estante ?? 0),
            apartado: Number(r.apartado ?? 0),
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);
}
