import { supabase } from "./supabase";

async function getAccessToken(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("integraciones")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("proveedor", "google_drive")
    .single();

  return data?.access_token || null;
}

export interface CarpetaDrive {
  id: string;
  nombre: string;
  url: string;
}

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
  const token = await getAccessToken();
  if (!token) return [];

  const query = parentId
    ? "mimeType='application/vnd.google-apps.folder' and name='" + nombre.replace(/'/g, "\\'") + "' and '" + parentId + "' in parents and trashed=false"
    : "mimeType='application/vnd.google-apps.folder' and name='" + nombre.replace(/'/g, "\\'") + "' and 'root' in parents and trashed=false";

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(query) + "&fields=files(id,name)",
    { headers: { Authorization: "Bearer " + token } }
  );

  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    nombre: f.name,
    url: "https://drive.google.com/drive/folders/" + f.id,
  }));
}

export async function crearCarpeta(nombre: string, parentId?: string): Promise<CarpetaDrive | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const body: any = {
    name: nombre,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentId) body.parents = [parentId];

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.id) return null;

  return {
    id: data.id,
    nombre: data.name,
    url: "https://drive.google.com/drive/folders/" + data.id,
  };
}