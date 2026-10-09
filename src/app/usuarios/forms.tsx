"use client";

import { useActionState } from "react";
import { addUser, changePin, type FormState } from "./actions";

const field =
  "rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-emerald-600">{state.ok}</p>;
  return null;
}

export function AddUserForm() {
  const [state, action, pending] = useActionState(addUser, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
          Nombre
          <input name="name" required maxLength={30} className={field} />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-neutral-500">
          PIN
          <input name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" required autoComplete="new-password" className={`${field} w-28`} />
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Agregar
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ChangePinForm({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(changePin, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,8}"
          required
          placeholder="PIN nuevo"
          autoComplete="new-password"
          className={`${field} w-28`}
        />
        <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
          Cambiar
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
