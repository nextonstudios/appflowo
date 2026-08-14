export interface Politicas {
  formaPago: string;
  fechasEntrega: string;
  validez: string;
  otras: string;
}

export const POLITICAS_POR_DEFECTO: Politicas = {
  formaPago: "Anticipo del 50% al iniciar el trabajo y el saldo restante a la entrega.",
  fechasEntrega: "Los plazos de entrega se cuentan a partir de la aprobación de la cotización y del recibo del pago correspondiente.",
  validez: "Esta cotización es válida por 15 días a partir de su fecha de emisión.",
  otras: "",
};

export function construirPoliticas(p: Politicas): string {
  const lineas: string[] = [];
  if (p.formaPago.trim()) lineas.push("Forma de pago: " + p.formaPago.trim());
  if (p.fechasEntrega.trim()) lineas.push("Fecha de entrega: " + p.fechasEntrega.trim());
  if (p.validez.trim()) lineas.push("Validez: " + p.validez.trim());
  if (p.otras.trim()) lineas.push(p.otras.trim());
  return lineas.join("\n");
}
