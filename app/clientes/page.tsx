"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ClientRow = {
  id: string;
  client_number: number;
  name: string;
  tax_id: string | null;
  fiscal_address: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  salesperson: string | null;
  price_tier: number | null;
  balance_due: number | null;
  created_at: string;
};

const emptyForm = {
  name: "",
  tax_id: "",
  fiscal_address: "",
  phone: "",
  city: "",
  state: "",
  salesperson: "",
  price_tier: "1",
};

const FIELDS: [keyof typeof emptyForm, string][] = [
  ["name", "Nombre o empresa"],
  ["tax_id", "RIF o cedula"],
  ["fiscal_address", "Direccion fiscal"],
  ["phone", "Telefono"],
  ["city", "Ciudad"],
  ["state", "Estado"],
  ["salesperson", "Vendedor"],
];

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientRow | null>(null);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load("");
  }, []);

  async function load(text: string) {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_clients", { search_text: text });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setClients(data ?? []);
  }

  function startCreate() {
    setForm(emptyForm);
    setEditing(null);
    setCreating(true);
  }

  function startEdit(c: ClientRow) {
    setForm({
      name: c.name ?? "",
      tax_id: c.tax_id ?? "",
      fiscal_address: c.fiscal_address ?? "",
      phone: c.phone ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      salesperson: c.salesperson ?? "",
      price_tier: String(c.price_tier ?? 1),
    });
    setEditing(c);
    setCreating(false);
    setDetail(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const rpcName = editing ? "update_client" : "create_client";
    const params = editing
      ? { p_id: editing.id, ...prefixed(form) }
      : prefixed(form);
    const { error } = await supabase.rpc(rpcName, params);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    setCreating(false);
    load(search);
  }

  function prefixed(f: typeof emptyForm) {
    return {
      p_name: f.name,
      p_tax_id: f.tax_id,
      p_fiscal_address: f.fiscal_address,
      p_phone: f.phone,
      p_city: f.city,
      p_state: f.state,
      p_salesperson: f.salesperson,
      p_price_tier: Number(f.price_tier) || 1,
    };
  }

  async function remove(c: ClientRow) {
    if (!confirm(`¿Eliminar a ${c.name}? Esta accion no se puede deshacer.`)) return;
    const { error } = await supabase.rpc("delete_client", { p_id: c.id });
    if (error) {
      setError(error.message);
      return;
    }
    setClients((prev) => prev.filter((x) => x.id !== c.id));
    setDetail(null);
  }

  function exportCsv() {
    const headers = ["N Cliente", "Nombre", "RIF/Cedula", "Direccion", "Telefono", "Ciudad", "Estado", "Vendedor", "Registrado"];
    const rows = clients.map((c) => [
      c.client_number,
      c.name,
      c.tax_id ?? "",
      c.fiscal_address ?? "",
      c.phone ?? "",
      c.city ?? "",
      c.state ?? "",
      c.salesperson ?? "",
      new Date(c.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function sendWhatsapp() {
    const text = clients
      .map(
        (c) =>
          `#${c.client_number} ${c.name}${c.phone ? ` - ${c.phone}` : ""}${
            c.city ? ` (${c.city})` : ""
          }`
      )
      .join("\n");
    const message = `Listado de clientes (${clients.length}):\n\n${text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="flex items-start justify-between mb-6 print:hidden">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-2">
            ← Volver al panel
          </Link>
          <h1 className="text-lg font-medium">Clientes</h1>
          <p className="text-sm text-gray-500">{clients.length} clientes registrados</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={exportCsv} className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors">
            Excel
          </button>
          <button onClick={() => window.print()} className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors">
            Imprimir / PDF
          </button>
          <button onClick={sendWhatsapp} className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-green-600 hover:text-white hover:border-green-600 transition-colors">
            WhatsApp
          </button>
          <button onClick={startCreate} className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md hover:bg-gray-700 transition-colors">
            + Nuevo cliente
          </button>
        </div>
      </div>

      <input
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-4 print:hidden"
        placeholder="Buscar por nombre, cedula, ciudad o estado"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          load(e.target.value);
        }}
      />

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {(creating || editing) && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6 print:hidden">
          <p className="text-sm font-medium mb-3">
            {editing ? `Editar cliente #${editing.client_number}` : "Nuevo cliente"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map(([field, label]) => (
              <input
                key={field}
                className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder={label}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            ))}
            <select
              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
              value={form.price_tier}
              onChange={(e) => setForm((f) => ({ ...f, price_tier: e.target.value }))}
            >
              <option value="1">Tarifa 1 (contado)</option>
              <option value="2">Tarifa 2 (credito)</option>
              <option value="3">Tarifa 3</option>
              <option value="4">Tarifa 4</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              className="text-sm text-gray-500 px-3 py-1.5"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !form.name}
              className="text-sm bg-gray-900 text-white rounded-md px-3 py-1.5 disabled:opacity-40"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {detail && (
        <div className="border border-gray-200 rounded-lg p-5 mb-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs text-gray-400">Cliente #{detail.client_number}</p>
              <p className="text-base font-medium">{detail.name}</p>
            </div>
            <button onClick={() => setDetail(null)} className="text-xs text-gray-400 hover:text-gray-900 print:hidden">
              Cerrar
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["RIF / Cedula", detail.tax_id],
                ["Direccion fiscal", detail.fiscal_address],
                ["Telefono", detail.phone],
                ["Ciudad", detail.city],
                ["Estado", detail.state],
                ["Vendedor", detail.salesperson],
                ["Registrado desde", new Date(detail.created_at).toLocaleDateString()],
              ].map(([label, value]) => (
                <tr key={label as string} className="border-t border-gray-100">
                  <td className="py-2 text-gray-400 w-40">{label}</td>
                  <td className="py-2">{value || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 text-left bg-gray-50">
              <th className="font-normal px-3 py-2 w-16">N</th>
              <th className="font-normal px-3 py-2">Cliente</th>
              <th className="font-normal px-3 py-2 w-16">Tarifa</th>
              <th className="font-normal px-3 py-2 w-28 text-right">Saldo</th>
              <th className="font-normal px-3 py-2 w-32">Telefono</th>
              <th className="font-normal px-3 py-2 w-28">Ciudad</th>
              <th className="font-normal px-3 py-2 w-28">Registrado</th>
              <th className="font-normal px-3 py-2 w-40 text-right print:hidden">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2 text-gray-400">{c.client_number}</td>
                <td className="px-3 py-2">
                  {c.name}
                  {c.tax_id && <span className="text-gray-400 text-xs ml-2">{c.tax_id}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">
                    T{c.price_tier ?? 1}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {Number(c.balance_due) > 0 ? (
                    <span className="text-amber-700">${Number(c.balance_due).toFixed(2)}</span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{c.phone || "-"}</td>
                <td className="px-3 py-2 text-gray-600">{c.city || "-"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-right print:hidden">
                  <button onClick={() => setDetail(c)} className="text-xs text-gray-500 hover:text-gray-900 mr-3">
                    Ver ficha
                  </button>
                  <button onClick={() => startEdit(c)} className="text-xs text-gray-500 hover:text-gray-900 mr-3">
                    Editar
                  </button>
                  <button onClick={() => remove(c)} className="text-xs text-gray-400 hover:text-red-500">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && clients.length === 0 && (
        <p className="text-sm text-gray-400 mt-4">Aun no hay clientes registrados.</p>
      )}
    </main>
  );
}
