import Link from "next/link";
import { Suspense } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, TIME_ZONE } from "@/lib/dates";

const usd = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: v < 1 ? 3 : 2,
        maximumFractionDigits: v < 1 ? 3 : 2,
      }).format(v);

const ars = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);

const tokens = (n: number) => new Intl.NumberFormat("es-AR").format(n);

export default function UsagePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500">
        ← Inicio
      </Link>
      <h1 className="text-2xl font-semibold">Consumo de IA</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Costo estimado de cada lectura con Claude, calculado con los tokens que informa la API y la lista de precios
        en dólares. Los pesos usan el dólar tarjeta del día de cada lectura (* si a alguna le faltó la
        cotización). La factura real está en console.anthropic.com.
      </p>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <Usage />
      </Suspense>
    </main>
  );
}

async function Usage() {
  await getCurrentUser();
  // Zona horaria como literal (constante): si va como parámetro, Postgres no reconoce que
  // la expresión del SELECT y la del GROUP BY son la misma.
  const month = sql<string>`to_char(${aiUsage.createdAt} at time zone ${sql.raw(`'${TIME_ZONE}'`)}, 'YYYY-MM')`;
  const [months, recent] = await Promise.all([
    db
      .select({
        month,
        calls: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${aiUsage.ok})::int`,
        failed: sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
        tokens: sql<number>`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens} + ${aiUsage.cacheWriteTokens} + ${aiUsage.cacheReadTokens})::int`,
        cost: sql<string | null>`sum(${aiUsage.costUsd})`,
        costArs: sql<string | null>`sum(${aiUsage.costUsd} * ${aiUsage.usdArs})`,
        withoutRate: sql<number>`count(*) filter (where ${aiUsage.costUsd} > 0 and ${aiUsage.usdArs} is null)::int`,
      })
      .from(aiUsage)
      .groupBy(month)
      .orderBy(desc(month)),
    db
      .select({
        id: aiUsage.id,
        createdAt: aiUsage.createdAt,
        ticketId: aiUsage.ticketId,
        model: aiUsage.model,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        costUsd: aiUsage.costUsd,
        usdArs: aiUsage.usdArs,
        ok: aiUsage.ok,
        error: aiUsage.error,
        durationMs: aiUsage.durationMs,
        user: users.name,
      })
      .from(aiUsage)
      .leftJoin(users, eq(aiUsage.userId, users.id))
      .orderBy(desc(aiUsage.createdAt))
      .limit(50),
  ]);

  if (months.length === 0) {
    return <p className="text-sm text-neutral-500">Todavía no hubo lecturas con IA.</p>;
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Por mes</h2>
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {months.map((m) => {
            const cost = m.cost === null ? null : Number(m.cost);
            return (
              <li key={m.month} className="flex items-center justify-between gap-4 p-3">
                <div>
                  <p className="font-medium">
                    {new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
                      new Date(`${m.month}-01T12:00:00Z`),
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {m.calls} {m.calls === 1 ? "lectura" : "lecturas"}
                    {m.failed > 0 && ` (${m.failed} con error)`} · {tokens(m.tokens)} tokens
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">{usd(cost)}</p>
                  {m.costArs !== null && (
                    <p className="text-sm tabular-nums">
                      ≈ {ars(Number(m.costArs))}
                      {m.withoutRate > 0 && "*"}
                    </p>
                  )}
                  {cost !== null && m.succeeded > 0 && (
                    <p className="text-xs text-neutral-500 tabular-nums">{usd(cost / m.succeeded)} por lectura</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Últimas lecturas</h2>
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
          {recent.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-4 p-3">
              <div className="min-w-0">
                <p>
                  {formatDate(r.createdAt)}
                  {r.ticketId ? (
                    <>
                      {" · "}
                      <Link href={`/tickets/${r.ticketId}`} className="underline">
                        ticket #{r.ticketId}
                      </Link>
                    </>
                  ) : (
                    " · ticket borrado"
                  )}
                  {r.user && ` · ${r.user}`}
                </p>
                <p className="text-xs text-neutral-500">
                  {r.model} · {tokens(r.inputTokens)} entrada / {tokens(r.outputTokens)} salida
                  {r.durationMs !== null && ` · ${Math.round(r.durationMs / 1000)} s`}
                </p>
                {!r.ok && <p className="truncate text-xs text-red-600">{r.error}</p>}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p>{usd(r.costUsd)}</p>
                {r.costUsd !== null && r.usdArs !== null && r.costUsd > 0 && (
                  <p className="text-xs text-neutral-500">{ars(r.costUsd * r.usdArs)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
