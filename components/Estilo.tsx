"use client";

/* ============================================================
   TEMA VISUAL DEL SISTEMA
   - "clasico": el diseño de siempre (es el tema base).
   - "dinamic": tarjetas redondeadas, fondo crema, menú negro,
     acentos amarillos y animaciones suaves.
   Se guarda en el USUARIO (en Supabase, dentro de su cuenta):
   cada asesor tiene el suyo y lo ve igual en cualquier computadora.
   Tambien se recuerda en la computadora, para pintarlo al instante
   al abrir el sistema, sin parpadeo.
   El modo oscuro (la luna) funciona con los dos.
   ============================================================ */

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type Estilo = "clasico" | "dinamic";

const CLAVE = "estilo";

function actual(): Estilo {
  if (typeof document === "undefined") return "clasico";
  return document.documentElement.classList.contains("dinamic") ? "dinamic" : "clasico";
}

/* cambia el tema en pantalla; con guardarEnUsuario=true tambien lo guarda en la cuenta */
export function aplicarEstilo(e: Estilo, guardarEnUsuario = true) {
  const html = document.documentElement;
  // durante el cambio se apagan las transiciones para que todo cambie de golpe
  html.classList.add("sn-cambiando");
  html.classList.toggle("dinamic", e === "dinamic");
  try {
    localStorage.setItem(CLAVE, e);
  } catch {}
  window.dispatchEvent(new CustomEvent<Estilo>("sn-estilo", { detail: e }));
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("sn-cambiando")));
  if (guardarEnUsuario) {
    // si no hay internet en ese momento, queda igual en esta computadora
    supabase.auth.updateUser({ data: { estilo: e } }).then(
      () => {},
      () => {}
    );
  }
}

/* al entrar: trae el tema que este usuario eligio (aunque lo haya elegido en otra computadora) */
export function useEstiloDelUsuario() {
  useEffect(() => {
    let vivo = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!vivo) return;
      const meta = (data.user as { user_metadata?: { estilo?: string } } | null)?.user_metadata;
      const guardado = meta?.estilo;
      if (guardado !== "dinamic" && guardado !== "clasico") {
        // todavia no lo guardo en su cuenta: si en esta computadora ya usaba el Dinamic,
        // se le guarda; si no, sigue con el Clasico (el tema base)
        if (actual() === "dinamic") aplicarEstilo("dinamic", true);
        return;
      }
      if (guardado !== actual()) aplicarEstilo(guardado, false);
    });
    return () => {
      vivo = false;
    };
  }, []);
}

export function useEstilo(): Estilo {
  // el sistema se dibuja solo en el navegador (despues de iniciar sesion), asi que se puede leer ya
  const [e, setE] = useState<Estilo>(actual);
  useEffect(() => {
    setE(actual());
    const f = (ev: Event) => setE((ev as CustomEvent<Estilo>).detail);
    window.addEventListener("sn-estilo", f);
    return () => window.removeEventListener("sn-estilo", f);
  }, []);
  return e;
}

/* ---------- las dos tarjetas para elegir, en Ajustes ---------- */

