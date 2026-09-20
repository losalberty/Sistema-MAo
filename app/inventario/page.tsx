"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type StockRow = {
  id: string;
  code: string;
  description: string;
  brand: string | null;
  category: string | null;
  supply_type: string;
  stock: number;
  min_stock: number;
  cost: number;
  valor: number;
  supplier_id: string | null;
  supplier_name: string | null;
  estado: string;
};

type Resumen = {
  total: number;
  almacen: number;
  pedido: number;
  reponer: number;
  agotados: number;
  valor: number;
};

type Movimiento = {
  id: string;
  move_date: string;
  kind: string;
  quantity: number;
  saldo: number;
  reason: string | null;
  sequence_number: number | null;
  cliente: string | null;
  factura: string | null;
  proveedor: string | null;
};

type Kardex = {
  stock: number;
  min_stock: number;
  supply_type: string;
  description: string;
  code: string;
  vendido_90d: number;
  movimientos: Movimiento[];
};

type PreviewRow = {
  code: string;
  quantity: number;
  found: boolean;
  description: string | null;
  current_stock: number;
};

const ESTADOS: Record<string, { label: string; clase: string }> = {
  OK: { label: "suficiente", clase: "bg-emerald-50 text-emerald-800" },
  REPONER: { label: "reponer", clase: "bg-amber-50 text-amber-800" },
  AGOTADO: { label: "agotado", clase: "bg-red-50 text-red-800" },
  PEDIDO: { label: "bajo pedido", clase: "bg-violet-50 text-violet-800" },
};

