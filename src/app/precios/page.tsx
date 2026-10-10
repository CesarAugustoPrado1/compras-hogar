import Link from "next/link";
import { Suspense } from "react";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { sepaBranches } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { lastSepaImport } from "@/lib/sepa";

export default function PricesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500">
        ← Inicio
      </Link>
      <h1 className="text-2xl font-semibold">Precios</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <Branches />
      </Suspense>
    </main>
  );
}

async function Branches() {
  await getCurrentUser();
  const [last, branches] = await Promise.all([
    lastSepaImport(),
    db
      .select({
        id: sepaBranches.id,
        chain: sepaBranches.chain,
        name: sepaBranches.name,
        address: sepaBranches.address,
        locality: sepaBranches.locality,
        distanceKm: sepaBranches.distanceKm,
        products: sql<number>`(select count(*)::int from sepa_prices sp where sp.branch_id = ${sepaBranches.id})`,
      })
      .from(sepaBranches)
      .orderBy(asc(sepaBranches.distanceKm)),
  ]);

  if (!last) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Todavía no se importaron datos de Precios Claros. Se cargan todos los días con la acción “Precios Claros” del
        repositorio en GitHub.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Datos de Precios Claros del {last.dataDate ?? "—"} (importados el {formatDate(last.createdAt)}):{" "}
        {last.branches} sucursales cercanas, {last.products.toLocaleString("es-AR")} productos.
      </p>
      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-4 p-3">
            <div>
              <p className="font-medium">{b.chain}</p>
              <p className="text-sm text-neutral-500">
                {[b.name, b.address, b.locality].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="tabular-nums">{b.distanceKm.toFixed(1)} km</p>
              <p className="text-neutral-500 tabular-nums">{b.products.toLocaleString("es-AR")} productos</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
