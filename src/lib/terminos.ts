import type { TFunction } from "i18next";

export interface Politicas {
  formaPago: string;
  fechasEntrega: string;
  validez: string;
  otras: string;
}

export function politicasPorDefecto(t: TFunction): Politicas {
  return {
    formaPago: t("cotizaciones.politicas.defecto.formaPago"),
    fechasEntrega: t("cotizaciones.politicas.defecto.fechasEntrega"),
    validez: t("cotizaciones.politicas.defecto.validez"),
    otras: "",
  };
}

export function construirPoliticas(p: Politicas, t: TFunction): string {
  const lineas: string[] = [];
  if (p.formaPago.trim()) lineas.push(t("cotizaciones.politicas.prefijo.formaPago") + p.formaPago.trim());
  if (p.fechasEntrega.trim()) lineas.push(t("cotizaciones.politicas.prefijo.fechasEntrega") + p.fechasEntrega.trim());
  if (p.validez.trim()) lineas.push(t("cotizaciones.politicas.prefijo.validez") + p.validez.trim());
  if (p.otras.trim()) lineas.push(p.otras.trim());
  return lineas.join("\n");
}
