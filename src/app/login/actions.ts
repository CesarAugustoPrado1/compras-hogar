"use server";

import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, deleteSession } from "@/lib/session";
import { hashPin, UserInput } from "@/lib/users";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get("name") ?? "");
  const pin = String(formData.get("pin") ?? "");

  const [user] = await db.select().from(users).where(eq(users.name, name));
  if (!user) return { error: "Usuario o PIN incorrecto." };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Demasiados intentos. Probá de nuevo en ${LOCK_MINUTES} minutos.` };
  }

  if (!(await bcrypt.compare(pin, user.pinHash))) {
    const failedAttempts = user.failedAttempts + 1;
    const locked = failedAttempts >= MAX_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedAttempts: locked ? 0 : failedAttempts,
        lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      })
      .where(eq(users.id, user.id));
    return {
      error: locked
        ? `Demasiados intentos. Probá de nuevo en ${LOCK_MINUTES} minutos.`
        : "Usuario o PIN incorrecto.",
    };
  }

  if (user.failedAttempts > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

// Solo funciona mientras no haya ningún usuario: crea el primero y entra.
export async function createFirstUser(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = UserInput.safeParse({ name: formData.get("name"), pin: formData.get("pin") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get("pin") !== formData.get("pin2")) return { error: "Los PIN no coinciden." };

  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total > 0) return { error: "Ya hay usuarios creados. Recargá la página." };

  const [user] = await db
    .insert(users)
    .values({ name: parsed.data.name, pinHash: await hashPin(parsed.data.pin) })
    .returning({ id: users.id });
  await createSession(user.id);
  redirect("/");
}
