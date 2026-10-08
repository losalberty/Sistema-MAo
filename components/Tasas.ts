"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/* ============================================================
   Tasas del dia (BCV, Binance, pesos), compartidas por todo el
   sistema. Se piden una sola vez y cualquier pantalla las lee.
   ============================================================ */

export type Tasas = {
  rate_date?: string | null;
  bcv?: number | null;
  binance?: number | null;
  cop?: number | null;
  updated_at?: string | null;
  hoy?: string;
};

let actual: Tasas | null = null;
let pidiendo: Promise<Tasas | null> | null = null;
const oyentes = new Set<(t: Tasas | null) => void>();

function avisar() {
  oyentes.forEach((f) => f(actual));
}

export function cargarTasas(forzar = false): Promise<Tasas | null> {
  if (actual && !forzar) return Promise.resolve(actual);
  if (pidiendo && !forzar) return pidiendo;
  pidiendo = Promise.resolve(supabase.rpc("get_rates")).then(({ data, error }) => {
    pidiendo = null;
    if (error) return actual;
    actual = (data ?? null) as Tasas | null;
    avisar();
    return actual;
  });
  return pidiendo;
}

export async function guardarTasas(bcv: number, binance: number, cop: number) {
  const { data, error } = await supabase.rpc("save_rates", {
    p_bcv: bcv,
    p_binance: binance,
    p_cop: cop,
  });
  if (error) throw new Error(error.message);
  actual = (data ?? null) as Tasas | null;
  avisar();
  return actual;
}

/** La tasa que corresponde a una moneda de nota. 0 si no hay. */
export function tasaPara(moneda: string, t: Tasas | null | undefined): number {
  if (!t) return 0;
  if (moneda === "BS_BCV") return Number(t.bcv) || 0;
  if (moneda === "BS_BINANCE") return Number(t.binance) || 0;
  if (moneda === "COP") return Number(t.cop) || 0;
  return 1;
}

/** true si las tasas guardadas son de hoy */
export function sonDeHoy(t: Tasas | null | undefined) {
  return !!t?.rate_date && t.rate_date === t.hoy;
}

export function useTasas() {
  const [t, setT] = useState<Tasas | null>(actual);
  useEffect(() => {
    oyentes.add(setT);
    cargarTasas();
    return () => {
      oyentes.delete(setT);
    };
  }, []);
  return t;
}
