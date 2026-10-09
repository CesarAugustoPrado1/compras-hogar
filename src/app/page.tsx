import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "./login/actions";

const modules = [
  { name: "Tickets", description: "Cargar fotos de tickets, normalizar y validar.", status: "En construcción" },
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
        {modules.map((m) => (
          <li key={m.name} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-medium">{m.name}</h2>
              <span className="text-xs text-neutral-500">{m.status}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{m.description}</p>
          </li>
        ))}
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
