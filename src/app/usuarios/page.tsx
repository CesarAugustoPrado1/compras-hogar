import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { AddUserForm, ChangePinForm } from "./forms";

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500">
        ← Inicio
      </Link>
      <h1 className="text-2xl font-semibold">Usuarios</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
        <UserList />
      </Suspense>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Agregar a alguien</h2>
        <AddUserForm />
      </section>
    </main>
  );
}

async function UserList() {
  const me = await getCurrentUser();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
  return (
    <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {rows.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span>
            {u.name}
            {u.id === me.id && <span className="text-sm text-neutral-500"> (vos)</span>}
          </span>
          <ChangePinForm userId={u.id} />
        </li>
      ))}
    </ul>
  );
}
