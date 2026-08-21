import { useState, useEffect } from "react";
import { check, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateState {
  disponible: boolean;
  version: string | null;
  descargando: boolean;
  progreso: number;
  listo: boolean;
  error: string | null;
  changelog: string | null;
}

const estadoInicial: UpdateState = {
  disponible: false,
  version: null,
  descargando: false,
  progreso: 0,
  listo: false,
  error: null,
  changelog: null,
};

export function useUpdater() {
  const [estado, setEstado] = useState<UpdateState>(estadoInicial);
  const [updateRef, setUpdateRef] = useState<Update | null>(null);

  const verificar = async () => {
    try {
      setEstado((prev) => ({ ...prev, error: null }));
      const update = await check();
      if (update) {
        setUpdateRef(update);
        setEstado((prev) => ({
          ...prev,
          disponible: true,
          version: update.version,
          changelog: update.body || null,
        }));
      } else {
        setEstado((prev) => ({ ...prev, disponible: false, version: null, changelog: null }));
      }
    } catch (e) {
      console.error("Error updater:", e);
      setEstado((prev) => ({ ...prev, error: String(e) }));
    }
  };

  const descargar = async () => {
    if (!updateRef) return;
    try {
      setEstado((prev) => ({ ...prev, descargando: true, progreso: 0, error: null }));

      let totalBytes = 0;
      await updateRef.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          const downloaded = event.data.chunkLength;
          const pct = totalBytes > 0 ? Math.round((downloaded / totalBytes) * 100) : 0;
          setEstado((prev) => ({ ...prev, progreso: pct }));
        }
      });

      setEstado((prev) => ({ ...prev, descargando: false, listo: true, progreso: 100 }));
    } catch (e) {
      console.error("Error downloading update:", e);
      setEstado((prev) => ({ ...prev, descargando: false, error: String(e) }));
    }
  };

  const reiniciar = async () => {
    try {
      await relaunch();
    } catch (e) {
      console.error("Error relaunching:", e);
    }
  };

  useEffect(() => {
    verificar();
  }, []);

  return { estado, verificar, reiniciar, descargar };
}
