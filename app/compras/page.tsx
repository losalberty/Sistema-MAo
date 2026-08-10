"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  contact: string | null;
  credit_days: number;
  default_discount: number;
  invoiced: number;
  paid: number;
  balance: number;
  invoices: number;
  products: number;
};

type LedgerRow = {
  kind: "factura" | "pago";
  id: string;
  entry_date: string;
  label: string;
  amount: number;
  due_date: string | null;
  items: number;
};

type ProductHit = {
  id: string;
  code: string;
  description: string;
  purchase_price: number | null;
  cost: number | null;
  discount_percent: number | null;
};

type Line = {
  code: string;
  description: string;
  quantity: string;
  list_price: string;
  discount_percent: string;
  previous_cost: number | null;
  known: boolean;
};

const emptyLine: Line = {
  code: "",
  description: "",
  quantity: "1",
  list_price: "0",
  discount_percent: "",
  previous_cost: null,
  known: false,
};

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ComprasPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // formulario de factura
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [freight, setFreight] = useState("0");
  const [customs, setCustoms] = useState("0");
  const [other, setOther] = useState("0");
  const [prorate, setProrate] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);

  // buscador de productos
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);

  // pago
  const [payFor, setPayFor] = useState<LedgerRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState("");

  const loadSuppliers = useCallback(async () => {
    const { data, error } = await supabase.rpc("suppliers_balance");
    setLoading(false);
    if (error) return setError(error.message);
    const rows = (data ?? []) as SupplierRow[];
    setSuppliers(rows);
    setCurrent((c) => c || rows[0]?.id || "");
  }, []);

  const loadLedger = useCallback(async (id: string) => {
    if (!id) return setLedger([]);
    const { data, error } = await supabase.rpc("supplier_ledger", { p_supplier_id: id });
    if (error) return setError(error.message);
    setLedger((data ?? []) as LedgerRow[]);
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    loadLedger(current);
  }, [current, loadLedger]);

  const totalDebt = useMemo(
    () => suppliers.reduce((s, x) => s + Math.max(0, Number(x.balance)), 0),
    [suppliers]
  );

  const currentSupplier = suppliers.find((s) => s.id === current);

  // ---------- formulario ----------

  function openForm() {
    const s = suppliers.find((x) => x.id === current);
    setSupplierId(current);
    setNumber("");
    setDate(today());
    setDueDate(s?.credit_days ? addDays(today(), s.credit_days) : "");
    setDiscount(String(s?.default_discount ?? 0));
    setFreight("0");
    setCustoms("0");
    setOther("0");
    setProrate(false);
    setShowExtras(false);
    setLines([{ ...emptyLine }]);
    setShowForm(true);
    setError(null);
    setInfo(null);
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length === 1 ? [{ ...emptyLine }] : prev.filter((_, x) => x !== i)));
  }

  async function search(text: string) {
    setQuery(text);
    if (text.trim().length < 2) return setHits([]);
    const { data } = await supabase.rpc("search_products", { search_text: text.trim() });
    setHits(((data ?? []) as ProductHit[]).slice(0, 12));
  }

  function pick(p: ProductHit) {
    if (pickerRow == null) return;
    setLine(pickerRow, {
      code: p.code,
      description: p.description,
      list_price: String(p.purchase_price ?? 0),
      previous_cost: p.cost != null ? Number(p.cost) : null,
      known: true,
    });
    setPickerRow(null);
    setQuery("");
    setHits([]);
  }

  const computed = useMemo(() => {
    const gen = Number(discount) || 0;
    let subtotal = 0;
    const rows = lines.map((l) => {
      const qty = Number(l.quantity) || 0;
      const list = Number(l.list_price) || 0;
      const dto = l.discount_percent === "" ? gen : Number(l.discount_percent) || 0;
      const unit = list * (1 - dto / 100);
      const total = unit * qty;
      subtotal += total;
      return { unit, total, dto };
    });
    const extras = (Number(freight) || 0) + (Number(customs) || 0) + (Number(other) || 0);
    const factor = prorate && subtotal > 0 ? extras / subtotal : 0;
    const final = rows.map((r) => ({ ...r, unit: r.unit * (1 + factor) }));
    const risen = final.filter(
      (r, i) => lines[i].known && lines[i].previous_cost != null && r.unit > (lines[i].previous_cost ?? 0)
    ).length;
    const knownCount = lines.filter((l) => l.known && l.previous_cost != null).length;
    return { rows: final, subtotal, extras, total: subtotal + extras, risen, knownCount };
  }, [lines, discount, freight, customs, other, prorate]);

  async function saveInvoice() {
    if (!supplierId) return setError("Elige un proveedor.");
    const items = lines
      .filter((l) => l.code.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        code: l.code.trim(),
        description: l.description,
        quantity: l.quantity,
        list_price: l.list_price,
        discount_percent: l.discount_percent === "" ? String(Number(discount) || 0) : l.discount_percent,
      }));
    if (items.length === 0) return setError("Agrega al menos un repuesto.");

    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_purchase_invoice", {
      p_supplier_id: supplierId,
      p_number: number,
      p_date: date,
      p_due_date: dueDate || null,
      p_currency: "USD",
      p_discount: Number(discount) || 0,
      p_freight: Number(freight) || 0,
      p_customs: Number(customs) || 0,
      p_other: Number(other) || 0,
      p_prorate: prorate,
      p_items: items,
    });
    setSaving(false);
    if (error) {
      setError(
        error.message.includes("purchase_invoices_no_dup")
          ? "Ya registraste una factura con ese numero para este proveedor."
          : error.message
      );
      return;
    }
    const r = data as {
      total: number;
      costs_updated: number;
      costs_skipped: number;
      unknown_codes: number;
    };
    setInfo(
      `Factura de ${money(r.total)} registrada. ${r.costs_updated} costo(s) actualizado(s)` +
        (r.costs_skipped ? `, ${r.costs_skipped} sin tocar por ser factura anterior` : "") +
        (r.unknown_codes ? `, ${r.unknown_codes} codigo(s) no existen en Productos` : "") +
        "."
    );
    setShowForm(false);
    setCurrent(supplierId);
    loadSuppliers();
    loadLedger(supplierId);
  }

  // ---------- pagos ----------

  function openPay(row: LedgerRow | null) {
    setPayFor(row);
    setPayAmount(row ? String(Number(row.amount).toFixed(2)) : "");
    setPayDate(today());
    setPayMethod("");
  }

  async function savePayment() {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return setError("Pon un monto valido.");
    const { error } = await supabase.rpc("register_payment", {
      p_supplier_id: current,
      p_invoice_id: payFor?.id ?? null,
      p_date: payDate,
      p_amount: amount,
      p_method: payMethod || null,
      p_notes: null,
    });
    if (error) return setError(error.message);
    setPayFor(null);
    setPayAmount("");
    setInfo(`Pago de ${money(amount)} registrado.`);
    loadSuppliers();
    loadLedger(current);
  }

  async function removeEntry(row: LedgerRow) {
    const what = row.kind === "pago" ? "este pago" : "esta factura";
    if (!confirm(`¿Eliminar ${what}? Los costos ya aplicados a los productos no se revierten.`))
      return;
    const rpc = row.kind === "pago" ? "delete_payment" : "delete_purchase_invoice";
    const { error } = await supabase.rpc(rpc, { p_id: row.id });
    if (error) return setError(error.message);
    loadSuppliers();
    loadLedger(current);
  }

  // ---------- render ----------

  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-indigo-600 inline-block mb-2 transition-colors"
          >
            ← Volver al panel
          </Link>
          <h1 className="text-lg font-medium">Compras</h1>
          <p className="text-sm text-gray-500">
            {suppliers.length} proveedores
            {totalDebt > 0 && (
              <span className="text-amber-600"> · {money(totalDebt)} por pagar</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openPay(null)}
            disabled={!current}
            className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40"
          >
            Registrar pago
          </button>
          <button
            onClick={openForm}
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 hover:shadow-md active:scale-[0.98] transition-all"
          >
            + Registrar factura
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {info && <p className="text-emerald-600 text-sm mb-4">{info}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {/* ---------- formulario de factura ---------- */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-medium mb-4">Registrar factura de compra</p>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Proveedor</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  const s = suppliers.find((x) => x.id === e.target.value);
                  setSupplierId(e.target.value);
                  if (s) {
                    setDiscount(String(s.default_discount ?? 0));
                    setDueDate(s.credit_days ? addDays(date, s.credit_days) : "");
                  }
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none transition-colors"
              >
                <option value="">Elige...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Su numero de factura</label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Ej: 1-000241"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Vence</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 mb-3 flex-wrap">
            <span className="text-sm text-gray-600">Descuento general</span>
            <input
              type="number"
              min={0}
              max={99}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right"
            />
            <span className="text-sm text-gray-500">%</span>
            <span className="text-xs text-gray-400">
              se aplica a las lineas que no tengan uno propio
            </span>
            <button
              onClick={() => setShowExtras((s) => !s)}
              className="ml-auto text-xs text-gray-500 hover:text-indigo-600 transition-colors"
            >
              {showExtras ? "Ocultar gastos" : "Flete y aduana"}
            </button>
          </div>

          {showExtras && (
            <div className="border border-gray-200 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-3 gap-3 mb-3">
                {(
                  [
                    ["Flete", freight, setFreight],
                    ["Aduana", customs, setCustoms],
                    ["Otros gastos", other, setOther],
                  ] as [string, string, (v: string) => void][]
                ).map(([label, value, set]) => (
                  <div key={label}>
                    <label className="text-xs text-gray-500 block mb-1">{label}</label>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right"
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={prorate}
                  onChange={(e) => setProrate(e.target.checked)}
                />
                <span>
                  Repartir estos gastos en el costo de cada repuesto
                  <span className="block text-xs text-gray-500">
                    Si lo dejas desmarcado, los gastos se suman al total de la factura pero el
                    costo de los productos queda solo con el precio del proveedor.
                  </span>
                </span>
              </label>
            </div>
          )}

          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-xs text-gray-400 text-left">
                <th className="font-normal py-1.5 w-40">Codigo</th>
                <th className="font-normal py-1.5">Descripcion</th>
                <th className="font-normal py-1.5 w-16 text-right">Cant</th>
                <th className="font-normal py-1.5 w-24 text-right">Precio lista</th>
                <th className="font-normal py-1.5 w-20 text-right">Dto</th>
                <th className="font-normal py-1.5 w-24 text-right">Total</th>
                <th className="font-normal py-1.5 w-28 text-right">Costo antes</th>
                <th className="font-normal py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const c = computed.rows[i];
                const prev = l.previous_cost;
                const up = prev != null && c && c.unit > prev;
                return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2">
                      <input
                        value={l.code}
                        onFocus={() => setPickerRow(i)}
                        onChange={(e) => {
                          setLine(i, { code: e.target.value, known: false, previous_cost: null });
                          setPickerRow(i);
                          search(e.target.value);
                        }}
                        placeholder="buscar..."
                        className="w-full border border-gray-200 rounded px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={l.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        className="w-full border border-gray-200 rounded px-2 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        value={l.list_price}
                        onChange={(e) => setLine(i, { list_price: e.target.value })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        value={l.discount_percent}
                        onChange={(e) => setLine(i, { discount_percent: e.target.value })}
                        placeholder={discount}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-1.5 text-right">{money(c?.total ?? 0)}</td>
                    <td className={`py-1.5 text-right ${up ? "text-red-600" : "text-emerald-700"}`}>
                      {prev == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <>
                          {money(prev)} {up ? "▲" : "▼"}
                        </>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => removeLine(i)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pickerRow != null && hits.length > 0 && (
            <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg mb-3 max-h-56 overflow-y-auto">
              {hits.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-100 transition-colors border-b border-indigo-100 last:border-0"
                >
                  <span className="text-gray-400 text-xs mr-2">{p.code}</span>
                  {p.description}
                  <span className="text-gray-400 text-xs ml-2">
                    lista {money(Number(p.purchase_price ?? 0))} · costo{" "}
                    {money(Number(p.cost ?? 0))}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={addLine}
            className="text-xs text-gray-500 hover:text-indigo-600 transition-colors mb-4"
          >
            + Agregar linea
          </button>

          {computed.knownCount > 0 && (
            <div
              className={`rounded-lg px-3 py-2 mb-4 text-xs ${
                computed.risen > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {computed.risen > 0
                ? `${computed.risen} de ${computed.knownCount} repuestos te quedan mas caros que antes. Revisa si hay que subir el precio de venta.`
                : "Ningun costo sube con esta factura."}
            </div>
          )}

          <div className="flex items-end justify-between border-t border-gray-200 pt-3">
            <div className="text-xs text-gray-500">
              Subtotal {money(computed.subtotal)}
              {computed.extras > 0 && ` · gastos ${money(computed.extras)}`}
              {computed.extras > 0 && !prorate && (
                <span className="text-amber-700"> (no se reparten en el costo)</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-medium">{money(computed.total)}</span>
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-2">
                Cancelar
              </button>
              <button
                onClick={saveInvoice}
                disabled={saving}
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                {saving ? "Guardando..." : "Guardar y actualizar costos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- pago ---------- */}
      {(payFor || payAmount !== "") && (
        <div className="bg-white border border-emerald-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium mb-3">
            {payFor ? `Pagar factura ${payFor.label}` : "Registrar pago"}
            {currentSupplier && <span className="text-gray-500"> · {currentSupplier.name}</span>}
          </p>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Monto</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Forma de pago</label>
              <input
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="Transferencia, efectivo..."
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={savePayment}
              className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Guardar pago
            </button>
            <button
              onClick={() => {
                setPayFor(null);
                setPayAmount("");
              }}
              className="text-sm text-gray-500 px-2 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ---------- proveedores + linea de tiempo ---------- */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1">
          <p className="text-xs text-gray-400 mb-2">Proveedores</p>
          {suppliers.map((s) => {
            const on = s.id === current;
            const bal = Number(s.balance);
            return (
              <button
                key={s.id}
                onClick={() => setCurrent(s.id)}
                className={`block w-full text-left border rounded-lg px-3 py-2.5 mb-2 transition-colors ${
                  on
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                }`}
              >
                <span className={`block text-sm truncate ${on ? "text-indigo-900" : ""}`}>
                  {s.name}
                </span>
                <span
                  className={`block text-xs ${bal > 0 ? "text-amber-600" : "text-gray-400"}`}
                >
                  {bal > 0 ? money(bal) : "al dia"}
                </span>
              </button>
            );
          })}
          {suppliers.length === 0 && !loading && (
            <p className="text-sm text-gray-400">
              Aun no hay proveedores. Se crean desde Productos → Compra → Importar.
            </p>
          )}
        </div>

        <div className="col-span-3">
          {currentSupplier && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <p className="text-sm font-medium">{currentSupplier.name}</p>
                  <p className="text-xs text-gray-400">
                    {currentSupplier.invoices} factura(s) · {currentSupplier.products} productos
                    {currentSupplier.credit_days > 0 &&
                      ` · ${currentSupplier.credit_days} dias de credito`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Saldo</p>
                  <p
                    className={`text-xl font-medium ${
                      Number(currentSupplier.balance) > 0 ? "text-amber-600" : "text-gray-400"
                    }`}
                  >
                    {money(Number(currentSupplier.balance))}
                  </p>
                </div>
              </div>

              {ledger.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Sin movimientos. Registra la primera factura de este proveedor.
                </p>
              ) : (
                <div>
                  {ledger.map((r) => {
                    const pago = r.kind === "pago";
                    const overdue =
                      !pago && r.due_date && r.due_date < today() && Number(currentSupplier.balance) > 0;
                    return (
                      <div
                        key={r.kind + r.id}
                        className="flex items-baseline gap-3 py-2 border-b border-gray-100 last:border-0 group"
                      >
                        <span className="text-xs text-gray-400 w-20 shrink-0">{r.entry_date}</span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            pago ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                        <span className="text-sm flex-1 min-w-0 truncate">
                          {pago ? r.label : `Factura ${r.label}`}
                          {!pago && (
                            <span className="text-gray-400 text-xs ml-2">
                              {r.items} articulos
                              {r.due_date && ` · vence ${r.due_date}`}
                            </span>
                          )}
                          {overdue && (
                            <span className="text-red-500 text-xs ml-2">vencida</span>
                          )}
                        </span>
                        {!pago && (
                          <button
                            onClick={() => openPay(r)}
                            className="text-xs text-gray-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            pagar
                          </button>
                        )}
                        <button
                          onClick={() => removeEntry(r)}
                          className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          eliminar
                        </button>
                        <span
                          className={`text-sm whitespace-nowrap w-24 text-right ${
                            pago ? "text-emerald-700" : ""
                          }`}
                        >
                          {pago ? "−" : "+"}
                          {money(Math.abs(Number(r.amount)))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
