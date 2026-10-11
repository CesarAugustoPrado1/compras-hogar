// Precios de lista de la API de Claude, en dólares por millón de tokens.
// Si Anthropic cambia precios o se usa otro modelo, actualizar acá.
// Escritura de caché: 1,25× la entrada (caché de 5 minutos).
type Price = { input: number; output: number; cacheRead: number };

const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export type TokenUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

// El modelo informado puede traer sufijos (fecha, contexto): se busca por prefijo.
function priceFor(model: string): Price | null {
  const key = Object.keys(PRICES)
    .filter((k) => model === k || model.startsWith(`${k}-`) || model.startsWith(`${k}[`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : null;
}

export function costUsd(usage: TokenUsage): number | null {
  const price = priceFor(usage.model);
  if (!price) return null;
  return (
    (usage.inputTokens * price.input +
      usage.cacheWriteTokens * price.input * 1.25 +
      usage.cacheReadTokens * price.cacheRead +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
