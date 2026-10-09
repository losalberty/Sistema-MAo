"use client";

import { useEffect, type RefObject } from "react";

/* ============================================================
   Cierra un menu o cuadro desplegable cuando:
   - haces clic en cualquier otra parte de la pantalla, o
   - aprietas Esc.
   Se usa en todos los desplegables del sistema para que ninguno
   se quede abierto "pegado".
   ============================================================ */

export function useAlClicFuera(
  ref: RefObject<HTMLElement | null>,
  abierto: boolean,
  cerrar: () => void
) {
  useEffect(() => {
    if (!abierto) return;
    function clic(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) cerrar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
      }
    }
    // se espera un instante para que el mismo clic que lo abrio no lo cierre
    const t = setTimeout(() => {
      document.addEventListener("mousedown", clic, true);
      document.addEventListener("touchstart", clic, true);
    }, 0);
    document.addEventListener("keydown", tecla, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", clic, true);
      document.removeEventListener("touchstart", clic, true);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [ref, abierto, cerrar]);
}
