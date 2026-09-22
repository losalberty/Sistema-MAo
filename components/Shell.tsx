"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Wallet,
  Undo2,
  Users,
  ClipboardList,
  Receipt,
  Package,
  Boxes,
  ChartColumn,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Item = { label: string; icon: LucideIcon; href: string | null };
type Grupo = { titulo: string | null; items: Item[] };

// El menu agrupado por lo que haces, no por orden alfabetico.
const GRUPOS: Grupo[] = [
  {
    titulo: null,
    items: [{ label: "Panel", icon: LayoutDashboard, href: "/" }],
  },
  {
    titulo: "Ventas",
    items: [
      { label: "Notas", icon: FileText, href: "/notas" },
      { label: "Cobranzas", icon: Wallet, href: "/cobranzas" },
      { label: "Devoluciones", icon: Undo2, href: "/devoluciones" },
      { label: "Clientes", icon: Users, href: "/clientes" },
    ],
  },
  {
    titulo: "Compras",
    items: [
      { label: "Pedidos", icon: ClipboardList, href: "/pedidos" },
      { label: "Facturas de compra", icon: Receipt, href: "/compras" },
    ],
  },
  {
    titulo: "Catalogo",
    items: [
      { label: "Productos", icon: Package, href: "/productos" },
      { label: "Inventario", icon: Boxes, href: "/inventario" },
    ],
  },
  {
    titulo: "Analisis",
    items: [{ label: "Informes", icon: ChartColumn, href: "/informes" }],
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("nav_collapsed") === "1");
    } catch {}
    setReady(true);
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("nav_collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const inicial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex">
      <aside
        className={`sticky top-0 h-screen bg-brand-950 text-brand-100 flex flex-col shrink-0 print:hidden transition-[width] duration-200 ${
          collapsed ? "w-[64px]" : "w-[228px]"
        }`}
      >
        {/* ---------- marca ---------- */}
        <div
          className={`flex items-center h-14 border-b border-white/[0.06] ${
            collapsed ? "justify-center" : "px-4 justify-between"
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-brand-500 text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
                S
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-white leading-tight truncate">
                  Save Notas
                </p>
                <p className="text-[10.5px] text-brand-300 leading-tight">
                  sistema de gestion
                </p>
              </div>
            </div>
          )}
          <button
            onClick={toggle}
            title={collapsed ? "Mostrar menu" : "Ocultar menu"}
            aria-label={collapsed ? "Mostrar menu" : "Ocultar menu"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpen size={17} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose size={17} strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* ---------- navegacion ---------- */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {GRUPOS.map((g, gi) => (
            <div key={gi} className={gi > 0 ? "mt-4" : ""}>
              {g.titulo &&
                (collapsed ? (
                  <div className="mx-2 mb-2 h-px bg-white/[0.07]" />
                ) : (
                  <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                    {g.titulo}
                  </p>
                ))}
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const Icono = item.icon;
                  const active = item.href ? isActive(item.href) : false;
                  return (
                    <Link
                      key={item.href ?? item.label}
                      href={item.href ?? "#"}
                      title={item.label}
                      className={`relative flex items-center gap-2.5 rounded-lg text-[13px] transition-colors ${
                        collapsed ? "justify-center h-9" : "px-2.5 h-9"
                      } ${
                        active
                          ? "bg-white/[0.09] text-white font-medium"
                          : "text-brand-200 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand-400" />
                      )}
                      <Icono size={17} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ---------- pie: configuracion y usuario ---------- */}
        <div className="border-t border-white/[0.06] p-2.5">
          <div
            title="Configuracion — proximamente"
            className={`flex items-center gap-2.5 rounded-lg text-[13px] text-brand-400/60 cursor-default ${
              collapsed ? "justify-center h-9" : "px-2.5 h-9"
            }`}
          >
            <Settings size={17} strokeWidth={1.75} className="shrink-0" />
            {!collapsed && (
              <>
                <span>Configuracion</span>
                <span className="ml-auto text-[9.5px] uppercase tracking-wide">pronto</span>
              </>
            )}
          </div>

          <div
            className={`mt-1.5 flex items-center gap-2.5 rounded-lg ${
              collapsed ? "flex-col py-1" : "px-2 py-1.5"
            }`}
          >
            <span
              title={email ?? ""}
              className="w-7 h-7 rounded-full bg-brand-700 text-white text-[11.5px] font-medium flex items-center justify-center shrink-0"
            >
              {inicial}
            </span>
            {!collapsed && (
              <span className="flex-1 min-w-0 text-[11.5px] text-brand-200 truncate">
                {email ?? "…"}
              </span>
            )}
            <button
              onClick={handleLogout}
              title="Cerrar sesion"
              aria-label="Cerrar sesion"
              className="w-7 h-7 rounded-md flex items-center justify-center text-brand-300 hover:text-red-300 hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">{ready ? children : null}</div>
    </div>
  );
}
