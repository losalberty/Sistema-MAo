"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardList,
  CornerDownLeft,
  FilePlus2,
  FileText,
  HandCoins,
  LayoutDashboard,
  Package,
  Receipt,
  Search,
  Truck,
  Undo2,
  Upload,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ============================================================
   Buscador universal (Ctrl + K)
   Escribes y salen acciones, pantallas, clientes, notas,
   productos y proveedores. Flechas para moverte, Enter para abrir.
   ============================================================ */

type Opcion = {
  grupo: string;
  titulo: string;
  sub?: string;
  icono?: LucideIcon;
  inicial?: string;
  color?: string;
  atajo?: string;
  derecha?: string;
  ir: string;
};

type Resultado = {
  clientes: { id: string; name: string; city: string | null; phone: string | null; tax_id: string | null }[];
  notas: {
    id: string;
    sequence_number: number;
    note_date: string;
    total: number;
    cliente: string;
    falta: number;
    payment_status: string;
  }[];
  productos: { id: string; code: string; description: string; price_1: number; stock: number; supply_type: string }[];
  proveedores: { id: string; name: string; active: boolean }[];
};

const ACCIONES: Opcion[] = [
  { grupo: "Acciones", titulo: "Nueva nota", icono: FilePlus2, atajo: "N", ir: "/notas/nueva" },
  { grupo: "Acciones", titulo: "Registrar un abono", sub: "ver quien debe", icono: HandCoins, ir: "/cobranzas" },
  { grupo: "Acciones", titulo: "Nuevo cliente", icono: UserPlus, ir: "/clientes?nuevo=1" },
  { grupo: "Acciones", titulo: "Registrar factura de compra", icono: Receipt, ir: "/compras" },
  { grupo: "Acciones", titulo: "Cargar cantidades al inventario", icono: Upload, ir: "/inventario" },
];

const PANTALLAS: Opcion[] = [
  { grupo: "Ir a", titulo: "Panel", icono: LayoutDashboard, ir: "/" },
  { grupo: "Ir a", titulo: "Notas", icono: FileText, ir: "/notas" },
  { grupo: "Ir a", titulo: "Cobranzas", icono: Wallet, ir: "/cobranzas" },
  { grupo: "Ir a", titulo: "Devoluciones", icono: Undo2, ir: "/devoluciones" },
  { grupo: "Ir a", titulo: "Clientes", icono: Users, ir: "/clientes" },
  { grupo: "Ir a", titulo: "Pedidos", icono: ClipboardList, ir: "/pedidos" },
  { grupo: "Ir a", titulo: "Facturas de compra", icono: Receipt, ir: "/compras" },
  { grupo: "Ir a", titulo: "Productos", icono: Package, ir: "/productos" },
  { grupo: "Ir a", titulo: "Inventario", icono: Boxes, ir: "/inventario" },
  { grupo: "Ir a", titulo: "Informes", icono: BarChart3, ir: "/informes" },
];

const COLORES = ["#3b5ba0", "#0f8a5f", "#b46a06", "#6d4bd1", "#1d7fbf", "#c2410c", "#be185d", "#0e7490"];

export function colorDe(texto: string) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return COLORES[h % COLORES.length];
}

