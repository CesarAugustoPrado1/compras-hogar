// Descarga el último archivo diario de Precios Claros (base SEPA) desde el portal de
// datos abiertos (CKAN). Uso: tsx scripts/sepa/download.ts <archivo.zip>
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CKAN = process.env.SEPA_CKAN_URL ?? "https://datos.produccion.gob.ar";
const DATASET = process.env.SEPA_DATASET ?? "sepa-precios";

const ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// El portal de datos abiertos a veces no responde: se reintenta con esperas crecientes.
async function fetchWithRetry(url: string, timeoutMs: number): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      const reason = error instanceof Error ? `${error.message}${error.cause ? ` (${String(error.cause)})` : ""}` : String(error);
      if (attempt >= ATTEMPTS) throw new Error(`No se pudo acceder a ${url} tras ${ATTEMPTS} intentos: ${reason}`);
      const wait = attempt * 30_000;
      console.log(`Intento ${attempt} falló (${reason}); reintento en ${wait / 1000} s`);
      await sleep(wait);
    }
  }
}

type Resource = { url: string; name?: string; format?: string; last_modified?: string; created?: string };

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Uso: download.ts <archivo.zip>");

  const res = await fetchWithRetry(`${CKAN}/api/3/action/package_show?id=${DATASET}`, 60_000);
  const { result } = (await res.json()) as { result: { resources: Resource[] } };

  const zips = result.resources
    .filter((r) => r.url.toLowerCase().endsWith(".zip") || r.format?.toLowerCase() === "zip")
    .map((r) => ({ ...r, when: r.last_modified ?? r.created ?? "" }))
    .sort((a, b) => b.when.localeCompare(a.when));
  if (!zips.length) throw new Error("No se encontraron archivos .zip en el dataset");

  const latest = zips[0];
  console.log(`Descargando "${latest.name}" (${latest.when}): ${latest.url}`);
  const file = await fetchWithRetry(latest.url, 20 * 60_000);
  if (!file.body) throw new Error("Descarga vacía");
  await pipeline(Readable.fromWeb(file.body as never), createWriteStream(out));
  console.log(`source=${latest.url}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
