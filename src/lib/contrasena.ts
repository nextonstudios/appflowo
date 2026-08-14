export interface RequisitosContrasena {
  longitud: boolean;
  mayuscula: boolean;
  minuscula: boolean;
  numero: boolean;
  especial: boolean;
}

export function evaluarContrasena(pass: string): RequisitosContrasena {
  return {
    longitud: pass.length >= 8,
    mayuscula: /[A-Z]/.test(pass),
    minuscula: /[a-z]/.test(pass),
    numero: /[0-9]/.test(pass),
    especial: /[^A-Za-z0-9]/.test(pass),
  };
}

export function contrasenaValida(pass: string): boolean {
  const r = evaluarContrasena(pass);
  return r.longitud && r.mayuscula && r.minuscula && r.numero && r.especial;
}
