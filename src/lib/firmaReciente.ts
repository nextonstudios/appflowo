const recientes = new Set<string>();
const TIEMPO = 5000;

export function marcarFirmaReciente(id: string) {
  recientes.add(id);
  window.setTimeout(() => recientes.delete(id), TIEMPO);
}

export function esFirmaReciente(id: string) {
  return recientes.has(id);
}
