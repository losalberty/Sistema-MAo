/* ============================================================
   Leer un pedido:
   - de un PDF hecho en FactuSOL (presupuesto, factura, nota...)
   - de un texto pegado (WhatsApp, Excel, correo)
   Aqui solo se interpreta el texto; buscar en el catalogo y en
   los clientes lo hace la pantalla de revision.
   ============================================================ */

export type LineaLeida = {
  i: number;
  code: string;
  desc: string;
  qty: number;
  price: number | null;
  total: number | null;
};

export type DocLeido = {
  tipo: string | null;
  numero: string | null;
  fecha: string | null;
  cliente: { nombre: string | null; rif: string | null; direccion: string | null; telefono: string | null };
  lineas: LineaLeida[];
  totalDoc: number | null;
  paginas: number;
};

type Item = { s: string; x: number; y: number; w: number };
type Fila = { y: number; items: Item[] };

/* ---------- numeros: 1,936.21 / 1.936,21 / 25.00 / 3 ---------- */
export function aNumero(t: string): number | null {
  let s = (t ?? "").trim().replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // el ultimo separador es el decimal
    if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (coma >= 0) {
    const dec = s.length - coma - 1;
    s = dec === 3 && s.indexOf(",") === coma && s.length > 4 ? s.replace(",", "") : s.replace(",", ".");
  } else if (punto >= 0) {
    const dec = s.length - punto - 1;
    // "1.250" con un solo punto y 3 decimales: miles
    if (dec === 3 && (s.match(/\./g) ?? []).length === 1 && !/^0\./.test(s)) s = s.replace(".", "");
    else s = s.replace(/\.(?=.*\.)/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const RIF = /\b([VJEGP])\s*-?\s*(\d{6,9})(?:\s*-?\s*(\d))?\b/i;
const TIPOS_DOC = ["nota de entrega", "presupuesto", "factura", "pedido", "albaran", "albarán", "cotizacion", "cotización", "proforma"];

function normal(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/* ---------- agrupar los textos del PDF en filas ---------- */
function enFilas(items: Item[]): Fila[] {
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const filas: Fila[] = [];
  for (const it of orden) {
    const f = filas.find((x) => Math.abs(x.y - it.y) <= 4);
    if (f) f.items.push(it);
    else filas.push({ y: it.y, items: [it] });
  }
  for (const f of filas) f.items.sort((a, b) => a.x - b.x);
  return filas.sort((a, b) => b.y - a.y);
}

const texto = (f: Fila) => f.items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();

/* ---------- interpretar una pagina ya separada en filas ---------- */
function interpretarPagina(filas: Fila[], doc: DocLeido, primera: boolean) {
  // encabezado de la tabla: la fila que dice CANTIDAD y CODIGO/ARTICULO
  const hIdx = filas.findIndex((f) => {
    const t = f.items.map((i) => normal(i.s));
    return t.some((s) => s.startsWith("cantidad") || s === "cant." || s === "cant") &&
      t.some((s) => ["codigo", "articulo", "referencia", "ref.", "cod."].includes(s));
  });
  if (hIdx < 0) return;
  const cab = filas[hIdx];
  const hCodigo = cab.items.find((i) => ["codigo", "articulo", "referencia", "ref.", "cod."].includes(normal(i.s)))!;
  const hCant = cab.items.find((i) => normal(i.s).startsWith("cant"))!;
  const xCodigo = hCodigo.x;
  const xNumeros = hCant.x - 25; // los numeros empiezan un poco antes del titulo CANTIDAD

  if (primera) {
    // ----- datos del documento (arriba de la tabla) -----
    const arriba = filas.slice(0, hIdx);
    for (const f of arriba) {
      for (let k = 0; k < f.items.length; k++) {
        const s = normal(f.items[k].s);
        if (!doc.tipo && TIPOS_DOC.includes(s)) {
          doc.tipo = f.items[k].s.trim();
          const resto = f.items.slice(k + 1).map((i) => i.s.trim());
          const fecha = resto.find((r) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(r));
          const nums = resto.filter((r) => /^\d+$/.test(r));
          if (nums.length >= 2) doc.numero = `${nums[0]}-${nums[1]}`;
          else if (nums.length === 1) doc.numero = nums[0];
          if (fecha) doc.fecha = fecha;
        }
      }
    }

    // ----- RIF: el primero (arriba del todo) es el de tu empresa; el cliente es otro -----
    const rifs: { v: string; y: number }[] = [];
    for (const f of arriba)
      for (const it of f.items) {
        const m = it.s.match(RIF);
        if (m) rifs.push({ v: `${m[1].toUpperCase()}-${m[2]}${m[3] ? "-" + m[3] : ""}`, y: f.y });
      }
    rifs.sort((a, b) => b.y - a.y);
    const propio = rifs[0]?.v;
    const delCliente = rifs.find((r) => r.v !== propio);
    doc.cliente.rif = delCliente?.v ?? null;

    // ----- nombre del cliente -----
    const iCliente = arriba.findIndex((f) => f.items.some((i) => /^cliente:?$/i.test(i.s.trim())));
    if (iCliente >= 0) {
      // "CLIENTE:" y debajo el nombre, la direccion y el telefono
      const fCli = arriba[iCliente];
      const mismo = fCli.items.filter((i) => !/^cliente:?$/i.test(i.s.trim())).map((i) => i.s).join(" ").trim();
      const siguientes = arriba.slice(iCliente + 1);
      doc.cliente.nombre = mismo || (siguientes[0] ? texto(siguientes[0]) : null);
      for (const f of siguientes) {
        const t = texto(f);
        if (/^direcci[oó]n:?/i.test(t)) doc.cliente.direccion = t.replace(/^direcci[oó]n:?\s*/i, "");
        else if (/^[\d\s()+-]{9,}$/.test(t) && !doc.cliente.telefono) doc.cliente.telefono = t;
      }
    } else {
      // sin titulo "CLIENTE": el primer bloque de la izquierda es tu empresa;
      // el siguiente bloque (despues de un salto) es el cliente
      const izq = arriba.filter((f) => f.items[0].x < 120 && /[a-zA-Z]{3}/.test(texto(f)));
      let corte = -1;
      for (let k = 1; k < izq.length; k++) {
        if (izq[k - 1].y - izq[k].y > 28) {
          corte = k;
          break;
        }
      }
      if (corte > 0) {
        const cand = izq[corte];
        const t = texto(cand);
        if (!/^(n\.?i\.?f|r\.?i\.?f|agente|forma de pago|documento)/i.test(normal(t))) doc.cliente.nombre = t;
        const sig = izq[corte + 1];
        if (sig && cand.y - sig.y < 20) doc.cliente.direccion = texto(sig);
      }
    }
  }

  // ----- lineas de la tabla -----
  let pendiente: LineaLeida | null = null;
  for (const f of filas.slice(hIdx + 1)) {
    const t = texto(f);
    if (/^(total|subtotal|suma y sigue|base imponible|i\.?v\.?a)/i.test(normal(t)) || f.items.some((i) => /^total:?$/i.test(i.s.trim()) && i.x > xNumeros)) {
      const n = f.items.map((i) => aNumero(i.s)).filter((x): x is number => x !== null);
      if (/total/i.test(t) && n.length && doc.totalDoc === null) doc.totalDoc = n[n.length - 1];
      if (/^total|total:/i.test(t)) break;
      continue;
    }
    const codigoItem = f.items[0].x <= xCodigo + 12 ? f.items[0] : null;
    const resto = codigoItem ? f.items.slice(1) : f.items;
    const numeros = resto.filter((i) => i.x >= xNumeros && aNumero(i.s) !== null).map((i) => aNumero(i.s) as number);
    const desc = resto.filter((i) => i.x < xNumeros || aNumero(i.s) === null).map((i) => i.s).join(" ").trim();

    if (codigoItem) {
      pendiente = {
        i: doc.lineas.length,
        code: codigoItem.s.trim(),
        desc,
        qty: numeros[0] ?? 0,
        price: numeros.length >= 2 ? numeros[1] : null,
        total: numeros.length >= 2 ? numeros[numeros.length - 1] : null,
      };
      doc.lineas.push(pendiente);
    } else if (pendiente) {
      // continuacion: la descripcion sigue, y a veces los numeros vienen en esta fila
      if (desc) pendiente.desc = `${pendiente.desc} ${desc}`.trim();
      if (numeros.length && !pendiente.qty) {
        pendiente.qty = numeros[0];
        pendiente.price = numeros.length >= 2 ? numeros[1] : null;
        pendiente.total = numeros.length >= 2 ? numeros[numeros.length - 1] : null;
      }
    }
  }
}

/* ---------- PDF -> documento leido ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leerPdfConMotor(pdfjs: any, datos: ArrayBuffer | Uint8Array): Promise<DocLeido> {
  const pdf = await pdfjs.getDocument({ data: datos instanceof Uint8Array ? datos : new Uint8Array(datos) }).promise;
  const doc: DocLeido = {
    tipo: null,
    numero: null,
    fecha: null,
    cliente: { nombre: null, rif: null, direccion: null, telefono: null },
    lineas: [],
    totalDoc: null,
    paginas: pdf.numPages,
  };
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const items: Item[] = (tc.items as { str: string; transform: number[]; width: number }[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    interpretarPagina(enFilas(items), doc, n === 1);
  }
  doc.lineas = doc.lineas.filter((l) => l.code);
  doc.lineas.forEach((l, k) => (l.i = k));
  return doc;
}

/* el motor de PDF se descarga la primera vez que se usa (no hace mas lenta la pagina) */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cargando: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cargarPdfjs(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (cargando) return cargando;
  cargando = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = PDFJS;
    s.async = true;
    s.onload = () => {
      if (!w.pdfjsLib) return mal(new Error("No se pudo abrir el lector de PDF"));
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      ok(w.pdfjsLib);
    };
    s.onerror = () => {
      cargando = null;
      mal(new Error("No se pudo descargar el lector de PDF. Revisa tu internet."));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

export async function leerPdf(file: File): Promise<DocLeido> {
  const pdfjs = await cargarPdfjs();
  return leerPdfConMotor(pdfjs, await file.arrayBuffer());
}

/* ============================================================
   TEXTO PEGADO
   Cada linea se interpreta de las dos formas posibles:
     A) codigo  y despues cantidad   "GUN-93   3"
     B) cantidad y despues codigo    "3 x GUN-93"
   La pantalla de revision decide cual es, mirando cual codigo
   existe en el catalogo (o lo que tu elijas a mano).
   ============================================================ */

export type Orden = "auto" | "codigo_cantidad" | "cantidad_codigo";

// qtys: cantidad propia de cada codigo posible (cuando viene pegado, "369-04")
export type Interpretacion = { codigos: string[]; qty: number; qtys?: number[] };

export type LineaPegada = {
  i: number;
  texto: string;
  A: Interpretacion | null; // codigo -> cantidad
  B: Interpretacion | null; // cantidad -> codigo
};

const UNIDAD = /^(x|und|unds|unid|unidad|unidades|pz|pza|pzas|piezas|pcs|c\/u|cu)$/i;

function cantidadDe(t: string): number | null {
  const s = t.replace(/^x/i, "").replace(/(x|und|unds|unid|pz|pza|pzas|pcs)$/i, "");
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const n = aNumero(s);
  return n !== null && n > 0 && n < 100000 ? n : null;
}

// codigos posibles a partir de las palabras que quedan: todo junto, la primera, la ultima
function codigosDe(palabras: string[]): string[] {
  const p = palabras.filter((w) => w && !UNIDAD.test(w));
  if (p.length === 0) return [];
  const set = new Set<string>([p.join(" "), p[0], p[p.length - 1]]);
  if (p.length >= 2) set.add(`${p[0]} ${p[1]}`);
  return Array.from(set).filter((c) => c.trim().length > 0);
}

// separadores sueltos entre codigo y cantidad: "369 - 04", "369 : 4", "369 = 4"
const SEPARADOR = /^[-–—:=>]+$/;

/** Las palabras utiles de una linea pegada (sin separadores ni "x"/"und"). */
export function palabrasDe(linea: string): string[] {
  return linea
    .split(/[\t;|]+|\s+/)
    .map((w) => w.trim().replace(/[:=]+$/, ""))
    .filter((w) => w && !SEPARADOR.test(w) && !UNIDAD.test(w));
}

/** La linea sin la cantidad de adelante o de atras: para buscar por descripcion. */
export function descripcionDe(linea: string): string {
  const p = palabrasDe(linea);
  if (p.length > 1 && cantidadDe(p[p.length - 1]) !== null) p.pop();
  if (p.length > 1 && cantidadDe(p[0]) !== null) p.shift();
  return p.join(" ");
}

export function interpretarPegado(texto: string): LineaPegada[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-–•*·>]+/, "").replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  return lineas.map((l, i) => {
    const tokens = palabrasDe(l);
    let A: Interpretacion | null = null;
    let B: Interpretacion | null = null;
    if (tokens.length === 1) {
      const w = tokens[0];
      // todo pegado: "369-04", "88508A-05" o "5-369". Primero se prueba el codigo
      // completo (hay codigos con guion, como GUN-93) y despues partido.
      const fin = w.match(/^(.+?)[-–:=*](\d{1,4})$/);
      const ini = w.match(/^(\d{1,4})[-–:=*](.+)$/);
      const qFin = fin ? cantidadDe(fin[2]) : null;
      const qIni = ini ? cantidadDe(ini[1]) : null;
      A = { codigos: [w], qty: 1, qtys: [1] };
      if (fin && qFin !== null) {
        A.codigos.push(fin[1]);
        A.qtys!.push(qFin);
      }
      if (ini && qIni !== null) B = { codigos: [ini[2]], qty: qIni };
    } else if (tokens.length > 1) {
      const qFin = cantidadDe(tokens[tokens.length - 1]);
      const qIni = cantidadDe(tokens[0]);
      if (qFin !== null) A = { codigos: codigosDe(tokens.slice(0, -1)), qty: qFin };
      if (qIni !== null) B = { codigos: codigosDe(tokens.slice(1)), qty: qIni };
      if (!A && !B) A = { codigos: codigosDe(tokens), qty: 1 };
    }
    return { i, texto: l.trim(), A, B };
  });
}

/* ============================================================
   Lista de precios especial de un cliente (Excel o CSV)
   Ej: "Lista VIP", "Lista Repuestos RM". Se busca sola la fila
   de titulos (Codigo, Descripcion, Precio...) aunque arriba
   tenga el nombre de la empresa, la fecha, etc.
   ============================================================ */

export type ItemLista = { code: string; desc: string; precio: number };

export type ListaPrecios = {
  colCodigo: number;
  colDesc: number | null;
  columnas: { idx: number; nombre: string }[]; // columnas que pueden ser el precio
  sugerida: number; // la que se usa al abrirla
  filas: string[][]; // datos, sin la fila de titulos
};

export const normCodigo = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s/g, "");
// sin guiones, puntos ni barras: "GUN-93" = "GUN93"
export const normCodigoSuelto = (s: string | null | undefined) => normCodigo(s).replace(/[-./_]/g, "");

const RX_COD = /c[oó]d|^ref|referencia|n[°º.]?\s*(de\s*)?parte|part\s*n|sku/i;
const RX_DESC = /desc|nombre|producto|art[ií]culo|detalle/i;
const RX_PRECIO = /precio|p\.?\s*v\.?\s*p|pvp|usd|\$|valor|vip|mayor|lista|tarifa|neto|importe|especial|oferta/i;
const RX_NO_PRECIO = /cant|exist|stock|unidades|empaque|bulto|m[ií]nimo|iva|%|costo|c[oó]d|ref|desc|marca|grupo|famil|ubic/i;
const RX_FAVORITA = /vip|especial|oferta|cliente|neto|convenio/i;

function numeroDeCelda(c: string): number | null {
  const s = (c ?? "").replace(/US\$|USD|Bs\.?|\$|€/gi, "").trim();
  if (!s) return null;
  return aNumero(s);
}

function proporcionNumerica(filas: string[][], col: number) {
  let llenas = 0;
  let numeros = 0;
  for (const r of filas.slice(0, 300)) {
    const c = (r[col] ?? "").trim();
    if (!c) continue;
    llenas++;
    if (numeroDeCelda(c) !== null) numeros++;
  }
  return llenas ? numeros / llenas : 0;
}

export function analizarLista(todas: string[][]): ListaPrecios | null {
  const filas = todas.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (filas.length === 0) return null;
  const ancho = Math.max(...filas.map((r) => r.length));

  // 1) buscar la fila de titulos en las primeras 25
  let h = -1;
  for (let i = 0; i < Math.min(25, filas.length); i++) {
    const r = filas[i];
    const ic = r.findIndex((c) => RX_COD.test(c) && c.length < 40);
    if (ic < 0) continue;
    const otra = r.some((c, j) => j !== ic && (RX_PRECIO.test(c) || RX_DESC.test(c)));
    if (otra) {
      h = i;
      break;
    }
  }

  let colCodigo = 0;
  let colDesc: number | null = null;
  let columnas: { idx: number; nombre: string }[] = [];
  let datos: string[][];

  if (h >= 0) {
    const t = filas[h].map((c) => (c ?? "").trim());
    datos = filas.slice(h + 1);
    colCodigo = t.findIndex((c) => RX_COD.test(c) && c.length < 40);
    const d = t.findIndex((c, j) => j !== colCodigo && RX_DESC.test(c));
    colDesc = d >= 0 ? d : null;
    for (let j = 0; j < ancho; j++) {
      if (j === colCodigo || j === colDesc) continue;
      const nombre = t[j] ?? "";
      const pareceNombre = RX_PRECIO.test(nombre) && !RX_NO_PRECIO.test(nombre.replace(RX_PRECIO, ""));
      const prop = proporcionNumerica(datos, j);
      if ((pareceNombre && prop >= 0.5) || (!nombre && prop >= 0.8)) columnas.push({ idx: j, nombre: nombre || `Columna ${j + 1}` });
    }
    // si ningun titulo dice "precio", cualquier columna de numeros que no sea cantidad/stock
    if (columnas.length === 0) {
      for (let j = 0; j < ancho; j++) {
        if (j === colCodigo || j === colDesc) continue;
        const nombre = t[j] ?? "";
        if (RX_NO_PRECIO.test(nombre)) continue;
        if (proporcionNumerica(datos, j) >= 0.8) columnas.push({ idx: j, nombre: nombre || `Columna ${j + 1}` });
      }
    }
  } else {
    // sin titulos: 1a columna = codigo, la de texto mas largo = descripcion, las de numeros = precio
    datos = filas;
    colCodigo = 0;
    let mejor = -1;
    let largo = 0;
    for (let j = 1; j < ancho; j++) {
      if (proporcionNumerica(datos, j) >= 0.6) {
        columnas.push({ idx: j, nombre: `Columna ${j + 1}` });
        continue;
      }
      const prom = datos.reduce((s, r) => s + (r[j] ?? "").length, 0) / datos.length;
      if (prom > largo) {
        largo = prom;
        mejor = j;
      }
    }
    colDesc = mejor >= 0 ? mejor : null;
  }

  if (colCodigo < 0 || columnas.length === 0) return null;
  const fav = columnas.find((c) => RX_FAVORITA.test(c.nombre));
  const sugerida = (fav ?? columnas[columnas.length - 1]).idx;
  return { colCodigo, colDesc, columnas, sugerida, filas: datos };
}

export function itemsDeLista(l: ListaPrecios, colPrecio: number): ItemLista[] {
  const out: ItemLista[] = [];
  for (const r of l.filas) {
    const code = (r[l.colCodigo] ?? "").trim();
    // se salta si es otra fila de titulos repetida
    if (!code || /^(c[oó]d(igo)?|ref(erencia)?|sku)\.?$/i.test(code)) continue;
    const precio = numeroDeCelda(r[colPrecio] ?? "");
    if (precio === null || precio < 0) continue;
    out.push({ code, desc: l.colDesc !== null ? (r[l.colDesc] ?? "").trim() : "", precio });
  }
  return out;
}

export type MapaLista = { exacto: Map<string, ItemLista>; suelto: Map<string, ItemLista>; total: number };

export function mapaDeLista(items: ItemLista[]): MapaLista {
  const exacto = new Map<string, ItemLista>();
  const suelto = new Map<string, ItemLista>();
  for (const it of items) {
    const a = normCodigo(it.code);
    const b = normCodigoSuelto(it.code);
    if (a && !exacto.has(a)) exacto.set(a, it);
    if (b && !suelto.has(b)) suelto.set(b, it);
  }
  return { exacto, suelto, total: items.length };
}

export function buscarEnLista(m: MapaLista | null, code: string | null | undefined): ItemLista | null {
  if (!m || !code) return null;
  const a = normCodigo(code);
  if (!a) return null;
  return m.exacto.get(a) ?? m.suelto.get(normCodigoSuelto(code)) ?? null;
}
