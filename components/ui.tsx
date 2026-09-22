"use client";

/**
 * Piezas visuales compartidas por todo el sistema.
 * Cualquier pantalla las importa desde "@/components/ui".
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { AlertTriangle, HelpCircle, type LucideIcon } from "lucide-react";

/* ============================================================
   AVISOS FLOTANTES
   Mensajes que aparecen abajo a la derecha y se van solos.
   Para "listo, se guardo". NO para preguntar — para eso, confirmar().
   ============================================================ */

export const notify = {
  ok: (titulo: string, detalle?: string) =>
    toast.success(titulo, { description: detalle }),
  error: (titulo: string, detalle?: string) =>
    toast.error(titulo, { description: detalle, duration: 7000 }),
  info: (titulo: string, detalle?: string) =>
    toast(titulo, { description: detalle }),
  aviso: (titulo: string, detalle?: string) =>
    toast.warning(titulo, { description: detalle, duration: 6000 }),
};

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      duration={3500}
      toastOptions={{
        style: { fontFamily: "var(--font-inter), system-ui, sans-serif" },
      }}
    />
  );
}

/* ============================================================
   CONFIRMACION PROPIA
   Reemplaza al confirm() del navegador.
   Uso:  if (!(await confirmar({ titulo: "...", mensaje: "..." }))) return;
   ============================================================ */

export type OpcionesConfirmar = {
  titulo: string;
  mensaje: string;
  detalle?: string;
  textoSi?: string;
  textoNo?: string;
  peligro?: boolean;
};

let solicitar: ((o: OpcionesConfirmar) => Promise<boolean>) | null = null;

export function confirmar(o: OpcionesConfirmar): Promise<boolean> {
  if (solicitar) return solicitar(o);
  // respaldo por si el anfitrion no esta montado
  return Promise.resolve(
    typeof window !== "undefined" ? window.confirm(`${o.titulo}\n\n${o.mensaje}`) : false
  );
}

export function ConfirmHost() {
  const [actual, setActual] = useState<OpcionesConfirmar | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    solicitar = (o) =>
      new Promise<boolean>((res) => {
        resolver.current = res;
        setActual(o);
      });
    return () => {
      solicitar = null;
    };
  }, []);

  function cerrar(v: boolean) {
    resolver.current?.(v);
    resolver.current = null;
    setActual(null);
  }

  return (
    <DialogoConfirmar
      abierto={!!actual}
      titulo={actual?.titulo ?? ""}
      mensaje={actual?.mensaje ?? ""}
      detalle={actual?.detalle}
      textoSi={actual?.textoSi}
      textoNo={actual?.textoNo}
      peligro={actual?.peligro}
      onSi={() => cerrar(true)}
      onNo={() => cerrar(false)}
    />
  );
}

