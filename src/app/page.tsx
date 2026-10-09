import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "./login/actions";

const modules = [
  { name: "Tickets", description: "Cargar fotos de tickets, normalizar y validar.", status: "Disponible", href: "/tickets" },
  { name: "Precios", description: "Comparar supermercados cercanos contra lo que compramos.", status: "Más adelante" },
  { name: "Análisis", description: "Gasto, consumo y patrones de la familia.", status: "Más adelante" },
  { name: "Predicción", description: "Qué comprar, cuándo y dónde, con escenarios.", status: "Más adelante" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Compras Hogar</h1>
        <Suspense fallback={null}>
          <UserBadge />
        </Suspense>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const content = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium">{m.name}</h2>
                <span className={`text-xs ${m.href ? "text-emerald-600" : "text-neutral-500"}`}>{m.status}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{m.description}</p>
            </>
          );
          return (
            <li key={m.name} className="rounded-xl border border-neutral-200 dark:border-neutral-800">
              {m.href ? (
                <Link href={m.href} className="block p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  {content}
                </Link>
              ) : (
                <div className="p-4 opacity-60">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

async function UserBadge() {
  const user = await getCurrentUser();
  return (
    <form action={logout} className="flex items-center gap-3 text-sm">
      <span>Hola, {user.name}</span>
      <button type="submit" className="text-neutral-500 underline">
        Salir
      </button>
    </form>
  );
}
