// Valida un código de barras GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) por su dígito verificador.
// Sirve para no confundir un EAN con el código interno que imprimen algunos súpers.
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
