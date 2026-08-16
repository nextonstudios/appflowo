import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import Select from "./Select";

export interface Subtarea {
  id: number;
  titulo: string;
  completada: boolean;
  publica: boolean;
}

export interface Nota {
  id: number;
  texto: string;
  fecha: string;
}

export interface Tarea {
  id: string;
  titulo: string;
  proyecto_nombre?: string;
  prioridad: "alta" | "media" | "baja";
  estado: "pendiente" | "en-progreso" | "completada";
  completada: boolean;
  publica: boolean;
  deadline: string;
  nota: string;
  notas: Nota[];
  folder_id?: string;
  folder_url?: string;
  subtareas: Subtarea[];
  aprobada_cliente: boolean;
}

export const prioridadConfig = {
  "alta": { label: "Alta", color: "text-coral bg-coral/10" },
  "media": { label: "Media", color: "text-violet bg-violet/10" },
  "baja": { label: "Baja", color: "text-muted bg-gray/10" },
};

function getPrioridadConfig(t: TFunction) {
  return {
    "alta": { ...prioridadConfig["alta"], label: t("tareaItem.prioridadAlta") },
    "media": { ...prioridadConfig["media"], label: t("tareaItem.prioridadMedia") },
    "baja": { ...prioridadConfig["baja"], label: t("tareaItem.prioridadBaja") },
  };
}

function getEstadoConfig(t: TFunction) {
  return {
    "pendiente": { label: t("tareaItem.estadoPendiente"), color: "text-muted bg-gray/10" },
    "en-progreso": { label: t("tareaItem.estadoEnProgreso"), color: "text-violet bg-violet/10" },
    "completada": { label: t("tareaItem.estadoCompletada"), color: "text-accent bg-accent/10" },
  };
}

