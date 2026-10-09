import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Compras Hogar</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <UserPicker />
      </Suspense>
    </main>
  );
}

async function UserPicker() {
  await connection();
  const rows = await db.select({ name: users.name }).from(users).orderBy(asc(users.name));
  return <LoginForm names={rows.map((r) => r.name)} />;
}