export function iniciales(nombre: string) {
  const p = nombre
    .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length > 2);
  return (p.length ? p : [nombre]).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fecha(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

function quitaAcentos(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Paleta({ abierto, onClose }: { abierto: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Resultado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const turno = useRef(0);

  // al abrir: limpiar y poner el cursor
  useEffect(() => {
    if (!abierto) return;
    setQ("");
    setRes(null);
    setSel(0);
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [abierto]);

  // buscar en la base mientras escribes (espera un instante)
  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2 && !/^#?\d+$/.test(texto)) {
      setRes(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const mio = ++turno.current;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("global_search", { p_text: texto });
      if (mio !== turno.current) return;
      setBuscando(false);
      setRes((data ?? null) as Resultado | null);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const opciones = useMemo<Opcion[]>(() => {
    const texto = quitaAcentos(q.trim());
    const fijas = [...ACCIONES, ...PANTALLAS].filter(
      (o) => !texto || quitaAcentos(o.titulo + " " + (o.sub ?? "")).includes(texto)
    );
    if (!texto) return fijas;
    const r = res;
    const extra: Opcion[] = [];
    const porNumero = /^#?\d+$/.test(q.trim());
    const notas: Opcion[] = [];
    const gente: Opcion[] = [];
    r?.notas.forEach((n) =>
      notas.push({
        grupo: "Notas",
        titulo: `Nota #${n.sequence_number} · ${n.cliente}`,
        sub: fecha(n.note_date),
        icono: FileText,
        derecha: n.falta > 0.005 && n.payment_status !== "ANULADO" ? `debe ${money(n.falta)}` : money(n.total),
        ir: `/notas/ver?id=${n.id}`,
      })
    );
    r?.clientes.forEach((c) =>
      gente.push({
        grupo: "Clientes",
        titulo: c.name,
        sub: [c.city, c.phone].filter(Boolean).join(" · "),
        inicial: iniciales(c.name),
        color: colorDe(c.name),
        ir: `/clientes?id=${c.id}`,
      })
    );
    // si escribes un numero van primero las notas; si escribes un nombre, los clientes
    if (porNumero) extra.push(...notas, ...gente);
    else extra.push(...gente, ...notas);
    r?.productos.forEach((p) =>
      extra.push({
        grupo: "Productos",
        titulo: p.description,
        sub: p.code,
        icono: Package,
        derecha: p.supply_type === "PEDIDO" ? "bajo pedido" : p.stock > 0 ? `${p.stock} en stock` : "agotado",
        ir: `/productos?buscar=${encodeURIComponent(p.code)}`,
      })
    );
    r?.proveedores.forEach((s) =>
      extra.push({
        grupo: "Proveedores",
        titulo: s.name,
        sub: s.active ? "proveedor" : "archivado",
        icono: Truck,
        ir: "/compras",
      })
    );
    return [...extra, ...fijas];
  }, [q, res]);

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(opciones.length - 1, 0)));
  }, [opciones.length]);

  // que la opcion marcada siempre se vea
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function abrir(o: Opcion | undefined) {
    if (!o) return;
    onClose();
    router.push(o.ir);
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, opciones.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      abrir(opciones[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  let grupoAnterior = "";

  return (
    <div
      className={`fixed inset-0 z-[70] print:hidden transition-opacity duration-150 ${
        abierto ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!abierto}
    >
      <div className="absolute inset-0 bg-gray-950/30 backdrop-blur-[2px]" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        className={`absolute left-1/2 top-[13vh] w-[640px] max-w-[92vw] -translate-x-1/2 rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden transition-transform duration-150 ${
          abierto ? "scale-100" : "scale-[0.97]"
        }`}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
          <Search size={18} className={buscando ? "text-brand-600 animate-pulse" : "text-gray-400"} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={tecla}
            placeholder="Busca un cliente, un nº de nota, un repuesto… o lo que quieres hacer"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-gray-400"
          />
          <kbd className="text-[10.5px] px-1.5 py-0.5 rounded-md border border-gray-200 text-gray-400 bg-gray-50 font-sans">
            Esc
          </kbd>
        </div>

        <div ref={lista} className="max-h-[400px] overflow-y-auto p-1.5">
          {opciones.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">
              {buscando ? "Buscando…" : `Nada coincide con “${q}”`}
            </p>
          )}
          {opciones.map((o, i) => {
            const cabecera = o.grupo !== grupoAnterior;
            grupoAnterior = o.grupo;
            const Icono = o.icono;
            const on = i === sel;
            return (
              <div key={o.grupo + o.titulo + i}>
                {cabecera && <p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-gray-400">{o.grupo}</p>}
                <button
                  data-i={i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => abrir(o)}
                  className={`w-full flex items-center gap-3 h-10 px-2.5 rounded-lg text-left ${
                    on ? "bg-gray-100 text-gray-900" : "text-gray-600"
                  }`}
                >
                  {o.inicial ? (
                    <span
                      className="w-6 h-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center shrink-0"
                      style={{ background: o.color }}
                    >
                      {o.inicial}
                    </span>
                  ) : Icono ? (
                    <Icono size={16} className={on ? "text-brand-700 shrink-0" : "text-gray-400 shrink-0"} />
                  ) : null}
                  <span className="truncate text-[13.5px] text-gray-900">{o.titulo}</span>
                  {o.sub && <span className="truncate text-[12px] text-gray-400">{o.sub}</span>}
                  <span className="ml-auto flex items-center gap-2 shrink-0">
                    {o.derecha && <span className="text-[12px] text-gray-500">{o.derecha}</span>}
                    {o.atajo && (
                      <kbd className="text-[10.5px] px-1.5 py-0.5 rounded-md border border-gray-200 text-gray-400 bg-gray-50 font-sans">
                        {o.atajo}
                      </kbd>
                    )}
                    {on && <ArrowRight size={14} className="text-gray-400" />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 text-[11.5px] text-gray-400">
          <span>↑ ↓ moverse</span>
          <span className="flex items-center gap-1">
            <CornerDownLeft size={12} /> abrir
          </span>
          <span className="ml-auto">Abre este buscador desde cualquier lado con Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