function getDiasRestantes(deadline: string) {
  if (!deadline) return 999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(deadline);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

interface Props {
  tarea: Tarea;
  deshabilitado?: boolean;
  editandoTareaId: string | null;
  editTitulo: string;
  editPrioridad: "alta" | "media" | "baja";
  editDeadline: string;
  editPublica: boolean;
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
}

export default function TareaItem({
  tarea, deshabilitado,
  editandoTareaId, editTitulo, editPrioridad, editDeadline, editPublica,
  editSubtareas, editSubtareaInput, editNota,
  subtareaAbiertaId, nuevoTituloSubtarea, nuevaSubtareaPublica,
  setEditandoTareaId, setEditTitulo, setEditPrioridad, setEditDeadline, setEditPublica,
  setEditSubtareas, setEditSubtareaInput, setEditNota,
  setSubtareaAbiertaId, setNuevoTituloSubtarea, setNuevaSubtareaPublica,
  onToggleTarea, onCambiarEstado, onGuardarEdicion, onAbrirEdicion, onEliminarTarea,
  onAgregarSubtarea, onToggleSubtarea, onEliminarSubtarea,
}: Props) {
  const { t } = useTranslation();
  const [plegada, setPlegada] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const diasRestantes = getDiasRestantes(tarea.deadline);
  const estaEditando = editandoTareaId === tarea.id;
  const prioridades = getPrioridadConfig(t);
  const estadoConfig = getEstadoConfig(t);
  const etiquetaDias = tarea.deadline
    ? (diasRestantes === 0 ? t("tareaItem.venceHoy") : diasRestantes < 0 ? t("tareaItem.vencidaHace", { count: Math.abs(diasRestantes) }) : t("tareaItem.venceEn", { count: diasRestantes }))
    : "";
  const diasUrgentes = tarea.deadline && diasRestantes <= 3 && !tarea.completada;

  function agregarEditSubtarea() {
    const titulo = editSubtareaInput.trim();
    if (!titulo) return;
    setEditSubtareas([...editSubtareas, { id: Date.now(), titulo, completada: false, publica: editPublica }]);
    setEditSubtareaInput("");
  }

  return (
    <div className={"bg-canvas border border-edge rounded-xl p-3 " + (tarea.completada && !estaEditando ? "opacity-70" : "")}>
      {estaEditando ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-primary font-medium text-sm">{t("tareaItem.editarTarea")}</p>
            <button onClick={() => setEditandoTareaId(null)} className="text-muted text-xs hover:text-primary">{t("tareaItem.cancelar")}</button>
          </div>
          <input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} placeholder={t("tareaItem.placeholderTituloTarea")}
            className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-surface border border-edge rounded-lg p-0.5">
              {(["alta", "media", "baja"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setEditPrioridad(p)}
                  className={"text-xs px-3 py-1 rounded-md transition-colors font-medium " +
                    (editPrioridad === p ? prioridades[p].color : "text-muted hover:text-primary")}>
                  {prioridades[p].label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setEditPublica(!editPublica)}
              className={"flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium " +
                (editPublica
                  ? "bg-accent/10 border-accent/40 text-accent"
                  : "bg-surface border-edge text-muted hover:text-primary")}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                {editPublica ? (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </>
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                )}
              </svg>
              {editPublica ? t("tareaItem.visibleCliente") : t("tareaItem.ocultaCliente")}
            </button>
            <label className="flex items-center gap-2">
              <span className="text-muted text-xs">{t("tareaItem.fechaLimite")}</span>
              <input value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} type="date"
                className="bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
            </label>
          </div>
          <div>
            <p className="text-muted text-xs mb-2">{t("tareaItem.subtareas")}</p>
            <div className="space-y-1 mb-2">
              {editSubtareas.length === 0 && (
                <p className="text-muted text-xs">{t("tareaItem.sinSubtareas")}</p>
              )}
              {editSubtareas.map((sub, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button type="button" onClick={() => setEditSubtareas(editSubtareas.map((s, i) => i === idx ? { ...s, completada: !s.completada } : s))}
                    className={"w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border transition-colors " +
                      (sub.completada
                        ? "bg-accent border-accent text-onaccent"
                        : "border-edge2 text-transparent hover:border-accent")}>
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <input value={sub.titulo} onChange={(e) => setEditSubtareas(editSubtareas.map((s, i) => i === idx ? { ...s, titulo: e.target.value } : s))}
                    className="flex-1 min-w-0 bg-transparent text-xs text-muted2 focus:text-primary focus:outline-none px-1 py-0.5 rounded" />
                  <button type="button" onClick={() => setEditSubtareas(editSubtareas.map((s, i) => i === idx ? { ...s, publica: !s.publica } : s))}
                    className={"text-xs " + (sub.publica ? "text-accent" : "text-muted")}>👁</button>
                  <button type="button" onClick={() => setEditSubtareas(editSubtareas.filter((_, i) => i !== idx))}
                    className="text-muted text-xs hover:text-coral">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={editSubtareaInput} onChange={(e) => setEditSubtareaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarEditSubtarea(); } }}
                placeholder={t("tareaItem.placeholderAgregarSubtarea")}
                className="flex-1 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
              <button type="button" onClick={agregarEditSubtarea}
                className="bg-surface border border-edge text-primary text-xs font-medium px-3 py-1.5 rounded-lg hover:border-accent/40">
                {t("tareaItem.agregar")}
              </button>
            </div>
          </div>
          <div>
            <p className="text-muted text-xs mb-2">{t("tareaItem.nota")}</p>
            <textarea value={editNota} onChange={(e) => setEditNota(e.target.value)} rows={2}
              placeholder={t("tareaItem.placeholderNota")}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => onGuardarEdicion(tarea.id)}
              className="bg-accent text-onaccent font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
              {t("tareaItem.guardarCambios")}
            </button>
            <button onClick={() => setEditandoTareaId(null)}
              className="text-muted px-4 py-1.5 rounded-lg text-xs hover:text-primary">
              {t("tareaItem.cancelar")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button onClick={() => onToggleTarea(tarea.id)} disabled={deshabilitado}
              className={"w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors " +
                (tarea.completada
                  ? "bg-accent border-accent text-onaccent"
                  : "border-edge2 text-transparent hover:border-accent")}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className={"text-sm truncate " + (tarea.completada ? "line-through text-muted" : "text-primary")}>
                {tarea.titulo}
              </p>
              {!plegada && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  {tarea.proyecto_nombre && <span className="text-muted text-xs">{tarea.proyecto_nombre}</span>}
                  {tarea.subtareas.length > 0 && (
                    <span className="text-muted text-xs">
                      {t("tareaItem.subtareasConteo", { completadas: tarea.subtareas.filter((s) => s.completada).length, total: tarea.subtareas.length })}
                    </span>
                  )}
                  {tarea.publica && <span className="text-muted text-xs">👁 {t("tareaItem.visible")}</span>}
                  {tarea.aprobada_cliente && (
                    <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-full font-medium">✓ {t("tareaItem.aprobada")}</span>
                  )}
                  {tarea.folder_url && (
                    <button onClick={() => openUrl(tarea.folder_url!)} className="text-muted text-xs hover:text-accent">📁 {t("tareaItem.carpeta")}</button>
                  )}
                </div>
              )}
            </div>
            <span className={"text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 " + prioridades[tarea.prioridad].color}>
              {prioridades[tarea.prioridad].label}
            </span>
            <button onClick={() => setPlegada(!plegada)} className="text-muted hover:text-primary flex-shrink-0 p-1 -mr-1">
              <svg className={"w-4 h-4 transition-transform " + (plegada ? "rotate-180" : "")}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {!plegada && (
            <>
              <div className="mt-3 ml-7 flex flex-wrap items-center gap-3">
                <Select value={tarea.estado} disabled={deshabilitado}
                  onChange={(v) => onCambiarEstado(tarea.id, v as "pendiente" | "en-progreso" | "completada")}
                  triggerClassName={"text-xs px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none flex items-center gap-1.5 " +
                    (estadoConfig[tarea.estado].color.split(" ").find((c) => c.startsWith("bg-")) || "bg-gray/10")}
                  labelClassName={estadoConfig[tarea.estado].color.split(" ").find((c) => c.startsWith("text-")) || "text-muted"}
                  options={[
                    { value: "pendiente", label: estadoConfig["pendiente"].label },
                    { value: "en-progreso", label: estadoConfig["en-progreso"].label },
                    { value: "completada", label: estadoConfig["completada"].label },
                  ]} />
                {tarea.deadline && (
                  <span className={"text-xs " + (diasUrgentes ? "text-coral font-medium" : "text-muted")}>
                    {etiquetaDias}
                  </span>
                )}
              </div>

              <div className="mt-2 ml-7">
                {tarea.subtareas.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {tarea.subtareas.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2 group">
                        <button onClick={() => onToggleSubtarea(tarea.id, sub.id)} disabled={deshabilitado}
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
                          <button onClick={() => onEliminarSubtarea(tarea.id, sub.id)}
                            className="text-muted text-xs hover:text-coral opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!deshabilitado && (
                  subtareaAbiertaId === tarea.id ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <input value={nuevoTituloSubtarea} onChange={(e) => setNuevoTituloSubtarea(e.target.value)}
                        placeholder={t("tareaItem.placeholderTituloSubtarea")}
                        className="w-full bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-muted text-xs cursor-pointer">
                          <input type="checkbox" checked={nuevaSubtareaPublica}
                            onChange={(e) => setNuevaSubtareaPublica(e.target.checked)}
                            className="w-3 h-3 accent-accent" />
                          {t("tareaItem.visibleCliente")}
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => onAgregarSubtarea(tarea.id)}
                            className="bg-accent text-onaccent font-medium px-3 py-1 rounded-lg text-xs hover:opacity-90">{t("tareaItem.guardar")}</button>
                          <button onClick={() => { setSubtareaAbiertaId(null); setNuevoTituloSubtarea(""); setNuevaSubtareaPublica(false); }}
                            className="text-muted px-2 py-1 rounded-lg text-xs hover:text-primary">{t("tareaItem.cancelar")}</button>
                        </div>
                      </div>
                    </div>
                  ) : null
                )}
              </div>

              {tarea.nota && (
                <div className="mt-3 ml-7 bg-surface border border-edge rounded-lg px-3 py-2">
                  <p className="text-muted text-xs">{tarea.nota}</p>
                </div>
              )}

              {confirmandoEliminar && (
                <div className="mt-3 ml-7 bg-coral/10 border border-coral/30 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-coral text-xs">{t("tareaItem.confirmarEliminar")}</p>
                  <div className="flex gap-2">
                    <button onClick={() => onEliminarTarea(tarea.id)}
                      className="bg-coral text-white font-medium px-3 py-1 rounded-lg text-xs hover:opacity-90">
                      {t("tareaItem.eliminar")}
                    </button>
                    <button onClick={() => setConfirmandoEliminar(false)}
                      className="text-muted px-3 py-1 rounded-lg text-xs hover:text-primary">
                      {t("tareaItem.cancelar")}
                    </button>
                  </div>
                </div>
              )}

              {!deshabilitado && !confirmandoEliminar && (
                <div className="mt-3 border-t border-edge pt-2.5 flex items-center gap-4">
                  <button onClick={() => onAbrirEdicion(tarea)}
                    className="text-muted text-xs hover:text-accent flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {t("tareaItem.editar")}
                  </button>
                  <button onClick={() => setSubtareaAbiertaId(subtareaAbiertaId === tarea.id ? null : tarea.id)}
                    className="text-muted text-xs hover:text-accent flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    {t("tareaItem.anadirSubtarea")}
                  </button>
                  <button onClick={() => setConfirmandoEliminar(true)}
                    className="text-coral text-xs hover:opacity-80 flex items-center gap-1.5 ml-auto">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    {t("tareaItem.eliminar")}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
