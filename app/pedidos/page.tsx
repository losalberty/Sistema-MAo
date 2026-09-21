"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type NotaEspera = {
  note_item_id: string;
  note_id: string;
  sequence_number: number;
  note_date: string;
  cliente: string;
  cantidad: number;
};

type LineaEspera = {
  product_id: string;
  code: string;
  description: string;
  supplier_id: string | null;
  proveedor: string;
  cantidad: number;
  notas: NotaEspera[];
};

type LineaReponer = {
  product_id: string;
  code: string;
  description: string;
  supplier_id: string | null;
  proveedor: string;
  cantidad: number;
};

type PorPedir = {
  espera_unidades: number;
  espera_notas: number;
  reponer_unidades: number;
  espera: LineaEspera[];
  reponer: LineaReponer[];
};

type Pedido = {
  id: string;
  numero: number;
  order_date: string;
  status: string;
  supplier_id: string | null;
  proveedor: string | null;
  lineas: number;
  unidades: number;
  recibido: number;
};

type Propuesta = {
  producto: string;
  code: string;
  llegaron: number;
  al_almacen: number;
  esperando: {
    note_item_id: string;
    note_id: string;
    sequence_number: number;
    note_date: string;
    cliente: string;
    pidio: number;
    propuesto: number;
  }[];
};