const TIPOS_MOV: Record<string, string> = {
  VENTA: "bg-red-50 text-red-800",
  COMPRA: "bg-emerald-50 text-emerald-800",
  AJUSTE: "bg-violet-50 text-violet-800",
  INICIAL: "bg-gray-100 text-gray-700",
  DEVOLUCION: "bg-orange-50 text-orange-800",
};

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(n: number) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function InventarioPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("TODOS");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [kardexId, setKardexId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [minimo, setMinimo] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const [r1, r2] = await Promise.all([
      supabase.rpc("list_stock", { p_search: search, p_filter: filtro }),
      supabase.rpc("stock_summary"),
    ]);
    setCargando(false);
    if (r1.error) {
      setError(r1.error.message);
      return;
    }
    setError(null);
    setRows((r1.data ?? []) as StockRow[]);
    if (!r2.error) setResumen(r2.data as Resumen);
  }, [search, filtro]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  function toggleSel(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function cambiarTipo(tipo: string) {
    if (sel.size === 0) return;
    const { error } = await supabase.rpc("set_supply_type", {
      p_ids: Array.from(sel),
      p_type: tipo,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSel(new Set());
    cargar();
  }

  async function aplicarMinimo() {
    const v = Number(minimo.replace(",", "."));
    if (sel.size === 0 || Number.isNaN(v)) return;
    const { error } = await supabase.rpc("set_min_stock", {
      p_ids: Array.from(sel),
      p_min: v,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setMinimo("");
    setSel(new Set());
    cargar();
  }

  const totalVista = useMemo(
    () => rows.reduce((s, r) => s + r.valor, 0),
    [rows]
  );

  return (
    <main className="p-6 max-w-[1150px]">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500">
            {rows.length} productos en la vista ·{" "}
            <Link href="/productos" className="text-indigo-600 hover:underline">
              ir a Productos
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cargar cantidades
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Tarjeta label="Valor del inventario" valor={`$${money(resumen.valor)}`} />
          <Tarjeta
            label="Por reponer"
            valor={String(resumen.reponer)}
            tono="text-amber-700"
            sub="bajo el minimo"
          />
          <Tarjeta
            label="Agotados"
            valor={String(resumen.agotados)}
            tono="text-red-600"
            sub="de almacen, en cero"
          />
          <Tarjeta
            label="Bajo pedido"
            valor={String(resumen.pedido)}
            tono="text-violet-700"
            sub="no alertan"
          />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex gap-2 items-center p-2.5 border-b border-gray-100">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Codigo, descripcion o marca"
            className="flex-1 h-8 px-2.5 border border-gray-200 rounded-lg text-[12.5px]"
          />
          {[
            { k: "TODOS", l: "todos" },
            { k: "REPONER", l: "reponer" },
            { k: "AGOTADO", l: "agotados" },
            { k: "PEDIDO", l: "bajo pedido" },
          ].map((f) => (
            <button
              key={f.k}
              onClick={() => setFiltro(f.k)}
              className={`h-8 px-2.5 rounded-full text-[11.5px] border ${
                filtro === f.k
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        {sel.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-100 text-[12px]">
            <span className="text-indigo-800">{sel.size} seleccionados</span>
            <button
              onClick={() => cambiarTipo("ALMACEN")}
              className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 hover:bg-gray-50"
            >
              marcar de almacen
            </button>
            <button
              onClick={() => cambiarTipo("PEDIDO")}
              className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 hover:bg-gray-50"
            >
              marcar bajo pedido
            </button>
            <span className="ml-2 text-gray-500">minimo:</span>
            <input
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              placeholder="0"
              className="w-16 h-7 px-2 border border-gray-300 rounded-lg text-[12px]"
            />
            <button
              onClick={aplicarMinimo}
              className="px-2.5 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-700"
            >
              aplicar
            </button>
            <button
              onClick={() => setSel(new Set())}
              className="ml-auto text-gray-500 hover:text-gray-900 underline"
            >
              quitar seleccion
            </button>
          </div>
        )}

        <div className="flex gap-2.5 px-3 py-1.5 border-b border-gray-100 text-[10.5px] text-gray-400">
          <span className="w-3.5" />
          <span className="w-[86px]">codigo</span>
          <span className="flex-1 min-w-0">descripcion</span>
          <span className="w-12 text-right">stock</span>
          <span className="w-10 text-right">min</span>
          <span className="w-[86px]">estado</span>
          <span className="w-14 text-right">costo</span>
          <span className="w-16 text-right">valor</span>
        </div>

        {cargando && <p className="text-sm text-gray-400 p-4">Cargando...</p>}

        {!cargando && rows.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 mb-1">
              No hay productos que coincidan.
            </p>
            <p className="text-xs text-gray-400">
              Si aun no has cargado cantidades, usa el boton &quot;Cargar cantidades&quot;.
            </p>
          </div>
        )}

        {rows.map((r) => {
          const e = ESTADOS[r.estado] ?? ESTADOS.OK;
          return (
            <div
              key={r.id}
              className="group flex gap-2.5 items-center px-3 py-[7px] border-b border-gray-50 text-[12.5px] hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={sel.has(r.id)}
                onChange={() => toggleSel(r.id)}
                className="w-3 h-3 shrink-0"
              />
              <span className="w-[86px] font-mono text-[10.5px] text-gray-500 shrink-0 truncate">
                {r.code}
              </span>
              <button
                onClick={() => setKardexId(r.id)}
                className="flex-1 min-w-0 truncate text-left text-gray-800 hover:text-indigo-700 hover:underline"
              >
                {r.description}
              </button>
              <span
                className={`w-12 text-right shrink-0 ${
                  r.estado === "AGOTADO"
                    ? "text-red-600"
                    : r.estado === "REPONER"
                    ? "text-amber-700"
                    : r.stock < 0
                    ? "text-violet-700"
                    : ""
                }`}
              >
                {num(r.stock)}
              </span>
              <span className="w-10 text-right text-gray-400 shrink-0">
                {r.supply_type === "PEDIDO" ? "—" : num(r.min_stock)}
              </span>
              <span className="w-[86px] shrink-0">
                <span className={`text-[10.5px] px-1.5 py-[1px] rounded-full ${e.clase}`}>
                  {e.label}
                </span>
              </span>
              <span className="w-14 text-right text-gray-500 shrink-0">
                {r.cost > 0 ? money(r.cost) : "—"}
              </span>
              <span className="w-16 text-right shrink-0">
                {r.supply_type === "PEDIDO" ? "—" : money(r.valor)}
              </span>
            </div>
          );
        })}

        <div className="flex items-center gap-3 px-3 py-2 border-t border-gray-200 bg-gray-50 text-[11.5px]">
          <span className="text-gray-400">
            haz clic en un producto para ver su historial
          </span>
          <span className="ml-auto text-gray-500">
            valor en la vista{" "}
            <b className="font-medium text-gray-900">${money(totalVista)}</b>
          </span>
        </div>
      </div>

      {kardexId && (
        <KardexModal
          productId={kardexId}
          onClose={() => setKardexId(null)}
          onCambio={() => {
            cargar();
          }}
        />
      )}

      {showImport && (
        <ImportarModal
          onClose={() => setShowImport(false)}
          onListo={() => {
            setShowImport(false);
            cargar();
          }}
        />
      )}
    </main>
  );
}

function Tarjeta({
  label,
  valor,
  sub,
  tono,
}: {
  label: string;
  valor: string;
  sub?: string;
  tono?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[11.5px] text-gray-500">{label}</p>
      <p className={`text-[21px] font-semibold ${tono ?? "text-gray-900"}`}>{valor}</p>
      {sub && <p className="text-[10.5px] text-gray-400">{sub}</p>}
    </div>
  );
}

/* ================= historial del producto ================= */

function KardexModal({
  productId,
  onClose,
  onCambio,
}: {
  productId: string;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [k, setK] = useState<Kardex | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc("product_moves", {
      p_product_id: productId,
      p_limit: 80,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setK(data as Kardex);
  }, [productId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ajustar() {
    const v = Number(nuevo.replace(",", "."));
    if (Number.isNaN(v)) {
      setErr("Escribe la cantidad real que contaste.");
      return;
    }
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: productId,
      p_new_qty: v,
      p_reason: motivo || null,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setNuevo("");
    setMotivo("");
    cargar();
    onCambio();
  }

  const dura =
    k && k.vendido_90d > 0 ? Math.round((k.stock / (k.vendido_90d / 90)) * 1) : null;

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
          <h2 className="text-base font-semibold text-gray-900">
            {k?.description ?? "Cargando..."}
          </h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            cerrar
          </button>
        </div>
        {k && (
          <p className="text-xs text-gray-500 mb-4">
            {k.code} ·{" "}
            {k.supply_type === "PEDIDO" ? "bajo pedido" : "de almacen"}
          </p>
        )}

        {k && (
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            <Mini label="Existencia" valor={num(k.stock)} />
            <Mini
              label="Minimo"
              valor={k.supply_type === "PEDIDO" ? "—" : num(k.min_stock)}
            />
            <Mini label="Vendido 90d" valor={num(k.vendido_90d)} />
            <Mini
              label="Dura"
              valor={
                k.supply_type === "PEDIDO"
                  ? "—"
                  : dura !== null && dura >= 0
                  ? `${dura} dias`
                  : "sin datos"
              }
              tono={dura !== null && dura < 15 ? "text-red-600" : undefined}
            />
          </div>
        )}

        <div className="flex gap-2 items-end mb-4 p-3 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-[10.5px] text-gray-500 mb-1">
              Conte y hay
            </label>
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="0"
              className="w-20 h-8 px-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10.5px] text-gray-500 mb-1">Motivo</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="conteo fisico, rotura, regalo..."
              className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            onClick={ajustar}
            className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[12.5px] hover:bg-gray-700"
          >
            Ajustar
          </button>
        </div>

        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2.5 px-1 py-1.5 border-b border-gray-100 text-[10.5px] text-gray-400">
          <span className="w-14">fecha</span>
          <span className="w-[76px]">movimiento</span>
          <span className="flex-1 min-w-0">documento</span>
          <span className="w-10 text-right">entra</span>
          <span className="w-10 text-right">sale</span>
          <span className="w-12 text-right">saldo</span>
        </div>

        {k && k.movimientos.length === 0 && (
          <p className="py-6 text-sm text-gray-400 text-center">
            Todavia no hay movimientos de este producto.
          </p>
        )}

        {k?.movimientos.map((m) => (
          <div
            key={m.id}
            className="flex gap-2.5 px-1 py-1.5 border-b border-gray-50 text-[12.5px]"
          >
            <span className="w-14 text-gray-500">{m.move_date.slice(5)}</span>
            <span className="w-[76px]">
              <span
                className={`text-[10.5px] px-1.5 py-[1px] rounded-full ${
                  TIPOS_MOV[m.kind] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {m.kind.toLowerCase()}
              </span>
            </span>
            <span className="flex-1 min-w-0 truncate text-gray-600">
              {m.sequence_number
                ? `nota ${m.sequence_number}${m.cliente ? ` · ${m.cliente}` : ""}`
                : m.factura
                ? `factura ${m.factura}${m.proveedor ? ` · ${m.proveedor}` : ""}`
                : m.reason ?? "—"}
            </span>
            <span className="w-10 text-right text-emerald-700">
              {m.quantity > 0 ? num(m.quantity) : "—"}
            </span>
            <span className="w-10 text-right text-red-600">
              {m.quantity < 0 ? num(-m.quantity) : "—"}
            </span>
            <span className="w-12 text-right">{num(m.saldo)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-[19px] font-semibold ${tono ?? "text-gray-900"}`}>{valor}</p>
    </div>
  );
}

/* ================= cargar cantidades ================= */

function ImportarModal({
  onClose,
  onListo,
}: {
  onClose: () => void;
  onListo: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"SET" | "ADD">("SET");
  const [prev, setPrev] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  function lineas() {
    return texto
      .split("\n")
      .map((l) => l.replace(/[;,]/g, "\t").trimEnd())
      .filter((l) => l.trim() !== "");
  }

  async function revisar() {
    setErr(null);
    const ls = lineas();
    if (ls.length === 0) {
      setErr("Pega al menos una linea con codigo y cantidad.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("preview_stock_import", {
      p_lines: ls,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPrev((data ?? []) as PreviewRow[]);
  }

  async function aplicar() {
    if (!prev) return;
    const items = prev
      .filter((p) => p.found && p.quantity !== null)
      .map((p) => ({ code: p.code, quantity: p.quantity }));
    if (items.length === 0) {
      setErr("No hay ningun codigo reconocido para aplicar.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("import_stock", {
      p_items: items,
      p_mode: modo,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const r = data as { actualizados: number; no_encontrados: number };
    setListo(`Listo: ${r.actualizados} productos actualizados.`);
    setTimeout(onListo, 900);
  }

  const encontrados = prev?.filter((p) => p.found).length ?? 0;
  const perdidos = prev?.filter((p) => !p.found).length ?? 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">Cargar cantidades</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            cerrar
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Copia dos columnas de Excel — codigo y cantidad — y pegalas aqui. Solo toca
          los codigos que pegues; el resto de tu lista queda igual.
        </p>

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setPrev(null);
          }}
          rows={7}
          placeholder={"2-2-G20\t48\nY-E-GUT-20\t3\n706213-X\t0"}
          className="w-full p-2.5 border border-gray-300 rounded-lg text-[12.5px] font-mono mb-3"
        />

        <div className="flex gap-2 items-center mb-3">
          <span className="text-[11.5px] text-gray-500">que hago con esa cantidad:</span>
          <button
            onClick={() => setModo("SET")}
            className={`px-2.5 py-1 rounded-full text-[11.5px] border ${
              modo === "SET"
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-200 text-gray-600"
            }`}
          >
            dejar esa cantidad exacta
          </button>
          <button
            onClick={() => setModo("ADD")}
            className={`px-2.5 py-1 rounded-full text-[11.5px] border ${
              modo === "ADD"
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-200 text-gray-600"
            }`}
          >
            sumarla a lo que hay
          </button>
        </div>

        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
        {listo && (
          <p className="mb-3 p-2.5 rounded-lg bg-emerald-50 text-sm text-emerald-800">
            {listo}
          </p>
        )}

        {!prev && (
          <button
            onClick={revisar}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? "Revisando..." : "Revisar antes de aplicar"}
          </button>
        )}

        {prev && (
          <>
            <div className="flex gap-4 mb-2 text-[12.5px]">
              <span className="text-emerald-700">{encontrados} codigos encontrados</span>
              <span className={perdidos > 0 ? "text-amber-700" : "text-gray-400"}>
                {perdidos} no encontrados
              </span>
            </div>

            <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto mb-3">
              {prev.map((p, i) => (
                <div
                  key={`${p.code}-${i}`}
                  className={`flex gap-2.5 px-2.5 py-1.5 text-[12px] border-b border-gray-50 last:border-0 ${
                    p.found ? "" : "bg-amber-50"
                  }`}
                >
                  <span className="w-[84px] font-mono text-[10.5px] text-gray-500 truncate">
                    {p.code}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-gray-700">
                    {p.found ? p.description : "no esta en tu lista de productos"}
                  </span>
                  {p.found && (
                    <span className="w-16 text-right text-gray-400">
                      hoy {num(p.current_stock)}
                    </span>
                  )}
                  <span className="w-12 text-right">{num(p.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={aplicar}
                disabled={busy || encontrados === 0}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
              >
                {busy ? "Aplicando..." : `Aplicar a ${encontrados} productos`}
              </button>
              <button
                onClick={() => setPrev(null)}
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
