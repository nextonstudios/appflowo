import { supabase } from "./supabase";

export type RolEquipo = "admin" | "miembro" | "viewer";

export interface Equipo {
  id: string;
  nombre: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  plan_region: string;
  max_miembros: number;
  moneda: string;
  owner_id: string;
}

export interface MiembroEquipo {
  user_id: string;
  rol: RolEquipo;
  custom_role_id: string | null;
  nombre: string;
  email: string | null;
  joined_at: string;
}

export interface InvitacionPendiente {
  id: string;
  equipo_id: string;
  rol: string;
  token: string;
  equipo_nombre: string;
  equipo_logo: string | null;
  invited_by_nombre: string | null;
  expires_at: string;
}

export interface InvitacionCreada {
  id: string;
  email: string;
  rol: RolEquipo;
  token: string;
  expires_at: string;
}

const EQUIPO_ACTIVO_KEY = "flowo_equipo_activo";

// ── Equipos ────────────────────────────────────────────────

export async function crearEquipo(
  nombre: string,
  moneda = "USD",
  region = "global"
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc("crear_equipo", {
    p_nombre: nombre,
    p_moneda: moneda,
    p_region: region,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

export async function misEquipos(): Promise<Equipo[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("equipos")
    .select("id, nombre, slug, logo_url, plan, plan_region, max_miembros, moneda, owner_id")
    .order("created_at", { ascending: true });
  if (error) return [];
  // RLS solo devuelve los equipos donde soy miembro
  return (data || []) as Equipo[];
}

export async function obtenerMiembro(equipoId: string): Promise<MiembroEquipo | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const miembros = await miembrosDeEquipo(equipoId);
  return miembros.find((m) => m.user_id === user.id) ?? null;
}

export async function miembrosDeEquipo(equipoId: string): Promise<MiembroEquipo[]> {
  const { data, error } = await supabase.rpc("_miembros_equipo", {
    p_equipo_id: equipoId,
  });
  if (error || !data) return [];
  return (data as MiembroEquipo[]) ?? [];
}

// ── Miembros ───────────────────────────────────────────────

export async function cambiarRolMiembro(miembroUserId: string, nuevoRol: RolEquipo, equipoId: string): Promise<boolean> {
  const { error } = await supabase
    .from("equipo_miembros")
    .update({ rol: nuevoRol })
    .eq("equipo_id", equipoId)
    .eq("user_id", miembroUserId);
  return !error;
}

export async function eliminarMiembro(miembroUserId: string, equipoId: string): Promise<boolean> {
  const { error } = await supabase
    .from("equipo_miembros")
    .delete()
    .eq("equipo_id", equipoId)
    .eq("user_id", miembroUserId);
  return !error;
}

export async function salirDelEquipo(equipoId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  return eliminarMiembro(user.id, equipoId);
}

// ── Invitaciones ───────────────────────────────────────────

export async function invitarMiembro(
  equipoId: string,
  email: string,
  rol: RolEquipo
): Promise<InvitacionCreada | { error: string }> {
  const emailLimpio = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
    return { error: "email_invalido" };
  }

  // No invitar a alguien que ya es miembro
  const miembros = await miembrosDeEquipo(equipoId);
  const yaMiembro = miembros.find((m) => m.email?.toLowerCase() === emailLimpio);
  if (yaMiembro) return { error: "ya_es_miembro" };

  const { data, error } = await supabase
    .from("equipo_invitaciones")
    .insert({ equipo_id: equipoId, email: emailLimpio, rol })
    .select("id, email, rol, token, expires_at")
    .single();

  if (error) {
    if (error.message?.includes("duplicate")) return { error: "ya_invitado" };
    return { error: "error_creando" };
  }
  return data as InvitacionCreada;
}

export async function invitacionesPendientes(equipoId: string): Promise<InvitacionCreada[]> {
  const { data, error } = await supabase
    .from("equipo_invitaciones")
    .select("id, email, rol, token, expires_at")
    .eq("equipo_id", equipoId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data || []) as InvitacionCreada[];
}

export async function revocarInvitacion(invitacionId: string): Promise<boolean> {
  const { error } = await supabase
    .from("equipo_invitaciones")
    .delete()
    .eq("id", invitacionId);
  return !error;
}

export function enlaceDeInvitacion(token: string): string {
  return `flowo://invite?token=${token}`;
}

export async function enviarEmailInvitacion(params: {
  email: string;
  equipoNombre: string;
  invitadoPor: string;
  rol: RolEquipo;
  enlace: string;
}): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      "https://pvwwfsdlifwiwjiznrku.supabase.co/functions/v1/enviar-invitacion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session?.access_token,
        },
        body: JSON.stringify(params),
      }
    );
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.ok;
  } catch {
    return false;
  }
}

