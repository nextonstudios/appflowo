import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getVersion } from '@tauri-apps/api/app';

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

const GIST_URL = 'https://gist.githubusercontent.com/nextonstudios/f40304340ffbfe1411d22db21d135d9c/raw/gistfile1.txt';

export function useUpdater() {
  const [estado, setEstado] = useState<UpdateState>(estadoInicial);

  const verificar = async () => {
    try {
      const versionActual = await getVersion();
      const response = await fetch(GIST_URL + '?t=' + Date.now());
      const data = await response.json();

      const partes = (v: string) => v.split('.').map(Number);
      const [ma, mi, pa] = partes(versionActual);
      const [ma2, mi2, pa2] = partes(data.version);

      const hayUpdate =
        ma2 > ma ||
        (ma2 === ma && mi2 > mi) ||
        (ma2 === ma && mi2 === mi && pa2 > pa);

      if (hayUpdate) {
        setEstado(prev => ({
          ...prev,
          disponible: true,
          version: data.version,
        }));
      } else {
        setEstado(prev => ({ ...prev, disponible: false, version: null }));
      }
    } catch (e) {
      console.error('Error updater:', e);
    }
  };

  const descargar = async () => {
    await openUrl('https://appflowo.com');
  };

  const reiniciar = async () => {};

  useEffect(() => {
    verificar();
  }, []);

  return { estado, verificar, reiniciar, descargar };
}