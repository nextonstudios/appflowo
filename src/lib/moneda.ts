const SIMBOLOS: Record<string, string> = {
  USD: "$",
  COP: "$",
  EUR: "€",
  MXN: "$",
};

const LOCALES: Record<string, string> = {
  USD: "en-US",
  COP: "es-CO",
  EUR: "es-ES",
  MXN: "es-MX",
};

const SIN_DECIMALES = new Set(["COP", "EUR"]);

export function formatearMoneda(monto: number | string, moneda = "USD"): string {
  const numero = typeof monto === "string" ? Number(monto) : monto;
  if (!isFinite(numero)) return moneda + " 0";
  const simbolo = SIMBOLOS[moneda] || "$";
  const locale = LOCALES[moneda] || "en-US";
  const texto = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: SIN_DECIMALES.has(moneda) ? 0 : 2,
  }).format(numero);
  return simbolo + texto;
}
