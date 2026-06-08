import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { buscarCarpeta, crearCarpeta, tieneDriveConectado } from "../lib/drive";
import { openUrl } from "@tauri-apps/plugin-opener";

interface Nota {
  id: number;
  texto: string;
  fecha: string;
}

interface Subtarea {
  id: number;
  titulo: string;
  completada: boolean;
  publica: boolean;
}

interface Tarea {
  id: string;
  titulo: string;
  proyecto_id: string;
  proyecto_nombre: string;
  prioridad: "alta" | "media" | "baja";
  estado: "pendiente" | "en-progreso" | "completada";
  completada: boolean;
  publica: boolean;
  deadline: string;
  notas: Nota[];
  subtareas: Subtarea[];
  folder_id?: string;
  folder_url?: string;
  aprobada_cliente: boolean;
}

interface ProyectoOpcion {
  id: string;
  nombre: string;
  folder_id?: string;
  folder_url?: string;
}

const prioridadConfig = {
  "alta": { label: "Alta", color: "text-[#F47C5C] bg-[#F47C5C]/10" },
  "media": { label: "Media", color: "text-[#7C5CBF] bg-[#7C5CBF]/10" },
  "baja": { label: "Baja", color: "text-[#6B7280] bg-[#6B7280]/10" },
};

const estadoConfig = {
  "pendiente": { label: "Pendiente", color: "text-[#6B7280] bg-[#6B7280]/10" },
  "en-progreso": { label: "En progreso", color: "text-[#7C5CBF] bg-[#7C5CBF]/10" },
  "completada": { label: "Completada", color: "text-[#1DB8A0] bg-[#1DB8A0]/10" },
};

