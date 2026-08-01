"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type NoteRow = {
  id: string;
  sequence_number: number;
  display_name: string;
  note_date: string;
  currency_mode: string;
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function NotasPage() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_notes");
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes(data ?? []);
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta nota? Esta accion no se puede deshacer.")) return;
    const { error } = await supabase.rpc("delete_note", { p_note_id: id });
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  // Agrupar por año > mes > dia
  const years: Record<string, Record<string, Record<string, NoteRow[]>>> = {};
  for (const n of notes) {
    const d = new Date(n.note_date + "T00:00:00");
    const y = String(d.getFullYear());
    const m = MESES[d.getMonth()];
    const day = n.note_date;
    years[y] ??= {};
    years[y][m] ??= {};
    years[y][m][day] ??= [];
    years[y][m][day].push(n);
  }
  const yearKeys = Object.keys(years).sort().reverse();

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-2">
            ← Volver al panel
          </Link>
          <h1 className="text-lg font-medium">Notas</h1>
          <p className="text-sm text-gray-500">{notes.length} notas guardadas</p>
        </div>
        <Link
          href="/notas/nueva"
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md transition-colors hover:bg-gray-700"
        >
          + Nueva nota
        </Link>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {yearKeys.map((year) => {
        const months = years[year];
        const monthKeys = Object.keys(months).sort(
          (a, b) => MESES.indexOf(b) - MESES.indexOf(a)
        );
        return (
          <details key={year} open={yearKeys.length <= 1} className="mb-4">
            {yearKeys.length > 1 && (
              <summary className="text-sm font-medium cursor-pointer py-2">{year}</summary>
            )}
            {monthKeys.map((month) => {
              const days = months[month];
              const dayKeys = Object.keys(days).sort().reverse();
              return (
                <details key={month} open={monthKeys.length <= 2} className="mb-2 ml-2">
                  {monthKeys.length > 1 && (
                    <summary className="text-sm text-gray-600 cursor-pointer py-1">
                      {month} {year}
                    </summary>
                  )}
                  {dayKeys.map((day) => (
                    <div key={day} className="mb-3 ml-2">
                      <p className="text-xs text-gray-400 mb-1">{day}</p>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        {days[day].map((n) => (
                          <div
                            key={n.id}
                            className="flex items-center justify-between px-3 py-2 text-sm border-t first:border-t-0 border-gray-100"
                          >
                            <div>
                              <span className="text-gray-400 mr-2">
                                #{String(n.sequence_number).padStart(4, "0")}
                              </span>
                              {n.display_name}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-600">${n.total.toFixed(2)}</span>
                              <Link
                                href={`/notas/ver?id=${n.id}`}
                                className="text-xs text-gray-500 hover:text-gray-900"
                              >
                                Ver
                              </Link>
                              <Link
                                href={`/notas/nueva?id=${n.id}`}
                                className="text-xs text-gray-500 hover:text-gray-900"
                              >
                                Editar
                              </Link>
                              <button
                                onClick={() => handleDelete(n.id)}
                                className="text-xs text-gray-400 hover:text-red-500"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </details>
              );
            })}
          </details>
        );
      })}

      {!loading && notes.length === 0 && (
        <p className="text-sm text-gray-400">Aun no hay notas guardadas.</p>
      )}
    </main>
  );
}
