import { useEffect, useState } from "react";

export const NOVEDADES_VERSION = "1.1.0";

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

const novedades: ItemNovedad[] = [
  {
    emoji: "📄",
    titulo: "Cotizaciones profesionales",
    descripcion:
      "Crea una cotización en minutos con servicios de tu catálogo, precios y políticas. Envíala a tu cliente por WhatsApp o correo y genera la factura o el contrato con un clic.",
  },
  {
    emoji: "✍️",
    titulo: "Firma de contratos en línea",
    descripcion:
      "Envía a tu cliente un enlace corto y firma escribiendo su nombre (o dibujando su firma). El contrato firmado llega al instante.",
  },
  {
    emoji: "📱",
    titulo: "Portal del cliente rediseñado",
    descripcion:
      "Mucho más fácil de entender: avance del proyecto, tareas, pagos y mensajes, todo en un solo lugar.",
  },
  {
    emoji: "🔔",
    titulo: "Notificaciones en tiempo real",
    descripcion:
      "Te avisamos al instante cuando tu cliente firma un contrato o te deja un mensaje.",
  },
  {
    emoji: "🎨",
    titulo: "Interfaz y comprobantes renovados",
    descripcion:
      "Menús desplegables con el estilo de la app y PDFs con el logo real y notas más claras.",
  },
];

interface NovedadesProps {
  onTerminar: () => void;
}

export default function Novedades({ onTerminar }: NovedadesProps) {
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
            <h2 className="text-primary text-xl font-bold mb-1">¡Flowo 1.1.0 está aquí!</h2>
            <div className="h-0.5 w-10 rounded-full mb-4 bg-accent" />
            <p className="text-muted2 text-sm">Esto es lo nuevo de esta versión:</p>
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
            ¡Entendido!
          </button>

        </div>
      </div>
    </div>
  );
}
