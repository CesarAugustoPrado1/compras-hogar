// Descarga el último archivo diario de Precios Claros (base SEPA) desde el portal de
// datos abiertos (CKAN). Uso: tsx scripts/sepa/download.ts <archivo.zip>
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CKAN = process.env.SEPA_CKAN_URL ?? "https://datos.produccion.gob.ar";
const DATASET = process.env.SEPA_DATASET ?? "sepa-precios";

type Resource = { url: string; name?: string; format?: string; last_modified?: string; created?: string };

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Uso: download.ts <archivo.zip>");

  const res = await fetch(`${CKAN}/api/3/action/package_show?id=${DATASET}`);
  if (!res.ok) throw new Error(`CKAN respondió ${res.status}`);
  const { result } = (await res.json()) as { result: { resources: Resource[] } };

  const zips = result.resources
    .filter((r) => r.url.toLowerCase().endsWith(".zip") || r.format?.toLowerCase() === "zip")
    .map((r) => ({ ...r, when: r.last_modified ?? r.created ?? "" }))
    .sort((a, b) => b.when.localeCompare(a.when));
  if (!zips.length) throw new Error("No se encontraron archivos .zip en el dataset");

  const latest = zips[0];
  console.log(`Descargando "${latest.name}" (${latest.when}): ${latest.url}`);
  const file = await fetch(latest.url);
  if (!file.ok || !file.body) throw new Error(`Descarga falló: ${file.status}`);
  await pipeline(Readable.fromWeb(file.body as never), createWriteStream(out));
  console.log(`source=${latest.url}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
