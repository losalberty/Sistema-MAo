"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  code: string;
  description: string;
  price_1: number;
};

type ClientRow = {
  id: string;
  name: string;
  tax_id: string | null;
  fiscal_address: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  salesperson: string | null;
};

type LineItem = {
  product_id: string | null;
  code_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
};

type CurrencyMode = "USD" | "COP" | "BS_BINANCE" | "BS_BCV";

const emptyClientForm = {
  name: "",
  tax_id: "",
  fiscal_address: "",
  phone: "",
  city: "",
  state: "",
  salesperson: "",
};

function NuevaNotaInner() {
  const params = useSearchParams();
  const editId = params.get("id");

  // productos
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);

  // cliente
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientRow[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [quickClientName, setQuickClientName] = useState("");
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [savingClient, setSavingClient] = useState(false);

  // totales
  const [discountPercent, setDiscountPercent] = useState(0);

  // moneda
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("USD");
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [gapPercent, setGapPercent] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [savedNoteNumber, setSavedNoteNumber] = useState<number | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  useEffect(() => {
    if (editId) loadForEdit(editId);
  }, [editId]);

  async function loadForEdit(id: string) {
    setLoadingEdit(true);
    const { data, error } = await supabase.rpc("get_note_detail", { p_note_id: id });
    setLoadingEdit(false);
    if (error) {
      setError(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    setItems(row.items ?? []);
    setQuickClientName(row.quick_client_name ?? "");
    if (row.client_id) {
      setSelectedClient({
        id: row.client_id,
        name: row.display_name,
        tax_id: null,
        fiscal_address: null,
        phone: null,
        city: null,
        state: null,
        salesperson: null,
      });
    }
    setCurrencyMode((row.currency_mode as CurrencyMode) ?? "USD");
    setExchangeRate(row.exchange_rate ?? 0);
    setGapPercent(row.exchange_gap_percent ?? 0);
    const sub = row.subtotal ?? 0;
    setDiscountPercent(sub > 0 ? Math.round(((row.discount ?? 0) / sub) * 10000) / 100 : 0);
  }

  function resetForm() {
    setItems([]);
    setQuery("");
    setResults([]);
    setSelectedClient(null);
    setQuickClientName("");
    setClientQuery("");
    setClientResults([]);
    setDiscountPercent(0);
    setCurrencyMode("USD");
    setExchangeRate(0);
    setGapPercent(0);
    setSavedNoteNumber(null);
    setSavedNoteId(null);
    setError(null);
    window.history.replaceState({}, "", "/notas/nueva");
  }

  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const total = subtotal - discountAmount;

  const effectiveRate =
    currencyMode === "BS_BCV" ? exchangeRate * (1 + gapPercent / 100) : exchangeRate;
  const isForeignCurrency = currencyMode !== "USD";
  const currencyLabel =
    currencyMode === "COP" ? "COP" : currencyMode === "USD" ? "USD" : "Bs";
  const subtotalInCurrency = subtotal * effectiveRate;
  const discountInCurrency = discountAmount * effectiveRate;
  const totalInCurrency = total * effectiveRate;

  async function searchProducts(text: string) {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const { data, error } = await supabase.rpc("search_products", { search_text: text });
    if (error) {
      setError(error.message);
      return;
    }
    setResults(data ?? []);
  }

  async function showAllProducts() {
    if (results.length > 0) {
      setResults([]);
      return;
    }
    const { data, error } = await supabase.rpc("list_products", {
      search_text: "",
      p_price_list: "",
    });
    if (error) {
      setError(error.message);
      return;
    }
    setResults((data ?? []).slice(0, 300));
  }

  function addManualProduct() {
    setItems((prev) => [
      ...prev,
      {
        product_id: null,
        code_snapshot: "",
        description_snapshot: "",
        quantity: 1,
        unit_price: 0,
        line_discount: 0,
        line_total: 0,
      },
    ]);
  }

  function updateItemText(
    index: number,
    field: "code_snapshot" | "description_snapshot",
    value: string
  ) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        code_snapshot: p.code,
        description_snapshot: p.description,
        quantity: 1,
        unit_price: p.price_1,
        line_discount: 0,
        line_total: p.price_1,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  function updateItem(index: number, field: "quantity" | "unit_price", value: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const updated = { ...it, [field]: value };
        updated.line_total = updated.quantity * updated.unit_price - updated.line_discount;
        return updated;
      })
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function searchClients(text: string) {
    setClientQuery(text);
    if (text.length < 2) {
      setClientResults([]);
      return;
    }
    const { data, error } = await supabase.rpc("list_clients", { search_text: text });
    if (error) {
      setError(error.message);
      return;
    }
    setClientResults(data ?? []);
  }

  function selectClient(c: ClientRow) {
    setSelectedClient(c);
    setClientQuery("");
    setClientResults([]);
  }

  function openNewClientForm() {
    setClientForm({ ...emptyClientForm, name: quickClientName });
    setShowClientForm(true);
  }

  function openEditClientForm() {
    if (!selectedClient) return;
    setClientForm({
      name: selectedClient.name ?? "",
      tax_id: selectedClient.tax_id ?? "",
      fiscal_address: selectedClient.fiscal_address ?? "",
      phone: selectedClient.phone ?? "",
      city: selectedClient.city ?? "",
      state: selectedClient.state ?? "",
      salesperson: selectedClient.salesperson ?? "",
    });
    setShowClientForm(true);
  }

  async function saveClient() {
    setSavingClient(true);
    setError(null);
    const rpcName = selectedClient ? "update_client" : "create_client";
    const params = selectedClient
      ? {
          p_id: selectedClient.id,
          p_name: clientForm.name,
          p_tax_id: clientForm.tax_id,
          p_fiscal_address: clientForm.fiscal_address,
          p_phone: clientForm.phone,
          p_city: clientForm.city,
          p_state: clientForm.state,
          p_salesperson: clientForm.salesperson,
        }
      : {
          p_name: clientForm.name,
          p_tax_id: clientForm.tax_id,
          p_fiscal_address: clientForm.fiscal_address,
          p_phone: clientForm.phone,
          p_city: clientForm.city,
          p_state: clientForm.state,
          p_salesperson: clientForm.salesperson,
        };
    const { data, error } = await supabase.rpc(rpcName, params);
    setSavingClient(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSelectedClient(data as ClientRow);
    setShowClientForm(false);
  }

  async function saveNote() {
    setSaving(true);
    setError(null);
    const basePayload = {
      p_client_id: selectedClient?.id ?? null,
      p_quick_client_name: selectedClient ? null : quickClientName || "Cliente eventual",
      p_currency_mode: currencyMode,
      p_exchange_rate: isForeignCurrency ? exchangeRate : null,
      p_exchange_gap_percent: currencyMode === "BS_BCV" ? gapPercent : null,
      p_show_company_name: true,
      p_show_logo: true,
      p_discount: discountAmount,
      p_items: items,
    };

    const { data, error } = editId
      ? await supabase.rpc("update_note", { p_note_id: editId, ...basePayload })
      : await supabase.rpc("create_note", basePayload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setSavedNoteNumber(row?.sequence_number ?? null);
    setSavedNoteId((row?.id as string) ?? editId ?? null);
  }

  if (loadingEdit) {
    return <p className="text-sm text-gray-400 p-8">Cargando nota...</p>;
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <Link href="/notas" className="text-sm text-gray-500 hover:text-gray-900 inline-block mb-4">
        ← Volver a notas
      </Link>
      <h1 className="text-lg font-medium mb-6">{editId ? "Editar nota" : "Nueva nota"}</h1>

      {/* Cliente */}
      <div className="mb-6 border border-gray-200 rounded-lg p-4">
        <label className="text-xs text-gray-500 block mb-2">Cliente</label>

        {selectedClient ? (
          <div className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{selectedClient.name}</p>
              <p className="text-xs text-gray-500">
                {[selectedClient.tax_id, selectedClient.city, selectedClient.state]
                  .filter(Boolean)
                  .join(" - ")}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={openEditClientForm} className="text-xs text-gray-500 hover:text-gray-900">
                Editar
              </button>
              <button
                onClick={() => setSelectedClient(null)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative mb-2">
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="Buscar por nombre, cedula, ciudad o estado"
                value={clientQuery}
                onChange={(e) => searchClients(e.target.value)}
              />
              {clientResults.length > 0 && (
                <div className="border border-gray-200 rounded-md mt-1 bg-white shadow-sm">
                  {clientResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c)}
                      className="w-full flex justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
                    >
                      <span>{c.name}</span>
                      <span className="text-gray-400 text-xs">
                        {[c.tax_id, c.city].filter(Boolean).join(" - ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="O escribe un cliente rapido (sin registrar)"
                value={quickClientName}
                onChange={(e) => setQuickClientName(e.target.value)}
              />
              <button
                onClick={openNewClientForm}
                className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors whitespace-nowrap"
              >
                {quickClientName ? "Registrar completo" : "+ Nuevo cliente"}
              </button>
            </div>
            {quickClientName && (
              <p className="text-xs text-gray-500 mt-2">
                Esta nota se guardara a nombre de{" "}
                <span className="text-gray-900 font-medium">{quickClientName}</span> (sin
                registrar). Puedes registrarlo completo cuando quieras.
              </p>
            )}
          </>
        )}

        {showClientForm && (
          <div className="mt-3 border-t border-gray-200 pt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["name", "Nombre o empresa"],
                ["tax_id", "RIF o cedula"],
                ["fiscal_address", "Direccion fiscal"],
                ["phone", "Telefono"],
                ["city", "Ciudad"],
                ["state", "Estado"],
                ["salesperson", "Vendedor"],
              ] as [keyof typeof clientForm, string][]
            ).map(([field, label]) => (
              <input
                key={field}
                className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder={label}
                value={clientForm[field]}
                onChange={(e) => setClientForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            ))}
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <button
                onClick={() => setShowClientForm(false)}
                className="text-sm text-gray-500 px-3 py-1.5"
              >
                Cancelar
              </button>
              <button
                onClick={saveClient}
                disabled={savingClient || !clientForm.name}
                className="text-sm bg-gray-900 text-white rounded-md px-3 py-1.5 disabled:opacity-40"
              >
                {savingClient ? "Guardando..." : "Guardar cliente"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Buscar producto */}
      <div className="mb-2 relative">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">Buscar producto</label>
          <div className="flex gap-2">
            <button
              onClick={showAllProducts}
              className="text-xs border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
            >
              {results.length > 0 ? "Ocultar listado" : "Ver listado completo"}
            </button>
            <button
              onClick={addManualProduct}
              className="text-xs border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
            >
              + Producto manual
            </button>
          </div>
        </div>
        <input
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          placeholder="Codigo o descripcion"
          value={query}
          onChange={(e) => searchProducts(e.target.value)}
        />
        {results.length > 0 && (
          <div className="border border-gray-200 rounded-md mt-1 bg-white shadow-sm max-h-72 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full flex justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <span>
                  <span className="text-gray-400">{p.code}</span> - {p.description}
                </span>
                <span className="text-gray-500">${p.price_1?.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-sm my-6">
        <thead>
          <tr className="text-xs text-gray-400 text-left">
            <th className="font-normal py-1 w-24">Codigo</th>
            <th className="font-normal py-1">Producto</th>
            <th className="font-normal py-1 w-16">Cant.</th>
            <th className="font-normal py-1 w-20">Precio (USD)</th>
            <th className="font-normal py-1 w-20 text-right">Total (USD)</th>
            {isForeignCurrency && (
              <th className="font-normal py-1 w-24 text-right">Total ({currencyLabel})</th>
            )}
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, index) => (
            <tr key={index} className="border-t border-gray-100">
              <td className="py-2 text-gray-400 text-xs">
                {it.product_id ? (
                  it.code_snapshot
                ) : (
                  <input
                    className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                    placeholder="Codigo"
                    value={it.code_snapshot}
                    onChange={(e) => updateItemText(index, "code_snapshot", e.target.value)}
                  />
                )}
              </td>
              <td className="py-2">
                {it.product_id ? (
                  it.description_snapshot
                ) : (
                  <input
                    className="w-full border border-gray-200 rounded px-2 py-1"
                    placeholder="Descripcion del producto"
                    value={it.description_snapshot}
                    onChange={(e) => updateItemText(index, "description_snapshot", e.target.value)}
                  />
                )}
              </td>
              <td className="py-2">
                <input
                  type="number"
                  className="w-14 border border-gray-200 rounded px-2 py-1"
                  value={it.quantity}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                />
              </td>
              <td className="py-2">
                <input
                  type="number"
                  className="w-20 border border-gray-200 rounded px-2 py-1"
                  value={it.unit_price}
                  onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                />
              </td>
              <td className="py-2 text-right">${it.line_total.toFixed(2)}</td>
              {isForeignCurrency && (
                <td className="py-2 text-right text-gray-700">
                  {(it.line_total * effectiveRate).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
              )}
              <td className="py-2 text-right">
                <button onClick={() => removeItem(index)} className="text-gray-400 hover:text-red-500">
                  x
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Moneda */}
      <div className="mb-6 border border-gray-200 rounded-lg p-4">
        <label className="text-xs text-gray-500 block mb-2">Moneda de la nota</label>
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-2"
          value={currencyMode}
          onChange={(e) => setCurrencyMode(e.target.value as CurrencyMode)}
        >
          <option value="USD">Dolares (USD)</option>
          <option value="COP">Pesos colombianos (COP)</option>
          <option value="BS_BINANCE">Bolivares - tasa Binance</option>
          <option value="BS_BCV">Bolivares - tasa BCV (con ajuste de brecha)</option>
        </select>

        {isForeignCurrency && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">
                Tasa del dia ({currencyLabel} por USD)
              </label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
            </div>
            {currencyMode === "BS_BCV" && (
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Ajuste de brecha (%)</label>
                <input
                  type="number"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={gapPercent}
                  onChange={(e) => setGapPercent(Number(e.target.value))}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end mb-6">
        <div className="w-72 text-sm">
          <div className="flex justify-between text-gray-500 py-1">
            <span>Subtotal (USD)</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-500">Descuento (%)</span>
            <input
              type="number"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-right"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-between text-gray-400 text-xs py-1">
            <span>Descuento aplicado</span>
            <span>-${discountAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-medium text-base border-t border-gray-200 mt-1 pt-2">
            <span>Total (USD)</span>
            <span>${total.toFixed(2)}</span>
          </div>

          {isForeignCurrency && (
            <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
              <div className="flex justify-between text-gray-500 py-1">
                <span>Subtotal ({currencyLabel})</span>
                <span>{subtotalInCurrency.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-gray-500 py-1">
                <span>Descuento ({currencyLabel})</span>
                <span>-{discountInCurrency.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-medium text-base pt-1">
                <span>Total ({currencyLabel})</span>
                <span>{totalInCurrency.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {savedNoteNumber ? (
        <div className="flex items-center justify-between">
          <p className="text-green-600 text-sm">
            Nota #{String(savedNoteNumber).padStart(4, "0")}{" "}
            {editId ? "actualizada" : "guardada"} correctamente.
          </p>
          <div className="flex gap-2">
            {savedNoteId && (
              <Link
                href={`/notas/ver?id=${savedNoteId}`}
                className="text-sm border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
              >
                Ver / imprimir
              </Link>
            )}
            <button
              onClick={resetForm}
              className="text-sm bg-gray-900 text-white rounded-md px-3 py-1.5 hover:bg-gray-700 transition-colors"
            >
              + Nueva nota
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            disabled={saving || items.length === 0}
            onClick={saveNote}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-md disabled:opacity-40 transition-colors hover:bg-gray-700"
          >
            {saving ? "Guardando..." : editId ? "Guardar cambios" : "Guardar nota"}
          </button>
        </div>
      )}
    </main>
  );
}

export default function NuevaNotaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400 p-8">Cargando...</p>}>
      <NuevaNotaInner />
    </Suspense>
  );
}
