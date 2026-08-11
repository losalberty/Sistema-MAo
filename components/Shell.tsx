"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const navItems: { label: string; icon: string; href: string | null }[] = [
  { label: "Panel", icon: "▣", href: "/" },
  { label: "Notas", icon: "☷", href: "/notas" },
  { label: "Clientes", icon: "▤", href: "/clientes" },
  { label: "Productos", icon: "▦", href: "/productos" },
  { label: "Compras", icon: "▩", href: "/compras" },
  { label: "Informes", icon: "▧", href: "/informes" },
  { label: "Configuracion", icon: "⚙", href: null },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("nav_collapsed") === "1");
    } catch {}
    setReady(true);
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

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col shrink-0 print:hidden transition-all duration-200 ${
          collapsed ? "w-14 p-2" : "w-52 p-4"
        }`}
      >
        <div className={`flex items-center mb-6 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <p className="text-base font-medium tracking-tight leading-tight">
              Sistema Save Notas
            </p>
          )}
          <button
            onClick={toggle}
            title={collapsed ? "Mostrar menu" : "Ocultar menu"}
            aria-label={collapsed ? "Mostrar menu" : "Ocultar menu"}
            className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md w-7 h-7 flex items-center justify-center shrink-0 transition-colors"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = item.href ? isActive(item.href) : false;
            const classes = `flex items-center gap-2 rounded-md text-sm transition-colors ${
              collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
            } ${
              active
                ? "bg-indigo-600 text-white"
                : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
            }`;
            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={classes} title={item.label}>
                  <span className="text-xs">{item.icon}</span>
                  {!collapsed && item.label}
                </Link>
              );
            }
            return (
              <div
                key={item.label}
                className={`${classes} opacity-40 cursor-default`}
                title={item.label}
              >
                <span className="text-xs">{item.icon}</span>
                {!collapsed && item.label}
              </div>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          title="Cerrar sesion"
          className={`mt-auto text-xs text-gray-400 hover:text-red-500 transition-colors ${
            collapsed ? "text-center" : "text-left"
          }`}
        >
          {collapsed ? "⏻" : "Cerrar sesion"}
        </button>
      </aside>

      <div className="flex-1 min-w-0">{ready ? children : null}</div>
    </div>
  );
}
