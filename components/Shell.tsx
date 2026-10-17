"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  Coins,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Receipt,
  Search,
  Settings,
  Sun,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import Paleta from "@/components/Paleta";
import { NumInput, notify } from "@/components/ui";
import { useAlClicFuera } from "@/components/useFuera";
import { guardarTasas, sonDeHoy, useTasas } from "@/components/Tasas";
import { useEstilo, useEstiloDelUsuario } from "@/components/Estilo";

type Item = { label: string; icon: LucideIcon; href: string; aviso?: "vencidas" | "reponer" };
type Grupo = { titulo: string | null; items: Item[] };

// El menu agrupado por lo que haces, no por orden alfabetico.
const GRUPOS: Grupo[] = [
  { titulo: null, items: [{ label: "Panel", icon: LayoutDashboard, href: "/" }] },
  {
    titulo: "Ventas",
    items: [
      { label: "Notas", icon: FileText, href: "/notas", aviso: "vencidas" },
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
      { label: "Inventario", icon: Boxes, href: "/inventario", aviso: "reponer" },
    ],
  },
  { titulo: "Analisis", items: [{ label: "Informes", icon: ChartColumn, href: "/informes" }] },
  { titulo: "Sistema", items: [{ label: "Ajustes", icon: Settings, href: "/ajustes" }] },
];

