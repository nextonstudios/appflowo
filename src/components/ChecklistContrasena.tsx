import { evaluarContrasena, type RequisitosContrasena } from "../lib/contrasena";

interface Props {
  password: string;
}

const REQUISITOS: { key: keyof RequisitosContrasena; texto: string }[] = [
  { key: "longitud", texto: "Mínimo 8 caracteres" },
  { key: "mayuscula", texto: "Una mayúscula (A-Z)" },
  { key: "minuscula", texto: "Una minúscula (a-z)" },
  { key: "numero", texto: "Un número (0-9)" },
  { key: "especial", texto: "Un carácter especial (!@#$...)" },
];

export default function ChecklistContrasena({ password }: Props) {
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
            <span className={"text-xs transition-colors " + (cumplido ? "text-primary" : "text-muted")}>{texto}</span>
          </div>
        );
      })}
    </div>
  );
}
