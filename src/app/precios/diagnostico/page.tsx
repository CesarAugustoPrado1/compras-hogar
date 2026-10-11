import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Prueba si desde el servidor de Vercel se puede llegar al portal de datos abiertos
// (desde GitHub Actions no responde).
export const maxDuration = 60;

const CKAN = "https://datos.produccion.gob.ar";

type Probe = { name: string; ok: boolean; ms: number; detail: string };

async function probe(name: string, url: string, method: "GET" | "HEAD" = "GET"): Promise<Probe & { res?: Response }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    return { name, ok: res.ok, ms: Date.now() - started, detail: `HTTP ${res.status}`, res };
  } catch (error) {
    const e = error as Error & { cause?: unknown };
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: `${e.message}${e.cause ? ` (${String(e.cause)})` : ""}`,
    };
  }
}

const formatBytes = (n: number) =>
  n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${n} bytes`;

export default function DiagnosticPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/precios" className="text-sm text-neutral-500">
        ← Precios
      </Link>
      <h1 className="text-2xl font-semibold">Diagnóstico Precios Claros</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Probando conexiones (hasta 30 segundos)…</p>}>
        <Results />
      </Suspense>
    </main>
  );
}

async function Results() {
  await connection();
  await getCurrentUser();

  const [control, ckan] = await Promise.all([
    probe("Internet en general (google.com)", "https://www.google.com", "HEAD"),
    probe("Portal de datos abiertos (lista de archivos)", `${CKAN}/api/3/action/package_show?id=sepa-precios`),
  ]);

  const probes: Probe[] = [control, ckan];
  let latest: { name?: string; url: string; when: string; size?: number } | null = null;

  if (ckan.ok && ckan.res) {
    try {
      const { result } = (await ckan.res.json()) as {
        result: { resources: { url: string; name?: string; format?: string; last_modified?: string; created?: string; size?: number }[] };
      };
      latest =
        result.resources
          .filter((r) => r.url.toLowerCase().endsWith(".zip") || r.format?.toLowerCase() === "zip")
          .map((r) => ({ name: r.name, url: r.url, when: r.last_modified ?? r.created ?? "", size: r.size }))
          .sort((a, b) => b.when.localeCompare(a.when))[0] ?? null;
      ckan.detail += ` · ${result.resources.length} archivos publicados`;
    } catch (error) {
      ckan.detail += ` · respuesta ilegible: ${(error as Error).message}`;
    }
  }

  if (latest) {
    const file = await probe(`Archivo del día (${latest.name ?? "zip"})`, latest.url, "HEAD");
    const length = file.res?.headers.get("content-length");
    if (length) file.detail += ` · ${formatBytes(Number(length))}`;
    else if (latest.size) file.detail += ` · ${formatBytes(latest.size)} (según el portal)`;
    probes.push(file);
  }

  const neonRegion = process.env.DATABASE_URL?.match(/\.([a-z]{2}-[a-z]+-\d)\./)?.[1] ?? "desconocida";

  return (
    <>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Servidor de Vercel: región <strong>{process.env.VERCEL_REGION ?? "local"}</strong> · Base de datos (Neon):{" "}
        <strong>{neonRegion}</strong>
      </p>
      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {probes.map((p) => (
          <li key={p.name} className="flex items-start gap-3 p-3 text-sm">
            <span aria-hidden>{p.ok ? "✅" : "❌"}</span>
            <div className="min-w-0">
              <p className="font-medium">{p.name}</p>
              <p className="break-words text-neutral-500">
                {p.detail} · {p.ms} ms
              </p>
            </div>
          </li>
        ))}
      </ul>
      {latest && (
        <p className="break-all text-xs text-neutral-500">
          Último archivo: {latest.when} · {latest.url}
        </p>
      )}
    </>
  );
}