type Avisos = {
  vencidas_count: number;
  vencidas_monto: number;
  semana_count: number;
  semana_monto: number;
  vencidas: { id: string; sequence_number: number; cliente: string; falta: number; dias: number }[];
  semana: { id: string; sequence_number: number; cliente: string; falta: number; dias: number }[];
  reponer: number;
  tasa_hoy: boolean;
};

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fm(n: number | null | undefined, dec = 2) {
  if (!n) return "—";
  return Number(n).toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// que pantalla es cada direccion, para la barra de arriba
function migas(path: string): { grupo: string | null; titulo: string } {
  if (path === "/notas/nueva") return { grupo: "Ventas · Notas", titulo: "Nueva nota" };
  if (path === "/notas/ver") return { grupo: "Ventas · Notas", titulo: "Ver nota" };
  for (const g of GRUPOS) {
    for (const it of g.items) {
      if (it.href === "/" ? path === "/" : path === it.href || path.startsWith(it.href + "/"))
        return { grupo: g.titulo, titulo: it.label };
    }
  }
  return { grupo: null, titulo: "" };
}

function escribiendo() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [paleta, setPaleta] = useState(false);
  const [avisos, setAvisos] = useState<Avisos | null>(null);
  const [verAvisos, setVerAvisos] = useState(false);
  const [oscuro, setOscuro] = useState(false);
  // tema: Clasico (el menu de siempre a la izquierda) o Dinamic (pastillas arriba y barra flotante)
  const estilo = useEstilo();
  useEstiloDelUsuario();

  // modo oscuro: se recuerda en esta computadora
  useEffect(() => {
    setOscuro(document.documentElement.classList.contains("dark"));
  }, []);
  function cambiarTema() {
    const nuevo = !oscuro;
    setOscuro(nuevo);
    document.documentElement.classList.toggle("dark", nuevo);
    try {
      localStorage.setItem("tema", nuevo ? "oscuro" : "claro");
    } catch {}
  }
  const ultimaCarga = useRef(0);
  const cajaAvisos = useRef<HTMLDivElement>(null);
  const cerrarAvisos = useCallback(() => setVerAvisos(false), []);
  // la lista de avisos se cierra al hacer clic en cualquier otro lado o con Esc
  useAlClicFuera(cajaAvisos, verAvisos, cerrarAvisos);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("nav_collapsed") === "1");
    } catch {}
    setReady(true);
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // avisos: al entrar y cada vez que cambias de pantalla (maximo una vez por minuto)
  const cargarAvisos = useCallback(async (forzar = false) => {
    if (!forzar && Date.now() - ultimaCarga.current < 60_000) return;
    ultimaCarga.current = Date.now();
    const { data, error } = await supabase.rpc("alerts_summary");
    if (!error && data) setAvisos(data as Avisos);
  }, []);

  useEffect(() => {
    cargarAvisos();
    setVerAvisos(false);
  }, [pathname, cargarAvisos]);

  // Chrome ofrece direcciones guardadas (codigo postal, ciudad...) en cualquier
  // campo que "parezca" de direccion. Aqui se le dice que no, a todos los campos
  // del sistema, incluso los que aparecen despues (ventanas, sugerencias...).
  // No afecta la pantalla de inicio de sesion, que vive fuera de este menu.
  useEffect(() => {
    const NO_TOCAR = new Set(["email", "password", "checkbox", "radio", "hidden", "file"]);
    function procesar(el: Element) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (el instanceof HTMLInputElement && NO_TOCAR.has(el.type)) return;
      if (el.getAttribute("autocomplete") === "sistema-off") return;
      // un valor que Chrome no reconoce hace que no ofrezca autorrelleno;
      // "off" solo, Chrome lo ignora en campos que parecen de direccion
      el.setAttribute("autocomplete", "sistema-off");
      el.setAttribute("data-lpignore", "true");
      el.setAttribute("data-1p-ignore", "true");
      el.setAttribute("data-form-type", "other");
    }
    function recorrer(raiz: Element | Document) {
      raiz.querySelectorAll("input, textarea").forEach(procesar);
    }
    recorrer(document);
    const obs = new MutationObserver((cambios) => {
      for (const c of cambios) {
        c.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          procesar(n);
          recorrer(n);
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // atajos de teclado: Ctrl+K abre el buscador, N abre una nota nueva
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (escribiendo()) return;
      // si hay una ventana abierta, los atajos no hacen nada
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"] *)')) return;
      if ((e.key === "n" || e.key === "N") && pathname !== "/notas/nueva") {
        e.preventDefault();
        router.push("/notas/nueva");
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pathname, router]);

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
  const { grupo, titulo } = migas(pathname);
  const totalAvisos = (avisos?.vencidas_count ?? 0) + (avisos?.semana_count ?? 0);

  // ================= tema Dinamic: otro marco, las mismas funciones =================
  if (estilo === "dinamic") {
    // el buscador va fuera del contenido: el contenido entra con una animacion que lo haria visible
    return (
      <>
        <MarcoDinamic
          pathname={pathname}
          email={email}
          avisos={avisos}
          totalAvisos={totalAvisos}
          verAvisos={verAvisos}
          cajaAvisos={cajaAvisos}
          oscuro={oscuro}
          onTema={cambiarTema}
          onBuscar={() => setPaleta(true)}
          onAvisos={() => {
            setVerAvisos((v) => !v);
            cargarAvisos(true);
          }}
          onIr={(href) => {
            setVerAvisos(false);
            router.push(href);
          }}
          onSalir={handleLogout}
          isActive={isActive}
        >
          {ready ? children : null}
        </MarcoDinamic>
        <Paleta abierto={paleta} onClose={() => setPaleta(false)} />
      </>
    );
  }

  // ================= tema Clasico: exactamente el de siempre =================
  return (
    <div className="min-h-screen flex">
      {/* =================== menu izquierdo =================== */}
      <aside
        className={`sn-menu sticky top-0 h-screen bg-[#fbfbfc] border-r border-gray-200/80 flex flex-col shrink-0 print:hidden transition-[width] duration-200 ${
          collapsed ? "w-[64px]" : "w-[236px]"
        }`}
      >
        {/* ---------- marca ---------- */}
        <div className={`flex items-center h-[56px] ${collapsed ? "justify-center" : "px-3.5 justify-between"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="sn-logo w-8 h-8 rounded-[9px] bg-gradient-to-br from-brand-500 to-brand-900 text-white flex items-center justify-center text-[12.5px] font-bold shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_2px_6px_rgba(28,45,82,.35)]">
                SN
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 leading-tight truncate tracking-tight">
                  Save Notas
                </p>
                <p className="text-[11px] text-gray-400 leading-tight">sistema de gestion</p>
              </div>
            </div>
          )}
          <button
            onClick={toggle}
            title={collapsed ? "Mostrar menu" : "Ocultar menu"}
            aria-label={collapsed ? "Mostrar menu" : "Ocultar menu"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.75} /> : <PanelLeftClose size={17} strokeWidth={1.75} />}
          </button>
        </div>

        {/* ---------- buscador ---------- */}
        <div className="px-2.5 pb-2">
          <button
            onClick={() => setPaleta(true)}
            title="Buscar (Ctrl + K)"
            className={`w-full flex items-center gap-2 h-[34px] rounded-[9px] border border-gray-200 bg-white text-gray-400 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:border-gray-300 hover:text-gray-600 transition-colors ${
              collapsed ? "justify-center" : "px-2.5"
            }`}
          >
            <Search size={15} />
            {!collapsed && (
              <>
                <span className="text-[13px]">Buscar o ir a…</span>
                <kbd className="ml-auto text-[10.5px] px-1.5 py-px rounded-md border border-gray-200 bg-gray-50 font-sans">
                  Ctrl K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* ---------- navegacion ---------- */}
        <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
          {GRUPOS.map((g, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3" : "mt-1"}>
              {g.titulo &&
                (collapsed ? (
                  <div className="mx-2 mb-2 h-px bg-gray-200" />
                ) : (
                  <p className="px-2.5 mb-1 text-[11px] font-medium text-gray-400">{g.titulo}</p>
                ))}
              <div className="flex flex-col gap-px">
                {g.items.map((item) => {
                  const Icono = item.icon;
                  const active = isActive(item.href);
                  const n =
                    item.aviso === "vencidas"
                      ? avisos?.vencidas_count ?? 0
                      : item.aviso === "reponer"
                      ? avisos?.reponer ?? 0
                      : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={`sn-enlace relative flex items-center gap-2.5 rounded-lg text-[13.5px] transition-colors ${
                        collapsed ? "justify-center h-9" : "px-2.5 h-[34px]"
                      } ${
                        active
                          ? "sn-activo bg-white text-gray-900 font-medium shadow-[0_1px_2px_rgba(16,24,40,.06)] ring-1 ring-gray-200"
                          : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
                      }`}
                    >
                      <Icono
                        size={17}
                        strokeWidth={active ? 2 : 1.75}
                        className={`shrink-0 ${active ? "text-brand-700" : ""}`}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {n > 0 &&
                        (collapsed ? (
                          <span
                            className={`absolute top-1.5 right-2 w-2 h-2 rounded-full ${
                              item.aviso === "vencidas" ? "bg-red-500" : "bg-amber-500"
                            }`}
                          />
                        ) : (
                          <span
                            title={item.aviso === "vencidas" ? `${n} notas vencidas` : `${n} productos por reponer`}
                            className={`ml-auto min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-medium flex items-center justify-center ${
                              item.aviso === "vencidas" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {n}
                          </span>
                        ))}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ---------- tasas del dia ---------- */}
        {!collapsed && <CajaTasas />}

        {/* ---------- usuario ---------- */}
        <div className={`flex items-center gap-2.5 border-t border-gray-200/80 ${collapsed ? "flex-col py-2" : "px-3 py-2.5"}`}>
          <span
            title={email ?? ""}
            className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-900 text-white text-[11.5px] font-semibold flex items-center justify-center shrink-0"
          >
            {inicial}
          </span>
          {!collapsed && <span className="flex-1 min-w-0 text-[12px] text-gray-600 truncate">{email ?? "…"}</span>}
          <button
            onClick={handleLogout}
            title="Cerrar sesion"
            aria-label="Cerrar sesion"
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* =================== contenido =================== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sn-cabecera sticky top-0 z-30 h-[52px] flex items-center gap-2 px-6 border-b border-gray-200/80 bg-[#f5f6f8]/85 backdrop-blur-md backdrop-saturate-150 print:hidden">
          <div className="flex items-center gap-1.5 text-[13px] min-w-0">
            {grupo && (
              <>
                <span className="text-gray-400 truncate">{grupo}</span>
                <ChevronRight size={13} className="text-gray-300 shrink-0" />
              </>
            )}
            <span className="font-medium text-gray-900 truncate">{titulo}</span>
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setPaleta(true)}
            title="Buscar (Ctrl + K)"
            aria-label="Buscar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200/60"
          >
            <Search size={16} />
          </button>

          {/* ---------- campanita ---------- */}
          <div className="relative" ref={cajaAvisos}>
            <button
              onClick={() => {
                setVerAvisos((v) => !v);
                cargarAvisos(true);
              }}
              title="Avisos"
              aria-label="Avisos"
              className={`relative w-8 h-8 rounded-lg flex items-center justify-center hover:text-gray-900 hover:bg-gray-200/60 ${
                verAvisos ? "bg-gray-200/60 text-gray-900" : "text-gray-500"
              }`}
            >
              <Bell size={16} />
              {totalAvisos > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9.5px] font-semibold flex items-center justify-center ring-2 ring-[#f5f6f8]">
                  {totalAvisos > 9 ? "9+" : totalAvisos}
                </span>
              )}
            </button>
            {verAvisos && (
              <PanelAvisos
                avisos={avisos}
                onIr={(href) => {
                  setVerAvisos(false);
                  router.push(href);
                }}
              />
            )}
          </div>

          <button
            onClick={cambiarTema}
            title={oscuro ? "Modo claro" : "Modo oscuro"}
            aria-label={oscuro ? "Modo claro" : "Modo oscuro"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200/60"
          >
            {oscuro ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="w-px h-5 bg-gray-200 mx-1.5" />

          {pathname !== "/notas/nueva" && (
            <Link
              href="/notas/nueva"
              className="sn-nueva h-[34px] pl-2.5 pr-2 rounded-[9px] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-[13px] font-medium text-white bg-gradient-to-b from-brand-600 to-brand-800 border border-brand-900 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_4px_12px_-4px_rgba(36,58,102,.55)] hover:brightness-110 transition"
            >
              <Plus size={15} strokeWidth={2.25} />
              Nueva nota
              <kbd className="ml-1 text-[10.5px] px-1.5 py-px rounded-md bg-white/10 border border-white/20 text-white/80 font-sans">
                N
              </kbd>
            </Link>
          )}
        </header>

        <div className="sn-contenido flex-1 min-w-0">{ready ? children : null}</div>
      </div>

      <Paleta abierto={paleta} onClose={() => setPaleta(false)} />
    </div>
  );
}

/* ============================================================
   MARCO DEL TEMA DINAMIC
   - Arriba: marca, tasas del dia, buscar, campanita, luna y tu usuario.
   - Debajo: el menu en pastillas (se queda pegado arriba al bajar),
     con una pastilla negra que se desliza a la pantalla donde estas.
   - A la izquierda: barra negra flotante con los atajos de siempre.
   Son las mismas pantallas y los mismos datos; solo cambia el marco.
   ============================================================ */

const PILDORAS = GRUPOS.flatMap((g) => g.items).map((it) => ({
  ...it,
  corto: it.href === "/compras" ? "Compras" : it.label,
}));

type MarcoProps = {
  children: React.ReactNode;
  pathname: string;
  email: string | null;
  avisos: Avisos | null;
  totalAvisos: number;
  verAvisos: boolean;
  cajaAvisos: React.RefObject<HTMLDivElement>;
  oscuro: boolean;
  onTema: () => void;
  onBuscar: () => void;
  onAvisos: () => void;
  onIr: (href: string) => void;
  onSalir: () => void;
  isActive: (href: string) => boolean;
};

function MarcoDinamic(p: MarcoProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const [pastilla, setPastilla] = useState<{ x: number; w: number } | null>(null);
  // a donde vas: la pastilla negra se mueve en cuanto tocas, sin esperar a que cargue la pantalla
  const [destino, setDestino] = useState<string | null>(null);
  useEffect(() => {
    setDestino(null);
  }, [p.pathname]);
  const activa = (href: string) => (destino ? href === destino : p.isActive(href));
  const ir = (href: string) => {
    setDestino(href);
    p.onIr(href);
  };
  const [verTasas, setVerTasas] = useState(false);
  const [verYo, setVerYo] = useState(false);
  const cajaTasas = useRef<HTMLDivElement>(null);
  const cajaYo = useRef<HTMLDivElement>(null);
  const cerrarTasas = useCallback(() => setVerTasas(false), []);
  const cerrarYo = useCallback(() => setVerYo(false), []);
  useAlClicFuera(cajaTasas, verTasas, cerrarTasas);
  useAlClicFuera(cajaYo, verYo, cerrarYo);
  const t = useTasas();
  const deHoy = sonDeHoy(t);

  // la pastilla negra se mueve debajo de la pantalla activa
  const medir = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const a = nav.querySelector<HTMLElement>("[data-activo='1']");
    if (!a) return setPastilla(null);
    setPastilla({ x: a.offsetLeft, w: a.offsetWidth });
    // que la pantalla activa siempre se vea si el menu no cabe completo
    const izq = a.offsetLeft - nav.scrollLeft;
    if (izq < 0 || izq + a.offsetWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - 24, behavior: "smooth" });
  }, []);
  useLayoutEffect(() => {
    medir();
  }, [p.pathname, destino, medir]);
  useEffect(() => {
    window.addEventListener("resize", medir);
    // cuando termina de cargar la letra, las pastillas cambian de ancho: se vuelve a medir
    document.fonts?.ready.then(medir).catch(() => {});
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => medir()) : null;
    navRef.current?.querySelectorAll("a").forEach((a) => ro?.observe(a));
    return () => {
      window.removeEventListener("resize", medir);
      ro?.disconnect();
    };
  }, [medir]);

  useEffect(() => {
    setVerTasas(false);
    setVerYo(false);
  }, [p.pathname]);

  const inicial = (p.email ?? "?").charAt(0).toUpperCase();
  const fmt = (n: number | null | undefined, dec = 2) =>
    n ? Number(n).toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—";

  const atajo = (titulo: string, Icono: LucideIcon, accion: () => void, extra = "") => (
    <button type="button" data-tip={titulo} aria-label={titulo} onClick={accion} className={`sn-d-atajo ${extra}`}>
      <Icono size={19} strokeWidth={1.9} />
    </button>
  );

  return (
    <div className="sn-d min-h-screen">
      {/* ---------- barra negra flotante (atajos) ---------- */}
      <aside className="sn-d-dock print:hidden" aria-label="Atajos">
        {atajo("Buscar · Ctrl K", Search, p.onBuscar)}
        {p.pathname !== "/notas/nueva" && atajo("Nueva nota · N", Plus, () => ir("/notas/nueva"), "sn-d-atajo-am")}
        {atajo("Cobrar", HandCoins, () => ir("/cobranzas"), activa("/cobranzas") ? "sn-d-on" : "")}
        {atajo("Pedidos", ClipboardList, () => ir("/pedidos"), activa("/pedidos") ? "sn-d-on" : "")}
        {atajo("Inventario", Boxes, () => ir("/inventario"), activa("/inventario") ? "sn-d-on" : "")}
        <hr />
        {atajo("Ajustes y temas", Settings, () => ir("/ajustes"), activa("/ajustes") ? "sn-d-on" : "")}
        {atajo(p.oscuro ? "Modo claro" : "Modo oscuro", p.oscuro ? Sun : Moon, p.onTema)}
      </aside>

      <div className="sn-d-marco">
        {/* ---------- arriba: marca y herramientas ---------- */}
        <div className="sn-d-arriba print:hidden">
          <Link href="/" className="sn-d-marca" title="Ir al panel">
            <span className="sn-d-logo">S</span>
            <span className="sn-d-nombre">save notas</span>
          </Link>
          <span className="sn-d-insignia">Tema Dinamic</span>

          <div className="sn-d-herr">
            {/* tasas del dia */}
            <div className="relative" ref={cajaTasas}>
              <button
                type="button"
                onClick={() => setVerTasas((v) => !v)}
                className={`sn-d-tasas ${deHoy ? "" : "sn-d-tasas-viejas"}`}
                title={deHoy ? "Tasas de hoy · tocar para cambiarlas" : "Las tasas no son de hoy · tocar para ponerlas"}
              >
                <Coins size={15} />
                {deHoy || t?.rate_date ? (
                  <>
                    <span>
                      BCV <b>{fmt(t?.bcv)}</b>
                    </span>
                    <span className="sn-d-sep sn-d-t2" />
                    <span className="sn-d-t2">
                      Binance <b>{fmt(t?.binance)}</b>
                    </span>
                    <span className="sn-d-sep sn-d-t2" />
                    <span className="sn-d-t2">
                      Pesos <b>{fmt(t?.cop, 0)}</b>
                    </span>
                  </>
                ) : (
                  <span>Poner las tasas de hoy</span>
                )}
                {deHoy ? <span className="sn-d-punto-verde" /> : <span className="sn-d-aviso-tasas">actualizar</span>}
              </button>
              {verTasas && (
                <div className="sn-d-pop absolute right-0 top-[50px] z-50 w-[300px]">
                  <CajaTasas />
                </div>
              )}
            </div>

            <button type="button" onClick={p.onBuscar} className="sn-d-circ" title="Buscar (Ctrl + K)" aria-label="Buscar">
              <Search size={17} />
            </button>

            {/* en pantallas angostas no cabe la barra negra: la luna pasa aqui */}
            <button
              type="button"
              onClick={p.onTema}
              className="sn-d-circ sn-d-solo-angosto"
              title={p.oscuro ? "Modo claro" : "Modo oscuro"}
              aria-label={p.oscuro ? "Modo claro" : "Modo oscuro"}
            >
              {p.oscuro ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="relative" ref={p.cajaAvisos}>
              <button
                type="button"
                onClick={p.onAvisos}
                className={`sn-d-circ ${p.verAvisos ? "sn-d-circ-on" : ""}`}
                title="Avisos"
                aria-label="Avisos"
              >
                <Bell size={17} />
                {p.totalAvisos > 0 && <span className="sn-d-globo">{p.totalAvisos > 9 ? "9+" : p.totalAvisos}</span>}
              </button>
              {p.verAvisos && <PanelAvisos avisos={p.avisos} onIr={p.onIr} dondeTasas="arriba, en la pastilla de las tasas" />}
            </div>

            <div className="relative" ref={cajaYo}>
              <button
                type="button"
                onClick={() => setVerYo((v) => !v)}
                className="sn-d-yo"
                title={p.email ?? ""}
                aria-label="Tu usuario"
              >
                {inicial}
              </button>
              {verYo && (
                <div className="sn-flotante absolute right-0 top-[50px] z-50 w-[250px] rounded-xl bg-white border border-gray-200 shadow-pop p-1.5">
                  <p className="px-3 pt-2 pb-1 text-[11.5px] text-gray-400">Sesión iniciada como</p>
                  <p className="px-3 pb-2 text-[13px] font-medium text-gray-900 truncate">{p.email ?? "…"}</p>
                  <button
                    type="button"
                    onClick={() => p.onIr("/ajustes")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-gray-700 hover:bg-gray-50"
                  >
                    <Settings size={15} /> Ajustes y temas
                  </button>
                  <button
                    type="button"
                    onClick={p.onSalir}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={15} /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------- menu en pastillas (se queda pegado arriba) ---------- */}
        <div className="sn-d-menu print:hidden">
          <nav ref={navRef} className="sn-d-pastillas" aria-label="Menú">
            {pastilla && <span className="sn-d-indicador" style={{ transform: `translateX(${pastilla.x}px)`, width: pastilla.w }} />}
            {PILDORAS.map((it) => {
              const on = activa(it.href);
              const n = it.aviso === "vencidas" ? p.avisos?.vencidas_count ?? 0 : it.aviso === "reponer" ? p.avisos?.reponer ?? 0 : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  data-activo={on ? "1" : "0"}
                  title={it.label}
                  className={`sn-d-pildora ${on ? "sn-d-pildora-on" : ""}`}
                  onClick={(e) => {
                    // con Ctrl o en otra pestaña no se mueve nada aqui
                    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    setDestino(it.href);
                  }}
                >
                  {it.corto}
                  {n > 0 && (
                    <span
                      className={`sn-d-cuenta ${it.aviso === "vencidas" ? "sn-d-cuenta-roja" : "sn-d-cuenta-ambar"}`}
                      title={it.aviso === "vencidas" ? `${n} notas vencidas` : `${n} productos por reponer`}
                    >
                      {n}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          {p.pathname !== "/notas/nueva" && (
            <Link href="/notas/nueva" className="sn-d-nueva">
              <Plus size={16} strokeWidth={2.4} />
              Nueva nota
              <kbd>N</kbd>
            </Link>
          )}
        </div>

        <div className="sn-contenido">{p.children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Lista de la campanita
   ============================================================ */

function PanelAvisos({
  avisos,
  onIr,
  dondeTasas = "abajo a la izquierda",
}: {
  avisos: Avisos | null;
  onIr: (href: string) => void;
  dondeTasas?: string;
}) {
  const fila = (n: { id: string; sequence_number: number; cliente: string; falta: number; dias: number }, vencida: boolean) => (
    <button
      key={n.id}
      onClick={() => onIr(`/notas?nota=${n.id}`)}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-gray-50"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${vencida ? "bg-red-500" : "bg-amber-500"}`} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-gray-900 truncate">{n.cliente}</span>
        <span className="block text-[11.5px] text-gray-400">
          Nota #{n.sequence_number} ·{" "}
          {vencida ? `vencio hace ${n.dias} dia${n.dias === 1 ? "" : "s"}` : n.dias === 0 ? "vence hoy" : `vence en ${n.dias} dia${n.dias === 1 ? "" : "s"}`}
        </span>
      </span>
      <span className={`text-[12.5px] font-medium ${vencida ? "text-red-600" : "text-amber-700"}`}>{money(n.falta)}</span>
    </button>
  );

  return (
    <div className="sn-flotante absolute right-0 top-10 z-50 w-[360px] rounded-xl bg-white border border-gray-200 shadow-pop overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center">
        <p className="text-[13.5px] font-semibold text-gray-900">Avisos</p>
        {avisos && (
          <span className="ml-auto text-[11.5px] text-gray-400">
            {avisos.vencidas_count + avisos.semana_count === 0 ? "todo en orden" : "lo que necesita atencion"}
          </span>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto p-1.5">
        {!avisos && <p className="p-4 text-sm text-gray-400">Cargando…</p>}

        {avisos && !avisos.tasa_hoy && (
          <div className="mx-1 my-1 px-3 py-2.5 rounded-lg bg-amber-50 text-[12.5px] text-amber-800">
            Todavia no pusiste las <b className="font-semibold">tasas de hoy</b>. Ponlas {dondeTasas} y las notas las toman
            solas.
          </div>
        )}

        {avisos && avisos.vencidas_count > 0 && (
          <>
            <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-gray-400">
              Vencidas · {avisos.vencidas_count} notas · {money(avisos.vencidas_monto)}
            </p>
            {avisos.vencidas.map((n) => fila(n, true))}
          </>
        )}

        {avisos && avisos.semana_count > 0 && (
          <>
            <p className="px-2.5 pt-3 pb-1 text-[11px] font-medium text-gray-400">
              Vencen esta semana · {avisos.semana_count} notas · {money(avisos.semana_monto)}
            </p>
            {avisos.semana.map((n) => fila(n, false))}
          </>
        )}

        {avisos && avisos.reponer > 0 && (
          <button
            onClick={() => onIr("/inventario")}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-lg text-left hover:bg-gray-50"
          >
            <Boxes size={15} className="text-amber-600 shrink-0" />
            <span className="flex-1 text-[13px] text-gray-800">
              {avisos.reponer} producto{avisos.reponer === 1 ? "" : "s"} por debajo del minimo
            </span>
            <ChevronRight size={14} className="text-gray-300" />
          </button>
        )}

        {avisos && avisos.vencidas_count + avisos.semana_count + avisos.reponer === 0 && avisos.tasa_hoy && (
          <p className="py-8 text-center text-sm text-gray-400">No hay nada pendiente. Todo al dia.</p>
        )}
      </div>
      {avisos && avisos.vencidas_count + avisos.semana_count > 0 && (
        <button
          onClick={() => onIr("/cobranzas")}
          className="w-full px-4 py-2.5 border-t border-gray-100 text-[12.5px] text-brand-700 font-medium hover:bg-gray-50 text-left"
        >
          Ver todo en Cobranzas →
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Tasas del dia (abajo a la izquierda)
   ============================================================ */

function CajaTasas() {
  const t = useTasas();
  const [editar, setEditar] = useState(false);
  const [bcv, setBcv] = useState(0);
  const [bin, setBin] = useState(0);
  const [cop, setCop] = useState(0);
  const [busy, setBusy] = useState(false);
  const deHoy = sonDeHoy(t);

  function abrir() {
    setBcv(Number(t?.bcv) || 0);
    setBin(Number(t?.binance) || 0);
    setCop(Number(t?.cop) || 0);
    setEditar(true);
  }

  async function guardar() {
    setBusy(true);
    try {
      await guardarTasas(bcv, bin, cop);
      notify.ok("Tasas de hoy guardadas", "Las notas nuevas ya las usan");
      setEditar(false);
    } catch (e) {
      notify.error("No se pudieron guardar", e instanceof Error ? e.message : undefined);
    }
    setBusy(false);
  }

  const col = (color: string, label: string, v: number | null | undefined, dec = 2) => (
    <div className="min-w-0">
      <span className="flex items-center gap-1 text-[10.5px] text-gray-400">
        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: color }} />
        {label}
      </span>
      <span className="block text-[12.5px] font-semibold text-gray-900 truncate">{fm(v, dec)}</span>
    </div>
  );

  const campo = (label: string, v: number, set: (n: number) => void) => (
    <label className="block">
      <span className="block text-[11px] text-gray-500 mb-0.5">{label}</span>
      <NumInput
        value={v}
        onChange={set}
        className="w-full h-8 px-2 border border-gray-300 rounded-lg text-[13px] text-right bg-white focus:border-brand-500"
      />
    </label>
  );

  return (
    <div className="sn-tasas mx-2.5 mb-2.5 rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)] px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Coins size={13} className="text-gray-400" />
        <span className="text-[11.5px] text-gray-500">Tasas de hoy</span>
        {deHoy && <span className="w-[6px] h-[6px] rounded-full bg-emerald-500" title="Son de hoy" />}
        {!editar && (
          <button
            onClick={abrir}
            title="Cambiar las tasas de hoy"
            className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-brand-700 hover:bg-brand-50"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {!editar ? (
        <>
          <button onClick={abrir} title="Cambiar las tasas de hoy" className="w-full grid grid-cols-3 gap-1.5 text-left">
            {col("#1d7fbf", "BCV", t?.bcv)}
            {col("#a86a00", "Binance", t?.binance)}
            {col("#6d4bd1", "Pesos", t?.cop, 0)}
          </button>
          {!deHoy && (
            <button
              onClick={abrir}
              className="mt-1.5 w-full h-6 rounded-md bg-amber-50 text-amber-800 text-[11px] font-medium hover:bg-amber-100"
            >
              {t?.rate_date ? "Son de otro dia · actualizar" : "Poner las tasas de hoy"}
            </button>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          {campo("BCV (Bs por $)", bcv, setBcv)}
          {campo("Binance (Bs por $)", bin, setBin)}
          {campo("Pesos por $", cop, setCop)}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => setEditar(false)}
              className="flex-1 h-8 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={busy}
              className="flex-1 h-8 rounded-lg text-[12px] font-medium text-white bg-brand-700 hover:bg-brand-800 disabled:opacity-50"
            >
              {busy ? "…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
