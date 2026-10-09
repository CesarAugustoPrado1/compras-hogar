import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { stores, ticketImages, ticketItems, tickets, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { formatDate, toLocalInput } from "@/lib/dates";
import { TicketEditor } from "./ticket-editor";

// "Reintentar lectura" vuelve a llamar a la IA.
export const maxDuration = 300;

export default function TicketPage({ params }: PageProps<"/tickets/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/tickets" className="text-sm text-neutral-500">
        ← Tickets
      </Link>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <TicketLoader params={params} />
      </Suspense>
    </main>
  );
}

async function TicketLoader({ params }: { params: PageProps<"/tickets/[id]">["params"] }) {
  await getCurrentUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
  if (!ticket) notFound();

  const [images, items, storeRows, validator, duplicates] = await Promise.all([
    db.select().from(ticketImages).where(eq(ticketImages.ticketId, id)).orderBy(asc(ticketImages.position)),
    db.select().from(ticketItems).where(eq(ticketItems.ticketId, id)).orderBy(asc(ticketItems.position)),
    db.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
    ticket.validatedBy
      ? db.select({ name: users.name }).from(users).where(eq(users.id, ticket.validatedBy))
      : Promise.resolve([]),
    // El mismo comprobante cargado dos veces (mismo súper y número).
    ticket.storeId && ticket.ticketNumber
      ? db
          .select({ id: tickets.id })
          .from(tickets)
          .where(
            and(
              eq(tickets.storeId, ticket.storeId),
              eq(tickets.ticketNumber, ticket.ticketNumber),
              ne(tickets.id, ticket.id),
            ),
          )
      : Promise.resolve([]),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Ticket #{ticket.id}</h1>
        <p className="text-sm text-neutral-500">
          {ticket.status === "validado"
            ? `Validado por ${validator[0]?.name ?? "—"} el ${formatDate(ticket.validatedAt)}`
            : "Por validar: revisá cada renglón contra la foto."}
        </p>
      </div>
      {duplicates.length > 0 && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          Este comprobante parece estar cargado dos veces:{" "}
          {duplicates.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/tickets/${d.id}`} className="underline">
                ticket #{d.id}
              </Link>
            </span>
          ))}
          . Si es así, eliminá uno.
        </p>
      )}
      <TicketEditor
        // Al releer el ticket los renglones cambian de id: remonta el editor con los datos nuevos.
        key={items.map((i) => i.id).join(",")}
        ticketId={ticket.id}
        status={ticket.status}
        notes={ticket.extractionNotes}
        images={images.map((img) => `/fotos/${img.path}`)}
        stores={storeRows}
        categories={[...CATEGORIES]}
        initial={{
          storeId: ticket.storeId,
          branch: ticket.branch,
          ticketNumber: ticket.ticketNumber,
          purchasedAt: toLocalInput(ticket.purchasedAt),
          total: ticket.total,
          paymentMethod: ticket.paymentMethod,
          items: items.map((i) => ({
            kind: i.kind,
            rawText: i.rawText,
            ean: i.ean,
            storeCode: i.storeCode,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            discount: i.discount,
            lineTotal: i.lineTotal,
            productId: i.productId,
            productName: i.productName,
            brand: i.brand,
            presentation: i.presentation,
            category: i.category,
          })),
        }}
      />
    </>
  );
}
