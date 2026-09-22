"use client";

import { useEffect } from "react";

export type Pregunta = {
  titulo: string;
  mensaje: string;
  detalle?: string;
  textoOk?: string;
  tono?: "normal" | "peligro";
  onSi: () => void;
};

/**
 * Dialogo de confirmacion del propio sistema.
 * Reemplaza al confirm() del navegador, que se ve como una ventana ajena.
 */
export default function Confirmar({
  pregunta,
  onCerrar,
}: {
  pregunta: Pregunta | null;
  onCerrar: () => void;
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (!pregunta) return;
      if (e.key === "Escape") onCerrar();
      if (e.key === "Enter") {
        pregunta.onSi();
        onCerrar();
      }
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [pregunta, onCerrar]);

  if (!pregunta) return null;

  const peligro = pregunta.tono === "peligro";

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-[60] p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-5 py-3 border-b ${
            peligro
              ? "bg-red-50 border-red-100"
              : "bg-gray-50 border-gray-100"
          }`}
        >
          <p
            className={`text-[14px] font-medium ${
              peligro ? "text-red-800" : "text-gray-900"
            }`}
          >
            {pregunta.titulo}
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-[13.5px] text-gray-700 leading-relaxed">
            {pregunta.mensaje}
          </p>
          {pregunta.detalle && (
            <p className="mt-2 text-[12px] text-gray-500 leading-relaxed">
              {pregunta.detalle}
            </p>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100 justify-end">
          <button
            onClick={onCerrar}
            className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-[13px] text-gray-600 hover:bg-white"
          >
            No, volver
          </button>
          <button
            onClick={() => {
              pregunta.onSi();
              onCerrar();
            }}
            autoFocus
            className={`px-3.5 py-1.5 rounded-lg text-[13px] text-white ${
              peligro
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gray-900 hover:bg-gray-700"
            }`}
          >
            {pregunta.textoOk ?? "Si, continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}