function num(n: number) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function PedidosPage() {
  const [data, setData] = useState<PorPedir | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tab, setTab] = useState<"pedir" | "pedidos">("pedir");
  const [recibir, setRecibir] = useState<{ productId: string; desc: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [r1, r2] = await Promise.all([
      supabase.rpc("pending_orders"),
      supabase.rpc("list_purchase_orders", { p_status: "TODOS" }),
    ]);
    setCargando(false);
    if (r1.error) {
      setError(r1.error.message);
      return;
    }
    setError(null);
    setData(r1.data as PorPedir);
    if (!r2.error) setPedidos((r2.data ?? []) as Pedido[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // agrupar por proveedor en el navegador
  const grupos = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { key: string; name: string; supplierId: string | null; espera: LineaEspera[]; reponer: LineaReponer[] }
    >();
    for (const l of data.espera) {
      const k = l.supplier_id ?? "sin";
      if (!map.has(k))
        map.set(k, { key: k, name: l.proveedor, supplierId: l.supplier_id, espera: [], reponer: [] });
      map.get(k)!.espera.push(l);
    }
    for (const l of data.reponer) {
      const k = l.supplier_id ?? "sin";
      if (!map.has(k))
        map.set(k, { key: k, name: l.proveedor, supplierId: l.supplier_id, espera: [], reponer: [] });
      map.get(k)!.reponer.push(l);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  async function generarPedido(g: (typeof grupos)[number]) {
    const items = [
      ...g.espera.map((l) => ({ product_id: l.product_id, cantidad: l.cantidad })),
      ...g.reponer.map((l) => ({ product_id: l.product_id, cantidad: l.cantidad })),
    ];
    if (items.length === 0) return;
    const { data: r, error } = await supabase.rpc("create_purchase_order", {
      p_supplier_id: g.supplierId,
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
      `Pedido P-${String(res.numero).padStart(4, "0")} generado para ${g.name} con ${res.lineas} lineas.`
    );
    cargar();
  }

  async function cancelarDemanda(noteItemId: string) {
    if (!confirm("¿El cliente cancelo este renglon? Deja de aparecer en Por pedir."))
      return;
    const { error } = await supabase.rpc("cancel_demand", {
      p_note_item_id: noteItemId,
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
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500">
            {data
              ? `${num(data.espera_unidades)} unidades esperadas por ${data.espera_notas} notas · ${num(
                  data.reponer_unidades
                )} para reponer stock`
              : "cargando..."}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
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

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("pedir")}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "pedir"
              ? "bg-gray-900 text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Por pedir ({grupos.length} proveedores)
        </button>
        <button
          onClick={() => setTab("pedidos")}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "pedidos"
              ? "bg-gray-900 text-white"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Pedidos hechos ({pedidos.length})
        </button>
      </div>

      {cargando && <p className="text-sm text-gray-400">Cargando...</p>}

      {tab === "pedir" && !cargando && grupos.length === 0 && (
        <div className="p-8 text-center bg-white border border-gray-200 rounded-xl">
          <p className="text-sm text-gray-700 mb-1">No hay nada que pedir ahora.</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Aqui aparece lo que tus clientes estan esperando (productos bajo pedido) y lo
            que bajo del minimo en tu almacen. Si nunca ves nada, revisa que tengas
            productos marcados como bajo pedido y minimos puestos en{" "}
            <Link href="/inventario" className="text-indigo-600 hover:underline">
              Inventario
            </Link>
            .
          </p>
        </div>
      )}

      {tab === "pedir" &&
        grupos.map((g) => (
          <div
            key={g.key}
            className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-[14px] font-medium text-gray-900">{g.name}</span>
              <span className="text-[10.5px] px-2 py-[2px] rounded-full bg-indigo-50 text-indigo-800">
                {g.espera.length + g.reponer.length} repuestos
              </span>
              <button
                onClick={() => generarPedido(g)}
                className="ml-auto px-3 h-7 rounded-lg bg-gray-900 text-white text-[12px] hover:bg-gray-700"
              >
                Generar pedido
              </button>
            </div>

            {g.espera.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-[10.5px] text-gray-400 mb-1.5">
                  clientes esperando
                </p>
                {g.espera.map((l) => (
                  <div key={l.product_id} className="mb-2">
                    <div className="flex gap-3 items-baseline text-[12.5px]">
                      <span className="w-[90px] font-mono text-[10.5px] text-gray-500 truncate">
                        {l.code}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{l.description}</span>
                      <span className="w-10 text-right font-medium">
                        {num(l.cantidad)}
                      </span>
                      <button
                        onClick={() =>
                          setRecibir({ productId: l.product_id, desc: l.description })
                        }
                        className="text-[11px] text-emerald-700 hover:underline shrink-0"
                      >
                        recibir
                      </button>
                    </div>
                    <div className="pl-[102px] mt-0.5">
                      {l.notas.map((n) => (
                        <span
                          key={n.note_item_id}
                          className="group inline-flex items-center gap-1 text-[10.5px] text-gray-500 mr-3"
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
                            onClick={() => cancelarDemanda(n.note_item_id)}
                            title="el cliente cancelo"
                            className="text-gray-300 hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {g.reponer.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-50">
                <p className="text-[10.5px] text-gray-400 mb-1.5">
                  para reponer stock de almacen
                </p>
                {g.reponer.map((l) => (
                  <div
                    key={l.product_id}
                    className="flex gap-3 items-baseline text-[12.5px] py-0.5"
                  >
                    <span className="w-[90px] font-mono text-[10.5px] text-gray-500 truncate">
                      {l.code}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-gray-700">
                      {l.description}
                    </span>
                    <span className="w-10 text-right text-amber-700">
                      {num(l.cantidad)}
                    </span>
                    <button
                      onClick={() =>
                        setRecibir({ productId: l.product_id, desc: l.description })
                      }
                      className="text-[11px] text-emerald-700 hover:underline shrink-0"
                    >
                      recibir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

      {tab === "pedidos" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex gap-3 px-4 py-2 border-b border-gray-100 text-[10.5px] text-gray-400">
            <span className="w-16">pedido</span>
            <span className="w-20">fecha</span>
            <span className="flex-1">proveedor</span>
            <span className="w-14 text-right">lineas</span>
            <span className="w-16 text-right">unidades</span>
            <span className="w-16 text-right">recibido</span>
            <span className="w-20">estado</span>
          </div>
          {pedidos.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">
              Todavia no has generado ningun pedido.
            </p>
          )}
          {pedidos.map((p) => (
            <div
              key={p.id}
              className="flex gap-3 px-4 py-2.5 border-b border-gray-50 text-[12.5px]"
            >
              <span className="w-16 font-mono text-[11px] text-gray-500">
                P-{String(p.numero).padStart(4, "0")}
              </span>
              <span className="w-20 text-gray-500">{p.order_date}</span>
              <span className="flex-1 min-w-0 truncate">
                {p.proveedor ?? "Sin proveedor"}
              </span>
              <span className="w-14 text-right text-gray-500">{p.lineas}</span>
              <span className="w-16 text-right">{num(p.unidades)}</span>
              <span className="w-16 text-right text-emerald-700">
                {num(p.recibido)}
              </span>
              <span className="w-20">
                <span
                  className={`text-[10.5px] px-1.5 py-[1px] rounded-full ${
                    p.status === "RECIBIDO"
                      ? "bg-emerald-50 text-emerald-800"
                      : p.status === "CANCELADO"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {p.status.toLowerCase()}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {recibir && (
        <RecibirModal
          productId={recibir.productId}
          descripcion={recibir.desc}
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

/* ================= recibir y repartir ================= */

function RecibirModal({
  productId,
  descripcion,
  onClose,
  onSaved,
}: {
  productId: string;
  descripcion: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [cantidad, setCantidad] = useState("");
  const [prop, setProp] = useState<Propuesta | null>(null);
  const [repartos, setRepartos] = useState<Record<string, string>>({});
  const [sumarStock, setSumarStock] = useState(true);
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
    for (const e of p.esperando) r[e.note_item_id] = String(e.propuesto);
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
      .map(([id, v]) => ({
        note_item_id: id,
        cantidad: Number(String(v).replace(",", ".")) || 0,
      }))
      .filter((a) => a.cantidad > 0);

    setBusy(true);
    const { data, error } = await supabase.rpc("receive_allocation", {
      p_product_id: productId,
      p_qty: llegaron,
      p_allocations: allocations,
      p_sumar_stock: sumarStock,
      p_order_id: null,
      p_fecha: fecha,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const r = data as { repartido: number; al_almacen: number; notas: number };
    onSaved(
      `Recibido. ${num(r.repartido)} repartidas entre ${r.notas} notas, ${num(
        r.al_almacen
      )} al almacen.`
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
            <div className="flex gap-3 px-1 py-1.5 border-b border-gray-100 text-[10.5px] text-gray-400">
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
              const dado = Number(String(repartos[e.note_item_id] ?? "0").replace(",", ".")) || 0;
              const falta = e.pidio - dado;
              return (
                <div
                  key={e.note_item_id}
                  className="flex gap-3 items-center px-1 py-2 border-b border-gray-50 text-[12.5px]"
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
                      value={repartos[e.note_item_id] ?? "0"}
                      onChange={(ev) =>
                        setRepartos((p) => ({
                          ...p,
                          [e.note_item_id]: ev.target.value,
                        }))
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

            <label className="flex items-start gap-2 mt-4 text-[12.5px] text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sumarStock}
                onChange={(e) => setSumarStock(e.target.checked)}
                className="w-3.5 h-3.5 mt-0.5"
              />
              <span>
                Sumar estas {num(llegaron)} unidades al stock
                <span className="block text-[11px] text-gray-500">
                  Desmarcalo solo si ya registraste la factura de compra en Compras — ahi
                  el stock ya entro y se contaria dos veces.
                </span>
              </span>
            </label>

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
