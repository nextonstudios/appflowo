import { supabase } from "./supabase";

// ─── PKCE Helpers ────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function iniciarFlujoDropbox(): Promise<{ authUrl: string; verifier: string }> {
  const verifier = generateCodeVerifier();
  return generateCodeChallenge(verifier).then((challenge) => {
    const clientId = import.meta.env.VITE_DROPBOX_CLIENT_KEY;
    const redirectUri = "flowo://oauth/dropbox";
    const authUrl =
      "https://www.dropbox.com/oauth2/authorize" +
      "?client_id=" + clientId +
      "&response_type=code" +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&code_challenge=" + challenge +
      "&code_challenge_method=S256";
    return { authUrl, verifier };
  });
}

// ─── Token Management ────────────────────────────────────────────────────────

async function refreshDropboxToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: import.meta.env.VITE_DROPBOX_CLIENT_KEY,
        client_secret: import.meta.env.VITE_DROPBOX_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!data.access_token) return null;

    await supabase
      .from("integraciones")
      .update({ access_token: data.access_token })
      .eq("user_id", userId)
      .eq("proveedor", "dropbox");

    return data.access_token;
  } catch {
    return null;
  }
}

async function getDropboxAccessToken(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("integraciones")
    .select("access_token, refresh_token")
    .eq("user_id", user.id)
    .eq("proveedor", "dropbox")
    .single();

  if (!data) return null;
  return data.access_token || null;
}

async function dropboxRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getDropboxAccessToken();
  if (!token) throw new Error("No hay token de Dropbox");

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const { data: integracion } = await supabase
      .from("integraciones")
      .select("refresh_token")
      .eq("user_id", user.id)
      .eq("proveedor", "dropbox")
      .single();

    if (!integracion?.refresh_token) throw new Error("No hay refresh_token disponible");

    const newToken = await refreshDropboxToken(user.id, integracion.refresh_token);
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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CarpetaDropbox {
  path: string;
  nombre: string;
  url: string;
}

// ─── Public Functions ────────────────────────────────────────────────────────

export async function tieneDropboxConectado(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("integraciones")
    .select("id")
    .eq("user_id", user.id)
    .eq("proveedor", "dropbox")
    .single();
  return !!data;
}

export async function buscarCarpeta(nombre: string): Promise<CarpetaDropbox[]> {
  try {
    const res = await dropboxRequest("https://api.dropboxapi.com/2/files/search_v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: nombre,
        options: {
          filename_only: true,
          max_results: 20,
        },
      }),
    });
    const data = await res.json();
    const matches = data.matches || [];
    return matches
      .filter((m: any) => m.metadata?.[".tag"] === "folder" && m.metadata?.name === nombre)
      .map((m: any) => ({
        path: m.metadata.path_display,
        nombre: m.metadata.name,
        url: "https://www.dropbox.com/home" + m.metadata.path_display,
      }));
  } catch {
    return [];
  }
}

export async function crearCarpeta(nombre: string): Promise<CarpetaDropbox | null> {
  try {
    const res = await dropboxRequest("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/" + nombre }),
    });
    const data = await res.json();
    const meta = data.metadata;
    if (!meta) return null;
    return {
      path: meta.path_display,
      nombre: meta.name,
      url: "https://www.dropbox.com/home" + meta.path_display,
    };
  } catch {
    return null;
  }
}

export async function handleDropboxCallback(code: string, codeVerifier: string): Promise<boolean> {
  try {
    const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: import.meta.env.VITE_DROPBOX_CLIENT_KEY,
        client_secret: import.meta.env.VITE_DROPBOX_CLIENT_SECRET,
        redirect_uri: "flowo://oauth/dropbox",
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return false;

    const accountRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokenData.access_token,
        "Content-Type": "application/json",
      },
    });

    const accountData = await accountRes.json();
    const email = accountData.email || "";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("integraciones").upsert({
      user_id: user.id,
      proveedor: "dropbox",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      cuenta_email: email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,proveedor" });

    return !error;
  } catch {
    return false;
  }
}
