import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TareaItem from "./TareaItem";
import type { Tarea, Subtarea } from "./TareaItem";

interface Props {
  tarea: Tarea;
  deshabilitado?: boolean;
  editandoTareaId: string | null;
  editTitulo: string;
  editPrioridad: "alta" | "media" | "baja";
  editDeadline: string;
  editPublica: boolean;
  editValor: string;
  editSubtareas: Subtarea[];
  editSubtareaInput: string;
  editNota: string;
  subtareaAbiertaId: string | null;
  nuevoTituloSubtarea: string;
  nuevaSubtareaPublica: boolean;
  setEditandoTareaId: (id: string | null) => void;
  setEditTitulo: (v: string) => void;
  setEditPrioridad: (v: "alta" | "media" | "baja") => void;
  setEditDeadline: (v: string) => void;
  setEditPublica: (v: boolean) => void;
  setEditValor: (v: string) => void;
  setEditSubtareas: (v: Subtarea[]) => void;
  setEditSubtareaInput: (v: string) => void;
  setEditNota: (v: string) => void;
  setSubtareaAbiertaId: (id: string | null) => void;
  setNuevoTituloSubtarea: (v: string) => void;
  setNuevaSubtareaPublica: (v: boolean) => void;
  onToggleTarea: (id: string) => void;
  onCambiarEstado: (id: string, estado: "pendiente" | "en-progreso" | "completada") => void;
  onGuardarEdicion: (id: string) => void;
  onAbrirEdicion: (tarea: Tarea) => void;
  onEliminarTarea: (id: string) => void;
  onAgregarSubtarea: (tareaId: string) => void;
  onToggleSubtarea: (tareaId: string, subtareaId: number) => void;
  onEliminarSubtarea: (tareaId: string, subtareaId: number) => void;
  cobroPorTareas?: boolean;
  onTogglePagada?: (id: string) => void;
}

export default function TareaItemSortable({ tarea, ...rest }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tarea.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TareaItem tarea={tarea} dragListeners={listeners} dragAttributes={attributes} {...rest} />
    </div>
  );
}
