"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { confirmar, notify } from "@/components/ui";

type Item = {
  code_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type NoteDetail = {
  id: string;
  sequence_number: number;
  display_name: string;
  note_date: string;
  currency_mode: string;
  exchange_rate: number | null;
  exchange_gap_percent: number | null;
  subtotal: number;
  discount: number;
  total: number;
  show_company_name: boolean;
  show_logo: boolean;
  items: Item[];
};

function VerNotaInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  async function load(noteId: string) {
    const { data, error } = await supabase.rpc("get_note_detail", { p_note_id: noteId });
    if (error) {
      setError(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setNote(row ?? null);
  }

  async function handleDelete() {
    if (!id) return;
    const ok = await confirmar({
      titulo: note ? `¿Eliminar la nota #${note.sequence_number}?` : "¿Eliminar esta nota?",
      mensaje: "Esta accion no se puede deshacer.",
      detalle: note ? `${note.display_name} · $${note.total.toFixed(2)}` : undefined,
      textoSi: "Si, eliminar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_note", { p_note_id: id });
    if (error) {
      notify.error("No se pudo eliminar", error.message);
      return;
    }
    notify.ok("Nota eliminada");
    window.location.href = "/notas";
  }

  if (error) return <p className="text-red-500 text-sm p-8">{error}</p>;
  if (!note) return <p className="text-sm text-gray-400 p-8">Cargando...</p>;

  const isForeignCurrency = note.currency_mode !== "USD";
  const currencyLabel = note.currency_mode === "COP" ? "COP" : "Bs";
  const effectiveRate =
    note.currency_mode === "BS_BCV"
      ? (note.exchange_rate ?? 0) * (1 + (note.exchange_gap_percent ?? 0) / 100)
      : note.exchange_rate ?? 0;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href="/notas"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={15} /> Volver a notas
        </Link>
        <div className="flex gap-2">
          <Link
            href={`/notas/nueva?id=${note.id}`}
            className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            <Pencil size={15} /> Editar
          </Link>
          <button
            onClick={handleDelete}
            className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
          >
            <Trash2 size={15} /> Eliminar
          </button>
          <button
            onClick={() => window.print()}
            className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-700 text-white hover:bg-brand-800 shadow-sm"
          >
            <Printer size={15} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Hoja tamaño carta */}
      <div className="bg-white border border-gray-200 rounded-lg p-10 print:border-0 print:p-0 print:rounded-none">
        <div className="flex justify-between items-start mb-8">
          <div>
            {note.show_company_name && (
              <p className="text-lg font-medium">Tu Empresa</p>
            )}
            <p className="text-xs text-gray-400 mt-1">Nota de entrega</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              Nota #{String(note.sequence_number).padStart(4, "0")}
            </p>
            <p className="text-sm text-gray-500">{note.note_date}</p>
          </div>
        </div>

        <p className="text-sm mb-6">
          <span className="text-gray-400">Cliente: </span>
          {note.display_name}
        </p>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="text-xs text-gray-400 text-left border-b border-gray-200">
              <th className="font-normal py-2 w-24">Codigo</th>
              <th className="font-normal py-2">Producto</th>
              <th className="font-normal py-2 w-16">Cant.</th>
              <th className="font-normal py-2 w-20">Precio</th>
              <th className="font-normal py-2 w-24 text-right">
                Total {isForeignCurrency ? `(${currencyLabel})` : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {note.items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 text-gray-400 text-xs">{it.code_snapshot}</td>
                <td className="py-2">{it.description_snapshot}</td>
                <td className="py-2">{it.quantity}</td>
                <td className="py-2">
                  {isForeignCurrency
                    ? fmt(it.unit_price * effectiveRate)
                    : `$${it.unit_price.toFixed(2)}`}
                </td>
                <td className="py-2 text-right">
                  {isForeignCurrency
                    ? fmt(it.line_total * effectiveRate)
                    : `$${it.line_total.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64 text-sm">
            {isForeignCurrency ? (
              <>
                <div className="flex justify-between text-gray-500 py-1">
                  <span>Subtotal ({currencyLabel})</span>
                  <span>{fmt(note.subtotal * effectiveRate)}</span>
                </div>
                <div className="flex justify-between text-gray-500 py-1">
                  <span>Descuento ({currencyLabel})</span>
                  <span>-{fmt(note.discount * effectiveRate)}</span>
                </div>
                <div className="flex justify-between font-medium text-base border-t border-gray-200 mt-1 pt-2">
                  <span>Total ({currencyLabel})</span>
                  <span>{fmt(note.total * effectiveRate)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-right">
                  Equivalente: ${note.total.toFixed(2)} USD
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-between text-gray-500 py-1">
                  <span>Subtotal</span>
                  <span>${note.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 py-1">
                  <span>Descuento</span>
                  <span>-${note.discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-base border-t border-gray-200 mt-1 pt-2">
                  <span>Total</span>
                  <span>${note.total.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerNotaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400 p-8">Cargando...</p>}>
      <VerNotaInner />
    </Suspense>
  );
}
