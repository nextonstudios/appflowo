import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import { marcarNovedadesVista } from "./Novedades";

const TUTORIAL_VERSION = 1;

interface Paso {
  id: string;
  tipo: "modal" | "spotlight";
  sidebarItem?: string;
  titulo: string;
  emoji: string;
  descripcion: string[];
  color: string;
}

function getPasos(t: TFunction): Paso[] {
  return [
  {
    id: "bienvenida",
    tipo: "modal",
    titulo: t("tutorial.pasos.bienvenida.titulo"),
    emoji: "👋",
    color: "#1DB8A0",
    descripcion: t("tutorial.pasos.bienvenida.desc", { returnObjects: true }) as string[],
  },
  {
    id: "perfil",
    tipo: "modal",
    titulo: t("tutorial.pasos.perfil.titulo"),
    emoji: "🧑‍💼",
    color: "#7C5CBF",
    descripcion: t("tutorial.pasos.perfil.desc", { returnObjects: true }) as string[],
  },
  {
    id: "clientes",
    tipo: "spotlight",
    sidebarItem: "clientes",
    titulo: t("tutorial.pasos.clientes.titulo"),
    emoji: "👥",
    color: "#1DB8A0",
    descripcion: t("tutorial.pasos.clientes.desc", { returnObjects: true }) as string[],
  },
  {
    id: "cotizaciones",
    tipo: "spotlight",
    sidebarItem: "cotizaciones",
    titulo: t("tutorial.pasos.cotizaciones.titulo"),
    emoji: "📄",
    color: "#F47C5C",
    descripcion: t("tutorial.pasos.cotizaciones.desc", { returnObjects: true }) as string[],
  },
  {
    id: "contratos",
    tipo: "spotlight",
    sidebarItem: "contratos",
    titulo: t("tutorial.pasos.contratos.titulo"),
    emoji: "✍️",
    color: "#7C5CBF",
    descripcion: t("tutorial.pasos.contratos.desc", { returnObjects: true }) as string[],
  },
  {
    id: "proyectos",
    tipo: "spotlight",
    sidebarItem: "proyectos",
    titulo: t("tutorial.pasos.proyectos.titulo"),
    emoji: "📁",
    color: "#7C5CBF",
    descripcion: t("tutorial.pasos.proyectos.desc", { returnObjects: true }) as string[],
  },
  {
    id: "tareas",
    tipo: "spotlight",
    sidebarItem: "tareas",
    titulo: t("tutorial.pasos.tareas.titulo"),
    emoji: "✅",
    color: "#1DB8A0",
    descripcion: t("tutorial.pasos.tareas.desc", { returnObjects: true }) as string[],
  },
  {
    id: "timer",
    tipo: "spotlight",
    sidebarItem: "timer",
    titulo: t("tutorial.pasos.timer.titulo"),
    emoji: "⏱️",
    color: "#1DB8A0",
    descripcion: t("tutorial.pasos.timer.desc", { returnObjects: true }) as string[],
  },
  {
    id: "facturas",
    tipo: "spotlight",
    sidebarItem: "facturas",
    titulo: t("tutorial.pasos.facturas.titulo"),
    emoji: "🧾",
    color: "#F47C5C",
    descripcion: t("tutorial.pasos.facturas.desc", { returnObjects: true }) as string[],
  },
  {
    id: "dashboard",
    tipo: "spotlight",
    sidebarItem: "dashboard",
    titulo: t("tutorial.pasos.dashboard.titulo"),
    emoji: "📊",
    color: "#7C5CBF",
    descripcion: t("tutorial.pasos.dashboard.desc", { returnObjects: true }) as string[],
  },
];
}

interface TutorialProps {
  onTerminar: () => void;
}

