import { supabase } from "./supabase";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = "Files.ReadWrite offline_access User.Read";

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

export function iniciarFlujoOneDrive(): Promise<{ authUrl: string; verifier: string }> {
  const verifier = generateCodeVerifier();
  return generateCodeChallenge(verifier).then((challenge) => {
    const clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID;
    const redirectUri = "flowo://oauth/onedrive";
    const authUrl =
      AUTH_BASE + "/authorize" +
      "?client_id=" + clientId +
      "&response_type=code" +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&scope=" + encodeURIComponent(SCOPES) +
      "&code_challenge=" + challenge +
      "&code_challenge_method=S256" +
      "&response_mode=query";
    return { authUrl, verifier };
  });
}

// ─── Token Management ────────────────────────────────────────────────────────

async function refreshOneDriveToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(AUTH_BASE + "/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: import.meta.env.VITE_ONEDRIVE_CLIENT_ID,
        grant_type: "refresh_token",
        scope: SCOPES,
      }),
    });

    const data = await res.json();
    if (!data.access_token) return null;

    await supabase
      .from("integraciones")
      .update({ access_token: data.access_token })
      .eq("user_id", userId)
      .eq("proveedor", "onedrive");

    return data.access_token;
  } catch {
    return null;
  }
}

async function getOneDriveAccessToken(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("integraciones")
    .select("access_token, refresh_token")
    .eq("user_id", user.id)
    .eq("proveedor", "onedrive")
    .single();

  if (!data) return null;
  return data.access_token || null;
}

async function onedriveRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getOneDriveAccessToken();
  if (!token) throw new Error("No hay token de OneDrive");

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
      .eq("proveedor", "onedrive")
      .single();

    if (!integracion?.refresh_token) throw new Error("No hay refresh_token disponible");

    const newToken = await refreshOneDriveToken(user.id, integracion.refresh_token);
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

export interface CarpetaOneDrive {
  path: string;
  nombre: string;
  url: string;
}

// ─── Public Functions ────────────────────────────────────────────────────────

export async function tieneOneDriveConectado(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("integraciones")
    .select("id")
    .eq("user_id", user.id)
    .eq("proveedor", "onedrive")
    .single();
  return !!data;
}

export async function buscarCarpeta(nombre: string): Promise<CarpetaOneDrive[]> {
  try {
    const res = await onedriveRequest(
      GRAPH_BASE + "/me/drive/root/search(q='" + encodeURIComponent(nombre) + "')"
    );
    const data = await res.json();
    const items = data.value || [];
    return items
      .filter((item: any) => item.folder && item.name === nombre)
      .map((item: any) => ({
        path: item.parentReference?.path
          ? item.parentReference.path + "/" + item.name
          : "/" + item.name,
        nombre: item.name,
        url: item.webUrl || "",
      }));
  } catch {
    return [];
  }
}

export async function crearCarpeta(nombre: string): Promise<CarpetaOneDrive | null> {
  try {
    const res = await onedriveRequest(
      GRAPH_BASE + "/me/drive/root:/" + encodeURIComponent(nombre),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nombre,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      }
    );
    const item = await res.json();
    if (!item.id) return null;
    return {
      path: item.parentReference?.path
        ? item.parentReference.path + "/" + item.name
        : "/" + item.name,
      nombre: item.name,
      url: item.webUrl || "",
    };
  } catch {
    return null;
  }
}

export async function handleOneDriveCallback(code: string, codeVerifier: string): Promise<boolean> {
  try {
    const tokenRes = await fetch(AUTH_BASE + "/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: import.meta.env.VITE_ONEDRIVE_CLIENT_ID,
        redirect_uri: "flowo://oauth/onedrive",
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
        scope: SCOPES,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return false;

    const userRes = await fetch(GRAPH_BASE + "/me", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const userData = await userRes.json();
    const email = userData.mail || userData.userPrincipalName || "";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("integraciones").upsert({
      user_id: user.id,
      proveedor: "onedrive",
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
