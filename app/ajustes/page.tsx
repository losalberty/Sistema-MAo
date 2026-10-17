"use client";

/* ============================================================
   AJUSTES DEL SISTEMA
   - Tema visual: Clásico (el de siempre) o Dinamic
   - Con que tipo nacen los repuestos nuevos
   - Punto de partida: desde que fecha se lleva la cuenta
   - Reiniciar pruebas (solo el administrador, con su clave)
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, ClipboardList, KeyRound, RotateCcw, ShieldCheck, Warehouse } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notify } from "@/components/ui";
import { Encabezado, Segmento, Ventana, inputCls } from "@/components/Ventana";
import { SelectorTema } from "@/components/Estilo";

type Ajustes = {
  cuenta_desde: string | null;
  tipo_por_defecto: "ALMACEN" | "PEDIDO";
  master_email: string | null;
  yo: string;
  soy_master: boolean;
  conteos: {
    notas: number;
    hojas: number;
    facturas: number;
    pagos: number;
    productos: number;
    con_stock: number;
    apartados: number;
  };
};

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaLarga(f: string | null) {
  if (!f) return "";
  return new Date(f + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });
}

/* pide la clave de inicio de sesion antes de algo delicado */
function PedirClave({
  titulo,
  detalle,
  pedirPalabra,
  onClose,
  onOk,
}: {
  titulo: string;
  detalle: string;
  pedirPalabra?: boolean;
  onClose: () => void;
  onOk: () => Promise<void>;
}) {
  const [clave, setClave] = useState("");
  const [palabra, setPalabra] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmar() {
    setErr(null);
    if (pedirPalabra && palabra.trim().toUpperCase() !== "REINICIAR") return setErr("Escribe REINICIAR para confirmar.");
    if (!clave) return setErr("Escribe tu clave.");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const email = u?.user?.email;
    if (!email) {
      setBusy(false);
      return setErr("No se pudo leer tu sesión. Vuelve a entrar al sistema.");
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) {
      setBusy(false);
      return setErr("Esa clave no es correcta.");
    }
    try {
      await onOk();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ventana
      titulo={titulo}
      subtitulo="Para seguir, confirma con la clave con la que entras al sistema"
      icono={KeyRound}
      onClose={onClose}
      pie={
        <>
          <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Trabajando…" : "Confirmar"}
          </button>
        </>
      }
    >
      <p className="text-[13px] text-gray-700 mb-3">{detalle}</p>
      {pedirPalabra && (
        <div className="mb-3">
          <label className="block text-[11.5px] text-gray-500 mb-1">Escribe REINICIAR</label>
          <input value={palabra} onChange={(e) => setPalabra(e.target.value)} className={inputCls} autoComplete="off" />
        </div>
      )}
      <label className="block text-[11.5px] text-gray-500 mb-1">Tu clave</label>
      <input
        type="password"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && confirmar()}
        className={inputCls}
        autoComplete="current-password"
        autoFocus
      />
      {err && <p className="mt-2 text-[12.5px] text-red-600">{err}</p>}
    </Ventana>
  );
}

