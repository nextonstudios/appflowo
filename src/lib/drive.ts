import { supabase } from "./supabase";

// ─── Token Management ────────────────────────────────────────────────────────

async function refreshAccessToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!data.access_token) return null;

    // Guardar el nuevo access_token en Supabase
    await supabase
      .from("integraciones")
      .update({
        access_token: data.access_token,
        // Google devuelve un nuevo expiry — guardamos para futuras optimizaciones
        ...(data.expires_in && {
          token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        }),
      })
      .eq("user_id", userId)
      .eq("proveedor", "google_drive");

    return data.access_token;
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("integraciones")
    .select("access_token, refresh_token, token_expiry")
    .eq("user_id", user.id)
    .eq("proveedor", "google_drive")
    .single();

  if (!data) return null;

  // Si tenemos expiry guardado y el token vence en menos de 5 minutos → refrescar ya
  const expiresAt = data.token_expiry ? new Date(data.token_expiry).getTime() : null;
  const nearlyExpired = expiresAt ? Date.now() > expiresAt - 5 * 60 * 1000 : false;

  if (nearlyExpired && data.refresh_token) {
    const newToken = await refreshAccessToken(user.id, data.refresh_token);
    if (newToken) return newToken;
  }

  return data.access_token || null;
}

// Llama a Drive con refresh automático en caso de 401
async function driveRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("No hay token de Google Drive");

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...options.headers,
    },
  });

  // Token expirado inesperadamente → refrescar y reintentar una vez
  if (res.status === 401) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const { data: integracion } = await supabase
      .from("integraciones")
      .select("refresh_token")
      .eq("user_id", user.id)
      .eq("proveedor", "google_drive")
      .single();

    if (!integracion?.refresh_token) throw new Error("No hay refresh_token disponible");

    const newToken = await refreshAccessToken(user.id, integracion.refresh_token);
    if (!newToken) throw new Error("No se pudo refrescar el token");

    return fetch(url, {
      ...options,
      headers: {
        Authorization: "Bearer " + newToken,
        ...options.headers,
      },
    });
  }

  return res;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CarpetaDrive {
  id: string;
  nombre: string;
  url: string;
}

// ─── Funciones públicas ───────────────────────────────────────────────────────

export async function tieneDriveConectado(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("integraciones")
    .select("id")
    .eq("user_id", user.id)
    .eq("proveedor", "google_drive")
    .single();
  return !!data;
}

export async function buscarCarpeta(nombre: string, parentId?: string): Promise<CarpetaDrive[]> {
  const query = parentId
    ? "mimeType='application/vnd.google-apps.folder' and name='" + nombre.replace(/'/g, "\\'") + "' and '" + parentId + "' in parents and trashed=false"
    : "mimeType='application/vnd.google-apps.folder' and name='" + nombre.replace(/'/g, "\\'") + "' and 'root' in parents and trashed=false";

  try {
    const res = await driveRequest(
      "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(query) + "&fields=files(id,name)"
    );
    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      nombre: f.name,
      url: "https://drive.google.com/drive/folders/" + f.id,
    }));
  } catch {
    return [];
  }
}

export async function crearCarpeta(nombre: string, parentId?: string): Promise<CarpetaDrive | null> {
  const body: any = {
    name: nombre,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];

  try {
    const res = await driveRequest("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.id) return null;
    return {
      id: data.id,
      nombre: data.name,
      url: "https://drive.google.com/drive/folders/" + data.id,
    };
  } catch {
    return null;
  }
}