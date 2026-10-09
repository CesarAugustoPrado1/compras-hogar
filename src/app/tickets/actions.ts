"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { ticketImages, ticketItems, tickets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/dates";
import { isValidGtin } from "@/lib/gtin";
import { deleteFiles, saveFile } from "@/lib/storage";
import { matchKnownProducts, rememberAlias, resolveProduct, runExtraction } from "@/lib/tickets";

const MAX_PHOTOS = 8;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type UploadState = { error?: string } | undefined;

export async function createTicket(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (photos.length === 0) return { error: "Elegí al menos una foto." };
  if (photos.length > MAX_PHOTOS) return { error: `Máximo ${MAX_PHOTOS} fotos por ticket.` };
  if (photos.some((p) => !IMAGE_TYPES.includes(p.type))) {
    return { error: "Las fotos tienen que ser JPG, PNG o WebP." };
  }

  const [ticket] = await db
    .insert(tickets)
    .values({ uploadedBy: user.id })
    .returning({ id: tickets.id });

  try {
    const images = await Promise.all(
      photos.map(async (photo, position) => {
        const ext = photo.type.split("/")[1].replace("jpeg", "jpg");
        const path = `tickets/${ticket.id}/${position + 1}.${ext}`;
        await saveFile(path, Buffer.from(await photo.arrayBuffer()), photo.type);
        return { ticketId: ticket.id, position, path, contentType: photo.type };
      }),
    );
    await db.insert(ticketImages).values(images);
  } catch (error) {
    console.error("No se pudieron guardar las fotos", error);
    await db.delete(tickets).where(eq(tickets.id, ticket.id));
    return {
      error: `No se pudieron guardar las fotos${error instanceof Error ? `: ${error.message}` : "."}`,
    };
  }

  await runExtraction(ticket.id);
  redirect(`/tickets/${ticket.id}`);
}

export async function retryExtraction(ticketId: number) {
  await getCurrentUser();
  await runExtraction(ticketId);
  redirect(`/tickets/${ticketId}`);
}

const nullableNumber = z.number().finite().nullable();

const TicketInput = z.object({
  storeId: z.number().int().nullable(),
  branch: z.string().nullable(),
  ticketNumber: z.string().nullable(),
  purchasedAt: z.string(),
  total: nullableNumber,
  paymentMethod: z.string().nullable(),
  items: z.array(
    z.object({
      kind: z.enum(["producto", "descuento", "otro"]),
      rawText: z.string().trim().min(1, "Hay un renglón sin descripción."),
      ean: z.string().nullable(),
      storeCode: z.string().nullable(),
      quantity: z.number().finite().positive("Hay una cantidad inválida."),
      unit: z.enum(["u", "kg", "l"]),
      unitPrice: nullableNumber,
      discount: nullableNumber,
      lineTotal: nullableNumber,
      productId: z.number().int().nullable(),
      productName: z.string().nullable(),
      brand: z.string().nullable(),
      presentation: z.string().nullable(),
      category: z.string().nullable(),
    }),
  ),
});

export type TicketInput = z.infer<typeof TicketInput>;
export type SaveResult = { error?: string; ok?: boolean };

const clean = (v: string | null) => v?.trim() || null;

export async function saveTicket(
  ticketId: number,
  input: TicketInput,
  validate: boolean,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  const parsed = TicketInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  let items = data.items.map((item, position) => ({
    ...item,
    ticketId,
    position,
    rawText: item.rawText.trim(),
    ean: item.ean?.replace(/\D/g, "") || null,
    storeCode: clean(item.storeCode),
    productName: clean(item.productName),
    brand: clean(item.brand),
    presentation: clean(item.presentation),
    category: clean(item.category),
  }));

  if (validate) {
    if (!data.storeId) return { error: "Elegí el supermercado antes de validar." };
    if (!fromLocalInput(data.purchasedAt)) return { error: "Falta la fecha de compra." };
    const unnamed = items.find((i) => i.kind === "producto" && !i.productName);
    if (unnamed) return { error: `Falta el producto para "${unnamed.rawText}".` };
    const badEan = items.find((i) => i.ean && !isValidGtin(i.ean));
    if (badEan) {
      return {
        error: `El EAN de "${badEan.rawText}" no es válido. Revisalo o, si es un código del súper, pasalo a "Cód. súper".`,
      };
    }

    for (const item of items) {
      if (item.kind !== "producto") continue;
      item.productId = await resolveProduct({ ...item, productName: item.productName! });
      await rememberAlias(data.storeId, item.rawText, item.productId);
    }
  }

  await db.delete(ticketItems).where(eq(ticketItems.ticketId, ticketId));
  if (items.length) {
    items = items.map((i) => (i.kind === "producto" ? i : { ...i, productId: null }));
    await db.insert(ticketItems).values(items);
  }
  await db
    .update(tickets)
    .set({
      storeId: data.storeId,
      branch: clean(data.branch),
      ticketNumber: clean(data.ticketNumber),
      purchasedAt: fromLocalInput(data.purchasedAt),
      total: data.total,
      paymentMethod: clean(data.paymentMethod),
      ...(validate
        ? { status: "validado" as const, validatedBy: user.id, validatedAt: new Date() }
        : {}),
    })
    .where(eq(tickets.id, ticketId));

  if (validate) redirect("/tickets");
  return { ok: true };
}

// Al cambiar el supermercado, vuelve a buscar productos conocidos por alias.
export async function suggestProducts(storeId: number, items: TicketInput["items"]) {
  await getCurrentUser();
  return matchKnownProducts(
    storeId,
    items.map((i, position) => ({ ...i, ticketId: 0, position })),
  );
}

export async function deleteTicket(ticketId: number) {
  await getCurrentUser();
  const images = await db
    .select({ path: ticketImages.path })
    .from(ticketImages)
    .where(eq(ticketImages.ticketId, ticketId));
  await db.delete(tickets).where(eq(tickets.id, ticketId));
  await deleteFiles(images.map((i) => i.path));
  redirect("/tickets");
}