export function SelectorTema() {
  const actual = useEstilo();

  const opcion = (k: Estilo, nombre: string, desc: string, muestra: React.ReactNode, etiqueta?: string) => {
    const on = actual === k;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => !on && aplicarEstilo(k)}
        className={`sn-opcion-tema text-left rounded-xl border-2 bg-white p-2.5 transition-all hover:-translate-y-0.5 ${
          on ? "border-gray-900" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {muestra}
        <div className="flex items-center gap-2 mt-2.5 px-1">
          <span className="text-[14px] font-semibold text-gray-900">{nombre}</span>
          {etiqueta && (
            <span className="text-[10.5px] font-semibold px-2 py-[1px] rounded-full" style={{ background: "#E9C547", color: "#2A2205" }}>
              {etiqueta}
            </span>
          )}
          {on && (
            <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-gray-900">
              <Check size={14} strokeWidth={2.5} /> En uso
            </span>
          )}
        </div>
        <p className="px-1 mt-0.5 text-[12px] text-gray-500 leading-snug">{desc}</p>
      </button>
    );
  };

  // las muestras usan colores fijos para que se vean igual sin importar el tema activo
  const clasico = (
    <div className="h-[120px] rounded-lg overflow-hidden flex" style={{ background: "#f5f6f8", border: "1px solid #e5e7eb" }}>
      <div style={{ width: 46, background: "#fbfbfc", borderRight: "1px solid #e5e7eb", padding: 7 }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: "linear-gradient(135deg,#4568a8,#1b2a49)" }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 5, borderRadius: 2, marginTop: 7, background: i === 1 ? "#c5d2ea" : "#e5e7eb" }} />
        ))}
      </div>
      <div style={{ flex: 1, padding: 9 }}>
        <div style={{ width: 60, height: 7, borderRadius: 2, background: "#1f2937" }} />
        <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: 30, borderRadius: 5, background: "#fff", border: "1px solid #e5e7eb" }} />
          ))}
        </div>
        <div style={{ height: 44, borderRadius: 5, background: "#fff", border: "1px solid #e5e7eb", marginTop: 6, padding: 6 }}>
          <div style={{ width: 34, height: 9, borderRadius: 3, background: "#34528c" }} />
        </div>
      </div>
    </div>
  );

  // muestra del Dinamic: menu de pildoras arriba, barra negra flotante a la izquierda, fichas de colores
  const dinamic = (
    <div
      className="h-[120px] rounded-lg overflow-hidden relative"
      style={{
        background:
          "radial-gradient(120px 80px at 90% 0%, rgba(233,197,71,.35), transparent 70%), radial-gradient(140px 90px at 0% 100%, rgba(47,93,79,.18), transparent 70%), #F2EFE8",
      }}
    >
      <div style={{ position: "absolute", left: 6, top: 26, width: 18, background: "#151515", borderRadius: 10, padding: "6px 4px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 99, margin: "0 auto 4px", background: i === 1 ? "#E9C547" : "rgba(255,255,255,.25)" }} />
        ))}
      </div>
      <div style={{ marginLeft: 32, padding: "7px 8px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 11, height: 11, borderRadius: 4, background: "#151515" }} />
          <div style={{ width: 34, height: 6, borderRadius: 9, background: "#151515" }} />
          <div style={{ width: 20, height: 7, borderRadius: 9, background: "#E9C547" }} />
          <div style={{ marginLeft: "auto", width: 9, height: 9, borderRadius: 99, background: "#fffdf9" }} />
          <div style={{ width: 9, height: 9, borderRadius: 99, background: "#2F5D4F" }} />
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: i === 1 ? 26 : 20, height: 9, borderRadius: 99, background: i === 1 ? "#151515" : "rgba(21,21,21,.1)" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
          <div style={{ flex: 1, height: 30, borderRadius: 11, background: "#C2412D" }} />
          <div style={{ flex: 1, height: 30, borderRadius: 11, background: "#E9C547" }} />
          <div style={{ flex: 1, height: 30, borderRadius: 11, background: "#2F5D4F" }} />
        </div>
        <div style={{ height: 30, borderRadius: 12, background: "rgba(255,253,249,.95)", marginTop: 5, padding: 6, boxShadow: "0 8px 18px -12px rgba(60,45,20,.5)" }}>
          <div style={{ width: 38, height: 9, borderRadius: 99, background: "#151515" }} />
        </div>
      </div>
    </div>
  );

  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[15px] font-semibold text-gray-900">Temas</p>
      <p className="text-[12.5px] text-gray-500 mb-3">
        Cómo se ve el sistema. Cambia al instante y se guarda en tu usuario: cada asesor tiene el suyo y lo ve igual en
        cualquier computadora. El modo oscuro (la luna) funciona con los dos.
      </p>
      <div role="radiogroup" className="grid sm:grid-cols-2 gap-3">
        {opcion("clasico", "Clásico", "El diseño de siempre: limpio, azul marino y compacto. Es el tema base.", clasico)}
        {opcion(
          "dinamic",
          "Dinamic",
          "Fondo crema, menú de pastillas arriba, barra negra flotante con atajos, fichas redondeadas, acentos amarillos y animaciones suaves.",
          dinamic,
          "Nuevo"
        )}
      </div>
    </section>
  );
}
