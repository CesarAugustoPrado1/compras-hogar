import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
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

  const [images, items, storeRows, validator] = await Promise.all([
    db.select().from(ticketImages).where(eq(ticketImages.ticketId, id)).orderBy(asc(ticketImages.position)),
    db.select().from(ticketItems).where(eq(ticketItems.ticketId, id)).orderBy(asc(ticketItems.position)),
    db.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
    ticket.validatedBy
      ? db.select({ name: users.name }).from(users).where(eq(users.id, ticket.validatedBy))
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
          purchasedAt: toLocalInput(ticket.purchasedAt),
          total: ticket.total,
          paymentMethod: ticket.paymentMethod,
          items: items.map((i) => ({
            kind: i.kind,
            rawText: i.rawText,
            ean: i.ean,
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
