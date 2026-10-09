"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hashPin, UserInput } from "@/lib/users";

export type FormState = { error?: string; ok?: string } | undefined;

export async function addUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentUser();
  const parsed = UserInput.safeParse({ name: formData.get("name"), pin: formData.get("pin") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const inserted = await db
    .insert(users)
    .values({ name: parsed.data.name, pinHash: await hashPin(parsed.data.pin) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (inserted.length === 0) return { error: `Ya existe un usuario "${parsed.data.name}".` };

  revalidatePath("/usuarios");
  return { ok: `Listo, ${parsed.data.name} ya puede entrar con su PIN.` };
}

export async function changePin(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentUser();
  const userId = Number(formData.get("userId"));
  const pin = String(formData.get("pin") ?? "");
  const parsed = UserInput.shape.pin.safeParse(pin);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db
    .update(users)
    .set({ pinHash: await hashPin(pin), failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId));
  return { ok: "PIN cambiado." };
}