function getDiasRestantes(deadline: string) {
  if (!deadline) return 999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(deadline);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function NotaItem({ nota, tareaId, onEditar, onEliminar }: {
  nota: Nota;
  tareaId: string;
  onEditar: (tareaId: string, notaId: number, texto: string) => void;
  onEliminar: (tareaId: string, notaId: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [textoEdit, setTextoEdit] = useState(nota.texto);

  async function guardarEdicion() {
    if (!textoEdit.trim()) return;
    await onEditar(tareaId, nota.id, textoEdit);
    setEditando(false);
  }

  return (
    <div className="bg-[#1A1F2E] rounded-lg px-3 py-2">
      {editando ? (
        <div>
          <textarea value={textoEdit} onChange={(e) => setTextoEdit(e.target.value)} rows={2}
            className="w-full bg-[#141824] border border-[#1DB8A0] rounded-lg px-3 py-2 text-white text-xs focus:outline-none resize-none mb-2" />
          <div className="flex gap-2">
            <button onClick={guardarEdicion}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1 rounded-lg text-xs hover:opacity-90">
              Guardar
            </button>
            <button onClick={() => { setEditando(false); setTextoEdit(nota.texto); }}
              className="text-[#6B7280] px-3 py-1 rounded-lg text-xs hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white text-xs">{nota.texto}</p>
            <p className="text-[#6B7280] text-xs mt-0.5">{nota.fecha}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setEditando(true)} className="text-[#6B7280] text-xs hover:text-[#1DB8A0]">Editar</button>
            <button onClick={() => onEliminar(tareaId, nota.id)} className="text-[#6B7280] text-xs hover:text-[#F47C5C]">Eliminar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TareaItem({ tarea, notaTareaId, nuevaNota, editandoTareaId, editTitulo, editPrioridad, editDeadline, editPublica,
  subtareaAbiertaId, nuevoTituloSubtarea, nuevaSubtareaPublica,
  setNotaTareaId, setNuevaNota, setEditandoTareaId, setEditTitulo, setEditPrioridad, setEditDeadline, setEditPublica,
  setSubtareaAbiertaId, setNuevoTituloSubtarea, setNuevaSubtareaPublica,
  onCambiarEstado, onAgregarNota, onEditarNota, onEliminarNota, onEliminarTarea, onGuardarEdicion, onAbrirEdicion,
  onAgregarSubtarea, onToggleSubtarea, onEliminarSubtarea,
}: {
  tarea: Tarea;
  notaTareaId: string | null;
  nuevaNota: string;
  editandoTareaId: string | null;
  editTitulo: string;
  editPrioridad: "alta" | "media" | "baja";
  editDeadline: string;
  editPublica: boolean;
  subtareaAbiertaId: string | null;
  nuevoTituloSubtarea: string;
  nuevaSubtareaPublica: boolean;
  setNotaTareaId: (id: string | null) => void;
  setNuevaNota: (v: string) => void;
  setEditandoTareaId: (id: string | null) => void;
  setEditTitulo: (v: string) => void;
  setEditPrioridad: (v: "alta" | "media" | "baja") => void;
  setEditDeadline: (v: string) => void;
  setEditPublica: (v: boolean) => void;
  setSubtareaAbiertaId: (id: string | null) => void;
  setNuevoTituloSubtarea: (v: string) => void;
  setNuevaSubtareaPublica: (v: boolean) => void;
  onCambiarEstado: (id: string, estado: "pendiente" | "en-progreso" | "completada") => void;
  onAgregarNota: (id: string) => void;
  onEditarNota: (tareaId: string, notaId: number, texto: string) => void;
  onEliminarNota: (tareaId: string, notaId: number) => void;
  onEliminarTarea: (id: string) => void;
  onGuardarEdicion: (id: string) => void;
  onAbrirEdicion: (tarea: Tarea) => void;
  onAgregarSubtarea: (tareaId: string) => void;
  onToggleSubtarea: (tareaId: string, subtareaId: number) => void;
  onEliminarSubtarea: (tareaId: string, subtareaId: number) => void;
}) {
  const diasRestantes = getDiasRestantes(tarea.deadline);
  const estaEditando = editandoTareaId === tarea.id;

  return (
    <div className="bg-[#141824] border border-[#252B3B] rounded-xl px-5 py-4">
      {estaEditando ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Titulo</label>
              <input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Prioridad</label>
              <select value={editPrioridad} onChange={(e) => setEditPrioridad(e.target.value as "alta" | "media" | "baja")}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Fecha limite</label>
              <input value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} type="date"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={editPublica} onChange={(e) => setEditPublica(e.target.checked)} className="w-4 h-4 accent-[#1DB8A0]" />
              <label className="text-[#6B7280] text-xs">Visible para el cliente</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onGuardarEdicion(tarea.id)}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
              Guardar cambios
            </button>
            <button onClick={() => setEditandoTareaId(null)}
              className="text-[#6B7280] px-4 py-1.5 rounded-lg text-xs hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1">
              <p className={"text-sm font-medium " + (tarea.estado === "completada" ? "line-through text-[#6B7280]" : "text-white")}>
                {tarea.titulo}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[#6B7280] text-xs">{tarea.proyecto_nombre}</p>
                {tarea.subtareas.length > 0 && (
                  <span className="text-[#6B7280] text-xs">
                    · {tarea.subtareas.filter((s) => s.completada).length}/{tarea.subtareas.length} subtareas
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {tarea.aprobada_cliente && (
                <span className="text-[#1DB8A0] text-xs bg-[#1DB8A0]/10 px-2 py-0.5 rounded-full font-medium">
                  ✓ Aprobada
                </span>
              )}
              {tarea.folder_url && (
                <button onClick={() => openUrl(tarea.folder_url!)}
                  className="text-[#1DB8A0] text-xs hover:underline" title="Abrir carpeta en Drive">
                  📁
                </button>
              )}
              {tarea.publica && <span className="text-[#1DB8A0] text-xs">👁</span>}
              <span className={"text-xs px-2 py-0.5 rounded-full " + prioridadConfig[tarea.prioridad].color}>
                {prioridadConfig[tarea.prioridad].label}
              </span>
              <button onClick={() => onAbrirEdicion(tarea)} className="text-[#6B7280] text-xs hover:text-[#1DB8A0]">Editar</button>
              <button onClick={() => onEliminarTarea(tarea.id)} className="text-[#6B7280] text-xs hover:text-[#F47C5C]">✕</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select value={tarea.estado}
                onChange={(e) => onCambiarEstado(tarea.id, e.target.value as "pendiente" | "en-progreso" | "completada")}
                className={"text-xs px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none " + estadoConfig[tarea.estado].color}>
                <option value="pendiente">Pendiente</option>
                <option value="en-progreso">En progreso</option>
                <option value="completada">Completada</option>
              </select>
              {tarea.deadline && (
                <span className={"text-xs " + (diasRestantes <= 3 && tarea.estado !== "completada" ? "text-[#F47C5C]" : "text-[#6B7280]")}>
                  {diasRestantes === 0 ? "Vence hoy" : diasRestantes < 0 ? "Vencida hace " + Math.abs(diasRestantes) + " dias" : "Vence en " + diasRestantes + " dias"}
                </span>
              )}
            </div>
            <button onClick={() => setNotaTareaId(notaTareaId === tarea.id ? null : tarea.id)}
              className="text-[#6B7280] text-xs hover:text-[#1DB8A0]">
              {tarea.notas.length > 0 ? tarea.notas.length + " nota" + (tarea.notas.length > 1 ? "s" : "") : "+ Nota"}
            </button>
          </div>
        </>
      )}

      {/* Notas */}
      {!estaEditando && notaTareaId === tarea.id && (
        <div className="mt-3 border-t border-[#252B3B] pt-3">
          <div className="space-y-2 mb-3">
            {tarea.notas.map((nota) => (
              <NotaItem key={nota.id} nota={nota} tareaId={tarea.id} onEditar={onEditarNota} onEliminar={onEliminarNota} />
            ))}
          </div>
          <textarea value={nuevaNota} onChange={(e) => setNuevaNota(e.target.value)}
            placeholder="Escribe una nota..." rows={2}
            className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0] resize-none mb-2" />
          <div className="flex gap-2">
            <button onClick={() => onAgregarNota(tarea.id)}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
              Guardar
            </button>
            <button onClick={() => { setNotaTareaId(null); setNuevaNota(""); }}
              className="text-[#6B7280] px-3 py-1.5 rounded-lg text-xs hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Subtareas */}
      {!estaEditando && (
        <div className="mt-2 ml-1">
          {tarea.subtareas.length > 0 && (
            <div className="space-y-1 mb-2">
              {tarea.subtareas.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={sub.completada}
                    onChange={() => onToggleSubtarea(tarea.id, sub.id)}
                    className="w-3 h-3 accent-[#1DB8A0] cursor-pointer flex-shrink-0" />
                  <p className={"text-xs flex-1 " + (sub.completada ? "line-through text-[#6B7280]" : "text-[#8B93A8]")}>
                    {sub.titulo}
                  </p>
                  {sub.publica && <span className="text-[#1DB8A0] text-xs">👁</span>}
                  <button onClick={() => onEliminarSubtarea(tarea.id, sub.id)}
                    className="text-[#6B7280] text-xs hover:text-[#F47C5C] opacity-0 group-hover:opacity-100 transition-opacity">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {subtareaAbiertaId === tarea.id ? (
            <div className="flex flex-col gap-2 mt-1">
              <input value={nuevoTituloSubtarea} onChange={(e) => setNuevoTituloSubtarea(e.target.value)}
                placeholder="Título de la subtarea"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[#6B7280] text-xs cursor-pointer">
                  <input type="checkbox" checked={nuevaSubtareaPublica}
                    onChange={(e) => setNuevaSubtareaPublica(e.target.checked)}
                    className="w-3 h-3 accent-[#1DB8A0]" />
                  Visible al cliente
                </label>
                <div className="flex gap-2">
                  <button onClick={() => onAgregarSubtarea(tarea.id)}
                    className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1 rounded-lg text-xs hover:opacity-90">
                    Guardar
                  </button>
                  <button onClick={() => { setSubtareaAbiertaId(null); setNuevoTituloSubtarea(""); setNuevaSubtareaPublica(false); }}
                    className="text-[#6B7280] px-2 py-1 rounded-lg text-xs hover:text-white">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setSubtareaAbiertaId(tarea.id)}
              className="text-[#6B7280] text-xs hover:text-[#1DB8A0] mt-1">
              + Subtarea
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tareas() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("todas");
  const [titulo, setTitulo] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [publica, setPublica] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [notaTareaId, setNotaTareaId] = useState<string | null>(null);
  const [nuevaNota, setNuevaNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editandoTareaId, setEditandoTareaId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editPrioridad, setEditPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [editDeadline, setEditDeadline] = useState("");
  const [editPublica, setEditPublica] = useState(false);

  // Subtareas
  const [subtareaAbiertaId, setSubtareaAbiertaId] = useState<string | null>(null);
  const [nuevoTituloSubtarea, setNuevoTituloSubtarea] = useState("");
  const [nuevaSubtareaPublica, setNuevaSubtareaPublica] = useState(false);

  // Drive
  const [hayDrive, setHayDrive] = useState(false);
  const [crearCarpetaTarea, setCrearCarpetaTarea] = useState(false);
  const [modalCarpeta, setModalCarpeta] = useState<{
    nombre: string;
    resolve: (opcion: "usar" | "nueva") => void;
  } | null>(null);

  useEffect(() => {
    cargarDatos();
    tieneDriveConectado().then(setHayDrive);
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: tareasData }, { data: proyectosData }] = await Promise.all([
      supabase.from("tareas").select("*").eq("user_id", user?.id).order("created_at", { ascending: false }),
      supabase.from("proyectos").select("id, nombre, folder_id, folder_url").eq("user_id", user?.id),
    ]);
    setProyectos(proyectosData || []);
    const proyectosMap = Object.fromEntries((proyectosData || []).map((p: ProyectoOpcion) => [p.id, p.nombre]));
    const tareasMapeadas = (tareasData || []).map((t: any) => ({
      ...t,
      titulo: t.nombre,
      completada: t.completada || false,
      proyecto_nombre: proyectosMap[t.proyecto_id] || "Sin proyecto",
      notas: Array.isArray(t.notas) ? t.notas : [],
      subtareas: Array.isArray(t.subtareas) ? t.subtareas : [],
      folder_id: t.folder_id || undefined,
      folder_url: t.folder_url || undefined,
      aprobada_cliente: t.aprobada_cliente || false,
    }));
    setTareas(tareasMapeadas);
    setCargando(false);
  }

  const proyectoSeleccionado = proyectos.find((p) => p.id === proyectoId);
  const proyectoTieneCarpeta = !!proyectoSeleccionado?.folder_id;

  function preguntarCarpetaExistente(nombre: string): Promise<"usar" | "nueva"> {
    return new Promise((resolve) => {
      setModalCarpeta({ nombre, resolve });
    });
  }

  async function agregarTarea() {
    if (!titulo || !proyectoId) return;
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();

    let folder_id: string | null = null;
    let folder_url: string | null = null;

    if (hayDrive && crearCarpetaTarea && proyectoTieneCarpeta) {
      try {
        const parentId = proyectoSeleccionado!.folder_id!;
        const existentes = await buscarCarpeta(titulo, parentId);
        if (existentes.length > 0) {
          const opcion = await preguntarCarpetaExistente(titulo);
          if (opcion === "usar") {
            folder_id = existentes[0].id;
            folder_url = existentes[0].url;
          } else {
            const nueva = await crearCarpeta(titulo, parentId);
            if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
          }
        } else {
          const nueva = await crearCarpeta(titulo, parentId);
          if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
        }
      } catch (err) {
        console.error("Error creando carpeta de tarea:", err);
      }
    }

    await supabase.from("tareas").insert({
      user_id: user?.id,
      proyecto_id: proyectoId,
      nombre: titulo,
      prioridad,
      estado: "pendiente",
      completada: false,
      visible_cliente: publica,
      deadline: deadline || null,
      notas: [],
      subtareas: [],
      folder_id,
      folder_url,
    });

    setTitulo(""); setProyectoId(""); setPrioridad("media"); setPublica(false);
    setDeadline(""); setCrearCarpetaTarea(false);
    setMostrarForm(false); setGuardando(false);
    cargarDatos();
  }

  async function cambiarEstado(id: string, nuevoEstado: "pendiente" | "en-progreso" | "completada") {
    const esCompletada = nuevoEstado === "completada";
    await supabase.from("tareas").update({ estado: nuevoEstado, completada: esCompletada }).eq("id", id);
    const tarea = tareas.find((t) => t.id === id);
    const nuevasTareas = tareas.map((t) =>
      t.id === id ? { ...t, estado: nuevoEstado, completada: esCompletada } : t
    );
    setTareas(nuevasTareas);
    if (tarea) {
      const tareasDelProyecto = nuevasTareas.filter((t) => t.proyecto_id === tarea.proyecto_id);
      const total = tareasDelProyecto.length;
      const completadasCount = tareasDelProyecto.filter((t) => t.completada).length;
      await supabase.from("proyectos").update({
        tareas_total: total,
        tareas_completadas: completadasCount,
      }).eq("id", tarea.proyecto_id);
    }
  }

  async function guardarEdicionTarea(id: string) {
    await supabase.from("tareas").update({
      nombre: editTitulo,
      prioridad: editPrioridad,
      deadline: editDeadline || null,
      visible_cliente: editPublica,
    }).eq("id", id);
    setTareas(tareas.map((t) =>
      t.id === id ? { ...t, titulo: editTitulo, prioridad: editPrioridad, deadline: editDeadline, publica: editPublica } : t
    ));
    setEditandoTareaId(null);
  }

  async function agregarNota(tareaId: string) {
    if (!nuevaNota.trim()) return;
    const tarea = tareas.find((t) => t.id === tareaId);
    if (!tarea) return;
    const nota: Nota = { id: Date.now(), texto: nuevaNota, fecha: new Date().toISOString().split("T")[0] };
    const nuevasNotas = [...tarea.notas, nota];
    await supabase.from("tareas").update({ notas: nuevasNotas }).eq("id", tareaId);
    setNuevaNota(""); setNotaTareaId(null);
    setTareas(tareas.map((t) => t.id === tareaId ? { ...t, notas: nuevasNotas } : t));
  }

  async function editarNota(tareaId: string, notaId: number, textoNuevo: string) {
    const tarea = tareas.find((t) => t.id === tareaId);
    if (!tarea) return;
    const nuevasNotas = tarea.notas.map((n) => n.id === notaId ? { ...n, texto: textoNuevo } : n);
    await supabase.from("tareas").update({ notas: nuevasNotas }).eq("id", tareaId);
    setTareas(tareas.map((t) => t.id === tareaId ? { ...t, notas: nuevasNotas } : t));
  }

  async function eliminarNota(tareaId: string, notaId: number) {
    const tarea = tareas.find((t) => t.id === tareaId);
    if (!tarea) return;
    const nuevasNotas = tarea.notas.filter((n) => n.id !== notaId);
    await supabase.from("tareas").update({ notas: nuevasNotas }).eq("id", tareaId);
    setTareas(tareas.map((t) => t.id === tareaId ? { ...t, notas: nuevasNotas } : t));
  }

  async function eliminarTarea(id: string) {
    await supabase.from("tareas").delete().eq("id", id);
    setTareas(tareas.filter((t) => t.id !== id));
  }

  async function agregarSubtarea(tareaId: string) {
    if (!nuevoTituloSubtarea.trim()) return;
    const tarea = tareas.find((t) => t.id === tareaId);
    if (!tarea) return;
    const subtarea: Subtarea = {
      id: Date.now(),
      titulo: nuevoTituloSubtarea,
      completada: false,
      publica: nuevaSubtareaPublica,
    };
    const nuevasSubtareas = [...tarea.subtareas, subtarea];
    await supabase.from("tareas").update({ subtareas: nuevasSubtareas }).eq("id", tareaId);
    setTareas(tareas.map((t) => t.id === tareaId ? { ...t, subtareas: nuevasSubtareas } : t));
    setNuevoTituloSubtarea("");
    setNuevaSubtareaPublica(false);
    setSubtareaAbiertaId(null);
  }

  async function toggleSubtarea(tareaId: string, subtareaId: number) {
    const tarea = tareas.find((t) => t.id === tareaId);
    if (!tarea) return;
    const nuevasSubtareas = tarea.subtareas.map((s) =>
      s.id === subtareaId ? { ...s, completada: !s.completada } : s
    );
    await supabase.from("tareas").update({ subtareas: nuevasSubtareas }).eq("id", tareaId);
    setTareas(tareas.map((t) => t.id === tareaId ? { ...t, subtareas: nuevasSubtareas } : t));
  }

  async function eliminarSubtarea(tareaId: string, subtareaId: number) {
    const tarea = tareas.find((t) => t.id === tareaId);
    if (!tarea) return;
    const nuevasSubtareas = tarea.subtareas.filter((s) => s.id !== subtareaId);
    await supabase.from("tareas").update({ subtareas: nuevasSubtareas }).eq("id", tareaId);
    setTareas(tareas.map((t) => t.id === tareaId ? { ...t, subtareas: nuevasSubtareas } : t));
  }

  function abrirEdicion(tarea: Tarea) {
    setEditandoTareaId(tarea.id);
    setEditTitulo(tarea.titulo);
    setEditPrioridad(tarea.prioridad);
    setEditDeadline(tarea.deadline || "");
    setEditPublica(tarea.publica);
  }

  const tareasFiltradas = tareas.filter((t) => {
    const coincideBusqueda = t.titulo.toLowerCase().includes(busqueda.toLowerCase());
    const coincidePrioridad = filtroPrioridad === "todas" || t.prioridad === filtroPrioridad;
    return coincideBusqueda && coincidePrioridad;
  });

  const urgentes = tareasFiltradas.filter((t) => getDiasRestantes(t.deadline) <= 3 && t.estado !== "completada");
  const enProgreso = tareasFiltradas.filter((t) => t.estado === "en-progreso" && !(getDiasRestantes(t.deadline) <= 3));
  const pendientes = tareasFiltradas.filter((t) => t.estado === "pendiente" && !(getDiasRestantes(t.deadline) <= 3));
  const completadas = tareasFiltradas.filter((t) => t.estado === "completada");

  const totalPendientes = tareas.filter((t) => t.estado === "pendiente").length;
  const totalEnProgreso = tareas.filter((t) => t.estado === "en-progreso").length;
  const totalCompletadas = tareas.filter((t) => t.estado === "completada").length;
  const totalAprobadas = tareas.filter((t) => t.aprobada_cliente).length;

  const propsComunes = {
    notaTareaId, nuevaNota, editandoTareaId, editTitulo, editPrioridad, editDeadline, editPublica,
    subtareaAbiertaId, nuevoTituloSubtarea, nuevaSubtareaPublica,
    setNotaTareaId, setNuevaNota, setEditandoTareaId, setEditTitulo, setEditPrioridad, setEditDeadline, setEditPublica,
    setSubtareaAbiertaId, setNuevoTituloSubtarea, setNuevaSubtareaPublica,
    onCambiarEstado: cambiarEstado,
    onAgregarNota: agregarNota,
    onEditarNota: editarNota,
    onEliminarNota: eliminarNota,
    onEliminarTarea: eliminarTarea,
    onGuardarEdicion: guardarEdicionTarea,
    onAbrirEdicion: abrirEdicion,
    onAgregarSubtarea: agregarSubtarea,
    onToggleSubtarea: toggleSubtarea,
    onEliminarSubtarea: eliminarSubtarea,
  };

  if (cargando) return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando tareas...</p></div>;

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-white font-medium mb-2">Carpeta ya existe</h3>
            <p className="text-[#6B7280] text-sm mb-6">
              Ya existe una carpeta <span className="text-white">"{modalCarpeta.nombre}"</span> dentro de la carpeta del proyecto en Drive.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-[#1A1F2E] border border-[#1DB8A0]/40 text-white text-sm px-4 py-3 rounded-lg hover:bg-[#1DB8A0]/10 transition-colors text-left">
                <p className="font-medium text-[#1DB8A0]">Usar carpeta existente</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Vincular la tarea a la carpeta que ya existe</p>
              </button>
              <button onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] text-white text-sm px-4 py-3 rounded-lg hover:border-[#7C5CBF]/40 transition-colors text-left">
                <p className="font-medium">Crear carpeta nueva</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Se creará una carpeta adicional con el mismo nombre</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Tareas</h2>
          <p className="text-[#6B7280] mt-1">
            {totalPendientes} pendientes · {totalEnProgreso} en progreso · {totalCompletadas} completadas
            {totalAprobadas > 0 && <span className="text-[#1DB8A0]"> · {totalAprobadas} aprobadas por cliente</span>}
          </p>
        </div>
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
          + Nueva tarea
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre de tarea..."
          className="flex-1 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
        <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
          {[
            { id: "todas", label: "Todas" },
            { id: "alta", label: "Alta" },
            { id: "media", label: "Media" },
            { id: "baja", label: "Baja" },
          ].map((f) => (
            <button key={f.id} onClick={() => setFiltroPrioridad(f.id)}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (filtroPrioridad === f.id ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
          <h3 className="text-white font-medium mb-4">Nueva tarea</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Titulo *</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Diseño de pantallas"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Proyecto *</label>
              <select value={proyectoId} onChange={(e) => { setProyectoId(e.target.value); setCrearCarpetaTarea(false); }}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="">Selecciona un proyecto</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.folder_id ? " 📁" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Prioridad</label>
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as "alta" | "media" | "baja")}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Fecha limite</label>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <input type="checkbox" id="publica" checked={publica} onChange={(e) => setPublica(e.target.checked)} className="w-4 h-4 accent-[#1DB8A0]" />
            <label htmlFor="publica" className="text-[#6B7280] text-sm cursor-pointer">Visible para el cliente en el portal</label>
          </div>

          {hayDrive && proyectoId ? (
            proyectoTieneCarpeta ? (
              <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
                <input type="checkbox" id="checkbox-drive-tarea"
                  checked={crearCarpetaTarea}
                  onChange={(e) => setCrearCarpetaTarea(e.target.checked)}
                  className="w-4 h-4 accent-[#1DB8A0] cursor-pointer" />
                <label htmlFor="checkbox-drive-tarea" className="cursor-pointer">
                  <p className="text-white text-sm">Crear carpeta en Google Drive <span className="text-[#6B7280] text-xs">(opcional)</span></p>
                  <p className="text-[#6B7280] text-xs mt-0.5">
                    Se creará <span className="text-[#1DB8A0]">"{titulo || "nombre de la tarea"}"</span> dentro de la carpeta de <span className="text-white">{proyectoSeleccionado?.nombre}</span>
                  </p>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3 opacity-60">
                <div className="w-4 h-4 rounded border border-[#252B3B] bg-[#141824] flex-shrink-0" />
                <div>
                  <p className="text-[#6B7280] text-sm">Crear carpeta en Google Drive</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">
                    Este proyecto no tiene carpeta en Drive. Créala desde <span className="text-[#1DB8A0]">Proyectos</span> para activar esta opción
                  </p>
                </div>
              </div>
            )
          ) : hayDrive && !proyectoId ? (
            <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3 opacity-60">
              <div className="w-4 h-4 rounded border border-[#252B3B] bg-[#141824] flex-shrink-0" />
              <p className="text-[#6B7280] text-sm">Selecciona un proyecto para ver las opciones de Drive</p>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button onClick={agregarTarea} disabled={guardando || !titulo || !proyectoId}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {guardando ? "Guardando..." : "Guardar tarea"}
            </button>
            <button onClick={() => setMostrarForm(false)} className="text-[#6B7280] px-4 py-2 rounded-lg text-sm hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {urgentes.length > 0 && (
          <div>
            <h3 className="text-[#F47C5C] text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
              Urgente — vence en 3 dias o menos
              <span className="bg-[#F47C5C]/10 text-[#F47C5C] px-2 py-0.5 rounded-full">{urgentes.length}</span>
            </h3>
            <div className="space-y-2">
              {urgentes.map((tarea) => <TareaItem key={tarea.id} tarea={tarea} {...propsComunes} />)}
            </div>
          </div>
        )}
        {enProgreso.length > 0 && (
          <div>
            <h3 className="text-[#7C5CBF] text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
              En progreso
              <span className="bg-[#7C5CBF]/10 text-[#7C5CBF] px-2 py-0.5 rounded-full">{enProgreso.length}</span>
            </h3>
            <div className="space-y-2">
              {enProgreso.map((tarea) => <TareaItem key={tarea.id} tarea={tarea} {...propsComunes} />)}
            </div>
          </div>
        )}
        {pendientes.length > 0 && (
          <div>
            <h3 className="text-[#6B7280] text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
              Pendientes
              <span className="bg-[#6B7280]/10 text-[#6B7280] px-2 py-0.5 rounded-full">{pendientes.length}</span>
            </h3>
            <div className="space-y-2">
              {pendientes.map((tarea) => <TareaItem key={tarea.id} tarea={tarea} {...propsComunes} />)}
            </div>
          </div>
        )}
        {completadas.length > 0 && (
          <div>
            <h3 className="text-[#6B7280] text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
              Completadas
              <span className="bg-[#6B7280]/10 text-[#6B7280] px-2 py-0.5 rounded-full">{completadas.length}</span>
            </h3>
            <div className="space-y-2 opacity-50">
              {completadas.map((tarea) => <TareaItem key={tarea.id} tarea={tarea} {...propsComunes} />)}
            </div>
          </div>
        )}
        {tareasFiltradas.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#6B7280]">
              {tareas.length === 0 ? "No tienes tareas todavia. Crea la primera con el boton de arriba." : "No se encontraron tareas"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Tareas;