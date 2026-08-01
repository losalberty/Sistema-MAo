"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabase";

const navItems = [
  { label: "Panel", icon: "▣", active: true, href: "/" },
  { label: "Notas", icon: "☷", href: "/notas" },
  { label: "Clientes", icon: "▤", href: null },
  { label: "Productos", icon: "▦", href: null },
  { label: "Configuracion", icon: "⚙", href: null },
];

export default function Home() {
  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-52 bg-white border-r border-gray-200 p-4 flex flex-col">
        <p className="text-base font-medium mb-8 tracking-tight">Sistema Save Notas</p>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const classes = `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              item.active
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`;
            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={classes}>
                  <span className="text-xs">{item.icon}</span>
                  {item.label}
                </Link>
              );
            }
            return (
              <div key={item.label} className={`${classes} opacity-50 cursor-default`}>
                <span className="text-xs">{item.icon}</span>
                {item.label}
              </div>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="mt-auto text-xs text-gray-400 hover:text-gray-700 text-left"
        >
          Cerrar sesion
        </button>
      </aside>

      <main className="flex-1 p-10">
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-xl font-medium mb-1">Buenos dias, Mao</h1>
            <p className="text-sm text-gray-500">Panel general</p>
          </div>
          <Link
            href="/notas/nueva"
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md transition-colors hover:bg-gray-700 active:scale-[0.98]"
          >
            + Nueva nota
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-400 mb-1">Accion rapida</p>
            <p className="text-sm text-gray-600 mb-4">
              Crea una nota de entrega en menos de un minuto.
            </p>
            <Link
              href="/notas/nueva"
              className="inline-block text-sm border border-gray-300 rounded-md px-3 py-1.5 transition-colors hover:bg-gray-900 hover:text-white hover:border-gray-900"
            >
              Crear nota
            </Link>
          </div>

          <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-center text-center">
            <div>
              <p className="text-sm text-gray-500 mb-1">Aqui vamos a ver pronto tu resumen</p>
              <p className="text-xs text-gray-400">
                Ventas de hoy, notas pendientes y alertas de stock — se agrega en la siguiente fase.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
