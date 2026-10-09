"use client";

import { useState, useTransition } from "react";
import {
  deleteTicket,
  retryExtraction,
  saveTicket,
  suggestProducts,
  type TicketInput,
} from "../actions";

type Item = TicketInput["items"][number];

const emptyItem: Item = {
  kind: "producto",
  rawText: "",
  ean: null,
  quantity: 1,
  unit: "u",
  unitPrice: null,
  discount: null,
  lineTotal: null,
  productId: null,
  productName: null,
  brand: null,
  presentation: null,
  category: null,
};

const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v);

const input =
  "w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
      {label}
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          onChange(e.target.value.trim() === "" || Number.isNaN(n) ? null : n);
        }}
        className={`${input} tabular-nums text-neutral-900 dark:text-neutral-100`}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-0.5 text-xs text-neutral-500 ${className}`}>
      {label}
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${input} text-neutral-900 dark:text-neutral-100`}
      />
    </label>
  );
}

export function TicketEditor({
  ticketId,
  status,
  notes,
  images,
  stores,
  categories,
  initial,
}: {
  ticketId: number;
  status: "borrador" | "validado";
  notes: string | null;
  images: string[];
  stores: { id: number; name: string }[];
  categories: string[];
  initial: TicketInput;
}) {
  const [data, setData] = useState(initial);
  // Clave estable por renglón para que React no mezcle inputs al borrar o insertar.
  const [keys, setKeys] = useState(() => initial.items.map((_, i) => i));
  const [nextKey, setNextKey] = useState(initial.items.length);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string }>();
  const [pending, startTransition] = useTransition();
  const [zoom, setZoom] = useState<string>();

  const sum = data.items.reduce((acc, i) => acc + (i.lineTotal ?? 0), 0);
  const diff = data.total === null ? null : Math.round((data.total - sum) * 100) / 100;

  function setItem(index: number, patch: Partial<Item>) {
    setData((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }));
  }

  function insertItem(index: number) {
    setData((d) => ({ ...d, items: [...d.items.slice(0, index), { ...emptyItem }, ...d.items.slice(index)] }));
    setKeys((k) => [...k.slice(0, index), nextKey, ...k.slice(index)]);
    setNextKey((n) => n + 1);
  }

  function removeItem(index: number) {
    setData((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }));
    setKeys((k) => k.filter((_, i) => i !== index));
  }

  function changeStore(storeId: number | null) {
    setData((d) => ({ ...d, storeId }));
    if (!storeId) return;
    startTransition(async () => {
      const matched = await suggestProducts(storeId, data.items);
      setData((d) => ({
        ...d,
        items: d.items.map((it, i) =>
          !it.productId && matched[i]?.productId
            ? {
                ...it,
                productId: matched[i].productId ?? null,
                ean: matched[i].ean ?? null,
                productName: matched[i].productName ?? null,
                brand: matched[i].brand ?? null,
                presentation: matched[i].presentation ?? null,
                category: matched[i].category ?? null,
              }
            : it,
        ),
      }));
    });
  }

  function save(validate: boolean) {
    setMessage(undefined);
    startTransition(async () => {
      const result = await saveTicket(ticketId, data, validate);
      if (result?.error) setMessage({ type: "error", text: result.error });
      else if (result?.ok) setMessage({ type: "ok", text: "Guardado." });
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* En el celular: tira de miniaturas que se agrandan al tocarlas. En la compu: columna fija al lado. */}
      <section className="flex gap-2 overflow-x-auto lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:flex-col lg:overflow-y-auto">
        {images.map((src, i) => (
          <button key={src} type="button" onClick={() => setZoom(src)} className="shrink-0 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Foto ${i + 1} del ticket`}
              className="h-40 w-auto rounded-lg border border-neutral-200 lg:h-auto lg:w-full dark:border-neutral-800"
            />
          </button>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        {notes && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {notes}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
            Supermercado
            <select
              value={data.storeId ?? ""}
              onChange={(e) => changeStore(e.target.value ? Number(e.target.value) : null)}
              className={`${input} text-neutral-900 dark:text-neutral-100`}
            >
              <option value="">Elegir…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
            Fecha y hora
            <input
              type="datetime-local"
              value={data.purchasedAt}
              onChange={(e) => setData((d) => ({ ...d, purchasedAt: e.target.value }))}
              className={`${input} text-neutral-900 dark:text-neutral-100`}
            />
          </label>
          <NumberField label="Total del ticket" value={data.total} onChange={(total) => setData((d) => ({ ...d, total }))} />
          <TextField
            label="Medio de pago"
            value={data.paymentMethod}
            onChange={(paymentMethod) => setData((d) => ({ ...d, paymentMethod }))}
          />
        </div>

        <div
          className={`rounded-lg p-3 text-sm ${
            diff === null || Math.abs(diff) < 1
              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          Suma de renglones: <strong>{money(sum)}</strong>
          {diff !== null && Math.abs(diff) >= 1 && <> · Diferencia con el total: <strong>{money(diff)}</strong></>}
        </div>

        <ol className="flex flex-col gap-3">
          {data.items.map((item, i) => (
            <li
              key={keys[i]}
              className={`flex flex-col gap-2 rounded-xl border p-3 ${
                item.kind === "producto"
                  ? "border-neutral-200 dark:border-neutral-800"
                  : "border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-neutral-400">{i + 1}</span>
                <input
                  value={item.rawText}
                  onChange={(e) => setItem(i, { rawText: e.target.value })}
                  placeholder="Texto del ticket"
                  className={`${input} font-mono`}
                />
                <select
                  value={item.kind}
                  onChange={(e) => setItem(i, { kind: e.target.value as Item["kind"] })}
                  className={`${input} w-auto`}
                >
                  <option value="producto">Producto</option>
                  <option value="descuento">Descuento</option>
                  <option value="otro">Otro</option>
                </select>
                <button type="button" onClick={() => removeItem(i)} className="px-1 text-red-600" aria-label="Borrar renglón">
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                <NumberField label="Cant." value={item.quantity} onChange={(v) => setItem(i, { quantity: v ?? 0 })} />
                <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
                  Unidad
                  <select
                    value={item.unit}
                    onChange={(e) => setItem(i, { unit: e.target.value as Item["unit"] })}
                    className={`${input} text-neutral-900 dark:text-neutral-100`}
                  >
                    <option value="u">u</option>
                    <option value="kg">kg</option>
                    <option value="l">l</option>
                  </select>
                </label>
                <NumberField label="Precio u." value={item.unitPrice} onChange={(v) => setItem(i, { unitPrice: v })} />
                <NumberField label="Desc." value={item.discount} onChange={(v) => setItem(i, { discount: v })} />
                <NumberField label="Total" value={item.lineTotal} onChange={(v) => setItem(i, { lineTotal: v })} />
              </div>

              {item.kind === "producto" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <TextField
                    label="Producto"
                    value={item.productName}
                    onChange={(v) => setItem(i, { productName: v })}
                    className="col-span-2"
                  />
                  <TextField label="Marca" value={item.brand} onChange={(v) => setItem(i, { brand: v })} />
                  <TextField label="Presentación" value={item.presentation} onChange={(v) => setItem(i, { presentation: v })} />
                  <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
                    Categoría
                    <select
                      value={item.category ?? ""}
                      onChange={(e) => setItem(i, { category: e.target.value || null })}
                      className={`${input} text-neutral-900 dark:text-neutral-100`}
                    >
                      <option value="">—</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <TextField label="EAN" value={item.ean} onChange={(v) => setItem(i, { ean: v })} />
                  {item.productId && (
                    <p className="col-span-full text-xs text-emerald-700 dark:text-emerald-400">
                      Producto ya conocido.{" "}
                      <button type="button" className="underline" onClick={() => setItem(i, { productId: null })}>
                        No es este, tratarlo como nuevo
                      </button>
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => insertItem(i + 1)}
                className="self-start text-xs text-neutral-500 underline"
              >
                + renglón debajo
              </button>
            </li>
          ))}
        </ol>
        {data.items.length === 0 && (
          <button type="button" onClick={() => insertItem(0)} className="self-start text-sm underline">
            + Agregar renglón
          </button>
        )}

        {message && (
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-emerald-600"}`}>{message.text}</p>
        )}

        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-neutral-200 bg-[var(--background)] py-3 dark:border-neutral-800">
          <button
            type="button"
            disabled={pending}
            onClick={() => save(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "validado" ? "Guardar cambios" : "Validar y guardar"}
          </button>
          {status === "borrador" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(false)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              Guardar borrador
            </button>
          )}
          {status === "borrador" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Se vuelve a leer el ticket y se pierden los cambios hechos. ¿Seguir?")) {
                  startTransition(() => retryExtraction(ticketId));
                }
              }}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              Reintentar lectura
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("¿Eliminar este ticket?")) startTransition(() => deleteTicket(ticketId));
            }}
            className="ml-auto px-2 py-2 text-sm text-red-600 disabled:opacity-50"
          >
            Eliminar
          </button>
        </div>
      </section>

      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(undefined)}
          className="fixed inset-0 z-10 overflow-auto bg-black/80 p-4"
          aria-label="Cerrar"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Foto ampliada" className="mx-auto max-w-none" />
        </button>
      )}
    </div>
  );
}
