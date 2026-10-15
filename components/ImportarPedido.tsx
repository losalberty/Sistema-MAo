"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  FileUp,
  Link2,
  PenLine,
  Search,
  Sparkles,
  Tag,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NumInput, notify } from "@/components/ui";
import { colorDe, iniciales } from "@/components/Paleta";
import {
  analizarLista,
  buscarEnLista,
  interpretarPegado,
  itemsDeLista,
  leerPdf,
  mapaDeLista,
  type DocLeido,
  type LineaPegada,
  type ListaPrecios,
  type MapaLista,
  type Orden,
} from "@/components/leerPedido";
import { leerFilas } from "@/components/Excel";

/* ============================================================
   Importar un pedido a la nota:
   - desde un PDF de FactuSOL (presupuesto, factura, nota de entrega)
   - pegando un texto (WhatsApp, Excel, correo)
   Todo pasa por una pantalla de revision antes de tocar la nota.
   ============================================================ */

export type ProductoImp = {
  id: string;
  code: string;
  description: string;
  brand: string | null;
  category: string | null;
  price_1: number;
  price_2: number | null;
  price_3: number | null;
  price_4: number | null;
  cost: number | null;
  stock_quantity: number | null;
  has_stock_control: boolean;
  price_list: string | null;
  supply_type: string | null;
};

type Hallazgo = ProductoImp & { k: string; tipo: "exacta" | "prefijo" | "descripcion" };

export type ClienteImp = {
  id: string;
  name: string;
  tax_id: string | null;
  fiscal_address: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  salesperson: string | null;
  price_tier?: number;
  balance_due?: number;
  credit_days?: number | null;
  overdue?: number | null;
};

export type LineaImportada = {
  producto: ProductoImp | null;
  code: string;
  desc: string;
  qty: number;
  precio: number | null; // null = usar el precio de la tarifa del cliente
};

export type ResultadoImportar = {
  lineas: LineaImportada[];
  cliente: ClienteImp | null;
  clienteRapido: string | null;
};

type Fila = {
  key: string;
  leidoCode: string;
  leidoDesc: string;
  leidoPrecio: number | null;
  texto: string; // la linea tal como se pego (o codigo + descripcion del PDF)
  qty: number;
  opciones: Hallazgo[];
  elegido: Hallazgo | null;
  incluir: boolean;
  manual: boolean; // agregar como producto fuera del catalogo
  descEditada: string | null; // lo que escribas a mano en un producto manual
  precioEditado: number | null;
};

type ListaCargada = { nombre: string; datos: ListaPrecios; col: number };

const TARIFAS: Record<number, string> = { 1: "Contado", 2: "Credito", 3: "Tarifa 3", 4: "Tarifa 4" };

function precioTarifa(p: ProductoImp, t: number) {
  const v = t === 4 ? p.price_4 : t === 3 ? p.price_3 : t === 2 ? p.price_2 : p.price_1;
  return Number(v ?? p.price_1 ?? 0);
}

