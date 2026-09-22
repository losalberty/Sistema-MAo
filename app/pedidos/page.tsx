"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type NotaEspera = {
  note_id: string;
  sequence_number: number;
  note_date: string;
  cliente: string;
  cantidad: number;
};

type LineaPedir = {
  product_id: string;
  code: string;
  description: string;
  supplier_id: string | null;
  proveedor: string | null;
  espera: number;
  reponer: number;
  cantidad: number;
  origen: "ESPERA" | "REPONER" | "AMBOS";
  notas: NotaEspera[];
  pedido: { order_id: string; numero: number; pendiente: number } | null;
};

type PorPedir = {
  espera_unidades: number;
  espera_notas: number;
  reponer_unidades: number;
  ya_pedido_unidades: number;
  lineas: LineaPedir[];
};

type Pedido = {
  id: string;
  numero: number;
  order_date: string;
  status: string;
  supplier_id: string | null;
  proveedor: string | null;
  invoice_id: string | null;
  lineas: number;
  unidades: number;
  recibido: number;
};

type ItemPedido = {
  id: string;
  product_id: string;
  code: string;
  description: string;
  quantity: number;
  received_qty: number;
  falta: number;
};

type Detalle = {
  id: string;
  numero: number;
  order_date: string;
  status: string;
  proveedor: string | null;
  supplier_id: string | null;
  notes: string | null;
  invoice_id: string | null;
  factura: string | null;
  total_pedido: number;
  total_recibido: number;
  items: ItemPedido[];
};

type Propuesta = {
  producto: string;
  code: string;
  llegaron: number;
  al_almacen: number;
  esperando: {
    note_id: string;
    sequence_number: number;
    note_date: string;
    cliente: string;
    pidio: number;
    propuesto: number;
  }[];
};

type Proveedor = { id: string; name: string; total: number };

const ORIGEN: Record<string, { l: string; c: string }> = {
  ESPERA: { l: "esperando", c: "bg-violet-50 text-violet-800" },
  REPONER: { l: "reponer", c: "bg-amber-50 text-amber-800" },
  AMBOS: { l: "ambos", c: "bg-sky-50 text-sky-800" },
};

const ESTADO_PEDIDO: Record<string, { l: string; c: string }> = {
  ABIERTO: { l: "abierto", c: "bg-amber-50 text-amber-800" },
  RECIBIDO: { l: "recibido", c: "bg-emerald-50 text-emerald-800" },
  CANCELADO: { l: "cancelado", c: "bg-gray-100 text-gray-600" },
};

