"use client";

import { useActionState, useState } from "react";
import { login } from "./actions";

export function LoginForm({ names }: { names: string[] }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [name, setName] = useState(names.length === 1 ? names[0] : "");

  if (names.length === 0) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Todavía no hay usuarios. Creá uno con <code>npm run user:set -- Nombre 1234</code>.
      </p>
    );
  }

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