export default function AjustesPage() {
  const [a, setA] = useState<Ajustes | null>(null);
  const [desde, setDesde] = useState(hoy());
  const [estanteCero, setEstanteCero] = useState(true);
  const [borrar, setBorrar] = useState({ notas: true, pedidos: true, compras: true, stock: true, numeracion: true });
  const [pedir, setPedir] = useState<"punto" | "reiniciar" | null>(null);
  const [sinStock, setSinStock] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc("obtener_ajustes");
    if (error) return notify.error("No se pudieron leer los ajustes", error.message);
    const r = data as Ajustes;
    setA(r);
    if (r.cuenta_desde) setDesde(r.cuenta_desde);
    const { data: ls } = await supabase.rpc("list_stock", { p_search: "", p_filter: "SIN_STOCK" });
    setSinStock(((ls ?? []) as unknown[]).length);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarTipo(t: "ALMACEN" | "PEDIDO") {
    const { error } = await supabase.rpc("guardar_tipo_por_defecto", { p_tipo: t });
    if (error) return notify.error("No se pudo guardar", error.message);
    notify.ok(t === "PEDIDO" ? "Los repuestos nuevos nacen bajo pedido" : "Los repuestos nuevos nacen de almacén");
    cargar();
  }

  async function pasarSinStock() {
    const { data } = await supabase.rpc("list_stock", { p_search: "", p_filter: "SIN_STOCK" });
    const ids = ((data ?? []) as { id: string }[]).map((x) => x.id);
    if (!ids.length) return notify.info("No hay repuestos de almacén sin stock y sin mínimo");
    const { error } = await supabase.rpc("set_supply_type", { p_ids: ids, p_type: "PEDIDO" });
    if (error) return notify.error("No se pudo cambiar", error.message);
    notify.ok(`${ids.length} repuestos pasaron a bajo pedido`);
    cargar();
  }

  async function fijarPunto() {
    const { data, error } = await supabase.rpc("fijar_punto_de_partida", {
      p_fecha: desde,
      p_estante: estanteCero ? "CERO" : "NADA",
    });
    if (error) throw new Error(error.message);
    const r = data as { productos: number };
    notify.ok("Punto de partida guardado", `Desde el ${fechaLarga(desde)} · ${r.productos} repuestos cuadrados`);
    cargar();
  }

  async function reiniciar() {
    const { data, error } = await supabase.rpc("reiniciar_pruebas", {
      p_notas: borrar.notas,
      p_pedidos: borrar.pedidos,
      p_compras: borrar.compras,
      p_stock_cero: borrar.stock,
      p_numeracion: borrar.numeracion,
      p_confirmacion: "REINICIAR",
    });
    if (error) throw new Error(error.message);
    const r = data as { notas: number; hojas: number; facturas: number };
    notify.ok("Listo, empezaste de cero", `${r.notas} notas · ${r.hojas} hojas · ${r.facturas} facturas borradas`);
    cargar();
  }

  if (!a)
    return (
      <main className="p-6 max-w-[900px]">
        <Encabezado titulo="Ajustes">Cargando…</Encabezado>
        <SelectorTema />
      </main>
    );

  const bloqueado = !a.soy_master;

  return (
    <main className="p-6 max-w-[900px]">
      <Encabezado titulo="Ajustes">Cómo trabaja el sistema y herramientas del administrador.</Encabezado>

      {/* tema visual */}
      <SelectorTema />

      {/* administrador */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <ShieldCheck size={17} />
        </span>
        <p className="text-[13px] text-gray-700">
          {a.master_email ? (
            <>
              Administrador: <b className="font-medium">{a.master_email}</b>
              {a.soy_master ? " (eres tú)" : ""}
            </>
          ) : (
            <>Todavía no hay administrador. El primero que use una herramienta protegida queda como administrador ({a.yo}).</>
          )}
        </p>
      </div>

      {/* tipo por defecto */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-[15px] font-semibold text-gray-900">Repuestos nuevos</p>
        <p className="text-[12.5px] text-gray-500 mb-3">
          Con qué tipo nacen los repuestos que creas o importas. Si casi todo lo pides cuando lo vendes, elige «Bajo pedido».
        </p>
        <Segmento
          opciones={[
            { k: "PEDIDO", l: "Bajo pedido" },
            { k: "ALMACEN", l: "De almacén" },
          ]}
          valor={a.tipo_por_defecto}
          onChange={cambiarTipo}
        />
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[12px] text-gray-600">
          <p className="flex gap-2">
            <ClipboardList size={14} className="text-violet-600 shrink-0 mt-0.5" /> Bajo pedido: no avisa «agotado»; lo vendido que no
            haya en el estante va a Pedidos.
          </p>
          <p className="flex gap-2">
            <Warehouse size={14} className="text-emerald-600 shrink-0 mt-0.5" /> De almacén: lo guardas en el estante y avisa cuando baja
            de su mínimo.
          </p>
        </div>
        {sinStock !== null && sinStock > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-[12.5px] text-gray-700 flex-1">
              Tienes {sinStock} repuestos «de almacén» en 0 y sin mínimo. ¿Los pasas a bajo pedido?
            </span>
            <button onClick={pasarSinStock} className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-[12.5px] text-gray-700 hover:border-gray-300">
              Pasarlos a bajo pedido
            </button>
          </div>
        )}
      </section>

      {/* recalcular */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <p className="text-[15px] font-semibold text-gray-900">Recalcular el inventario</p>
          <p className="text-[12.5px] text-gray-500">
            Vuelve a cuadrar cada repuesto: estante, apartado y lo que se entregó a cada nota. No borra nada.
          </p>
        </div>
        <button
          onClick={async () => {
            const { data, error } = await supabase.rpc("recalcular_todo");
            if (error) return notify.error("No se pudo recalcular", error.message);
            notify.ok("Inventario recalculado", `${data} repuestos revisados`);
            cargar();
          }}
          className="h-9 px-4 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-700 hover:border-gray-300"
        >
          Recalcular ahora
        </button>
      </section>

      {/* punto de partida */}
      <section className={`mb-4 rounded-xl border border-gray-200 bg-white p-4 ${bloqueado ? "opacity-60" : ""}`}>
        <p className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <CalendarCheck size={16} className="text-brand-700" /> Punto de partida
        </p>
        <p className="text-[12.5px] text-gray-500 mb-3">
          Desde qué fecha el sistema lleva la cuenta de lo entregado y lo que falta. Las notas anteriores cuentan como
          entregadas y no aparecen en Pedidos.
          {a.cuenta_desde ? (
            <> Ahora mismo: desde el <b className="font-medium text-gray-700">{fechaLarga(a.cuenta_desde)}</b>.</>
          ) : (
            <> Ahora mismo: se cuentan todas las notas.</>
          )}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11.5px] text-gray-500 mb-1">Llevar la cuenta desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${inputCls} w-44`} />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700 h-9">
            <input
              type="checkbox"
              checked={estanteCero}
              onChange={(e) => setEstanteCero(e.target.checked)}
              className="w-4 h-4 accent-brand-700"
            />
            Y poner todo el estante en 0 (luego cargas lo que de verdad tienes)
          </label>
          <button
            disabled={bloqueado}
            onClick={() => setPedir("punto")}
            className="h-9 px-4 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            Guardar punto de partida
          </button>
        </div>
      </section>

      {/* reiniciar pruebas */}
      <section className={`rounded-xl border-2 border-red-200 bg-white p-4 ${bloqueado ? "opacity-60" : ""}`}>
        <p className="text-[15px] font-semibold text-red-700 flex items-center gap-2">
          <RotateCcw size={16} /> Reiniciar pruebas
        </p>
        <p className="text-[12.5px] text-gray-600 mb-3">
          Borra los datos de prueba para empezar limpio. <b className="font-medium">No se tocan</b> clientes, repuestos, precios ni
          proveedores. No se puede deshacer.
        </p>
        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          {(
            [
              ["notas", `Notas, abonos y devoluciones (${a.conteos.notas})`],
              ["pedidos", `Hojas de pedido y lo que llegó (${a.conteos.hojas})`],
              ["compras", `Facturas de compra y pagos a proveedores (${a.conteos.facturas})`],
              ["stock", `Poner todo el estante en 0 (${a.conteos.con_stock} con existencia)`],
              ["numeracion", "Volver a numerar desde 1 (notas y hojas)"],
            ] as const
          ).map(([k, t]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={borrar[k]}
                onChange={(e) => setBorrar((b) => ({ ...b, [k]: e.target.checked }))}
                className="w-4 h-4 accent-red-600"
              />
              {t}
            </label>
          ))}
        </div>
        <button
          disabled={bloqueado || !Object.values(borrar).some(Boolean)}
          onClick={() => setPedir("reiniciar")}
          className="h-9 px-4 rounded-lg bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 disabled:opacity-50"
        >
          Reiniciar…
        </button>
        {bloqueado && <p className="mt-2 text-[12px] text-gray-500">Solo el administrador puede usar esto.</p>}
      </section>

      {pedir === "punto" && (
        <PedirClave
          titulo="Guardar punto de partida"
          detalle={`Las notas de antes del ${fechaLarga(desde)} quedan como entregadas.${
            estanteCero ? " Todo el estante queda en 0." : ""
          }`}
          onClose={() => setPedir(null)}
          onOk={fijarPunto}
        />
      )}
      {pedir === "reiniciar" && (
        <PedirClave
          titulo="Reiniciar pruebas"
          detalle="Se borrará lo que marcaste. Clientes, repuestos y proveedores se quedan."
          pedirPalabra
          onClose={() => setPedir(null)}
          onOk={reiniciar}
        />
      )}
    </main>
  );
}