function money(n: number) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function Existencia({ p, qty }: { p: ProductoImp; qty: number }) {
  if (p.supply_type === "PEDIDO")
    return <span className="text-[11px] px-1.5 py-px rounded-md bg-violet-50 text-violet-700 whitespace-nowrap">bajo pedido</span>;
  const s = Number(p.stock_quantity ?? 0);
  if (s <= 0) return <span className="text-[11px] px-1.5 py-px rounded-md bg-red-50 text-red-600 whitespace-nowrap">agotado</span>;
  return (
    <span
      className={`text-[11px] px-1.5 py-px rounded-md whitespace-nowrap ${
        qty > s ? "bg-amber-50 text-amber-800" : s <= 5 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {qty > s ? `solo hay ${s}` : `${s} en stock`}
    </span>
  );
}

const TIPO_TXT: Record<string, { l: string; c: string }> = {
  exacta: { l: "codigo exacto", c: "text-emerald-700" },
  prefijo: { l: "codigo cortado en el PDF", c: "text-sky-700" },
  descripcion: { l: "parecido por descripcion · revisa", c: "text-amber-700" },
};

export default function ImportarPedido({
  modo,
  tier,
  hayCliente,
  onClose,
  onAgregar,
}: {
  modo: "pdf" | "pegar";
  tier: number;
  hayCliente: boolean;
  onClose: () => void;
  onAgregar: (r: ResultadoImportar) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<"entrada" | "leyendo" | "revision">("entrada");
  const [error, setError] = useState<string | null>(null);

  // pegar
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<Orden>("auto");
  const [ordenUsado, setOrdenUsado] = useState<"codigo_cantidad" | "cantidad_codigo" | "mixto">("codigo_cantidad");

  // pdf
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [doc, setDoc] = useState<DocLeido | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [usarPreciosDoc, setUsarPreciosDoc] = useState(true);
  const [cliente, setCliente] = useState<ClienteImp | null>(null);
  const [usarCliente, setUsarCliente] = useState(true);
  const [usarRapido, setUsarRapido] = useState(true);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [buscandoEn, setBuscandoEn] = useState<string | null>(null);
  const [faltaDesc, setFaltaDesc] = useState(false);

  // lista de precios especial del cliente (solo en Pegar pedido)
  const listaRef = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState<ListaCargada | null>(null);
  const [leyendoLista, setLeyendoLista] = useState(false);
  const mapaLista = useMemo(() => (lista ? mapaDeLista(itemsDeLista(lista.datos, lista.col)) : null), [lista]);

  // Esc cierra (si no hay otra ventana encima)
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const abiertos = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"] *)')
      );
      if (abiertos[abiertos.length - 1] !== raiz.current) return;
      if (buscandoEn) return setBuscandoEn(null);
      onClose();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onClose, buscandoEn]);

  /* ---------- buscar en el catalogo ---------- */
  async function buscarEnCatalogo(items: { k: string; code: string; desc: string }[]) {
    const mapa = new Map<string, Hallazgo[]>();
    // de 150 en 150 para no mandar paquetes enormes
    for (let i = 0; i < items.length; i += 150) {
      const { data, error } = await supabase.rpc("buscar_codigos", { p_items: items.slice(i, i + 150) });
      if (error) throw new Error(error.message);
      for (const h of (data ?? []) as Hallazgo[]) {
        const l = mapa.get(h.k) ?? [];
        l.push(h);
        mapa.set(h.k, l);
      }
    }
    return mapa;
  }

  /* ---------- PDF ---------- */
  async function abrirPdf(file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setError("Ese archivo no es un PDF.");
      return;
    }
    setError(null);
    setNombreArchivo(file.name);
    setPaso("leyendo");
    try {
      const d = await leerPdf(file);
      if (d.lineas.length === 0) {
        setPaso("entrada");
        setError(
          "No encontre productos en ese PDF. Puede que sea una foto o un escaneo (no tiene texto), o que su formato sea distinto. Prueba con Pegar pedido."
        );
        return;
      }
      setDoc(d);
      const mapa = await buscarEnCatalogo(d.lineas.map((l) => ({ k: `L${l.i}`, code: l.code, desc: l.desc })));
      setFilas(
        d.lineas.map((l) => {
          const op = mapa.get(`L${l.i}`) ?? [];
          const seguro = op.length > 0 && op[0].tipo !== "descripcion" ? op[0] : null;
          return {
            key: `L${l.i}`,
            leidoCode: l.code,
            leidoDesc: l.desc,
            leidoPrecio: l.price,
            texto: `${l.code} ${l.desc}`,
            qty: l.qty || 1,
            opciones: op,
            elegido: seguro,
            // lo que no esta en el catalogo igual viene en el documento: se agrega como manual
            incluir: true,
            manual: !seguro && !(op[0]?.tipo === "descripcion"),
            descEditada: null,
            precioEditado: null,
          };
        })
      );
      // si hay sugerencia por descripcion, se deja sin incluir hasta que la confirmes
      setFilas((fs) => fs.map((f) => (!f.elegido && f.opciones[0]?.tipo === "descripcion" ? { ...f, incluir: false } : f)));
      await buscarCliente(d);
      setPaso("revision");
    } catch (e) {
      setPaso("entrada");
      setError(e instanceof Error ? e.message : "No se pudo leer el PDF.");
    }
  }

  async function buscarCliente(d: DocLeido) {
    setCliente(null);
    const rif = soloDigitos(d.cliente.rif);
    let hallado: ClienteImp | null = null;
    if (rif.length >= 6) {
      const { data } = await supabase.rpc("list_clients", { search_text: rif });
      hallado = ((data ?? []) as ClienteImp[]).find((c) => soloDigitos(c.tax_id) === rif) ?? null;
    }
    if (!hallado && d.cliente.nombre) {
      const nombre = d.cliente.nombre.trim();
      const { data } = await supabase.rpc("list_clients", { search_text: nombre.slice(0, 40) });
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ñ]/g, "");
      hallado = ((data ?? []) as ClienteImp[]).find((c) => norm(c.name) === norm(nombre)) ?? null;
    }
    setCliente(hallado);
    setUsarCliente(!!hallado && !hayCliente);
    setUsarRapido(!hallado && !hayCliente);
  }

  /* ---------- texto pegado ---------- */
  const lineasPegadas = useMemo(() => interpretarPegado(texto), [texto]);

  async function revisarPegado(m: MapaLista | null = mapaLista) {
    if (lineasPegadas.length === 0) return;
    setError(null);
    setPaso("leyendo");
    try {
      const items: { k: string; code: string; desc: string }[] = [];
      for (const l of lineasPegadas) {
        for (const [o, interp] of [["A", l.A], ["B", l.B]] as const) {
          interp?.codigos.forEach((c, n) => items.push({ k: `${l.i}|${o}|${n}`, code: c, desc: "" }));
        }
        // si ningun codigo existe, se intenta por descripcion con el texto sin numeros
        const sinNumeros = l.texto.replace(/\b\d+([.,]\d+)?\b/g, " ").replace(/\s+/g, " ").trim();
        if (sinNumeros.length >= 4) items.push({ k: `${l.i}|D`, code: "", desc: sinNumeros });
      }
      const mapa = await buscarEnCatalogo(items);

      const hallado = (l: LineaPegada, o: "A" | "B") => {
        const interp = o === "A" ? l.A : l.B;
        if (!interp) return null;
        for (let n = 0; n < interp.codigos.length; n++) {
          const op = mapa.get(`${l.i}|${o}|${n}`) ?? [];
          // cuenta si esta en el catalogo o en la lista especial
          const li = buscarEnLista(m, interp.codigos[n]);
          if (op.length || li) return { op, interp, n, li };
        }
        return null;
      };

      // en automatico: cada linea va por donde haya un codigo real;
      // las dudosas siguen lo que hagan la mayoria
      let votosA = 0;
      let votosB = 0;
      const previo = lineasPegadas.map((l) => {
        const a = hallado(l, "A");
        const b = hallado(l, "B");
        if (a && !b) votosA++;
        if (b && !a) votosB++;
        return { l, a, b };
      });
      const mayoria: "A" | "B" = votosB > votosA ? "B" : "A";
      let usadosA = 0;
      let usadosB = 0;

      const nuevas: Fila[] = previo.map(({ l, a, b }) => {
        let o: "A" | "B";
        if (orden === "codigo_cantidad") o = l.A ? "A" : "B";
        else if (orden === "cantidad_codigo") o = l.B ? "B" : "A";
        else o = a && !b ? "A" : b && !a ? "B" : a && b ? mayoria : l[mayoria] ? mayoria : l.A ? "A" : "B";
        if (o === "A") usadosA++;
        else usadosB++;
        const r = o === "A" ? a : b;
        const interp = (o === "A" ? l.A : l.B) ?? l.A ?? l.B;
        const seguro = r && r.op.length ? r.op[0] : null;
        const li = r?.li ?? null;
        // si no esta en el catalogo pero si en la lista: entra como manual con lo de la lista
        const op = r?.op.length ? r.op : li ? [] : mapa.get(`${l.i}|D`) ?? [];
        return {
          key: `P${l.i}`,
          leidoCode: r ? r.interp.codigos[r.n] : interp?.codigos[0] ?? l.texto,
          leidoDesc: li?.desc ?? "",
          leidoPrecio: null,
          texto: l.texto,
          qty: interp?.qty ?? 1,
          opciones: op,
          elegido: seguro,
          incluir: !!seguro || !!li,
          manual: !seguro && !!li,
          descEditada: null,
          precioEditado: null,
        };
      });
      setOrdenUsado(usadosA && usadosB ? "mixto" : usadosB > usadosA ? "cantidad_codigo" : "codigo_cantidad");
      setFaltaDesc(false);
      setFilas(nuevas);
      setDoc(null);
      setPaso("revision");
    } catch (e) {
      setPaso("entrada");
      setError(e instanceof Error ? e.message : "No se pudo revisar el pedido.");
    }
  }

  /* ---------- lista especial ---------- */
  async function abrirLista(file: File) {
    setError(null);
    setLeyendoLista(true);
    try {
      const datos = analizarLista(await leerFilas(file));
      const n = datos ? itemsDeLista(datos, datos.sugerida).length : 0;
      if (!datos || n === 0) {
        setError(
          "No encontre codigos con precios en esa lista. Revisa que tenga una columna de codigo y otra de precio."
        );
        return;
      }
      const nueva = { nombre: file.name, datos, col: datos.sugerida };
      setLista(nueva);
      notify.ok(`Lista cargada: ${n} productos con precio especial`);
      if (paso === "revision") await revisarPegado(mapaDeLista(itemsDeLista(datos, datos.sugerida)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la lista.");
    } finally {
      setLeyendoLista(false);
    }
  }

  async function quitarLista() {
    setLista(null);
    if (paso === "revision") await revisarPegado(null);
  }

  /* ---------- edicion en la revision ---------- */
  function cambiar(key: string, cambio: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambio } : f)));
  }

  function elegir(key: string, h: Hallazgo) {
    cambiar(key, { elegido: h, incluir: true, manual: false });
    setBuscandoEn(null);
  }

  const listaDe = (f: Fila) =>
    mapaLista ? buscarEnLista(mapaLista, f.leidoCode) ?? (f.elegido ? buscarEnLista(mapaLista, f.elegido.code) : null) : null;

  // de donde sale el precio: lo que escribas > lista especial > documento > tu tarifa
  const precioInfo = (f: Fila): { v: number; origen: "editado" | "lista" | "doc" | "tarifa" | "leido" } => {
    if (f.manual && f.precioEditado !== null) return { v: f.precioEditado, origen: "editado" };
    const li = listaDe(f);
    if (li) return { v: li.precio, origen: "lista" };
    if (doc && usarPreciosDoc && f.leidoPrecio !== null) return { v: f.leidoPrecio, origen: "doc" };
    if (f.elegido && !f.manual) return { v: precioTarifa(f.elegido, tier), origen: "tarifa" };
    return { v: f.leidoPrecio ?? 0, origen: "leido" };
  };
  const precioDe = (f: Fila) => precioInfo(f).v;

  // descripcion de un producto manual
  const descDe = (f: Fila) => f.descEditada ?? (listaDe(f)?.desc || f.leidoDesc || (doc ? f.texto : ""));

  const resumen = useMemo(() => {
    const incl = filas.filter((f) => f.incluir && (f.elegido || f.manual));
    return {
      listos: incl.length,
      catalogo: incl.filter((f) => f.elegido && !f.manual).length,
      manuales: incl.filter((f) => f.manual).length,
      dudosos: filas.filter((f) => !f.elegido && !f.manual).length,
      deLista: incl.filter((f) => precioInfo(f).origen === "lista").length,
      unidades: incl.reduce((s, f) => s + f.qty, 0),
      total: incl.reduce((s, f) => s + f.qty * precioDe(f), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, usarPreciosDoc, tier, doc, mapaLista]);

  const sumaLeida = doc ? doc.lineas.reduce((s, l) => s + (l.total ?? 0), 0) : 0;

  function confirmar() {
    const marcadas = filas.filter((f) => f.incluir && (f.elegido || f.manual));
    if (marcadas.length === 0) {
      notify.aviso("No hay nada marcado para agregar");
      return;
    }
    const sinDesc = marcadas.filter((f) => f.manual && !descDe(f).trim()).length;
    if (sinDesc) {
      setFaltaDesc(true);
      notify.aviso(
        sinDesc === 1
          ? "Falta escribir la descripcion de 1 producto manual (marcado en rojo)"
          : `Falta escribir la descripcion de ${sinDesc} productos manuales (marcados en rojo)`
      );
      return;
    }
    const lineas: LineaImportada[] = marcadas.map((f) => {
      const pi = precioInfo(f);
      return {
        producto: f.manual ? null : f.elegido,
        code: f.elegido && !f.manual ? f.elegido.code : f.leidoCode,
        desc: f.elegido && !f.manual ? f.elegido.description : descDe(f).trim(),
        qty: f.qty,
        // null = la nota usa la tarifa del cliente
        precio: !f.manual && pi.origen === "tarifa" ? null : pi.v,
      };
    });
    onAgregar({
      lineas,
      cliente: doc && usarCliente ? cliente : null,
      clienteRapido: doc && !cliente && usarRapido ? doc.cliente.nombre : null,
    });
  }

  /* ---------- tarjeta de la lista especial ---------- */
  function bloqueLista() {
    if (!lista)
      return (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 px-3 py-2.5">
          <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
            <Tag size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-900">¿Este cliente tiene precios especiales?</p>
            <p className="text-[11.5px] text-gray-500">
              Sube su lista en Excel y el pedido toma esos precios, codigos y descripciones.
            </p>
          </div>
          <button
            onClick={() => listaRef.current?.click()}
            disabled={leyendoLista}
            className="h-8 px-3 rounded-lg text-[12.5px] font-medium border border-violet-100 bg-white text-violet-700 hover:border-violet-300 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            {leyendoLista ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-violet-100 border-t-violet-700 animate-spin" />
            ) : (
              <FileSpreadsheet size={14} />
            )}
            Subir lista especial
          </button>
        </div>
      );
    return (
      <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 flex-wrap">
        <span className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0">
          <Tag size={16} />
        </span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-[13px] font-medium text-gray-900 truncate" title={lista.nombre}>
            {lista.nombre}
          </p>
          <p className="text-[11.5px] text-violet-800">
            {mapaLista?.total ?? 0} productos con precio especial · estos precios mandan sobre tu tarifa
          </p>
        </div>
        {lista.datos.columnas.length > 1 && (
          <label className="text-[12px] text-gray-600 flex items-center gap-1.5 whitespace-nowrap">
            Precio de
            <select
              value={lista.col}
              onChange={(e) => setLista({ ...lista, col: Number(e.target.value) })}
              className="h-7 px-1.5 border border-violet-100 rounded-md text-[12px] bg-white"
            >
              {lista.datos.columnas.map((c) => (
                <option key={c.idx} value={c.idx}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => listaRef.current?.click()}
          disabled={leyendoLista}
          className="h-7 px-2 rounded-md text-[12px] text-violet-700 hover:bg-white whitespace-nowrap"
        >
          Cambiar
        </button>
        <button
          onClick={quitarLista}
          className="h-7 px-2 rounded-md text-[12px] text-gray-500 hover:bg-white hover:text-red-600 whitespace-nowrap"
        >
          Quitar
        </button>
      </div>
    );
  }

  const titulo = modo === "pdf" ? "Importar pedido desde un PDF" : "Pegar pedido";
  const Icono = modo === "pdf" ? FileUp : ClipboardPaste;

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className={`w-full ${paso === "revision" ? "max-w-6xl h-[88vh]" : "max-w-2xl"} flex flex-col rounded-2xl bg-white shadow-pop border border-gray-200/80 overflow-hidden transition-[max-width] duration-200`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={listaRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) abrirLista(f);
          }}
        />
        {/* ---------- cabecera ---------- */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
          <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Icono size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-gray-900">{titulo}</h2>
            <p className="text-[12.5px] text-gray-500 truncate">
              {paso === "revision"
                ? doc
                  ? `${doc.tipo ?? "Documento"} ${doc.numero ?? ""}${doc.fecha ? ` · ${doc.fecha}` : ""} · ${nombreArchivo}`
                  : `${filas.length} lineas leidas · ${
                      ordenUsado === "mixto"
                        ? "habia lineas de las dos formas"
                        : ordenUsado === "cantidad_codigo"
                        ? "venian cantidad y despues codigo"
                        : "venian codigo y despues cantidad"
                    }`
                : modo === "pdf"
                ? "Un presupuesto, factura o nota de entrega hecha en FactuSOL"
                : "Copia el pedido de WhatsApp, Excel o un correo y pegalo aqui"}
            </p>
          </div>
          {paso === "revision" && (
            <button
              onClick={() => {
                setPaso("entrada");
                setFilas([]);
              }}
              className="h-8 px-3 rounded-lg text-[12.5px] text-gray-600 hover:bg-gray-100"
            >
              {modo === "pdf" ? "Elegir otro PDF" : "Volver a editar"}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100"
          >
            <X size={17} />
          </button>
        </div>

        {/* ---------- entrada: PDF ---------- */}
        {paso === "entrada" && modo === "pdf" && (
          <div className="p-5">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) abrirPdf(f);
              }}
              className={`flex flex-col items-center justify-center gap-2 h-56 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
                arrastrando ? "border-brand-400 bg-brand-50/60" : "border-gray-300 hover:border-brand-300 hover:bg-gray-50"
              }`}
            >
              <span className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <FileText size={26} />
              </span>
              <span className="text-[14.5px] font-medium text-gray-900">Arrastra el PDF aqui</span>
              <span className="text-[12.5px] text-gray-500">o toca para elegirlo de tu computadora</span>
              <input
                ref={archivoRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) abrirPdf(f);
                }}
              />
            </label>
            <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-gray-600">
              {[
                ["1", "Lee el cliente por su RIF y lo busca en tus clientes"],
                ["2", "Encuentra cada repuesto por su codigo en tu catalogo"],
                ["3", "Te muestra todo para revisar antes de agregarlo"],
              ].map(([n, t]) => (
                <div key={n} className="flex gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-700 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {n}
                  </span>
                  {t}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-gray-400">
              El PDF se lee en tu computadora, no se sube a ningun lado. Tiene que ser un PDF que sale directo del programa
              (no una foto ni un escaneo).
            </p>
          </div>
        )}

        {/* ---------- entrada: pegar ---------- */}
        {paso === "entrada" && modo === "pegar" && (
          <div className="p-5">
            <div className="flex items-center gap-3 mb-2.5 flex-wrap">
              <span className="text-[12px] font-medium text-gray-500">Cada linea trae</span>
              <div className="inline-flex p-[3px] rounded-[9px] bg-gray-100 gap-0.5">
                {(
                  [
                    ["auto", "Lo detecto solo", Sparkles],
                    ["codigo_cantidad", "Codigo → Cantidad", null],
                    ["cantidad_codigo", "Cantidad → Codigo", null],
                  ] as const
                ).map(([k, l, Ic]) => (
                  <button
                    key={k}
                    onClick={() => setOrden(k)}
                    className={`h-7 px-2.5 rounded-md text-[12.5px] inline-flex items-center gap-1.5 ${
                      orden === k ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {Ic && <Ic size={13} className={orden === k ? "text-brand-600" : ""} />}
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={"Ejemplos (cualquiera de las dos formas):\nGUN-93    3\nSET-12    2\n\n3 x 88107\n5 und SET-75"}
              className="w-full p-3 border border-gray-300 rounded-xl text-[13px] font-mono leading-relaxed bg-white focus:border-brand-500 resize-none"
            />
            <p className="mt-2 text-[11.5px] text-gray-400">
              Sirve separado por espacios, tabulaciones (copiado de Excel), comas o punto y coma. Si una linea solo trae el
              codigo, se toma 1 unidad. En "Lo detecto solo" el sistema mira cual dato existe en tu catalogo.
            </p>
            <div className="mt-3">{bloqueLista()}</div>
          </div>
        )}

        {paso === "entrada" && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2">
            {error && (
              <p className="flex-1 text-[12.5px] text-red-600 flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-px" /> {error}
              </p>
            )}
            {!error && modo === "pegar" && (
              <p className="flex-1 text-[12.5px] text-gray-500">
                {lineasPegadas.length > 0 ? `${lineasPegadas.length} lineas para revisar` : "Pega el pedido arriba"}
              </p>
            )}
            {!error && modo === "pdf" && <div className="flex-1" />}
            <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
            {modo === "pegar" ? (
              <button
                onClick={() => revisarPegado()}
                disabled={lineasPegadas.length === 0}
                className="h-9 px-4 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-gradient-to-b from-brand-600 to-brand-800 border border-brand-900 shadow-sm hover:brightness-110 disabled:opacity-40"
              >
                Revisar pedido <ArrowRight size={15} />
              </button>
            ) : (
              <button
                onClick={() => archivoRef.current?.click()}
                className="h-9 px-4 rounded-[9px] inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-gradient-to-b from-brand-600 to-brand-800 border border-brand-900 shadow-sm hover:brightness-110"
              >
                <FileUp size={15} /> Elegir PDF
              </button>
            )}
          </div>
        )}

        {/* ---------- leyendo ---------- */}
        {paso === "leyendo" && (
          <div className="py-16 flex flex-col items-center gap-3">
            <span className="w-10 h-10 rounded-full border-[3px] border-brand-100 border-t-brand-700 animate-spin" />
            <p className="text-[14px] font-medium text-gray-900">{modo === "pdf" ? "Leyendo el PDF…" : "Buscando en tu catalogo…"}</p>
            <p className="text-[12.5px] text-gray-500">{modo === "pdf" ? nombreArchivo : `${lineasPegadas.length} lineas`}</p>
          </div>
        )}

        {/* ---------- revision ---------- */}
        {paso === "revision" && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* cliente y precios (solo PDF) */}
              {doc && (
                <div className="grid md:grid-cols-[1fr_auto] gap-3 px-5 pt-4">
                  <div className="rounded-xl border border-gray-200 p-3 flex items-center gap-3">
                    {cliente ? (
                      <>
                        <span
                          className="w-10 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center shrink-0"
                          style={{ background: colorDe(cliente.name) }}
                        >
                          {iniciales(cliente.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-emerald-700 inline-flex items-center gap-1">
                            <UserCheck size={13} /> Cliente encontrado en tu lista
                          </p>
                          <p className="text-[14px] font-semibold text-gray-900 truncate">{cliente.name}</p>
                          <p className="text-[12px] text-gray-500 truncate">
                            {[cliente.tax_id, cliente.city, TARIFAS[cliente.price_tier ?? 1]].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-[12.5px] text-gray-700 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-brand-700"
                            checked={usarCliente}
                            onChange={(e) => setUsarCliente(e.target.checked)}
                          />
                          Usarlo en la nota
                        </label>
                      </>
                    ) : (
                      <>
                        <span className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                          <UserPlus size={17} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-amber-700">
                            {doc.cliente.nombre ? "Este cliente no esta registrado" : "No se encontro el cliente en el PDF"}
                          </p>
                          <p className="text-[14px] font-semibold text-gray-900 truncate">{doc.cliente.nombre ?? "—"}</p>
                          <p className="text-[12px] text-gray-500 truncate">
                            {[doc.cliente.rif, doc.cliente.telefono, doc.cliente.direccion].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {doc.cliente.nombre && (
                          <label className="flex items-center gap-2 text-[12.5px] text-gray-700 cursor-pointer whitespace-nowrap">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-brand-700"
                              checked={usarRapido}
                              onChange={(e) => setUsarRapido(e.target.checked)}
                            />
                            Usarlo como cliente rapido
                          </label>
                        )}
                      </>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[11.5px] text-gray-500 mb-1.5">Precios a usar</p>
                    <div className="inline-flex p-[3px] rounded-[9px] bg-gray-100 gap-0.5">
                      <button
                        onClick={() => setUsarPreciosDoc(true)}
                        className={`h-7 px-2.5 rounded-md text-[12.5px] ${
                          usarPreciosDoc ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500"
                        }`}
                      >
                        Los del {doc.tipo?.toLowerCase() ?? "documento"}
                      </button>
                      <button
                        onClick={() => setUsarPreciosDoc(false)}
                        className={`h-7 px-2.5 rounded-md text-[12.5px] ${
                          !usarPreciosDoc ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500"
                        }`}
                      >
                        Mis precios ({TARIFAS[tier]})
                      </button>
                    </div>
                    {doc.totalDoc !== null && (
                      <p
                        className={`mt-1.5 text-[11.5px] ${
                          Math.abs(sumaLeida - doc.totalDoc) < 0.05 ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {Math.abs(sumaLeida - doc.totalDoc) < 0.05
                          ? `✓ Leido completo: suma $${money(sumaLeida)} = total del PDF`
                          : `Ojo: lo leido suma $${money(sumaLeida)} y el PDF dice $${money(doc.totalDoc)}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* lista especial (solo pegar) */}
              {!doc && modo === "pegar" && <div className="px-5 pt-4">{bloqueLista()}</div>}

              {/* tabla */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex gap-3 items-center px-3 h-9 text-[11px] font-medium text-gray-400 bg-gray-50 rounded-t-xl border border-gray-200">
                  <span className="w-5" />
                  <span className="w-[230px]">Leido</span>
                  <span className="w-4" />
                  <span className="flex-1 min-w-0">En tu catalogo</span>
                  <span className="w-[86px] text-center">Cantidad</span>
                  <span className="w-24 text-right">Precio $</span>
                  <span className="w-24 text-right">Total $</span>
                </div>
                <div className="border-x border-b border-gray-200 rounded-b-xl">
                  {filas.map((f) => {
                    const ok = !!f.elegido && !f.manual;
                    const sugerencia = !f.elegido && f.opciones[0]?.tipo === "descripcion" ? f.opciones[0] : null;
                    const info = precioInfo(f);
                    const precio = info.v;
                    const sistema = f.elegido ? precioTarifa(f.elegido, tier) : null;
                    return (
                      <div
                        key={f.key}
                        className={`flex gap-3 items-start px-3 py-2.5 border-t border-gray-100 first:border-t-0 ${
                          !f.incluir ? "bg-gray-50/60" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 mt-1 accent-brand-700 shrink-0"
                          checked={f.incluir && (ok || f.manual)}
                          disabled={!ok && !f.manual}
                          onChange={(e) => cambiar(f.key, { incluir: e.target.checked })}
                          aria-label="Incluir esta linea"
                        />
                        <div className={`w-[230px] shrink-0 ${!f.incluir ? "opacity-60" : ""}`}>
                          <p className="font-mono text-[12px] text-gray-700 truncate">{f.leidoCode}</p>
                          <p className="text-[11.5px] text-gray-400 truncate" title={f.leidoDesc || f.texto}>
                            {f.leidoDesc || (f.texto !== f.leidoCode ? f.texto : "")}
                          </p>
                        </div>
                        <span className="w-4 shrink-0 mt-1 text-gray-300">
                          <ArrowRight size={14} />
                        </span>

                        <div className="flex-1 min-w-0">
                          {ok && f.elegido && (
                            <>
                              <p className="text-[13px] text-gray-900 truncate">
                                <span className="font-mono text-[11.5px] text-gray-500 mr-1.5">{f.elegido.code}</span>
                                {f.elegido.description}
                              </p>
                              <p className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className={`text-[11px] inline-flex items-center gap-1 ${TIPO_TXT[f.elegido.tipo].c}`}>
                                  <Check size={11} /> {TIPO_TXT[f.elegido.tipo].l}
                                </span>
                                <Existencia p={f.elegido} qty={f.qty} />
                                {f.opciones.filter((o) => o.tipo !== "descripcion").length > 1 && (
                                  <select
                                    value={f.elegido.id}
                                    onChange={(e) => {
                                      const h = f.opciones.find((o) => o.id === e.target.value);
                                      if (h) elegir(f.key, h);
                                    }}
                                    className="h-6 px-1 border border-gray-200 rounded-md text-[11.5px] bg-white"
                                  >
                                    {f.opciones.map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.code} · {o.description.slice(0, 40)}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </p>
                            </>
                          )}

                          {!ok && sugerencia && !f.manual && (
                            <div className="rounded-lg bg-amber-50 px-2.5 py-1.5">
                              <p className="text-[11.5px] text-amber-800">El codigo no existe. ¿Es este?</p>
                              <p className="text-[12.5px] text-gray-900 truncate">
                                <span className="font-mono text-[11px] text-gray-500 mr-1.5">{sugerencia.code}</span>
                                {sugerencia.description}
                              </p>
                              <div className="flex gap-1.5 mt-1">
                                <button
                                  onClick={() => elegir(f.key, sugerencia)}
                                  className="h-6 px-2 rounded-md text-[11.5px] font-medium bg-white border border-amber-200 text-amber-800 hover:bg-amber-100"
                                >
                                  Si, es este
                                </button>
                                <button
                                  onClick={() => setBuscandoEn(f.key)}
                                  className="h-6 px-2 rounded-md text-[11.5px] text-gray-600 hover:bg-white"
                                >
                                  Buscar otro
                                </button>
                                <button
                                  onClick={() => cambiar(f.key, { manual: true, incluir: true })}
                                  className="h-6 px-2 rounded-md text-[11.5px] text-gray-600 hover:bg-white"
                                >
                                  Agregar como manual
                                </button>
                              </div>
                            </div>
                          )}

                          {!ok && !sugerencia && !f.manual && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] text-red-600 inline-flex items-center gap-1">
                                <AlertTriangle size={13} /> No esta en tu catalogo
                              </span>
                              <button
                                onClick={() => setBuscandoEn(f.key)}
                                className="h-6 px-2 rounded-md text-[11.5px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300 inline-flex items-center gap-1"
                              >
                                <Search size={11} /> Buscarlo
                              </button>
                              <button
                                onClick={() => cambiar(f.key, { manual: true, incluir: true })}
                                className="h-6 px-2 rounded-md text-[11.5px] border border-gray-200 bg-white text-gray-700 hover:border-gray-300 inline-flex items-center gap-1"
                              >
                                <PenLine size={11} /> Agregar como manual
                              </button>
                            </div>
                          )}

                          {f.manual && (
                            <input
                              value={descDe(f)}
                              onChange={(e) => cambiar(f.key, { descEditada: e.target.value })}
                              placeholder="Escribe la descripcion del producto"
                              aria-label="Descripcion del producto manual"
                              className={`w-full h-8 px-2.5 mb-1 rounded-lg border text-[13px] bg-white ${
                                faltaDesc && f.incluir && !descDe(f).trim()
                                  ? "border-red-300 ring-2 ring-red-100"
                                  : "border-gray-200 focus:border-brand-500"
                              }`}
                            />
                          )}
                          {f.manual && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] px-1.5 py-px rounded-md bg-amber-50 text-amber-800">
                                fuera del catalogo · entra como producto manual
                              </span>
                              {listaDe(f) && (
                                <span className="text-[11px] px-1.5 py-px rounded-md bg-violet-50 text-violet-700">
                                  de la lista especial
                                </span>
                              )}
                              <button
                                onClick={() => setBuscandoEn(f.key)}
                                className="text-[11.5px] text-brand-700 hover:underline inline-flex items-center gap-1"
                              >
                                <Link2 size={11} /> Enlazar con un producto
                              </button>
                            </div>
                          )}

                          {buscandoEn === f.key && (
                            <BuscarProducto
                              inicial={f.leidoDesc || f.leidoCode}
                              tier={tier}
                              onElegir={(h) => elegir(f.key, { ...h, k: f.key, tipo: "exacta" })}
                              onCerrar={() => setBuscandoEn(null)}
                            />
                          )}
                        </div>

                        <div className="w-[86px] shrink-0 flex justify-center">
                          <NumInput
                            value={f.qty}
                            onChange={(n) => cambiar(f.key, { qty: n })}
                            className="w-16 h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-center bg-white"
                            ariaLabel="Cantidad"
                          />
                        </div>
                        <div className="w-24 shrink-0 text-right">
                          {f.manual ? (
                            <NumInput
                              value={precio}
                              onChange={(n) => cambiar(f.key, { precioEditado: n })}
                              className="w-full h-8 px-2 border border-gray-200 rounded-lg text-[13px] text-right bg-white"
                              ariaLabel="Precio del producto manual"
                            />
                          ) : (
                            <p className={`text-[13px] ${info.origen === "lista" ? "text-violet-700 font-medium" : "text-gray-900"}`}>
                              {money(precio)}
                            </p>
                          )}
                          {info.origen === "lista" && !f.manual && (
                            <p className="text-[10.5px] text-violet-700">
                              lista especial
                              {sistema !== null && Math.abs(sistema - precio) > 0.005 ? ` · antes ${money(sistema)}` : ""}
                            </p>
                          )}
                          {doc && usarPreciosDoc && sistema !== null && f.leidoPrecio !== null && Math.abs(sistema - f.leidoPrecio) > 0.005 && (
                            <p className="text-[10.5px] text-gray-400">sistema {money(sistema)}</p>
                          )}
                          {doc && !usarPreciosDoc && f.leidoPrecio !== null && sistema !== null && Math.abs(sistema - f.leidoPrecio) > 0.005 && (
                            <p className="text-[10.5px] text-gray-400">PDF {money(f.leidoPrecio)}</p>
                          )}
                        </div>
                        <div className="w-24 shrink-0 text-right text-[13px] font-semibold text-gray-900">
                          {f.incluir && (ok || f.manual) ? money(precio * f.qty) : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* resumen y confirmar */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/70 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  <Check size={12} /> {resumen.catalogo} del catalogo
                </span>
                {resumen.manuales > 0 && (
                  <span className="h-6 px-2 rounded-full bg-amber-50 text-amber-800 inline-flex items-center">
                    {resumen.manuales} manual{resumen.manuales === 1 ? "" : "es"}
                  </span>
                )}
                {resumen.deLista > 0 && (
                  <span className="h-6 px-2 rounded-full bg-violet-50 text-violet-700 inline-flex items-center gap-1">
                    <Tag size={11} /> {resumen.deLista} con precio de la lista
                  </span>
                )}
                {resumen.dudosos > 0 && (
                  <span className="h-6 px-2 rounded-full bg-red-50 text-red-600 inline-flex items-center">
                    {resumen.dudosos} sin resolver (no se agregan)
                  </span>
                )}
                <span className="text-gray-500">
                  · {resumen.unidades} unidades · total <b className="text-gray-900">${money(resumen.total)}</b>
                </span>
              </div>
              <div className="flex-1" />
              <button onClick={onClose} className="h-9 px-3 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={resumen.listos === 0}
                className="h-10 px-5 rounded-[10px] inline-flex items-center gap-2 text-[13.5px] font-medium text-white bg-gradient-to-b from-brand-600 to-brand-800 border border-brand-900 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_4px_12px_-4px_rgba(36,58,102,.55)] hover:brightness-110 disabled:opacity-40"
              >
                <Check size={16} /> Agregar {resumen.listos} a la nota
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- buscador pequeño para resolver una linea a mano ---------- */
function BuscarProducto({
  inicial,
  tier,
  onElegir,
  onCerrar,
}: {
  inicial: string;
  tier: number;
  onElegir: (p: ProductoImp) => void;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState(inicial.split(" ").slice(0, 3).join(" "));
  const [res, setRes] = useState<ProductoImp[]>([]);
  const [activo, setActivo] = useState(0);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setRes([]);
      const { data } = await supabase.rpc("buscar_para_nota", { p_text: q.trim() });
      setRes(((data ?? []) as ProductoImp[]).slice(0, 6));
      setActivo(0);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="mt-2 rounded-xl border border-brand-200 bg-white shadow-card p-2">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-gray-400 ml-1" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, res.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && res[activo]) {
              e.preventDefault();
              onElegir(res[activo]);
            }
          }}
          placeholder="Busca por codigo o nombre…"
          className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-[12.5px]"
        />
        <button onClick={onCerrar} aria-label="Cerrar buscador" className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>
      {res.map((p, i) => (
        <button
          key={p.id}
          onMouseEnter={() => setActivo(i)}
          onClick={() => onElegir(p)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 mt-1 rounded-lg text-left ${i === activo ? "bg-brand-50" : ""}`}
        >
          <span className="w-24 shrink-0 font-mono text-[11px] text-gray-500 truncate">{p.code}</span>
          <span className="flex-1 min-w-0 truncate text-[12.5px] text-gray-800">{p.description}</span>
          <span className="text-[12px] text-gray-900">${money(precioTarifa(p, tier))}</span>
        </button>
      ))}
      {q.trim().length >= 2 && res.length === 0 && <p className="px-2 py-2 text-[12px] text-gray-400">Nada coincide.</p>}
    </div>
  );
}
