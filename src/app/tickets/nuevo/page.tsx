import Link from "next/link";
import { UploadForm } from "./upload-form";

// La lectura con IA puede tardar cerca de un minuto en tickets largos.
export const maxDuration = 300;

export default function NewTicketPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/tickets" className="text-sm text-neutral-500">
        ← Tickets
      </Link>
      <h1 className="text-2xl font-semibold">Cargar ticket</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Sacale una foto al ticket entero. Si es largo, sacá varias de arriba hacia abajo, dejando que se
        superpongan un poco.
      </p>
      <UploadForm />
    </main>
  );
}
