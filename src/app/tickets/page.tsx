import Link from "next/link";
import { Suspense } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stores, ticketItems, tickets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/dates";

export default function TicketsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500">
        ← Inicio
      </Link>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <Link href="/tickets/nuevo" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
          Cargar ticket
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <TicketList />
      </Suspense>
    </main>
  );
}

async function TicketList() {
  await getCurrentUser();
  const rows = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      purchasedAt: tickets.purchasedAt,
      total: tickets.total,
      createdAt: tickets.createdAt,
      store: stores.name,
      items: sql<number>`(select count(*)::int from ${ticketItems} where ${ticketItems.ticketId} = ${tickets.id})`,
    })
    .from(tickets)
    .leftJoin(stores, eq(tickets.storeId, stores.id))
    .orderBy(desc(tickets.createdAt));

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Todavía no cargaste ningún ticket.</p>;
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={`/tickets/${t.id}`} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{t.store ?? "Supermercado sin identificar"}</p>
              <p className="text-sm text-neutral-500">
                {formatDate(t.purchasedAt ?? t.createdAt)} · {t.items} renglones
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium tabular-nums">{formatMoney(t.total)}</p>
              <span
                className={`text-xs ${t.status === "validado" ? "text-emerald-600" : "text-amber-600"}`}
              >
                {t.status === "validado" ? "Validado" : "Por validar"}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
