// Lectura de los CSV de SEPA: separados por "|", con encabezado. Los nombres de columna
// se buscan por candidatos para tolerar cambios de formato entre versiones.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type Row = (name: string) => string | null;

const normalize = (h: string) =>
  h.replace(/^﻿/, "").replace(/^"|"$/g, "").trim().toLowerCase();

export async function* readCsv(
  file: string,
  columns: Record<string, string[]>,
  required: string[],
): AsyncGenerator<Row> {
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  let index: Record<string, number> | null = null;
  let minWidth = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split("|").map((c) => c.replace(/^"|"$/g, "").trim());

    if (!index) {
      const headers = cells.map(normalize);
      index = {};
      for (const [key, candidates] of Object.entries(columns)) {
        // Los candidatos van en orden de preferencia.
        const i = candidates.map((c) => headers.indexOf(c)).find((j) => j >= 0);
        if (i !== undefined) index[key] = i;
      }
      const missing = required.filter((k) => !(k in index!));
      if (missing.length) {
        throw new Error(`${file}: faltan columnas ${missing.join(", ")}. Encabezados: ${headers.join(" | ")}`);
      }
      minWidth = Math.max(...required.map((k) => index![k])) + 1;
      continue;
    }

    // Saltea renglones rotos y el pie "Última actualización: ...". Tolera columnas
    // vacías de menos al final.
    if (cells.length < minWidth) continue;
    const idx = index;
    yield (name) => {
      const i = idx[name];
      const v = i === undefined ? undefined : cells[i];
      return v ? v : null;
    };
  }
}

export function toNumber(value: string | null): number | null {
  if (!value) return null;
  let v = value.replace(/\s|\$/g, "");
  if (v.includes(",") && !v.includes(".")) v = v.replace(",", ".");
  else if (v.includes(",") && v.includes(".")) v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Los ids de sucursal vienen a veces con ceros a la izquierda ("004").
export const idPart = (v: string | null) => String(Number(v ?? "") || v || "");

export const searchText = (...parts: (string | null | undefined)[]) =>
  parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
