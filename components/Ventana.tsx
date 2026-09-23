"use client";

import { useEffect, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

/* ============================================================
   Piezas compartidas por todas las pantallas:
   - Ventana: cuadro centrado con titulo, cuerpo y pie de botones
   - Campo: etiqueta pequeña encima de un control
   - IconBtn: boton cuadrado pequeño para acciones de fila
   - Encabezado: titulo grande + subtitulo de cada seccion
   - Barra: contenedor blanco de la barra de accesos directos
   - Tarjeta: numero grande con etiqueta (resumenes)
   - Segmento: botones tipo pestaña (uno activo)
   ============================================================ */

export const inputCls =
  "w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400";

export function Ventana({
  titulo,
  subtitulo,
  icono: Icono,
  ancho = "max-w-lg",
  onClose,
  children,
  pie,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icono: LucideIcon;
  ancho?: string;
  onClose: () => void;
  children: ReactNode;
  pie?: ReactNode;
}) {
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-[2px] print:static print:block print:bg-transparent print:p-0 print:backdrop-blur-0"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${ancho} max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden print:max-h-none print:shadow-none print:border-0 print:rounded-none`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 print:hidden">
            <Icono size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-gray-900 truncate">{titulo}</h2>
            {subtitulo && <div className="text-[12px] text-gray-500">{subtitulo}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 print:hidden"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto print:overflow-visible">{children}</div>
        {pie && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-end gap-2 print:hidden">
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}

export function Campo({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function IconBtn({
  children,
  title,
  onClick,
  tone = "neutral",
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  tone?: "neutral" | "success" | "danger";
}) {
  const t =
    tone === "success"
      ? "hover:text-emerald-700 hover:bg-emerald-50"
      : tone === "danger"
      ? "hover:text-red-600 hover:bg-red-50"
      : "hover:text-brand-700 hover:bg-brand-50";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center text-gray-400 ${t}`}
    >
      {children}
    </button>
  );
}

export function Encabezado({
  titulo,
  children,
  derecha,
}: {
  titulo: string;
  children?: ReactNode;
  derecha?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3 print:hidden">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">{titulo}</h1>
        {children && <p className="text-[13px] text-gray-500">{children}</p>}
      </div>
      {derecha}
    </div>
  );
}

export function Barra({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-0.5 rounded-xl bg-white border border-gray-200 shadow-card px-1.5 py-1 overflow-x-auto print:hidden">
      {children}
    </div>
  );
}

export function Tarjeta({
  label,
  valor,
  sub,
  tono = "text-gray-900",
  subTono = "text-gray-400",
  icono: Icono,
  acento,
}: {
  label: string;
  valor: ReactNode;
  sub?: ReactNode;
  tono?: string;
  subTono?: string;
  icono?: LucideIcon;
  acento?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-card px-4 py-3">
      <p className="text-[11.5px] text-gray-500 flex items-center gap-1.5">
        {Icono && (
          <span className={`w-5 h-5 rounded-md flex items-center justify-center ${acento ?? "bg-gray-100 text-gray-500"}`}>
            <Icono size={12} />
          </span>
        )}
        {label}
      </p>
      <p className={`text-[21px] font-semibold tracking-tight ${tono}`}>{valor}</p>
      {sub && <p className={`text-[11px] ${subTono}`}>{sub}</p>}
    </div>
  );
}

export function Segmento<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { k: T; l: ReactNode; title?: string }[];
  valor: T;
  onChange: (k: T) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex gap-0.5 p-0.5 rounded-lg bg-gray-100">
      {opciones.map((o) => (
        <button
          key={o.k}
          type="button"
          role="radio"
          aria-checked={valor === o.k}
          title={o.title}
          onClick={() => onChange(o.k)}
          className={`h-7 px-2.5 rounded-md text-[12.5px] whitespace-nowrap ${
            valor === o.k
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* descarga una tabla como archivo que Excel abre directo */
export function descargarExcel(nombre: string, encabezados: string[], filas: (string | number)[][]) {
  const csv = [encabezados, ...filas]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
