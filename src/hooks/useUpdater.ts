import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useEffect } from 'react';

export interface UpdateState {
  disponible: boolean;
  version: string | null;
  descargando: boolean;
  progreso: number;
  listo: boolean;
  error: string | null;
}

const estadoInicial: UpdateState = {
  disponible: false,
  version: null,
  descargando: false,
  progreso: 0,
  listo: false,
  error: null,
};

let updateInstancia: Awaited<ReturnType<typeof check>> | null = null;

export function useUpdater() {
  const [estado, setEstado] = useState<UpdateState>(estadoInicial);

  const descargar = async () => {
    if (!updateInstancia) return;

    setEstado(prev => ({ ...prev, descargando: true, progreso: 0 }));

    try {
      let descargado = 0;
      let total = 0;

      await updateInstancia.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          descargado += event.data.chunkLength;
          const porcentaje = total > 0 ? Math.round((descargado / total) * 100) : 0;
          setEstado(prev => ({ ...prev, progreso: porcentaje }));
        } else if (event.event === 'Finished') {
          setEstado(prev => ({
            ...prev,
            descargando: false,
            listo: true,
            progreso: 100,
          }));
        }
      });
    } catch (e) {
      setEstado(prev => ({
        ...prev,
        descargando: false,
        error: 'Error al descargar la actualización',
      }));
    }
  };

  const verificar = async () => {
    try {
      setEstado(prev => ({ ...prev, error: null }));
      const update = await check();

      if (update?.available) {
        updateInstancia = update;
        setEstado(prev => ({
          ...prev,
          disponible: true,
          version: update.version,
        }));

        // Descarga automática en segundo plano
        descargar();
      } else {
        setEstado(prev => ({ ...prev, disponible: false, version: null }));
      }
    } catch (e) {
      console.error('Error updater:', e);
    }
  };

  const reiniciar = async () => {
    await relaunch();
  };

  // Verificar al montar
  useEffect(() => {
    verificar();
  }, []);

  return { estado, verificar, reiniciar };
}