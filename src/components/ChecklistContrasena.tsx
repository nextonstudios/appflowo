import { useTranslation } from "react-i18next";
import { evaluarContrasena, type RequisitosContrasena } from "../lib/contrasena";

interface Props {
  password: string;
}

const REQUISITOS: { key: keyof RequisitosContrasena; texto: string }[] = [
  { key: "longitud", texto: "checklist.longitud" },
  { key: "mayuscula", texto: "checklist.mayuscula" },
  { key: "minuscula", texto: "checklist.minuscula" },
  { key: "numero", texto: "checklist.numero" },
  { key: "especial", texto: "checklist.especial" },
];

export default function ChecklistContrasena({ password }: Props) {
  const { t } = useTranslation();
  const r = evaluarContrasena(password);
  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {REQUISITOS.map(({ key, texto }) => {
        const cumplido = r[key];
        return (
          <div key={key} className="flex items-center gap-2">
            <span className={"flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold transition-colors " + (cumplido ? "bg-accent/15 text-accent" : "bg-canvas border border-edge text-muted/40")}>
              ✓
            </span>
            <span className={"text-xs transition-colors " + (cumplido ? "text-primary" : "text-muted")}>{t(texto)}</span>
          </div>
        );
      })}
    </div>
  );
}
