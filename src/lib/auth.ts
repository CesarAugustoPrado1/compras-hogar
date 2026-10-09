import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "./session";

export type User = { id: number; name: string };

// Capa de acceso: toda página o acción que necesite al usuario pasa por acá.
export async function getCurrentUser(): Promise<User> {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!user) redirect("/login");

  return user;
}