export default function Tutorial({ onTerminar }: TutorialProps) {
  const { t } = useTranslation();
  const pasos = getPasos(t);
  const [paso, setPaso] = useState(0);
  const [spotlightPos, setSpotlightPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const pasoActual = pasos[paso];
  const esUltimo = paso === pasos.length - 1;

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
  }, []);

  useEffect(() => {
    if (pasoActual.tipo === "spotlight" && pasoActual.sidebarItem) {
      // Pequeño delay para que el DOM esté listo
      timeoutRef.current = setTimeout(() => {
        const el = document.querySelector(`[data-tutorial="${pasoActual.sidebarItem}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          setSpotlightPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }
      }, 100);
    } else {
      setSpotlightPos(null);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [paso]);

  async function terminar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("perfiles").upsert(
        { user_id: user.id, tutorial_version: TUTORIAL_VERSION },
        { onConflict: "user_id" }
      );
    }
    marcarNovedadesVista();
    setVisible(false);
    setTimeout(onTerminar, 300);
  }

  function siguiente() {
    if (esUltimo) { terminar(); return; }
    setPaso((p) => p + 1);
  }

  function anterior() {
    if (paso > 0) setPaso((p) => p - 1);
  }

  const modalLeft = spotlightPos ? spotlightPos.left + spotlightPos.width + 16 : null;
  const modalTop = spotlightPos ? Math.max(16, spotlightPos.top - 40) : null;

  return (
    <div
      className="fixed inset-0 z-50 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black/70" style={{ left: 224 }} />
<div className="absolute top-0 left-0 w-56 h-full bg-black/30" />

      {/* Spotlight sobre elemento del sidebar */}
      {spotlightPos && (
        <div
          className="absolute rounded-xl transition-all duration-300"
          style={{
            top: spotlightPos.top - 6,
            left: spotlightPos.left - 6,
            width: spotlightPos.width + 12,
            height: spotlightPos.height + 12,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.70), 0 0 0 3px ${pasoActual.color}`,
            zIndex: 51,
          }}
        />
      )}

      {/* Modal */}
      <div
        className="absolute transition-all duration-300"
        style={
          spotlightPos && modalLeft !== null && modalTop !== null
            ? { left: modalLeft, top: modalTop, width: 360, zIndex: 52 }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 480, zIndex: 52 }
        }
      >
        <div className="bg-canvas border border-edge rounded-2xl p-8 shadow-2xl">

          {/* Progreso */}
          <div className="flex gap-1.5 mb-6">
            {pasos.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full flex-1 transition-all duration-300"
                style={{ backgroundColor: i <= paso ? pasoActual.color : "#252B3B" }}
              />
            ))}
          </div>

          {/* Emoji + título */}
          <div className="mb-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
              style={{ backgroundColor: pasoActual.color + "20" }}
            >
              {pasoActual.emoji}
            </div>
            <h2 className="text-primary text-xl font-bold mb-1">{pasoActual.titulo}</h2>
            <div
              className="h-0.5 w-10 rounded-full mb-4"
              style={{ backgroundColor: pasoActual.color }}
            />
          </div>

          {/* Descripción */}
          <div className="space-y-3 mb-8">
            {pasoActual.descripcion.map((linea, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: pasoActual.color + "20", color: pasoActual.color }}>
                  {i + 1}
                </span>
                <p className="text-muted2 text-sm leading-relaxed">{linea}</p>
              </div>
            ))}
          </div>

          {/* Controles */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {paso > 0 && (
                <button
                  onClick={anterior}
                  className="text-muted text-sm hover:text-primary transition-colors"
                >
                  ← {t("tutorial.anterior")}
                </button>
              )}
              <button
                onClick={terminar}
                className="text-muted text-xs hover:text-primary transition-colors"
              >
                {t("tutorial.saltarGuia")}
              </button>
            </div>
            <button
              onClick={siguiente}
              className="px-6 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: pasoActual.color, color: pasoActual.color === "#F47C5C" ? "white" : "#1A1F2E" }}
            >
              {esUltimo ? t("tutorial.empezar") : t("tutorial.siguiente")}
            </button>
          </div>

          {/* Contador */}
          <p className="text-center text-muted text-xs mt-4">
            {t("tutorial.contador", { actual: paso + 1, total: pasos.length })}
          </p>

        </div>
      </div>
    </div>
  );
}