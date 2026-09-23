"use client";

/* ============================================================
   Leer archivos de Excel (.xlsx, .xls) y CSV en el navegador.
   La libreria de Excel (SheetJS) solo se descarga la primera vez
   que abres un archivo, asi no hace mas lenta ninguna pantalla.
   ============================================================ */

const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

type SheetJS = {
  read: (data: ArrayBuffer, opts: { type: "array" }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (
      ws: unknown,
      opts: { header: 1; raw: boolean; defval: string; blankrows: boolean }
    ) => unknown[][];
  };
};

let cargando: Promise<SheetJS> | null = null;

function cargarSheetJS(): Promise<SheetJS> {
  const w = window as unknown as { XLSX?: SheetJS };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (cargando) return cargando;
  cargando = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = SHEETJS;
    s.async = true;
    s.onload = () => (w.XLSX ? ok(w.XLSX) : mal(new Error("No se pudo abrir el lector de Excel")));
    s.onerror = () => {
      cargando = null;
      mal(new Error("No se pudo descargar el lector de Excel. Revisa tu internet."));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

function partirLineaCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let comillas = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (comillas && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else comillas = !comillas;
    } else if ((ch === "," || ch === ";" || ch === "\t") && !comillas) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Devuelve la primera hoja como filas de texto (la primera fila suele ser el encabezado). */
export async function leerFilas(file: File): Promise<string[][]> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls") || nombre.endsWith(".xlsm") || nombre.endsWith(".ods")) {
    const XLSX = await cargarSheetJS();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    return filas
      .map((r) => r.map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c !== ""));
  }
  const texto = (await file.text()).replace(/^﻿/, "");
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => partirLineaCsv(l).map((c) => c.trim()));
}

/** Filas -> objetos usando la primera fila como nombres de columna (en minusculas). */
export function comoObjetos(filas: string[][]): Record<string, string>[] {
  if (filas.length < 2) return [];
  const head = filas[0].map((h) => h.toLowerCase().trim());
  return filas.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}
