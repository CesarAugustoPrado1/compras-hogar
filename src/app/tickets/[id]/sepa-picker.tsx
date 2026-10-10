"use client";

import { useState, useTransition } from "react";
import type { SepaMatch } from "@/lib/sepa";
import { searchPreciosClaros } from "../actions";

const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v);

export const describeSepa = (m: SepaMatch) =>
  [m.description, m.brand, m.quantity && m.unit ? `${m.quantity} ${m.unit}` : null]
    .filter(Boolean)
    .join(" · ");

export function SepaInfo({ match }: { match: SepaMatch }) {
  return (
    <span>
      En Precios Claros: {describeSepa(match)}
      {match.bestPrice !== null && (
        <>
          {" "}
          — desde <strong>{money(match.bestPrice)}</strong> en {match.bestChain}
        </>
      )}
    </span>
  );
}

// Busca el producto en el catálogo de Precios Claros para asignarle su EAN.
export function SepaPicker({
  initialQuery,
  onPick,
  onClose,
}: {
  initialQuery: string;
  onPick: (match: SepaMatch) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SepaMatch[]>();
  const [pending, startTransition] = useTransition();

  function search(q: string) {
    startTransition(async () => setResults(await searchPreciosClaros(q)));
  }

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2 dark:border-sky-900 dark:bg-sky-950">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej.: dulce de batata esnaola"
          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button type="submit" disabled={pending} className="rounded-md bg-sky-600 px-3 text-sm text-white disabled:opacity-50">
          {pending ? "…" : "Buscar"}
        </button>
        <button type="button" onClick={onClose} className="px-1 text-sm text-neutral-500" aria-label="Cerrar">
          ✕
        </button>
      </form>
      {results && results.length === 0 && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Sin resultados. Probá con menos palabras, o puede que no esté en Precios Claros (los productos sueltos o por
          peso no suelen estar).
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((m) => (
            <li key={m.ean}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className="w-full rounded-md bg-white p-2 text-left text-sm hover:bg-sky-100 dark:bg-neutral-900 dark:hover:bg-sky-900"
              >
                <span className="block">{describeSepa(m)}</span>
                <span className="block text-xs text-neutral-500">
                  EAN {m.ean}
                  {m.bestPrice !== null && ` · desde ${money(m.bestPrice)} en ${m.bestChain} (${m.branches} suc.)`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
