import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

export const NOVEDADES_VERSION = "1.2.2";

export function debeMostrarNovedades(tutorialCompletado: boolean): boolean {
  if (!tutorialCompletado) return false;
  return localStorage.getItem("flowo_novedades_vista") !== NOVEDADES_VERSION;
}

export function marcarNovedadesVista() {
  localStorage.setItem("flowo_novedades_vista", NOVEDADES_VERSION);
}

interface ItemNovedad {
  emoji: string;
  titulo: string;
  descripcion: string;
}

function getItems(t: TFunction): ItemNovedad[] {
  return [
  {
    emoji: "🌐",
    titulo: t("novedades.items.0.titulo"),
    descripcion: t("novedades.items.0.desc"),
  },
  {
    emoji: "☁️",
    titulo: t("novedades.items.1.titulo"),
    descripcion: t("novedades.items.1.desc"),
  },
  {
    emoji: "📄",
    titulo: t("novedades.items.2.titulo"),
    descripcion: t("novedades.items.2.desc"),
  },
  {
    emoji: "✍️",
    titulo: t("novedades.items.3.titulo"),
    descripcion: t("novedades.items.3.desc"),
  },
  {
    emoji: "🎨",
    titulo: t("novedades.items.4.titulo"),
    descripcion: t("novedades.items.4.desc"),
  },
];
}

interface NovedadesProps {
  onTerminar: () => void;
}

export default function Novedades({ onTerminar }: NovedadesProps) {
  const { t } = useTranslation();
  const novedades = getItems(t);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[90vw]">
        <div className="bg-canvas border border-edge rounded-2xl p-8 shadow-2xl">

          <div className="mb-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4 bg-accent/10">
              🎉
            </div>
            <h2 className="text-primary text-xl font-bold mb-1">{t("novedades.titulo")}</h2>
            <div className="h-0.5 w-10 rounded-full mb-4 bg-accent" />
            <p className="text-muted2 text-sm">{t("novedades.subtitulo")}</p>
          </div>

          <div className="space-y-4 mb-8">
            {novedades.map((n, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xl flex-shrink-0">{n.emoji}</span>
                <div>
                  <p className="text-primary text-sm font-medium">{n.titulo}</p>
                  <p className="text-muted2 text-sm mt-0.5 leading-relaxed">{n.descripcion}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onTerminar}
            className="w-full bg-accent text-onaccent font-medium px-6 py-3 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            {t("novedades.entendido")}
          </button>

        </div>
      </div>
    </div>
  );
}
