import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import { buscarCarpeta, crearCarpeta, tieneDriveConectado } from "../lib/drive";
import { usePersistedState } from "../hooks/usePersistedState";
import Select, { type SelectOption } from "./Select";
import TareaItemSortable from "./TareaItemSortable";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { prioridadConfig, type Nota, type Subtarea, type Tarea } from "./TareaItem";
import { miembrosDeEquipo, type MiembroEquipo } from "../lib/equipo";

type TareaTab = Tarea & {
  proyecto_id: string;
  proyecto_nombre: string;
};

interface ProyectoOpcion {
  id: string;
  nombre: string;
  folder_id?: string;
  folder_url?: string;
  cobro_por_tareas?: boolean;
}

function getPrioridadLabels(t: TFunction) {
  return {
    alta: t("tareas.prioridadAlta"),
    media: t("tareas.prioridadMedia"),
    baja: t("tareas.prioridadBaja"),
  };
}

function Tareas({ equipoId, miRolEquipo }: { equipoId?: string | null; miRolEquipo?: string | null }) {
  const { t } = useTranslation();
  const prioridadLabels = getPrioridadLabels(t);
  const modoEquipo = !!equipoId;
  const esViewer = miRolEquipo === "viewer";
  const [tareas, setTareas] = useState<TareaTab[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("todas");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [vista, setVista] = usePersistedState<"lista" | "tarjetas">("flowo:tareas-vista", "tarjetas");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [publica, setPublica] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [nuevaNotaTarea, setNuevaNotaTarea] = useState("");
  const [nuevasSubtareas, setNuevasSubtareas] = useState<string[]>([]);
  const [subtareaInput, setSubtareaInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editandoTareaId, setEditandoTareaId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editPrioridad, setEditPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [editDeadline, setEditDeadline] = useState("");
  const [editPublica, setEditPublica] = useState(false);
  const [editValor, setEditValor] = useState("");
  const [editSubtareas, setEditSubtareas] = useState<Subtarea[]>([]);
  const [editSubtareaInput, setEditSubtareaInput] = useState("");
  const [editNota, setEditNota] = useState("");

  // Subtareas
  const [subtareaAbiertaId, setSubtareaAbiertaId] = useState<string | null>(null);
  const [nuevoTituloSubtarea, setNuevoTituloSubtarea] = useState("");
  const [nuevaSubtareaPublica, setNuevaSubtareaPublica] = useState(false);

  // Drive
  const [hayDrive, setHayDrive] = useState(false);
  const [crearCarpetaTarea, setCrearCarpetaTarea] = useState(false);
  const [nuevoValor, setNuevoValor] = useState("");
  const [modalCarpeta, setModalCarpeta] = useState<{
    nombre: string;
    resolve: (opcion: "usar" | "nueva") => void;
  } | null>(null);
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [asignaciones, setAsignaciones] = useState<{ tarea_id: string; user_id: string }[]>([]);

  useEffect(() => {
    cargarDatos();
    tieneDriveConectado().then(setHayDrive);
    if (equipoId) miembrosDeEquipo(equipoId).then(setMiembros);
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();

    let proyectosQuery = supabase.from("proyectos").select("id, nombre, folder_id, folder_url, cobro_por_tareas");
    if (modoEquipo) {
      proyectosQuery = proyectosQuery.eq("equipo_id", equipoId);
    } else {
      proyectosQuery = proyectosQuery.eq("user_id", user?.id);
    }
    const { data: proyectosData } = await proyectosQuery;
    setProyectos(proyectosData || []);

    let tareasData: any[] | null = null;
    if (modoEquipo) {
      const ids = (proyectosData || []).map((p: ProyectoOpcion) => p.id);
      if (ids.length === 0) {
        tareasData = [];
      } else {
        const res = await supabase.from("tareas").select("*").in("proyecto_id", ids).order("orden", { ascending: true }).order("created_at", { ascending: false });
        tareasData = res.data;
        if (res.data && res.data.length > 0) {
          const { data: asigData } = await supabase
            .from("tarea_asignaciones")
            .select("tarea_id, user_id")
            .in("tarea_id", res.data.map((td: any) => td.id));
          setAsignaciones(asigData || []);
        } else {
          setAsignaciones([]);
        }
      }
    } else {
      const res = await supabase.from("tareas").select("*").eq("user_id", user?.id).order("orden", { ascending: true }).order("created_at", { ascending: false });
      tareasData = res.data;
    }

    const proyectosMap = Object.fromEntries((proyectosData || []).map((p: ProyectoOpcion) => [p.id, p.nombre]));
    const tareasMapeadas = (tareasData || []).map((td: any) => ({
      ...td,
      titulo: td.nombre,
      completada: td.completada || false,
      estado: td.estado || (td.completada ? "completada" : "pendiente"),
      proyecto_nombre: proyectosMap[td.proyecto_id] || t("tareas.sinProyecto"),
      nota: td.nota || (Array.isArray(td.notas) && td.notas.length > 0 ? td.notas[0].texto : ""),
      notas: Array.isArray(td.notas) ? td.notas : [],
      subtareas: Array.isArray(td.subtareas) ? td.subtareas : [],
      folder_id: td.folder_id || undefined,
      folder_url: td.folder_url || undefined,
      aprobada_cliente: td.aprobada_cliente || false,
      valor: td.valor || 0,
      pagada: td.pagada || false,
      orden: td.orden ?? 0,
    }));
    setTareas(tareasMapeadas as TareaTab[]);
    setCargando(false);
  }

  const tareasConAsignados = useMemo(() => {
    if (!modoEquipo) return tareas;
    return tareas.map((tarea) => ({
      ...tarea,
      asignaciones: asignaciones
        .filter((a) => a.tarea_id === tarea.id)
        .map((a) => ({ user_id: a.user_id, nombre: miembros.find((m) => m.user_id === a.user_id)?.nombre || "?" })),
    })) as TareaTab[];
  }, [tareas, asignaciones, miembros, modoEquipo]);

  async function toggleAsignado(tareaId: string, userId: string) {
    if (!modoEquipo || esViewer) return;
    const existente = asignaciones.find((a) => a.tarea_id === tareaId && a.user_id === userId);
    if (existente) {
      setAsignaciones(asignaciones.filter((a) => a !== existente));
      await supabase.from("tarea_asignaciones").delete().eq("tarea_id", tareaId).eq("user_id", userId);
    } else {
      setAsignaciones([...asignaciones, { tarea_id: tareaId, user_id: userId }]);
      await supabase.from("tarea_asignaciones").insert({ tarea_id: tareaId, user_id: userId });
    }
  }

  const proyectoSeleccionado = proyectos.find((p) => p.id === proyectoId);
  const proyectoTieneCarpeta = !!proyectoSeleccionado?.folder_id;

  function preguntarCarpetaExistente(nombre: string): Promise<"usar" | "nueva"> {
    return new Promise((resolve) => {
      setModalCarpeta({ nombre, resolve });
    });
  }

  async function actualizarContadores(proyectoId: string | null) {
    if (!proyectoId) return;
    const { data } = await supabase.from("tareas").select("completada").eq("proyecto_id", proyectoId);
    const total = (data || []).length;
    const completadas = (data || []).filter((ta) => ta.completada).length;
    await supabase.from("proyectos").update({
      tareas_total: total,
      tareas_completadas: completadas,
    }).eq("id", proyectoId);
  }

  function agregarSubtareaInput() {
    const s = subtareaInput.trim();
    if (!s) return;
    setNuevasSubtareas([...nuevasSubtareas, s]);
    setSubtareaInput("");
  }

  function quitarSubtareaInput(index: number) {
    setNuevasSubtareas(nuevasSubtareas.filter((_, i) => i !== index));
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

    const subtareasFinales = subtareaInput.trim() ? [...nuevasSubtareas, subtareaInput.trim()] : nuevasSubtareas;
    const notasFinales = nuevaNotaTarea.trim()
      ? [{ id: Date.now(), texto: nuevaNotaTarea.trim(), fecha: new Date().toISOString().split("T")[0] }]
      : [];

    await supabase.from("tareas").insert({
      user_id: user?.id,
      proyecto_id: proyectoId,
      nombre: titulo,
      prioridad,
      estado: "pendiente",
      completada: false,
      visible_cliente: publica,
      deadline: deadline || null,
      notas: notasFinales,
      subtareas: subtareasFinales.map((s, i) => ({ id: Date.now() + i, titulo: s, completada: false, publica: false })),
      folder_id,
      folder_url,
      valor: proyectoSeleccionado?.cobro_por_tareas ? Number(nuevoValor) || 0 : 0,
      orden: -1,
    });

    await actualizarContadores(proyectoId);

    setTitulo(""); setProyectoId(""); setPrioridad("media"); setPublica(false);
    setDeadline(""); setCrearCarpetaTarea(false); setNuevaNotaTarea("");
    setNuevasSubtareas([]); setSubtareaInput(""); setNuevoValor("");
    setMostrarForm(false); setGuardando(false);
    cargarDatos();
  }

  async function cambiarEstado(id: string, nuevoEstado: "pendiente" | "en-progreso" | "completada") {
    const esCompletada = nuevoEstado === "completada";
    await supabase.from("tareas").update({ estado: nuevoEstado, completada: esCompletada }).eq("id", id);
    const tarea = tareas.find((ta) => ta.id === id);
    const nuevasTareas = tareas.map((ta) =>
      ta.id === id ? { ...ta, estado: nuevoEstado, completada: esCompletada } : ta
    );
    setTareas(nuevasTareas);
    if (tarea) {
      const tareasDelProyecto = nuevasTareas.filter((ta) => ta.proyecto_id === tarea.proyecto_id);
      const total = tareasDelProyecto.length;
      const completadasCount = tareasDelProyecto.filter((ta) => ta.completada).length;
      await supabase.from("proyectos").update({
        tareas_total: total,
        tareas_completadas: completadasCount,
      }).eq("id", tarea.proyecto_id);
    }
  }

  async function toggleTarea(id: string) {
    const tarea = tareas.find((ta) => ta.id === id);
    if (!tarea) return;
    await cambiarEstado(id, tarea.completada ? "pendiente" : "completada");
  }

  async function togglePagada(id: string) {
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea) return;
    const nuevoValor = !tarea.pagada;
    await supabase.from("tareas").update({ pagada: nuevoValor }).eq("id", id);
    setTareas(tareas.map((t) => t.id === id ? { ...t, pagada: nuevoValor } : t));
  }

  async function guardarEdicionTarea(id: string) {
    const nota = editNota.trim();
    const notas: Nota[] = nota
      ? [{ id: Date.now(), texto: nota, fecha: new Date().toISOString().split("T")[0] }]
      : [];
    await supabase.from("tareas").update({
      nombre: editTitulo,
      prioridad: editPrioridad,
      deadline: editDeadline || null,
      visible_cliente: editPublica,
      subtareas: editSubtareas,
      notas,
      valor: Number(editValor) || 0,
    }).eq("id", id);
    setTareas(tareas.map((ta) =>
      ta.id === id ? {
        ...ta,
        titulo: editTitulo,
        prioridad: editPrioridad,
        deadline: editDeadline,
        publica: editPublica,
        subtareas: editSubtareas,
        nota,
        notas,
        valor: Number(editValor) || 0,
      } : ta
    ));
    setEditandoTareaId(null);
  }

  async function eliminarTarea(id: string) {
    const tarea = tareas.find((ta) => ta.id === id);
    await supabase.from("tareas").delete().eq("id", id);
    setTareas(tareas.filter((ta) => ta.id !== id));
    if (tarea) await actualizarContadores(tarea.proyecto_id);
  }

  async function agregarSubtarea(tareaId: string) {
    if (!nuevoTituloSubtarea.trim()) return;
    const tarea = tareas.find((ta) => ta.id === tareaId);
    if (!tarea) return;
    const subtarea: Subtarea = {
      id: Date.now(),
      titulo: nuevoTituloSubtarea,
      completada: false,
      publica: nuevaSubtareaPublica,
    };
    const nuevasSubtareas = [...tarea.subtareas, subtarea];
    await supabase.from("tareas").update({ subtareas: nuevasSubtareas }).eq("id", tareaId);
    setTareas(tareas.map((ta) => ta.id === tareaId ? { ...ta, subtareas: nuevasSubtareas } : ta));
    setNuevoTituloSubtarea("");
    setNuevaSubtareaPublica(false);
    setSubtareaAbiertaId(null);
  }

  async function toggleSubtarea(tareaId: string, subtareaId: number) {
    const tarea = tareas.find((ta) => ta.id === tareaId);
    if (!tarea) return;
    const nuevasSubtareas = tarea.subtareas.map((s) =>
      s.id === subtareaId ? { ...s, completada: !s.completada } : s
    );
    await supabase.from("tareas").update({ subtareas: nuevasSubtareas }).eq("id", tareaId);
    setTareas(tareas.map((ta) => ta.id === tareaId ? { ...ta, subtareas: nuevasSubtareas } : ta));
  }

  async function eliminarSubtarea(tareaId: string, subtareaId: number) {
    const tarea = tareas.find((ta) => ta.id === tareaId);
    if (!tarea) return;
    const nuevasSubtareas = tarea.subtareas.filter((s) => s.id !== subtareaId);
    await supabase.from("tareas").update({ subtareas: nuevasSubtareas }).eq("id", tareaId);
    setTareas(tareas.map((ta) => ta.id === tareaId ? { ...ta, subtareas: nuevasSubtareas } : ta));
  }

  function abrirEdicion(tarea: Tarea) {
    setEditandoTareaId(tarea.id);
    setEditTitulo(tarea.titulo);
    setEditPrioridad(tarea.prioridad);
    setEditDeadline(tarea.deadline || "");
    setEditPublica(tarea.publica);
    setEditValor(String(tarea.valor || ""));
    setEditSubtareas(tarea.subtareas.map((s) => ({ ...s })));
    setEditSubtareaInput("");
    setEditNota(tarea.nota);
  }

  const tareasFiltradas = tareasConAsignados.filter((ta) => {
    const coincideBusqueda = ta.titulo.toLowerCase().includes(busqueda.toLowerCase());
    const coincidePrioridad = filtroPrioridad === "todas" || ta.prioridad === filtroPrioridad;
    const coincideProyecto = !filtroProyecto || ta.proyecto_id === filtroProyecto;
    const coincideEstado = filtroEstado === "todos" ||
      (filtroEstado === "completada" ? (ta.completada || ta.estado === "completada") : ta.estado === filtroEstado && !ta.completada);
    return coincideBusqueda && coincidePrioridad && coincideProyecto && coincideEstado;
  });

  const grupos = proyectos
    .map((p) => ({ proyecto: p, tareas: tareasFiltradas.filter((ta) => ta.proyecto_id === p.id) }))
    .filter((g) => g.tareas.length > 0);
  const tareasSinProyecto = tareasFiltradas.filter((ta) => !proyectos.some((p) => p.id === ta.proyecto_id));
  const filtrosActivos = filtroProyecto !== "" || filtroPrioridad !== "todas" || filtroEstado !== "todos";

  function limpiarFiltros() {
    setFiltroProyecto("");
    setFiltroPrioridad("todas");
    setFiltroEstado("todos");
  }

  const totalPendientes = tareas.filter((ta) => ta.estado === "pendiente" && !ta.completada).length;
  const totalEnProgreso = tareas.filter((ta) => ta.estado === "en-progreso" && !ta.completada).length;
  const totalCompletadas = tareas.filter((ta) => ta.completada || ta.estado === "completada").length;
  const totalAprobadas = tareas.filter((ta) => ta.aprobada_cliente).length;

  const propsComunes = {
    editandoTareaId,
    setEditandoTareaId,
    editTitulo,
    setEditTitulo,
    editPrioridad,
    setEditPrioridad,
    editDeadline,
    setEditDeadline,
    editPublica,
    setEditPublica,
    editValor,
    setEditValor,
    editSubtareas,
    setEditSubtareas,
    editSubtareaInput,
    setEditSubtareaInput,
    editNota,
    setEditNota,
    subtareaAbiertaId,
    setSubtareaAbiertaId,
    nuevoTituloSubtarea,
    setNuevoTituloSubtarea,
    nuevaSubtareaPublica,
    setNuevaSubtareaPublica,
    onToggleTarea: toggleTarea,
    onCambiarEstado: cambiarEstado,
    onTogglePagada: togglePagada,
    onGuardarEdicion: guardarEdicionTarea,
    onAbrirEdicion: abrirEdicion,
    onEliminarTarea: eliminarTarea,
    onAgregarSubtarea: agregarSubtarea,
    onToggleSubtarea: toggleSubtarea,
    onEliminarSubtarea: eliminarSubtarea,
    modoEquipo,
    miembros: miembros.map((m) => ({ userId: m.user_id, nombre: m.nombre })),
    onToggleAsignado: toggleAsignado,
    onReorderSubtareas: async (tareaId: string, subtareas: Subtarea[]) => {
      setTareas((prev) => prev.map((ta) => ta.id === tareaId ? { ...ta, subtareas } : ta));
      await supabase.from("tareas").update({ subtareas }).eq("id", tareaId);
    },
  };

  function proyectoCobroPorTareas(proyectoId: string): boolean {
    const p = proyectos.find((pr) => pr.id === proyectoId);
    return !!p?.cobro_por_tareas;
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback(async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = tareas.findIndex((ta) => ta.id === active.id);
    const newIdx = tareas.findIndex((ta) => ta.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const oldProyecto = tareas[oldIdx].proyecto_id;
    const newProyecto = tareas[newIdx].proyecto_id;
    if (oldProyecto !== newProyecto) return;
    const copia = [...tareas];
    const [moved] = copia.splice(oldIdx, 1);
    copia.splice(newIdx, 0, moved);
    setTareas(copia);
    await Promise.all(copia.map((ta, i) => supabase.from("tareas").update({ orden: i }).eq("id", ta.id)));
  }, [tareas]);

  if (cargando) return <div className="p-8"><p className="text-muted text-sm">{t("tareas.cargando")}</p></div>;

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-medium mb-2">{t("tareas.carpetaExiste")}</h3>
            <p className="text-muted text-sm mb-6">
              {t("tareas.carpetaExisteDesc1")} <span className="text-primary">"{modalCarpeta.nombre}"</span> {t("tareas.carpetaExisteDesc2")}
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-accent/40 text-primary text-sm px-4 py-3 rounded-lg hover:bg-accent/10 transition-colors text-left">
                <p className="font-medium text-accent">{t("tareas.usarCarpetaExistente")}</p>
                <p className="text-muted text-xs mt-0.5">{t("tareas.usarCarpetaExistenteDesc")}</p>
              </button>
              <button onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-3 rounded-lg hover:border-violet/40 transition-colors text-left">
                <p className="font-medium">{t("tareas.crearCarpetaNueva")}</p>
                <p className="text-muted text-xs mt-0.5">{t("tareas.crearCarpetaNuevaDesc")}</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight text-primary">{t("tareas.titulo")}</h2>
          <p className="text-muted mt-1">
            {t("tareas.pendientesConteo", { count: totalPendientes })} · {t("tareas.enProgresoConteo", { count: totalEnProgreso })} · {t("tareas.completadasConteo", { count: totalCompletadas })}
            {totalAprobadas > 0 && <span className="text-accent"> · {t("tareas.aprobadasPorCliente", { count: totalAprobadas })}</span>}
          </p>
        </div>
        {!esViewer && (
          <button onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
            + {t("tareas.nuevaTarea")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("tareas.buscarPlaceholder")}
          className="flex-1 min-w-[200px] bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          <button onClick={() => setVista("lista")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "lista" ? "bg-surface text-primary" : "text-muted hover:text-primary")}>
            {t("tareas.lista")}
          </button>
          <button onClick={() => setVista("tarjetas")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "tarjetas" ? "bg-surface text-primary" : "text-muted hover:text-primary")}>
            {t("tareas.tarjetas")}
          </button>
        </div>
        <button onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={"flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors " +
            (mostrarFiltros || filtrosActivos
              ? "bg-surface border-edge text-primary"
              : "bg-canvas border-edge text-muted hover:text-primary hover:border-accent/40")}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          {t("tareas.filtros")}
          {filtrosActivos && <span className="w-2 h-2 rounded-full bg-accent" />}
        </button>
      </div>

      {mostrarFiltros && (
        <div className="bg-canvas border border-edge rounded-lg p-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="min-w-[180px] flex-1">
            <label className="text-muted text-xs mb-1 block">{t("tareas.proyecto")}</label>
            <Select value={filtroProyecto} onChange={setFiltroProyecto}
              options={[
                { value: "", label: t("tareas.todosLosProyectos") },
                ...proyectos.map((p): SelectOption => ({ value: p.id, label: p.nombre })),
              ]} />
          </div>
          <div className="min-w-[160px]">
            <label className="text-muted text-xs mb-1 block">{t("tareas.prioridad")}</label>
            <Select value={filtroPrioridad} onChange={setFiltroPrioridad}
              options={[
                { value: "todas", label: t("tareas.todasLasPrioridades") },
                { value: "alta", label: prioridadLabels.alta },
                { value: "media", label: prioridadLabels.media },
                { value: "baja", label: prioridadLabels.baja },
              ]} />
          </div>
          <div className="min-w-[160px]">
            <label className="text-muted text-xs mb-1 block">{t("tareas.estado")}</label>
            <Select value={filtroEstado} onChange={setFiltroEstado}
              options={[
                { value: "todos", label: t("tareas.todosLosEstados") },
                { value: "pendiente", label: t("tareas.estadoPendiente") },
                { value: "en-progreso", label: t("tareas.estadoEnProgreso") },
                { value: "completada", label: t("tareas.estadoCompletada") },
              ]} />
          </div>
          {filtrosActivos && (
            <button onClick={limpiarFiltros}
              className="text-accent text-sm font-medium px-3 py-2 hover:opacity-90">
              {t("tareas.limpiarFiltros")}
            </button>
          )}
        </div>
      )}

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-xl p-5 mb-6">
          <h3 className="text-primary font-medium mb-4">{t("tareas.nuevaTarea")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-muted text-xs mb-1 block">{t("tareas.tituloCampo")}</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={t("tareas.placeholderTitulo")}
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">{t("tareas.proyectoCampo")}</label>
              <Select value={proyectoId} onChange={(v) => { setProyectoId(v); setCrearCarpetaTarea(false); }}
                options={[
                  { value: "", label: t("tareas.seleccionaProyecto") },
                  ...proyectos.map((p): SelectOption => ({ value: p.id, label: p.nombre + (p.folder_id ? " 📁" : "") })),
                ]} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-1 bg-surface border border-edge rounded-lg p-0.5">
              {(["alta", "media", "baja"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPrioridad(p)}
                  className={"text-xs px-3 py-1 rounded-md transition-colors font-medium " +
                    (prioridad === p ? prioridadConfig[p].color : "text-muted hover:text-primary")}>
                  {prioridadLabels[p]}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPublica(!publica)}
              className={"flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium " +
                (publica
                  ? "bg-accent/10 border-accent/40 text-accent"
                  : "bg-surface border-edge text-muted hover:text-primary")}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                {publica ? (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </>
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                )}
              </svg>
              {publica ? t("tareas.visibleCliente") : t("tareas.ocultaCliente")}
            </button>
            <label className="flex items-center gap-2">
              <span className="text-muted text-xs">{t("tareas.fechaLimite")}</span>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date"
                className="bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
            </label>
          </div>

          {proyectoSeleccionado?.cobro_por_tareas && (
            <div className="mb-4">
              <label className="text-muted text-xs mb-1 block">{t("tareas.valor")}</label>
              <div className="flex items-center gap-2">
                <span className="text-muted text-xs">$</span>
                <input value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)}
                  type="number" placeholder={t("tareas.placeholderValor")}
                  className="w-32 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
              </div>
            </div>
          )}

          {hayDrive && (
            proyectoTieneCarpeta ? (
              <div className="flex items-center gap-2 mb-4 bg-surface border border-edge rounded-lg px-3 py-2">
                <input type="checkbox" id="checkbox-drive-tarea"
                  checked={crearCarpetaTarea}
                  onChange={(e) => setCrearCarpetaTarea(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent cursor-pointer" />
                <label htmlFor="checkbox-drive-tarea" className="cursor-pointer">
                  <p className="text-muted text-xs">{t("tareas.crearCarpetaDrive")} <span className="text-muted">{t("tareas.opcional")}</span></p>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 bg-surface border border-edge rounded-lg px-3 py-2 opacity-50">
                <div className="w-3.5 h-3.5 rounded border border-edge flex-shrink-0" />
                <p className="text-muted text-xs">
                  {proyectoId ? t("tareas.sinCarpetaDrive") : t("tareas.seleccionaProyectoDrive")}
                </p>
              </div>
            )
          )}

          <div className="mb-4">
            <p className="text-muted text-xs mb-2">{t("tareas.subtareas")}</p>
            <div className="flex gap-2 mb-2">
              <input value={subtareaInput} onChange={(e) => setSubtareaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarSubtareaInput(); } }}
                placeholder={t("tareas.subtareaPlaceholder")}
                className="flex-1 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
              <button type="button" onClick={agregarSubtareaInput}
                className="bg-surface border border-edge text-primary text-xs font-medium px-3 py-1.5 rounded-lg hover:border-accent/40">
                {t("tareas.agregar")}
              </button>
            </div>
            {nuevasSubtareas.length > 0 && (
              <div className="space-y-1">
                {nuevasSubtareas.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface border border-edge rounded-lg px-3 py-1.5">
                    <p className="text-primary text-xs flex-1">{s}</p>
                    <button type="button" onClick={() => quitarSubtareaInput(i)}
                      className="text-muted text-xs hover:text-coral">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4">
            <p className="text-muted text-xs mb-2">{t("tareas.nota")}</p>
            <textarea value={nuevaNotaTarea} onChange={(e) => setNuevaNotaTarea(e.target.value)}
              placeholder={t("tareas.notaPlaceholder")}
              rows={2}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={agregarTarea} disabled={guardando || !titulo || !proyectoId}
              className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {guardando ? t("tareas.guardando") : t("tareas.guardarTarea")}
            </button>
            <button onClick={() => setMostrarForm(false)} className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary">
              {t("tareas.cancelar")}
            </button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-8">
        {grupos.map(({ proyecto, tareas: tareasGrupo }) => (
          <div key={proyecto.id}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-primary text-sm font-semibold">{proyecto.nombre}</h3>
              <span className="text-muted text-xs bg-gray/10 px-2 py-0.5 rounded-full">{tareasGrupo.length}</span>
            </div>
            <SortableContext items={tareasGrupo.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className={vista === "tarjetas" ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "space-y-2"}>
                {tareasGrupo.map((tarea) => <TareaItemSortable key={tarea.id} tarea={tarea} deshabilitado={esViewer} cobroPorTareas={proyectoCobroPorTareas(tarea.proyecto_id)} {...propsComunes} />)}
              </div>
            </SortableContext>
          </div>
        ))}
        {tareasSinProyecto.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-primary text-sm font-semibold">{t("tareas.sinProyecto")}</h3>
              <span className="text-muted text-xs bg-gray/10 px-2 py-0.5 rounded-full">{tareasSinProyecto.length}</span>
            </div>
            <SortableContext items={tareasSinProyecto.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className={vista === "tarjetas" ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "space-y-2"}>
                {tareasSinProyecto.map((tarea) => <TareaItemSortable key={tarea.id} tarea={tarea} deshabilitado={esViewer} cobroPorTareas={false} {...propsComunes} />)}
              </div>
            </SortableContext>
          </div>
        )}
        {tareasFiltradas.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted">
              {tareas.length === 0 ? t("tareas.vacio") : t("tareas.sinResultados")}
            </p>
          </div>
        )}
      </div>
      </DndContext>
    </div>
  );
}

export default Tareas;