export async function validarInvitacion(token: string): Promise<{
  ok: boolean;
  error?: string;
  data?: any;
}> {
  const { data, error } = await supabase.rpc("_validar_invitacion", {
    p_token: token,
  });
  if (error) return { ok: false, error: "error_validando" };
  if (!data) return { ok: false, error: "invalid_token" };
  if (data.aceptada) return { ok: false, error: "ya_usada" };
  if (data.expirada) return { ok: false, error: "expirada" };
  return { ok: true, data };
}

export async function aceptarInvitacion(token: string): Promise<{
  ok: boolean;
  error?: string;
  equipoId?: string;
}> {
  const { data, error } = await supabase.rpc("_aceptar_invitacion", {
    p_token: token,
  });
  if (error) return { ok: false, error: "error_aceptando" };
  if (!data?.ok) return { ok: false, error: data?.error || "invalid_token" };
  return { ok: true, equipoId: data.equipo_id };
}

// Invitaciones pendientes para MI email (mostrar banner en la app)
export async function misInvitaciones(): Promise<InvitacionPendiente[]> {
  const { data, error } = await supabase.rpc("_mis_invitaciones");
  if (error || !data) return [];
  return (data as InvitacionPendiente[]) ?? [];
}

// ── Ajustes del equipo ─────────────────────────────────────

export async function guardarAjustesEquipo(
  equipoId: string,
  cambios: { nombre?: string; moneda?: string; plan_region?: string; logo_url?: string }
): Promise<boolean> {
  const { error } = await supabase
    .from("equipos")
    .update(cambios)
    .eq("id", equipoId);
  return !error;
}

export async function eliminarEquipo(equipoId: string): Promise<boolean> {
  const { error } = await supabase
    .from("equipos")
    .delete()
    .eq("id", equipoId);
  return !error;
}

export async function contarMiembros(equipoId: string): Promise<number> {
  const { data, error } = await supabase.rpc("_contar_miembros", {
    p_equipo_id: equipoId,
  });
  if (error || data == null) return 0;
  return data as number;
}

// ── Equipo activo (contexto local) ─────────────────────────

export function getEquipoActivoId(): string | null {
  return localStorage.getItem(EQUIPO_ACTIVO_KEY);
}

export function setEquipoActivoId(id: string | null): void {
  if (id) localStorage.setItem(EQUIPO_ACTIVO_KEY, id);
  else localStorage.removeItem(EQUIPO_ACTIVO_KEY);
}

// ── Asignaciones multiples de tareas ───────────────────────

export interface AsignacionTarea {
  tarea_id: string;
  user_id: string;
}

export async function asignacionesDeTareas(tareaIds: string[]): Promise<AsignacionTarea[]> {
  if (tareaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("tarea_asignaciones")
    .select("tarea_id, user_id")
    .in("tarea_id", tareaIds);
  if (error || !data) return [];
  return data as AsignacionTarea[];
}

// ── Avatares de usuarios ───────────────────────────────────

const COLORES_AVATAR = ["#7C5CBF", "#3B82F6", "#F59E0B", "#EC4899", "#1DB8A0"];

export function colorAvatarUsuario(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORES_AVATAR[hash % COLORES_AVATAR.length];
}

export function inicialesUsuario(nombre: string): string {
  const partes = (nombre || "?").trim().split(/\s+/);
  const primera = partes[0]?.charAt(0) || "?";
  const segunda = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (primera + segunda).toUpperCase();
}
