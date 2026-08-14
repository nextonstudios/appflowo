import { supabase } from "./supabase";

export interface ContratoClienteInfo {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_correo: string | null;
}

function normalizarTel(tel: string) {
  return (tel || "").replace(/[^0-9]/g, "");
}

export async function buscarClienteExistente(
  nombre: string,
  telefono: string | null,
  email: string | null
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email")
    .eq("user_id", user.id);

  const lista = (data || []) as {
    id: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
  }[];

  const nombreNorm = (nombre || "").trim().toLowerCase();
  const telNorm = normalizarTel(telefono || "");
  const emailNorm = (email || "").trim().toLowerCase();

  for (const c of lista) {
    if (telNorm && c.telefono && normalizarTel(c.telefono) === telNorm) return c.id;
    if (emailNorm && c.email && c.email.trim().toLowerCase() === emailNorm) return c.id;
    if (nombreNorm && c.nombre && c.nombre.trim().toLowerCase() === nombreNorm) return c.id;
  }
  return null;
}

export async function contratoRequiereCrearCliente(c: ContratoClienteInfo): Promise<boolean> {
  const existente = await buscarClienteExistente(c.cliente_nombre, c.cliente_telefono, c.cliente_correo);
  return !existente;
}

export async function crearClienteDesdeContrato(c: ContratoClienteInfo): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      user_id: user.id,
      nombre: c.cliente_nombre,
      empresa: "",
      email: c.cliente_correo || "",
      telefono: c.cliente_telefono || "",
      notas: [],
    })
    .select("id")
    .single();

  if (error || !data) return null;
  const clienteId = data.id;

  await supabase.from("portal_tokens").insert({ cliente_id: clienteId });
  await supabase.from("contratos").update({ cliente_id: clienteId }).eq("id", c.id);
  return clienteId;
}
