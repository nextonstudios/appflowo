import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Subtarea } from "./TareaItem";

interface Props {
  sub: Subtarea;
  deshabilitado?: boolean;
  onToggle: () => void;
  onEliminar: () => void;
}

export default function SubtareaSortable({ sub, deshabilitado, onToggle, onEliminar }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <button className="text-muted hover:text-primary cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5" {...listeners} {...attributes}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
        </svg>
      </button>
      <button onClick={onToggle} disabled={deshabilitado}
        className={"w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border transition-colors " +
          (sub.completada
            ? "bg-accent border-accent text-onaccent"
            : "border-edge2 text-transparent hover:border-accent")}>
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <p className={"text-xs flex-1 " + (sub.completada ? "line-through text-muted" : "text-muted2")}>{sub.titulo}</p>
      {sub.publica && <span className="text-accent text-xs">👁</span>}
      {!deshabilitado && (
        <button onClick={onEliminar}
          className="text-muted text-xs hover:text-coral opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
      )}
    </div>
  );
}
