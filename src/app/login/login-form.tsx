"use client";

import { useActionState, useState } from "react";
import { createFirstUser, login } from "./actions";

const field =
  "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-lg dark:border-neutral-700";

export function LoginForm({ names }: { names: string[] }) {
  return names.length === 0 ? <FirstUserForm /> : <PinForm names={names} />;
}

function FirstUserForm() {
  const [state, action, pending] = useActionState(createFirstUser, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Primera vez: creá tu usuario. Después vas a poder agregar al resto de la familia.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre
        <input name="name" required maxLength={30} autoComplete="username" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        PIN (4 a 8 números)
        <input name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" required autoComplete="new-password" className={`${field} tracking-widest`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Repetir PIN
        <input name="pin2" type="password" inputMode="numeric" pattern="\d{4,8}" required autoComplete="new-password" className={`${field} tracking-widest`} />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50">
        {pending ? "Creando…" : "Crear y entrar"}
      </button>
    </form>
  );
}

function PinForm({ names }: { names: string[] }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [name, setName] = useState(names.length === 1 ? names[0] : "");

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-medium">¿Quién sos?</legend>
        {names.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setName(n)}
            className={`rounded-full border px-4 py-2 text-sm ${
              name === n
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {n}
          </button>
        ))}
      </fieldset>
      <input type="hidden" name="name" value={name} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        PIN
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,8}"
          autoComplete="current-password"
          required
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-lg tracking-widest dark:border-neutral-700"
        />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || !name}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
