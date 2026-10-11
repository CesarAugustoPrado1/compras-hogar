// Descarga el último archivo diario de Precios Claros (base SEPA) desde el portal de
// datos abiertos (CKAN). Uso: tsx scripts/sepa/download.ts <archivo.zip>
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Catálogos donde se publica la base SEPA, en orden de preferencia. El portal de
// Desarrollo Productivo a veces está caído; datos.gob.ar tiene una ficha del mismo dataset.
const CATALOGS = [
  { ckan: process.env.SEPA_CKAN_URL ?? "https://datos.produccion.gob.ar", dataset: process.env.SEPA_DATASET ?? "sepa-precios" },
  { ckan: "https://datos.gob.ar", dataset: "produccion-precios-claros---base-sepa" },
];

const ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// El portal de datos abiertos a veces no responde: se reintenta con esperas crecientes.
async function fetchWithRetry(url: string, timeoutMs: number, attempts = ATTEMPTS): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      const reason = error instanceof Error ? `${error.message}${error.cause ? ` (${String(error.cause)})` : ""}` : String(error);
      if (attempt >= attempts) throw new Error(`No se pudo acceder a ${url} tras ${attempts} intentos: ${reason}`);
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

  // Lista de archivos: se prueba cada catálogo; los reintentos largos van en el último.
  let resources: Resource[] | null = null;
  for (const [i, { ckan, dataset }] of CATALOGS.entries()) {
    try {
      const res = await fetchWithRetry(
        `${ckan}/api/3/action/package_show?id=${dataset}`,
        60_000,
        i === CATALOGS.length - 1 ? ATTEMPTS : 2,
      );
      resources = ((await res.json()) as { result: { resources: Resource[] } }).result.resources;
      console.log(`Catálogo: ${ckan}`);
      break;
    } catch (error) {
      console.log(`Catálogo ${ckan} no disponible: ${(error as Error).message}`);
    }
  }
  if (!resources) throw new Error("Ningún catálogo de Precios Claros respondió");

  const zips = resources
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