function num(n: number) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/* ---------- boton de barra: icono arriba, etiqueta abajo ---------- */
function Accion({
  icono,
  label,
  onClick,
  tono,
  disabled,
}: {
  icono: string;
  label: string;
  onClick?: () => void;
  tono?: "accent" | "success" | "danger";
  disabled?: boolean;
}) {
  const color =
    tono === "accent"
      ? "text-indigo-700 hover:bg-indigo-50"
      : tono === "success"
      ? "text-emerald-700 hover:bg-emerald-50"
      : tono === "danger"
      ? "text-red-600 hover:bg-red-50"
      : "text-gray-600 hover:bg-gray-100";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg ${color} disabled:opacity-30 disabled:hover:bg-transparent`}
    >
      <span className="text-[17px] leading-none">{icono}</span>
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}

export default function PedidosPage() {
  const [data, setData] = useState<PorPedir | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [provs, setProvs] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [tab, setTab] = useState<"pedir" | "pedidos">("pedir");
  const [soloEsperando, setSoloEsperando] = useState(false);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cant, setCant] = useState<Record<string, string>>({});

  const [asignar, setAsignar] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [recibir, setRecibir] = useState<{
    productId: string;
    desc: string;
    orderItemId: string | null;
    falta: number;
  } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.rpc("pending_orders"),
      supabase.rpc("list_purchase_orders", { p_status: "TODOS" }),
      supabase.rpc("list_suppliers"),
    ]);
    setCargando(false);
    if (r1.error) {
      setError(r1.error.message);
      return;
    }
    setError(null);
    setData(r1.data as PorPedir);
    if (!r2.error) setPedidos((r2.data ?? []) as Pedido[]);
    if (!r3.error) setProvs((r3.data ?? []) as Proveedor[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const lineas = useMemo(() => {
    if (!data) return [];
    return soloEsperando
      ? data.lineas.filter((l) => l.origen !== "REPONER")
      : data.lineas;
  }, [data, soloEsperando]);

  // agrupar por proveedor, los sin proveedor primero
  const grupos = useMemo(() => {
    const m = new Map<
      string,
      { key: string; name: string; supplierId: string | null; lineas: LineaPedir[] }
    >();
    for (const l of lineas) {
      const k = l.supplier_id ?? "SIN";
      if (!m.has(k))
        m.set(k, {
          key: k,
          name: l.proveedor ?? "Sin proveedor asignado",
          supplierId: l.supplier_id,
          lineas: [],
        });
      m.get(k)!.lineas.push(l);
    }
    return Array.from(m.values()).sort((a, b) => {
      if (!a.supplierId) return -1;
      if (!b.supplierId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [lineas]);

  function qty(l: LineaPedir) {
    return cant[l.product_id] ?? String(l.cantidad);
  }

  function toggle(l: LineaPedir) {
    if (l.pedido) return;
    setSel((p) => {
      const n = new Set(p);
      if (n.has(l.product_id)) n.delete(l.product_id);
      else n.add(l.product_id);
      return n;
    });
  }

  const seleccionadas = useMemo(
    () => lineas.filter((l) => sel.has(l.product_id)),
    [lineas, sel]
  );

  const unidadesSel = useMemo(
    () =>
      seleccionadas.reduce(
        (s, l) => s + (Number(String(qty(l)).replace(",", ".")) || 0),
        0
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seleccionadas, cant]
  );

  const provsSel = useMemo(
    () => new Set(seleccionadas.map((l) => l.supplier_id ?? "SIN")),
    [seleccionadas]
  );

  const puedeGenerar =
    seleccionadas.length > 0 && provsSel.size === 1 && !provsSel.has("SIN");

  async function generar() {
    if (!puedeGenerar) return;
    const supplierId = seleccionadas[0].supplier_id;
    const items = seleccionadas.map((l) => ({
      product_id: l.product_id,
      cantidad: Number(String(qty(l)).replace(",", ".")) || 0,
    }));
    const { data: r, error } = await supabase.rpc("create_purchase_order", {
      p_supplier_id: supplierId,
      p_items: items,
      p_order_date: null,
      p_notes: null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    const res = r as { numero: number; lineas: number };
    setAviso(
      `Pedido P-${String(res.numero).padStart(4, "0")} generado con ${res.lineas} lineas. Esas lineas ya no vuelven a aparecer aqui.`
    );
    setSel(new Set());
    setCant({});
    cargar();
  }

  async function cancelarDemanda(noteId: string, productId: string) {
    if (!confirm("¿El cliente cancelo? Deja de aparecer en Por pedir.")) return;
    const { error } = await supabase.rpc("cancel_demand", {
      p_note_id: noteId,
      p_product_id: productId,
      p_cancel: true,
    });
    if (error) {
      setError(error.message);
      return;
    }
    cargar();
  }

  return (
    <main className="p-6 max-w-[1100px]">
      {/* ---------- barra de contexto ---------- */}
      <div className="flex items-center gap-2.5 mb-3">
        <h1 className="text-2xl font-semibold text-gray-900">Pedidos</h1>
        {data && (
          <span className="text-sm text-gray-500">
            {num(data.espera_unidades)} uds esperadas por {data.espera_notas} notas ·{" "}
            {num(data.reponer_unidades)} para reponer · {num(data.ya_pedido_unidades)} ya
            pedidas
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex">
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500">
            ×
          </button>
        </div>
      )}
      {aviso && (
        <div className="mb-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex">
          {aviso}
          <button onClick={() => setAviso(null)} className="ml-auto text-emerald-600">
            ×
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("pedir")}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "pedir"
              ? "bg-gray-900 text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Por pedir ({lineas.length})
        </button>
        <button
          onClick={() => setTab("pedidos")}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "pedidos"
              ? "bg-gray-900 text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Pedidos ({pedidos.length})
        </button>
      </div>

      {/* ================= POR PEDIR ================= */}
      {tab === "pedir" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex gap-1 px-2.5 py-1.5 border-b border-gray-100">
            <Accion
              icono="＋"
              label="generar pedido"
              tono="accent"
              disabled={!puedeGenerar}
              onClick={generar}
            />
            <Accion
              icono="⌂"
              label="asignar proveedor"
              disabled={seleccionadas.length === 0}
              onClick={() => setAsignar(true)}
            />
            <div className="w-px bg-gray-200 my-1.5 mx-1.5" />
            <Accion
              icono="≡"
              label={soloEsperando ? "ver todo" : "solo esperando"}
              onClick={() => setSoloEsperando((v) => !v)}
            />
            <div className="ml-auto flex items-center pr-2 text-[11px] text-gray-400">
              {seleccionadas.length > 0 && provsSel.size > 1 && (
                <span className="text-amber-700">
                  elegiste lineas de varios proveedores — un pedido por proveedor
                </span>
              )}
              {seleccionadas.length > 0 && provsSel.has("SIN") && (
                <span className="text-amber-700">
                  hay lineas sin proveedor: asignalo primero
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 px-3.5 py-1.5 border-b border-gray-300 text-[10px] text-gray-400 uppercase tracking-wide">
            <span className="w-3.5" />
            <span className="w-[86px]">codigo</span>
            <span className="flex-1 min-w-0">descripcion</span>
            <span className="w-[72px]">origen</span>
            <span className="w-11 text-right">cant</span>
            <span className="w-[108px]">estado</span>
          </div>

          {cargando && <p className="text-sm text-gray-400 p-4">Cargando...</p>}

          {!cargando && grupos.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-700 mb-1">No hay nada que pedir ahora.</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Aqui cae lo que tus clientes esperan (productos bajo pedido) y lo que bajo
                del minimo. Si nunca ves nada, revisa en{" "}
                <Link href="/inventario" className="text-indigo-600 hover:underline">
                  Inventario
                </Link>{" "}
                que tengas productos marcados bajo pedido y minimos puestos.
              </p>
            </div>
          )}

          {grupos.map((g) => (
            <div key={g.key}>
              <div
                className={`flex items-center gap-2.5 px-3.5 py-1.5 border-b border-gray-100 text-[12px] ${
                  g.supplierId ? "bg-gray-50" : "bg-amber-50"
                }`}
              >
                <span
                  className={`font-medium ${
                    g.supplierId ? "text-gray-900" : "text-amber-900"
                  }`}
                >
                  {g.name}
                </span>
                <span
                  className={`text-[11px] ${
                    g.supplierId ? "text-gray-500" : "text-amber-800"
                  }`}
                >
                  {g.lineas.length} repuestos ·{" "}
                  {num(g.lineas.reduce((s, l) => s + l.cantidad, 0))} uds
                  {!g.supplierId && " · no se puede pedir asi"}
                </span>
                <button
                  onClick={() =>
                    setSel((p) => {
                      const n = new Set(p);
                      for (const l of g.lineas) if (!l.pedido) n.add(l.product_id);
                      return n;
                    })
                  }
                  className="ml-auto text-[11px] text-indigo-600 hover:underline"
                >
                  seleccionar todo
                </button>
              </div>

              {g.lineas.map((l) => {
                const marcada = sel.has(l.product_id);
                const o = ORIGEN[l.origen];
                return (
                  <div key={l.product_id}>
                    <div
                      className={`flex gap-2.5 px-3.5 py-[7px] border-b border-gray-100 text-[12.5px] items-center ${
                        marcada ? "bg-indigo-50/60" : l.pedido ? "opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={marcada}
                        disabled={!!l.pedido}
                        onChange={() => toggle(l)}
                        className="w-3 h-3 shrink-0"
                      />
                      <span className="w-[86px] font-mono text-[10.5px] text-gray-500 shrink-0 truncate">
                        {l.code}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {l.description}
                        {l.notas.length > 0 && (
                          <span className="ml-2 text-[10px] text-gray-400">
                            notas{" "}
                            {l.notas.map((n) => n.sequence_number).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="w-[72px] shrink-0">
                        <span className={`text-[10px] px-1.5 py-[1px] rounded-full ${o.c}`}>
                          {o.l}
                        </span>
                      </span>
                      <span className="w-11 text-right shrink-0">
                        {marcada ? (
                          <input
                            value={qty(l)}
                            onChange={(e) =>
                              setCant((p) => ({ ...p, [l.product_id]: e.target.value }))
                            }
                            className="w-11 h-6 px-1.5 border border-indigo-300 rounded text-[12px] text-right"
                          />
                        ) : (
                          num(l.cantidad)
                        )}
                      </span>
                      <span className="w-[108px] shrink-0">
                        {l.pedido ? (
                          <button
                            onClick={() => {
                              setDetalleId(l.pedido!.order_id);
                              setTab("pedidos");
                            }}
                            className="text-[10px] px-1.5 py-[1px] rounded-full bg-amber-50 text-amber-800 hover:bg-amber-100"
                          >
                            pedido P-{String(l.pedido.numero).padStart(4, "0")}
                          </button>
                        ) : !l.supplier_id ? (
                          <span className="text-[10.5px] text-amber-700">
                            falta proveedor
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              setRecibir({
                                productId: l.product_id,
                                desc: l.description,
                                orderItemId: null,
                                falta: l.cantidad,
                              })
                            }
                            className="text-[11px] text-emerald-700 hover:underline"
                          >
                            recibir suelto
                          </button>
                        )}
                      </span>
                    </div>

                    {marcada && l.notas.length > 0 && (
                      <div className="pl-[118px] pr-3.5 py-1 border-b border-gray-50 bg-indigo-50/30">
                        {l.notas.map((n) => (
                          <span
                            key={n.note_id}
                            className="inline-flex items-center gap-1 text-[10.5px] text-gray-600 mr-3"
                          >
                            <Link
                              href={`/notas/nueva?id=${n.note_id}`}
                              className="text-indigo-600 hover:underline"
                            >
                              nota {n.sequence_number}
                            </Link>
                            <span>
                              {n.cliente} · {num(n.cantidad)}
                            </span>
                            <button
                              onClick={() => cancelarDemanda(n.note_id, l.product_id)}
                              title="el cliente cancelo"
                              className="text-gray-300 hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {data && (
            <div className="flex items-center gap-4 px-3.5 py-2 border-t border-gray-300 bg-gray-50 text-[11.5px]">
              {seleccionadas.length > 0 ? (
                <span className="text-indigo-700">
                  {seleccionadas.length} lineas · {num(unidadesSel)} unidades
                  <button
                    onClick={() => {
                      setSel(new Set());
                      setCant({});
                    }}
                    className="ml-2 text-gray-400 hover:text-gray-700 underline"
                  >
                    quitar
                  </button>
                </span>
              ) : (
                <span className="text-gray-400">
                  marca lineas de un mismo proveedor para generar su pedido
                </span>
              )}
              <span className="ml-auto text-gray-500">
                esperando{" "}
                <b className="font-medium text-gray-900">{num(data.espera_unidades)}</b>
              </span>
              <span className="text-gray-500">
                reponer{" "}
                <b className="font-medium text-gray-900">{num(data.reponer_unidades)}</b>
              </span>
              <span className="text-gray-500">
                ya pedido{" "}
                <b className="font-medium text-amber-700">
                  {num(data.ya_pedido_unidades)}
                </b>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ================= PEDIDOS ================= */}
      {tab === "pedidos" && !detalleId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex gap-2.5 px-3.5 py-1.5 border-b border-gray-300 text-[10px] text-gray-400 uppercase tracking-wide">
            <span className="w-16">pedido</span>
            <span className="w-20">fecha</span>
            <span className="flex-1">proveedor</span>
            <span className="w-14 text-right">lineas</span>
            <span className="w-16 text-right">pedido</span>
            <span className="w-16 text-right">recibido</span>
            <span className="w-20">estado</span>
          </div>
          {pedidos.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">
              Todavia no has generado ningun pedido.
            </p>
          )}
          {pedidos.map((p) => {
            const e = ESTADO_PEDIDO[p.status] ?? ESTADO_PEDIDO.ABIERTO;
            const parcial =
              p.status === "ABIERTO" && p.recibido > 0 && p.recibido < p.unidades;
            return (
              <button
                key={p.id}
                onClick={() => setDetalleId(p.id)}
                className="w-full flex gap-2.5 px-3.5 py-2 border-b border-gray-100 text-[12.5px] text-left hover:bg-gray-50"
              >
                <span className="w-16 font-mono text-[11px] text-indigo-600">
                  P-{String(p.numero).padStart(4, "0")}
                </span>
                <span className="w-20 text-gray-500">{p.order_date}</span>
                <span className="flex-1 min-w-0 truncate">
                  {p.proveedor ?? "Sin proveedor"}
                  {p.invoice_id && (
                    <span className="ml-2 text-[10px] text-sky-700">factura enlazada</span>
                  )}
                </span>
                <span className="w-14 text-right text-gray-500">{p.lineas}</span>
                <span className="w-16 text-right">{num(p.unidades)}</span>
                <span className="w-16 text-right text-emerald-700">
                  {num(p.recibido)}
                </span>
                <span className="w-20">
                  <span className={`text-[10px] px-1.5 py-[1px] rounded-full ${e.c}`}>
                    {parcial ? "a medias" : e.l}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "pedidos" && detalleId && (
        <DetallePedido
          id={detalleId}
          onClose={() => setDetalleId(null)}
          onCambio={(msg) => {
            if (msg) setAviso(msg);
            cargar();
          }}
          onRecibir={(it) =>
            setRecibir({
              productId: it.product_id,
              desc: it.description,
              orderItemId: it.id,
              falta: it.falta,
            })
          }
        />
      )}

      {asignar && (
        <AsignarProveedor
          provs={provs}
          ids={seleccionadas.map((l) => l.product_id)}
          onClose={() => setAsignar(false)}
          onListo={(n, nombre) => {
            setAsignar(false);
            setSel(new Set());
            setAviso(`${n} repuestos asignados a ${nombre}.`);
            cargar();
          }}
        />
      )}

      {recibir && (
        <RecibirModal
          productId={recibir.productId}
          descripcion={recibir.desc}
          orderItemId={recibir.orderItemId}
          sugerida={recibir.falta}
          onClose={() => setRecibir(null)}
          onSaved={(msg) => {
            setRecibir(null);
            setAviso(msg);
            cargar();
          }}
        />
      )}
    </main>
  );
}

/* ================= asignar proveedor ================= */

function AsignarProveedor({
  provs,
  ids,
  onClose,
  onListo,
}: {
  provs: Proveedor[];
  ids: string[];
  onClose: () => void;
  onListo: (n: number, nombre: string) => void;
}) {
  const [elegido, setElegido] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!elegido) {
      setErr("Elige un proveedor.");
      return;
    }
    const { data, error } = await supabase.rpc("assign_product_supplier", {
      p_ids: ids,
      p_supplier_id: elegido,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    onListo(
      (data as number) ?? ids.length,
      provs.find((p) => p.id === elegido)?.name ?? ""
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Asignar proveedor
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          {ids.length} repuestos seleccionados. Este queda como su proveedor habitual;
          igual puedes comprarle a otro cuando quieras.
        </p>
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="w-full h-9 px-2 border border-gray-300 rounded-lg text-sm mb-3"
        >
          <option value="">Elige...</option>
          {provs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button
            onClick={guardar}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700"
          >
            Asignar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= detalle del pedido ================= */

function DetallePedido({
  id,
  onClose,
  onCambio,
  onRecibir,
}: {
  id: string;
  onClose: () => void;
  onCambio: (msg?: string) => void;
  onRecibir: (it: ItemPedido) => void;
}) {
  const [d, setD] = useState<Detalle | null>(null);
  const [editando, setEditando] = useState(false);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [facturas, setFacturas] = useState<
    { id: string; numero: string; fecha: string; total: number }[]
  >([]);
  const [verFact, setVerFact] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_purchase_order", { p_id: id });
    if (error) {
      setErr(error.message);
      return;
    }
    setD(data as Detalle);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abrirFacturas() {
    if (!d?.supplier_id) return;
    const { data } = await supabase.rpc("invoices_for_supplier", {
      p_supplier_id: d.supplier_id,
    });
    setFacturas((data ?? []) as typeof facturas);
    setVerFact(true);
  }

  async function enlazar(invoiceId: string | null) {
    const { error } = await supabase.rpc("link_invoice_to_order", {
      p_order_id: id,
      p_invoice_id: invoiceId,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setVerFact(false);
    cargar();
    onCambio();
  }

  async function guardarCantidades() {
    for (const [itemId, v] of Object.entries(cant)) {
      const q = Number(String(v).replace(",", ".")) || 0;
      const { error } = await supabase.rpc("update_order_item", {
        p_id: itemId,
        p_quantity: q,
      });
      if (error) {
        setErr(error.message);
        return;
      }
    }
    setCant({});
    setEditando(false);
    cargar();
    onCambio();
  }

  async function cancelar() {
    if (!confirm("¿Cancelar este pedido? Sus lineas vuelven a Por pedir.")) return;
    const { error } = await supabase.rpc("cancel_purchase_order", { p_id: id });
    if (error) {
      setErr(error.message);
      return;
    }
    cargar();
    onCambio("Pedido cancelado. Sus lineas volvieron a Por pedir.");
  }

  async function reabrir() {
    const { error } = await supabase.rpc("reopen_purchase_order", { p_id: id });
    if (error) {
      setErr(error.message);
      return;
    }
    cargar();
    onCambio();
  }

  function textoWhatsapp() {
    if (!d) return "";
    const l = d.items
      .map((i) => `${i.code}  ${i.description}  x${num(i.quantity)}`)
      .join("\n");
    return `Pedido P-${String(d.numero).padStart(4, "0")} - ${d.order_date}\n\n${l}`;
  }

  if (!d) return <p className="text-sm text-gray-400">Cargando pedido...</p>;

  const e = ESTADO_PEDIDO[d.status] ?? ESTADO_PEDIDO.ABIERTO;
  const parcial =
    d.status === "ABIERTO" && d.total_recibido > 0 && d.total_recibido < d.total_pedido;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2 bg-gray-50 border-b border-gray-200">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-900 text-[13px]"
        >
          ‹ volver
        </button>
        <span className="text-[14px] font-medium">
          Pedido P-{String(d.numero).padStart(4, "0")}
        </span>
        <span className="text-[11.5px] text-gray-500">
          {d.proveedor} · {d.order_date}
        </span>
        <span className={`text-[10px] px-2 py-[2px] rounded-full ${e.c}`}>
          {parcial ? "recibido a medias" : e.l}
        </span>
      </div>

      <div className="flex gap-1 px-2.5 py-1.5 border-b border-gray-100">
        <Accion
          icono="↓"
          label="editar"
          onClick={() => setEditando((v) => !v)}
          disabled={d.status === "CANCELADO"}
        />
        {editando && (
          <Accion icono="✓" label="guardar" tono="success" onClick={guardarCantidades} />
        )}
        <Accion
          icono="✆"
          label="whatsapp"
          onClick={() =>
            window.open(
              `https://wa.me/?text=${encodeURIComponent(textoWhatsapp())}`,
              "_blank"
            )
          }
        />
        <Accion icono="⎙" label="imprimir" onClick={() => window.print()} />
        <div className="w-px bg-gray-200 my-1.5 mx-1.5" />
        <Accion icono="⚯" label="enlazar factura" onClick={abrirFacturas} />
        {d.status === "CANCELADO" ? (
          <Accion icono="↺" label="reabrir" onClick={reabrir} />
        ) : (
          <Accion icono="✕" label="cancelar" tono="danger" onClick={cancelar} />
        )}
      </div>

      {d.invoice_id && (
        <div className="px-3.5 py-2 bg-sky-50 border-b border-sky-100 text-[12px] text-sky-900 flex items-center gap-2">
          Factura {d.factura ?? "de compra"} enlazada — el stock ya entro por Compras, al
          recibir aqui solo se reparte
          <button
            onClick={() => enlazar(null)}
            className="ml-auto text-[11px] text-sky-700 hover:underline"
          >
            quitar
          </button>
        </div>
      )}

      {err && (
        <div className="px-3.5 py-2 bg-red-50 text-sm text-red-700">{err}</div>
      )}

      <div className="flex gap-2.5 px-3.5 py-1.5 border-b border-gray-300 text-[10px] text-gray-400 uppercase tracking-wide">
        <span className="w-[86px]">codigo</span>
        <span className="flex-1">descripcion</span>
        <span className="w-12 text-right">pedi</span>
        <span className="w-16 text-right">recibido</span>
        <span className="w-14 text-right">falta</span>
        <span className="w-16" />
      </div>

      {d.items.map((i) => (
        <div
          key={i.id}
          className="flex gap-2.5 px-3.5 py-[7px] border-b border-gray-100 text-[12.5px] items-center"
        >
          <span className="w-[86px] font-mono text-[10.5px] text-gray-500 shrink-0 truncate">
            {i.code}
          </span>
          <span className="flex-1 min-w-0 truncate">{i.description}</span>
          <span className="w-12 text-right shrink-0">
            {editando ? (
              <input
                value={cant[i.id] ?? String(i.quantity)}
                onChange={(ev) =>
                  setCant((p) => ({ ...p, [i.id]: ev.target.value }))
                }
                className="w-12 h-6 px-1.5 border border-indigo-300 rounded text-[12px] text-right"
              />
            ) : (
              num(i.quantity)
            )}
          </span>
          <span className="w-16 text-right shrink-0 text-emerald-700">
            {i.received_qty > 0 ? num(i.received_qty) : "—"}
          </span>
          <span
            className={`w-14 text-right shrink-0 ${
              i.falta > 0 ? "text-amber-700" : "text-gray-300"
            }`}
          >
            {i.falta > 0 ? num(i.falta) : "—"}
          </span>
          <span className="w-16 text-right shrink-0">
            {i.falta > 0 && d.status !== "CANCELADO" ? (
              <button
                onClick={() => onRecibir(i)}
                className="text-[11px] text-emerald-700 hover:underline"
              >
                recibir
              </button>
            ) : (
              <span className="text-[10px] px-1.5 py-[1px] rounded-full bg-emerald-50 text-emerald-800">
                completo
              </span>
            )}
          </span>
        </div>
      ))}

      <div className="flex items-center gap-4 px-3.5 py-2 border-t border-gray-300 bg-gray-50 text-[11.5px]">
        <span className="text-gray-500">
          {d.items.length} lineas · {num(d.total_pedido)} unidades pedidas
        </span>
        <span className="ml-auto text-gray-500">
          recibido{" "}
          <b className="font-medium text-emerald-700">{num(d.total_recibido)}</b>
        </span>
        <span className="text-gray-500">
          falta{" "}
          <b className="font-medium text-amber-700">
            {num(Math.max(d.total_pedido - d.total_recibido, 0))}
          </b>
        </span>
      </div>

      {verFact && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setVerFact(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Enlazar factura de compra
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Facturas registradas de {d.proveedor}. Al enlazarla, recibir aqui deja de
              sumar stock para no contarlo dos veces.
            </p>
            {facturas.length === 0 && (
              <p className="text-sm text-gray-500 mb-3">
                No hay facturas de este proveedor todavia. Registrala en{" "}
                <Link href="/compras" className="text-indigo-600 hover:underline">
                  Compras
                </Link>
                .
              </p>
            )}
            {facturas.map((f) => (
              <button
                key={f.id}
                onClick={() => enlazar(f.id)}
                className="w-full flex gap-3 px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-[13px] text-left"
              >
                <span className="font-mono text-[11px] text-gray-500 w-20 truncate">
                  {f.numero}
                </span>
                <span className="text-gray-500">{f.fecha}</span>
                <span className="ml-auto">${f.total}</span>
              </button>
            ))}
            <button
              onClick={() => setVerFact(false)}
              className="mt-3 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= recibir y repartir ================= */

function RecibirModal({
  productId,
  descripcion,
  orderItemId,
  sugerida,
  onClose,
  onSaved,
}: {
  productId: string;
  descripcion: string;
  orderItemId: string | null;
  sugerida: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [cantidad, setCantidad] = useState(sugerida > 0 ? String(sugerida) : "");
  const [prop, setProp] = useState<Propuesta | null>(null);
  const [repartos, setRepartos] = useState<Record<string, string>>({});
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const proponer = useCallback(async () => {
    const q = Number(cantidad.replace(",", ".")) || 0;
    if (q <= 0) {
      setErr("Pon cuantas unidades llegaron.");
      return;
    }
    setErr(null);
    setBusy(true);
    const { data, error } = await supabase.rpc("propose_allocation", {
      p_product_id: productId,
      p_qty: q,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const p = data as Propuesta;
    setProp(p);
    const r: Record<string, string> = {};
    for (const e of p.esperando) r[e.note_id] = String(e.propuesto);
    setRepartos(r);
  }, [cantidad, productId]);

  const llegaron = Number(cantidad.replace(",", ".")) || 0;
  const repartido = useMemo(
    () =>
      Object.values(repartos).reduce(
        (s, v) => s + (Number(String(v).replace(",", ".")) || 0),
        0
      ),
    [repartos]
  );
  const alAlmacen = Math.max(llegaron - repartido, 0);
  const sobrepasa = repartido > llegaron + 0.005;

  async function guardar() {
    setErr(null);
    if (sobrepasa) {
      setErr("Estas repartiendo mas de lo que llego.");
      return;
    }
    const allocations = Object.entries(repartos)
      .map(([noteId, v]) => ({
        note_id: noteId,
        cantidad: Number(String(v).replace(",", ".")) || 0,
      }))
      .filter((a) => a.cantidad > 0);

    setBusy(true);
    const { data, error } = await supabase.rpc("receive_allocation", {
      p_product_id: productId,
      p_qty: llegaron,
      p_allocations: allocations,
      p_order_item_id: orderItemId,
      p_sumar_stock: null,
      p_fecha: fecha,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const r = data as {
      repartido: number;
      al_almacen: number;
      notas: number;
      sumo_stock: boolean;
    };
    onSaved(
      `Recibido. ${num(r.repartido)} repartidas entre ${r.notas} notas, ${num(
        r.al_almacen
      )} al almacen.${r.sumo_stock ? "" : " No se sumo stock: la factura ya lo habia hecho."}`
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">Recibir mercancia</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            cerrar
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{descripcion}</p>

        <div className="flex gap-3 items-end mb-4">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Llegaron</label>
            <input
              value={cantidad}
              onChange={(e) => {
                setCantidad(e.target.value);
                setProp(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") proponer();
              }}
              placeholder="0"
              className="w-24 h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 px-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {!prop && (
            <button
              onClick={proponer}
              disabled={busy}
              className="h-9 px-4 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {busy ? "..." : "Ver el reparto"}
            </button>
          )}
        </div>

        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        {prop && (
          <>
            <div className="flex gap-3 px-1 py-1.5 border-b border-gray-200 text-[10px] text-gray-400 uppercase tracking-wide">
              <span className="w-12">nota</span>
              <span className="flex-1">cliente</span>
              <span className="w-16">pedida</span>
              <span className="w-12 text-right">pidio</span>
              <span className="w-20 text-right">le doy</span>
              <span className="w-20">falta</span>
            </div>

            {prop.esperando.length === 0 && (
              <p className="py-4 text-sm text-gray-500">
                Nadie esta esperando este repuesto. Todo lo que llego va al almacen.
              </p>
            )}

            {prop.esperando.map((e) => {
              const dado =
                Number(String(repartos[e.note_id] ?? "0").replace(",", ".")) || 0;
              const falta = e.pidio - dado;
              return (
                <div
                  key={e.note_id}
                  className="flex gap-3 items-center px-1 py-2 border-b border-gray-100 text-[12.5px]"
                >
                  <Link
                    href={`/notas/nueva?id=${e.note_id}`}
                    className="w-12 text-indigo-600 hover:underline font-mono text-[11px]"
                  >
                    {e.sequence_number}
                  </Link>
                  <span className="flex-1 min-w-0 truncate">{e.cliente}</span>
                  <span className="w-16 text-gray-500 text-[11px]">{e.note_date}</span>
                  <span className="w-12 text-right">{num(e.pidio)}</span>
                  <span className="w-20 text-right">
                    <input
                      value={repartos[e.note_id] ?? "0"}
                      onChange={(ev) =>
                        setRepartos((p) => ({ ...p, [e.note_id]: ev.target.value }))
                      }
                      className="w-16 h-7 px-2 border border-indigo-300 rounded-lg text-sm text-right"
                    />
                  </span>
                  <span className="w-20">
                    {falta > 0.005 ? (
                      <span className="text-[10.5px] px-1.5 py-[1px] rounded-full bg-amber-50 text-amber-800">
                        faltan {num(falta)}
                      </span>
                    ) : (
                      <span className="text-[10.5px] px-1.5 py-[1px] rounded-full bg-emerald-50 text-emerald-800">
                        completa
                      </span>
                    )}
                  </span>
                </div>
              );
            })}

            <div className="flex gap-3 items-center px-1 py-2 text-[12.5px] bg-emerald-50 rounded-lg mt-1">
              <span className="flex-1 text-emerald-800">al almacen</span>
              <span className="w-20 text-right font-medium text-emerald-800">
                {num(alAlmacen)}
              </span>
              <span className="w-20" />
            </div>

            {sobrepasa && (
              <p className="mt-2 text-sm text-red-600">
                Estas repartiendo {num(repartido)} de las {num(llegaron)} que llegaron.
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={guardar}
                disabled={busy || sobrepasa}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-40"
              >
                {busy ? "Guardando..." : "Guardar recepcion"}
              </button>
              <button
                onClick={() => setProp(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Volver
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