/** La ventana en si. La usan confirmar() y el componente Confirmar. */
export function DialogoConfirmar({
  abierto,
  titulo,
  mensaje,
  detalle,
  textoSi = "Confirmar",
  textoNo = "Cancelar",
  peligro = false,
  onSi,
  onNo,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  detalle?: string;
  textoSi?: string;
  textoNo?: string;
  peligro?: boolean;
  onSi: () => void;
  onNo: () => void;
}) {
  const botonSi = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => botonSi.current?.focus(), 30);
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onNo();
    }
    document.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, onNo]);

  if (!abierto) return null;

  const Icono = peligro ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-[2px]"
      onMouseDown={onNo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-titulo"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3.5 p-5">
          <span
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              peligro ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
            }`}
          >
            <Icono size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 id="confirmar-titulo" className="text-[15px] font-semibold text-gray-900">
              {titulo}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{mensaje}</p>
            {detalle && (
              <p className="mt-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-[12px] leading-relaxed text-gray-600">
                {detalle}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50/80 border-t border-gray-100">
          <button
            onClick={onNo}
            className="h-9 px-4 rounded-lg text-[13px] text-gray-700 hover:bg-gray-200/60"
          >
            {textoNo}
          </button>
          <button
            ref={botonSi}
            onClick={onSi}
            className={`h-9 px-4 rounded-lg text-[13px] font-medium text-white shadow-sm ${
              peligro ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {textoSi}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CAMPO NUMERICO
   A diferencia de <input type="number">, este SI deja borrar el cero.
   Acepta coma o punto como decimal.
   ============================================================ */

export function NumInput({
  value,
  onChange,
  className = "",
  placeholder = "0",
  id,
  onKeyDown,
  selectOnFocus = true,
  disabled,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  selectOnFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const aTexto = (v: number | null | undefined) =>
    v === null || v === undefined || v === 0 ? "" : String(v);
  const [txt, setTxt] = useState(aTexto(value));
  const enfocado = useRef(false);

  // si el valor cambia desde afuera (al cargar la nota), actualizar
  useEffect(() => {
    if (!enfocado.current) setTxt(aTexto(value));
  }, [value]);

  return (
    <input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      aria-label={ariaLabel}
      value={txt}
      placeholder={placeholder}
      className={className}
      onFocus={(e) => {
        enfocado.current = true;
        if (selectOnFocus) e.currentTarget.select();
      }}
      onBlur={() => {
        enfocado.current = false;
        setTxt(aTexto(value));
      }}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,-]/g, "");
        setTxt(t);
        const n = Number(t.replace(",", "."));
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

/* ============================================================
   BOTON DE BARRA: icono arriba, etiqueta abajo
   ============================================================ */

type Tono = "neutral" | "brand" | "success" | "danger";

const TONO_BARRA: Record<Tono, string> = {
  neutral: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  brand: "text-brand-700 hover:bg-brand-50",
  success: "text-emerald-700 hover:bg-emerald-50",
  danger: "text-red-600 hover:bg-red-50",
};

export function ToolbarButton({
  icon: Icono,
  label,
  onClick,
  tone = "neutral",
  disabled,
  active,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  tone?: Tono;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex flex-col items-center gap-1 min-w-[64px] px-2.5 py-1.5 rounded-lg transition-colors ${
        active ? "bg-brand-50 text-brand-700" : TONO_BARRA[tone]
      } disabled:opacity-30 disabled:pointer-events-none`}
    >
      <Icono size={18} strokeWidth={1.75} />
      <span className="text-[10.5px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

export function ToolbarSeparator() {
  return <div className="w-px self-stretch bg-gray-200 my-1.5 mx-1" />;
}

/* ============================================================
   PASTILLA DE ESTADO
   ============================================================ */

export type PillTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "violet"
  | "sky"
  | "orange";

const TONO_PILL: Record<PillTone, string> = {
  neutral: "bg-gray-100 text-gray-700 ring-gray-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  warning: "bg-amber-50 text-amber-800 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
  violet: "bg-violet-50 text-violet-800 ring-violet-100",
  sky: "bg-sky-50 text-sky-800 ring-sky-100",
  orange: "bg-orange-50 text-orange-800 ring-orange-100",
};

export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[1px] rounded-full text-[10.5px] font-medium ring-1 ring-inset ${TONO_PILL[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ============================================================
   ESTADO VACIO: explica que hacer, no solo "no hay nada"
   ============================================================ */

export function EmptyState({
  icon: Icono,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      <span className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-3">
        <Icono size={20} strokeWidth={1.75} />
      </span>
      <p className="text-[14px] font-medium text-gray-900">{title}</p>
      {children && (
        <div className="mt-1 max-w-md text-[12.5px] leading-relaxed text-gray-500">
          {children}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ============================================================
   SILUETAS DE CARGA: en vez de "Cargando..."
   ============================================================ */

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="px-3.5 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="skeleton h-3 w-14" />
          <div className="skeleton h-3 flex-1" style={{ maxWidth: `${60 + ((i * 17) % 35)}%` }} />
          <div className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
