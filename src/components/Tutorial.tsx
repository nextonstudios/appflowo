import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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

const pasos: Paso[] = [
  {
    id: "bienvenida",
    tipo: "modal",
    titulo: "Bienvenido a Flowo",
    emoji: "👋",
    color: "#1DB8A0",
    descripcion: [
      "El lugar donde tu negocio freelance por fin funciona como debe.",
      "Clientes, proyectos, tiempo, facturas y tu portal profesional — todo conectado en un solo flujo.",
      "Esta guía te lleva por lo esencial en menos de 2 minutos. ¡Vamos allá!",
    ],
  },
  {
    id: "perfil",
    tipo: "modal",
    titulo: "Tu perfil profesional",
    emoji: "🧑‍💼",
    color: "#7C5CBF",
    descripcion: [
      "Ve a Perfil y completa tu información: nombre, WhatsApp con indicador de país sin el +, y tu marca personal.",
      "Sube tu logotipo — aparece automáticamente en todas tus facturas PDF.",
      "Conecta tu Google Drive para crear carpetas de clientes y proyectos sin salir de la app.",
      "Crea tu catálogo de servicios con tus tarifas base. Se autocompletan al crear un proyecto.",
    ],
  },
  {
    id: "clientes",
    tipo: "spotlight",
    sidebarItem: "clientes",
    titulo: "Gestión de clientes",
    emoji: "👥",
    color: "#1DB8A0",
    descripcion: [
      "Agrega clientes con el botón Nueva cliente. Registra su WhatsApp con indicador de país sin el + y su correo.",
      "Desde el perfil de cada cliente puedes enviarle un WhatsApp directo, compartir su portal personalizado, agendar una reunión en Google Meet o agregar notas privadas.",
      "Si tienes Google Drive conectado, puedes vincular o crear su carpeta en la nube desde aquí.",
    ],
  },
  {
    id: "proyectos",
    tipo: "spotlight",
    sidebarItem: "proyectos",
    titulo: "Proyectos en control total",
    emoji: "📁",
    color: "#7C5CBF",
    descripcion: [
      "Crea proyectos seleccionando un cliente, definiendo fechas y cargando tus servicios personalizados en un clic.",
      "Dentro de cada proyecto agrega tareas con subtareas, define si el cliente puede verlas o no, y asigna carpetas de Drive por tarea.",
      "Recibe feedback directo del cliente, registra ingresos por precio fijo o por horas, y agenda reuniones — todo sin salir de la app.",
    ],
  },
  {
    id: "tareas",
    tipo: "spotlight",
    sidebarItem: "tareas",
    titulo: "Vista dedicada de tareas",
    emoji: "✅",
    color: "#1DB8A0",
    descripcion: [
      "Una vista centralizada con todas tus tareas de todos los proyectos.",
      "Misma potencia que dentro del proyecto pero con una pestaña dedicada para cuando necesitas ver el panorama completo.",
      "Filtra por proyecto, prioridad o estado para enfocarte en lo que importa hoy.",
    ],
  },
  {
    id: "timer",
    tipo: "spotlight",
    sidebarItem: "timer",
    titulo: "Tu tiempo vale dinero",
    emoji: "⏱️",
    color: "#1DB8A0",
    descripcion: [
      "Si trabajas por horas, el timer es tu mejor aliado. Selecciona proyecto y tarea, inicia y listo.",
      "Al guardar, el tiempo queda registrado automáticamente vinculado al cliente, proyecto y tarea.",
      "El Pomodoro te ayuda a gestionar tu energía con bloques de trabajo y pausas — no registra tiempo, pero te mantiene en flow.",
    ],
  },
  {
    id: "facturas",
    tipo: "spotlight",
    sidebarItem: "facturas",
    titulo: "Facturas que se hacen solas",
    emoji: "🧾",
    color: "#F47C5C",
    descripcion: [
      "Olvídate de armar facturas manualmente. Todo lo que registres en Flowo se agrega automáticamente.",
      "Selecciona el proyecto y la factura se llena sola con los conceptos, horas y tareas realizadas.",
      "Descárgala en PDF con tu logo, envíala por email o WhatsApp, y registra abonos o pagos completos.",
    ],
  },
  {
    id: "dashboard",
    tipo: "spotlight",
    sidebarItem: "dashboard",
    titulo: "Tu negocio de un vistazo",
    emoji: "📊",
    color: "#7C5CBF",
    descripcion: [
      "El Dashboard es tu punto de partida diario. Tareas completadas, en proceso y las más urgentes.",
      "Un resumen ejecutivo de todo lo que está pasando en tu negocio freelance — sin abrir nada más.",
      "Flowo está listo. Ahora es tu turno. ¡A facturar!",
    ],
  },
];

interface TutorialProps {
  onTerminar: () => void;
}

export default function Tutorial({ onTerminar }: TutorialProps) {
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
        <div className="bg-[#141824] border border-[#252B3B] rounded-2xl p-8 shadow-2xl">

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
            <h2 className="text-white text-xl font-bold mb-1">{pasoActual.titulo}</h2>
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
                <p className="text-[#9CA3AF] text-sm leading-relaxed">{linea}</p>
              </div>
            ))}
          </div>

          {/* Controles */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {paso > 0 && (
                <button
                  onClick={anterior}
                  className="text-[#6B7280] text-sm hover:text-white transition-colors"
                >
                  ← Anterior
                </button>
              )}
              <button
                onClick={terminar}
                className="text-[#6B7280] text-xs hover:text-white transition-colors"
              >
                Saltar guía
              </button>
            </div>
            <button
              onClick={siguiente}
              className="px-6 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: pasoActual.color, color: pasoActual.color === "#F47C5C" ? "white" : "#1A1F2E" }}
            >
              {esUltimo ? "¡Empezar a usar Flowo!" : "Siguiente →"}
            </button>
          </div>

          {/* Contador */}
          <p className="text-center text-[#6B7280] text-xs mt-4">
            {paso + 1} de {pasos.length}
          </p>

        </div>
      </div>
    </div>
  );
}