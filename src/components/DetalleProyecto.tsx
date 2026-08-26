import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buscarCarpeta, crearCarpeta, tieneDriveConectado } from "../lib/drive";
import TareaItemSortable from "./TareaItemSortable";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { prioridadConfig, type Tarea, type Subtarea, type Nota } from "./TareaItem";
import { usePersistedState } from "../hooks/usePersistedState";
import { formatearMoneda } from "../lib/moneda";
import { useMoneda } from "../hooks/useMoneda";
import { miembrosDeEquipo, type MiembroEquipo } from "../lib/equipo";

interface Registro {
  id: string;
  descripcion: string;
  duracion: number;
  fecha: string;
}

interface ServicioProyecto {
  nombre: string;
  modo: "fijo" | "horas";
  precio: number;
}

interface Proyecto {
  id: string;
  nombre: string;
  cliente_nombre: string;
  servicios: ServicioProyecto[];
  deadline: string;
  estado: "activo" | "en-riesgo" | "retrasado" | "completado";
  cliente_id: string;
  folder_id?: string;
  folder_url?: string;
  cobro_por_tareas?: boolean;
  es_privado?: boolean;
  feedback_visible?: boolean;
  created_by?: string;
}

interface MensajePortal {
  id: string;
  autor: string;
  contenido: string;
  tipo: string | null;
  tarea_id: string | null;
  creado_en: string;
}

interface Props {
  proyecto: Proyecto;
  onVolver: () => void;
  onGenerarFactura?: (proyectoId: string) => void;
  onEditar?: (proyecto: Proyecto) => void;
  equipoId?: string | null;
  miRolEquipo?: string | null;
}

function getEstadoConfig(t: TFunction): Record<string, { label: string; color: string }> {
  return {
    "activo": { label: t("detalleProyecto.estado.activo"), color: "text-accent bg-accent/10" },
    "en-riesgo": { label: t("detalleProyecto.estado.enRiesgo"), color: "text-coral bg-coral/10" },
    "retrasado": { label: t("detalleProyecto.estado.retrasado"), color: "text-red-400 bg-red-400/10" },
    "completado": { label: t("detalleProyecto.estado.completado"), color: "text-muted bg-gray/10" },
  };
}

function formatTiempo(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h + "h " + String(m).padStart(2, "0") + "m";
}

function formatFecha(iso: string, locale: string) {
  const fecha = new Date(iso);
  return fecha.toLocaleDateString(locale, { day: "numeric", month: "short" }) +
    " " + fecha.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function DetalleProyecto({ proyecto, onVolver, onGenerarFactura, onEditar, equipoId, miRolEquipo }: Props) {
  const { t, i18n } = useTranslation();
  const estadoConfig = getEstadoConfig(t);
  const localeFechas = i18n.language === "en" ? "en-US" : "es-ES";
  const moneda = useMoneda();
  const modoEquipo = !!equipoId;
  const esViewer = miRolEquipo === "viewer";
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [mostrarFormTarea, setMostrarFormTarea] = useState(false);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevaPrioridad, setNuevaPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [nuevaPublica, setNuevaPublica] = useState(true);
  const [nuevaNotaTarea, setNuevaNotaTarea] = useState("");
  const [nuevasSubtareas, setNuevasSubtareas] = useState<string[]>([]);
  const [subtareaInput, setSubtareaInput] = useState("");
  const [nuevaNotaProyecto, setNuevaNotaProyecto] = useState("");
  const [editandoNotaId, setEditandoNotaId] = useState<number | null>(null);
  const [notaProyectoEdit, setNotaProyectoEdit] = useState("");
  const [mostrarFormNota, setMostrarFormNota] = useState(false);
  const [finalizado, setFinalizado] = useState(proyecto.estado === "completado");
  const [fechaFinalizacion, setFechaFinalizacion] = useState("");
  const [confirmandoFinalizar, setConfirmandoFinalizar] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [clienteWhatsapp, setClienteWhatsapp] = useState("");
  const [subtareaAbiertaId, setSubtareaAbiertaId] = useState<string | null>(null);
  const [nuevoTituloSubtarea, setNuevoTituloSubtarea] = useState("");
  const [nuevaSubtareaPublica, setNuevaSubtareaPublica] = useState(false);
  const [nuevoValor, setNuevoValor] = useState("");
  const [editandoTareaId, setEditandoTareaId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editPrioridad, setEditPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [editPublica, setEditPublica] = useState(true);
  const [editDeadline, setEditDeadline] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editSubtareas, setEditSubtareas] = useState<Subtarea[]>([]);
  const [editSubtareaInput, setEditSubtareaInput] = useState("");
  const [editNota, setEditNota] = useState("");
  const [hayDrive, setHayDrive] = useState(false);
  const [crearCarpetaTarea, setCrearCarpetaTarea] = useState(false);
  const [colapsado, setColapsado] = usePersistedState<Record<string, boolean>>("flowo:secciones-" + proyecto.id, {});
  const [modalCarpeta, setModalCarpeta] = useState<{
    nombre: string;
    carpetaExistenteId: string;
    resolve: (opcion: "usar" | "nueva") => void;
  } | null>(null);
  const [mensajesPortal, setMensajesPortal] = useState<MensajePortal[]>([]);
  const [respuesta, setRespuesta] = useState("");
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [asignaciones, setAsignaciones] = useState<{ tarea_id: string; user_id: string }[]>([]);
  const [nuevosAsignados, setNuevosAsignados] = useState<string[]>([]);
  const [miUserId, setMiUserId] = useState<string | null>(null);

  useEffect(() => {
    if (modoEquipo) {
      supabase.auth.getUser().then(({ data }) => setMiUserId(data.user?.id || null));
    }
  }, [modoEquipo]);

  // Tareas con asignados resueltos (nombre) para render
  const tareasConAsignados = useMemo(() => {
    if (!modoEquipo) return tareas;
    return tareas.map((tarea) => ({
      ...tarea,
      asignaciones: asignaciones
        .filter((a) => a.tarea_id === tarea.id)
        .map((a) => ({ user_id: a.user_id, nombre: miembros.find((m) => m.user_id === a.user_id)?.nombre || "?" })),
    }));
  }, [tareas, asignaciones, miembros, modoEquipo]);

  useEffect(() => {
    cargarDatos();
    cargarMensajesPortal();
    tieneDriveConectado().then(setHayDrive);
    if (equipoId) {
      miembrosDeEquipo(equipoId).then(setMiembros);
    }

    // Realtime — mensajes del portal
    const canal = supabase
      .channel("portal_msgs_" + proyecto.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "portal_mensajes",
        filter: "proyecto_id=eq." + proyecto.id,
      }, (payload) => {
        setMensajesPortal(prev => [...prev, payload.new as MensajePortal]);
        const nuevo = payload.new as MensajePortal;
        if (nuevo.tipo === "aprobacion" && nuevo.tarea_id) {
          setTareas(prev => prev.map(tarea =>
            tarea.id === nuevo.tarea_id ? { ...tarea, aprobada_cliente: true } : tarea
          ));
        }
      })
      .subscribe();

    // Realtime — registros de tiempo (se actualiza cuando el timer guarda)
    const canalRegistros = supabase
      .channel("registros_" + proyecto.id)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "registros_tiempo",
        filter: "proyecto_id=eq." + proyecto.id,
      }, () => {
        supabase
          .from("registros_tiempo")
          .select("*")
          .eq("proyecto_id", proyecto.id)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            if (data) {
              setRegistros(data.map((r: any) => ({
                id: r.id,
                descripcion: r.descripcion,
                duracion: r.duracion,
                fecha: r.fecha,
              })));
            }
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
      supabase.removeChannel(canalRegistros);
    };
  }, []);

  async function cargarDatos() {
    const [
      { data: tareasData },
      { data: registrosData },
      { data: proyectoData },
      { data: clienteData },
    ] = await Promise.all([
      supabase.from("tareas").select("*").eq("proyecto_id", proyecto.id).order("orden", { ascending: true }).order("created_at", { ascending: false }),
      supabase.from("registros_tiempo").select("*").eq("proyecto_id", proyecto.id).order("created_at", { ascending: false }),
      supabase.from("proyectos").select("notas, fecha_finalizacion").eq("id", proyecto.id).single(),
      supabase.from("clientes").select("telefono").eq("id", proyecto.cliente_id).single(),
    ]);

    const tareasMapeadas = (tareasData || []).map((tarea: any) => ({
      id: tarea.id,
      titulo: tarea.nombre,
      completada: tarea.completada,
      estado: tarea.estado || (tarea.completada ? "completada" : "pendiente"),
      deadline: tarea.deadline || "",
      publica: tarea.visible_cliente,
      prioridad: tarea.prioridad,
      nota: tarea.nota || (Array.isArray(tarea.notas) && tarea.notas.length > 0 ? tarea.notas[0].texto : ""),
      notas: Array.isArray(tarea.notas) ? tarea.notas : [],
      folder_id: tarea.folder_id || undefined,
      folder_url: tarea.folder_url || undefined,
      subtareas: Array.isArray(tarea.subtareas) ? tarea.subtareas : [],
      aprobada_cliente: tarea.aprobada_cliente || false,
      valor: tarea.valor || 0,
      pagada: tarea.pagada || false,
      orden: tarea.orden ?? 0,
    }));

    setTareas(tareasMapeadas);
    setRegistros((registrosData || []).map((r: any) => ({
      id: r.id,
      descripcion: r.descripcion,
      duracion: r.duracion,
      fecha: r.fecha,
    })));
    setNotas(Array.isArray(proyectoData?.notas) ? proyectoData.notas : []);
    if (proyectoData?.fecha_finalizacion) setFechaFinalizacion(proyectoData.fecha_finalizacion);
    setClienteWhatsapp(clienteData?.telefono || "");

    if (equipoId && tareasMapeadas.length > 0) {
      const { data: asigData } = await supabase
        .from("tarea_asignaciones")
        .select("tarea_id, user_id")
        .in("tarea_id", tareasMapeadas.map((tarea) => tarea.id));
      setAsignaciones(asigData || []);
    } else {
      setAsignaciones([]);
    }
  }

  async function cargarMensajesPortal() {
    const { data } = await supabase
      .from("portal_mensajes")
      .select("id, autor, contenido, tipo, tarea_id, creado_en")
      .eq("proyecto_id", proyecto.id)
      .order("creado_en", { ascending: true });
    setMensajesPortal(data || []);
  }

  async function enviarRespuesta() {
    if (!respuesta.trim() || enviandoRespuesta) return;
    setEnviandoRespuesta(true);
    await supabase.from("portal_mensajes").insert({
      proyecto_id: proyecto.id,
      autor: "freelancer",
      contenido: respuesta.trim(),
      tipo: null,
      tarea_id: null,
    });
    setRespuesta("");
    setEnviandoRespuesta(false);
  }

  // Agrupar registros por tarea mostrando tiempo total acumulado
  const registrosAgrupados = registros.reduce((acc, r) => {
    const key = r.descripcion;
    if (acc[key]) {
      acc[key] = { ...acc[key], duracion: acc[key].duracion + r.duracion };
    } else {
      acc[key] = { ...r };
    }
    return acc;
  }, {} as Record<string, Registro>);
  const registrosMostrados = Object.values(registrosAgrupados);

  const totalSegundos = registros.reduce((acc, r) => acc + r.duracion, 0);
  const totalHoras = totalSegundos / 3600;
  const completadas = tareas.filter((tarea) => tarea.completada).length;
  const progreso = tareas.length > 0 ? Math.round((completadas / tareas.length) * 100) : 0;
  const todasCompletadas = tareas.length > 0 && completadas === tareas.length;
  const presupuesto = proyecto.cobro_por_tareas
    ? tareas.reduce((acc, t) => acc + (t.valor || 0), 0)
    : (proyecto.servicios?.reduce((acc, s) => acc + s.precio, 0) || 0);
  const totalTareasValor = tareas.reduce((acc, t) => acc + (t.valor || 0), 0);
  const totalTareasPagadasValor = tareas.filter(t => t.pagada).reduce((acc, t) => acc + (t.valor || 0), 0);
  const totalTareasPorCobrarValor = tareas.filter(t => t.completada && !t.pagada).reduce((acc, t) => acc + (t.valor || 0), 0);
  const modo = proyecto.servicios?.[0]?.modo || "fijo";
  const proyectoTieneCarpeta = !!proyecto.folder_id;
  const feedbacks = mensajesPortal.filter(m => m.tipo === "feedback");
  const tareasAprobadas = tareas.filter((tarea) => tarea.aprobada_cliente).length;
  const mostrarActividad = !modoEquipo || proyecto.feedback_visible !== false || miRolEquipo === "admin";

  function preguntarCarpetaExistente(nombre: string, carpetaExistenteId: string): Promise<"usar" | "nueva"> {
    return new Promise((resolve) => {
      setModalCarpeta({ nombre, carpetaExistenteId, resolve });
    });
  }

  async function toggleTarea(id: string) {
    if (finalizado) return;
    const tarea = tareas.find((tareaItem) => tareaItem.id === id);
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

  async function cambiarEstado(id: string, nuevoEstado: "pendiente" | "en-progreso" | "completada") {
    if (finalizado) return;
    const esCompletada = nuevoEstado === "completada";
    await supabase.from("tareas").update({ estado: nuevoEstado, completada: esCompletada }).eq("id", id);
    const nuevasTareas = tareas.map((tarea) => tarea.id === id ? { ...tarea, estado: nuevoEstado, completada: esCompletada } : tarea);
    setTareas(nuevasTareas);
    await supabase.from("proyectos").update({
      tareas_total: nuevasTareas.length,
      tareas_completadas: nuevasTareas.filter((tarea) => tarea.completada).length,
    }).eq("id", proyecto.id);
  }

  async function agregarTarea() {
    if (!nuevoTitulo || finalizado) return;
    const { data: { user } } = await supabase.auth.getUser();

    let folder_id: string | null = null;
    let folder_url: string | null = null;

    if (hayDrive && crearCarpetaTarea && proyectoTieneCarpeta) {
      try {
        const parentId = proyecto.folder_id!;
        const existentes = await buscarCarpeta(nuevoTitulo, parentId);
        if (existentes.length > 0) {
          const opcion = await preguntarCarpetaExistente(nuevoTitulo, existentes[0].id);
          if (opcion === "usar") {
            folder_id = existentes[0].id;
            folder_url = existentes[0].url;
          } else {
            const nueva = await crearCarpeta(nuevoTitulo, parentId);
            if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
          }
        } else {
          const nueva = await crearCarpeta(nuevoTitulo, parentId);
          if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
        }
      } catch (err) {
        console.error("Error creando carpeta de tarea:", err);
      }
    }

    const pendienteSubtarea = subtareaInput.trim();
    const subtareasFinales = pendienteSubtarea ? [...nuevasSubtareas, pendienteSubtarea] : nuevasSubtareas;
    const subtareasCreadas: Subtarea[] = subtareasFinales
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i) => ({ id: Date.now() + i, titulo: s, completada: false, publica: nuevaPublica }));
    const notaTarea = nuevaNotaTarea.trim();

    const { data } = await supabase.from("tareas").insert({
      user_id: user?.id,
      proyecto_id: proyecto.id,
      nombre: nuevoTitulo,
      prioridad: nuevaPrioridad,
      visible_cliente: nuevaPublica,
      completada: false,
      notas: [],
      subtareas: subtareasCreadas,
      estado: "pendiente",
      folder_id,
      folder_url,
      valor: proyecto.cobro_por_tareas ? Number(nuevoValor) || 0 : 0,
      orden: -1,
    }).select().single();

    if (data) {
      if (modoEquipo && nuevosAsignados.length > 0) {
        const filas = nuevosAsignados.map((userId) => ({ tarea_id: data.id, user_id: userId }));
        await supabase.from("tarea_asignaciones").insert(filas);
        setAsignaciones((prev) => [...prev, ...filas]);
        setNuevosAsignados([]);
      }
      if (notaTarea) {
        const { error: errNota } = await supabase.from("tareas").update({ nota: notaTarea }).eq("id", data.id);
        if (errNota) {
          await supabase.from("tareas").update({
            notas: [{ id: Date.now(), texto: notaTarea, fecha: new Date().toISOString() }],
          }).eq("id", data.id);
        }
      }
      const nuevasTareas = [{
        id: data.id,
        titulo: data.nombre,
        completada: false,
        estado: "pendiente" as const,
        deadline: "",
        publica: nuevaPublica,
        prioridad: nuevaPrioridad,
        nota: notaTarea,
        notas: notaTarea ? [{ id: Date.now(), texto: notaTarea, fecha: new Date().toISOString() }] : [],
        folder_id: data.folder_id || undefined,
        folder_url: data.folder_url || undefined,
        subtareas: subtareasCreadas,
        aprobada_cliente: false,
        valor: Number(nuevoValor) || 0,
        pagada: false,
      }, ...tareas];
      setTareas(nuevasTareas);
      await supabase.from("proyectos").update({
        tareas_total: nuevasTareas.length,
        tareas_completadas: nuevasTareas.filter((tarea) => tarea.completada).length,
      }).eq("id", proyecto.id);
    }
    setNuevoTitulo("");
    setNuevaPrioridad("media");
    setNuevaPublica(true);
    setNuevaNotaTarea("");
    setNuevasSubtareas([]);
    setSubtareaInput("");
    setCrearCarpetaTarea(false);
    setMostrarFormTarea(false);
    setNuevoValor("");
  }

  function agregarSubtareaInput() {
    if (!subtareaInput.trim()) return;
    setNuevasSubtareas([...nuevasSubtareas, subtareaInput.trim()]);
    setSubtareaInput("");
  }

  function quitarSubtareaInput(index: number) {
    setNuevasSubtareas(nuevasSubtareas.filter((_, i) => i !== index));
  }

  function abrirEdicion(tarea: Tarea) {
    setEditandoTareaId(tarea.id);
    setEditTitulo(tarea.titulo);
    setEditPrioridad(tarea.prioridad);
    setEditPublica(tarea.publica);
    setEditDeadline(tarea.deadline || "");
    setEditValor(String(tarea.valor || ""));
    setEditSubtareas(tarea.subtareas.map((s) => ({ ...s })));
    setEditSubtareaInput("");
    setEditNota(tarea.nota);
  }

  async function guardarEdicion() {
    if (!editandoTareaId || !editTitulo.trim()) return;
    const tarea = tareas.find((tareaItem) => tareaItem.id === editandoTareaId);
    if (!tarea) return;
    const nota = editNota.trim();
    const subtareas = editSubtareas.map((s, i) => ({ ...s, id: typeof s.id === "number" ? s.id : Date.now() + i }));

    await supabase.from("tareas").update({
      nombre: editTitulo.trim(),
      prioridad: editPrioridad,
      visible_cliente: editPublica,
      deadline: editDeadline || null,
      subtareas,
      valor: proyecto.cobro_por_tareas ? Number(editValor) || 0 : 0,
    }).eq("id", tarea.id);

    const { error: errNota } = await supabase.from("tareas").update({ nota }).eq("id", tarea.id);
    if (errNota) {
      const notas = nota
        ? (tarea.notas.length > 0
            ? tarea.notas.map((n, i) => (i === 0 ? { ...n, texto: nota, fecha: new Date().toISOString() } : n))
            : [{ id: Date.now(), texto: nota, fecha: new Date().toISOString() }])
        : (tarea.notas.length > 0 ? tarea.notas.slice(1) : []);
      await supabase.from("tareas").update({ notas }).eq("id", tarea.id);
    }

    setTareas(tareas.map((ta) => ta.id === tarea.id ? {
      ...ta,
      titulo: editTitulo.trim(),
      publica: editPublica,
      prioridad: editPrioridad,
      deadline: editDeadline,
      nota,
      valor: Number(editValor) || 0,
      notas: nota
        ? (tarea.notas.length > 0
            ? tarea.notas.map((n, i) => (i === 0 ? { ...n, texto: nota, fecha: new Date().toISOString() } : n))
            : [{ id: Date.now(), texto: nota, fecha: new Date().toISOString() }])
        : (tarea.notas.length > 0 ? tarea.notas.slice(1) : []),
      subtareas,
    } : ta));
    setEditandoTareaId(null);
  }

  async function eliminarTarea(id: string) {
    await supabase.from("tareas").delete().eq("id", id);
    const nuevasTareas = tareas.filter((ta) => ta.id !== id);
    setTareas(nuevasTareas);
    await supabase.from("proyectos").update({
      tareas_total: nuevasTareas.length,
      tareas_completadas: nuevasTareas.filter((tarea) => tarea.completada).length,
    }).eq("id", proyecto.id);
    setEditandoTareaId(null);
  }

  async function agregarSubtarea(tareaId: string) {
    if (!nuevoTituloSubtarea.trim()) return;
    const tarea = tareas.find((ta) => ta.id === tareaId);
    if (!tarea) return;
    const subtarea: Subtarea = { id: Date.now(), titulo: nuevoTituloSubtarea, completada: false, publica: nuevaSubtareaPublica };
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
    const nuevasSubtareas = tarea.subtareas.map((s) => s.id === subtareaId ? { ...s, completada: !s.completada } : s);
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
    const copia = [...tareas];
    const [moved] = copia.splice(oldIdx, 1);
    copia.splice(newIdx, 0, moved);
    setTareas(copia);
    await Promise.all(copia.map((ta, i) => supabase.from("tareas").update({ orden: i }).eq("id", ta.id)));
  }, [tareas]);

  async function agregarNotaProyecto() {
    if (!nuevaNotaProyecto.trim()) return;
    const nota: Nota = { id: Date.now(), texto: nuevaNotaProyecto, fecha: new Date().toISOString().split("T")[0] };
    const nuevasNotas = [...notas, nota];
    await supabase.from("proyectos").update({ notas: nuevasNotas }).eq("id", proyecto.id);
    setNotas(nuevasNotas);
    setNuevaNotaProyecto("");
    setMostrarFormNota(false);
  }

  async function eliminarNotaProyecto(id: number) {
    const nuevasNotas = notas.filter((n) => n.id !== id);
    await supabase.from("proyectos").update({ notas: nuevasNotas }).eq("id", proyecto.id);
    setNotas(nuevasNotas);
  }

  async function guardarNotaProyecto(id: number) {
    const texto = notaProyectoEdit.trim();
    if (!texto) return;
    const nuevasNotas = notas.map((n) => n.id === id ? { ...n, texto } : n);
    await supabase.from("proyectos").update({ notas: nuevasNotas }).eq("id", proyecto.id);
    setNotas(nuevasNotas);
    setEditandoNotaId(null);
    setNotaProyectoEdit("");
  }

  async function aceptarFinalizar() {
    const fecha = new Date().toISOString().split("T")[0];
    await supabase.from("proyectos").update({ estado: "completado", fecha_finalizacion: fecha }).eq("id", proyecto.id);
    setFinalizado(true);
    setFechaFinalizacion(fecha);
    setConfirmandoFinalizar(false);
  }

  async function eliminarProyecto() {
    await supabase.from("tareas").delete().eq("proyecto_id", proyecto.id);
    await supabase.from("proyectos").delete().eq("id", proyecto.id);
    onVolver();
  }

  const tareaItemProps = {
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
    onGuardarEdicion: guardarEdicion,
    onAbrirEdicion: abrirEdicion,
    onEliminarTarea: eliminarTarea,
    onAgregarSubtarea: agregarSubtarea,
    onToggleSubtarea: toggleSubtarea,
    onEliminarSubtarea: eliminarSubtarea,
    cobroPorTareas: proyecto.cobro_por_tareas,
    onReorderSubtareas: async (tareaId: string, subtareas: Subtarea[]) => {
      setTareas((prev) => prev.map((ta) => ta.id === tareaId ? { ...ta, subtareas } : ta));
      await supabase.from("tareas").update({ subtareas }).eq("id", tareaId);
    },
    modoEquipo,
    miembros: miembros.map((m) => ({ userId: m.user_id, nombre: m.nombre })),
    onToggleAsignado: toggleAsignado,
  };

  return (
    <div className="p-8">

      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-medium mb-2">{t("detalleProyecto.modalCarpeta.titulo")}</h3>
            <p className="text-muted text-sm mb-6">
              {t("detalleProyecto.modalCarpeta.existe", { nombre: modalCarpeta.nombre })}
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-accent/40 text-primary text-sm px-4 py-3 rounded-lg hover:bg-accent/10 transition-colors text-left">
                <p className="font-medium text-accent">{t("detalleProyecto.modalCarpeta.usarExistente")}</p>
                <p className="text-muted text-xs mt-0.5">{t("detalleProyecto.modalCarpeta.usarExistenteDesc")}</p>
              </button>
              <button onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-3 rounded-lg hover:border-violet/40 transition-colors text-left">
                <p className="font-medium">{t("detalleProyecto.modalCarpeta.crearNueva")}</p>
                <p className="text-muted text-xs mt-0.5">{t("detalleProyecto.modalCarpeta.crearNuevaDesc")}</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={onVolver} className="text-muted text-sm hover:text-primary mb-6 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t("detalleProyecto.volver")}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-[26px] font-semibold tracking-tight text-primary">{proyecto.nombre}</h1>
            {finalizado ? (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray/20 text-muted border border-gray/30">
                {t("detalleProyecto.proyectoFinalizado")}
              </span>
            ) : (
              <span className={"text-xs px-2 py-1 rounded-full font-medium " + estadoConfig[proyecto.estado].color}>
                {estadoConfig[proyecto.estado].label}
              </span>
            )}
            {proyecto.folder_url && (
              <button onClick={() => openUrl(proyecto.folder_url!)}
                className="text-xs bg-accent/10 border border-accent/30 text-accent px-2 py-1 rounded-lg hover:bg-accent/20">
                {t("detalleProyecto.verCarpetaDrive")}
              </button>
            )}
            {proyecto.cobro_por_tareas && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-accent/10 text-accent border border-accent/30">
                {t("proyectos.cobroPorTareas")}
              </span>
            )}
            {modoEquipo && proyecto.es_privado && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-violet/10 text-violet border border-violet/30">
                🔒 {t("equipos.privado")}
              </span>
            )}
          </div>
          <p className="text-muted text-sm">
            {proyecto.cliente_nombre}
            {proyecto.deadline && <> · {t("detalleProyecto.entrega", { fecha: proyecto.deadline })}</>}
          </p>
          {finalizado && fechaFinalizacion && (
            <p className="text-muted text-xs mt-1">{t("detalleProyecto.finalizadoEl", { fecha: fechaFinalizacion })}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openUrl("https://wa.me/" + clienteWhatsapp)}
            disabled={!clienteWhatsapp}
            className="bg-accent text-onaccent font-medium px-3 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            WhatsApp
          </button>
          <button onClick={() => openUrl("https://calendar.google.com/calendar/r/eventedit?text=Reunion+con+" + proyecto.cliente_nombre)}
            className="bg-surface border border-edge text-primary font-medium px-3 py-2 rounded-lg text-sm hover:border-violet/40">
            {t("detalleProyecto.agendarReunion")}
          </button>
          {!finalizado && (!modoEquipo || miRolEquipo === "admin" || proyecto.created_by === miUserId) && (
            <button onClick={() => setConfirmandoEliminar(true)}
              className="border border-coral/30 text-coral font-medium px-3 py-2 rounded-lg text-sm hover:bg-coral/10">
              {t("detalleProyecto.eliminar")}
            </button>
          )}
          {onEditar && (!modoEquipo || !esViewer) && (
            <button onClick={() => onEditar(proyecto)}
              className="bg-surface border border-edge text-primary font-medium px-3 py-2 rounded-lg text-sm hover:border-accent/40">
              {t("detalleProyecto.editar")}
            </button>
          )}
        </div>
      </div>

      {confirmandoEliminar && (
        <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
          <p className="text-primary text-sm font-medium mb-1">{t("detalleProyecto.confirmarEliminar.titulo")}</p>
          <p className="text-muted text-xs mb-3">{t("detalleProyecto.confirmarEliminar.desc")}</p>
          <div className="flex gap-2">
            <button onClick={eliminarProyecto} className="bg-coral text-white font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90">
              {t("detalleProyecto.confirmarEliminar.confirmar")}
            </button>
            <button onClick={() => setConfirmandoEliminar(false)} className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary">
              {t("detalleProyecto.cancelar")}
            </button>
          </div>
        </div>
      )}

      <div className={"grid grid-cols-1 gap-4 mb-6 " + (proyecto.cobro_por_tareas ? "md:grid-cols-4" : "md:grid-cols-3")}>
        <div className="bg-canvas border border-edge rounded-xl p-5">
          <p className="text-muted text-xs mb-1">{proyecto.cobro_por_tareas ? t("detalleProyecto.presupuestoTareas") : (modo === "fijo" ? t("detalleProyecto.presupuestoTotal") : t("detalleProyecto.tarifaPorHora"))}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(presupuesto, moneda)}{!proyecto.cobro_por_tareas && modo === "horas" ? "/hr" : ""}</p>
          {proyecto.cobro_por_tareas && (
            <p className="text-muted text-xs mt-1">{t("detalleProyecto.totalTareasValor", { total: tareas.length, valor: formatearMoneda(totalTareasValor, moneda) })}</p>
          )}
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-5">
          <p className="text-muted text-xs mb-1">{t("detalleProyecto.horasTrabajadas")}</p>
          <p className="text-2xl font-bold text-primary">{formatTiempo(totalSegundos)}</p>
        </div>
        {proyecto.cobro_por_tareas && (
          <div className="bg-canvas border border-edge rounded-xl p-5">
            <p className="text-muted text-xs mb-1">{t("detalleProyecto.porCobrar")}</p>
            <p className="text-2xl font-bold text-white">{formatearMoneda(totalTareasPorCobrarValor, moneda)}</p>
            <p className="text-muted text-xs mt-1">{t("detalleProyecto.tareasPorCobrar", { count: tareas.filter(t => t.completada && !t.pagada).length })}</p>
          </div>
        )}
        {proyecto.cobro_por_tareas && (
          <div className="bg-canvas border border-edge rounded-xl p-5">
            <p className="text-muted text-xs mb-1">{t("detalleProyecto.cobrado")}</p>
            <p className="text-2xl font-bold text-accent">{formatearMoneda(totalTareasPagadasValor, moneda)}</p>
            <p className="text-muted text-xs mt-1">{t("detalleProyecto.tareasPagadas", { count: tareas.filter(t => t.pagada).length })}</p>
          </div>
        )}
        {!proyecto.cobro_por_tareas && (
          <div className="bg-canvas border border-edge rounded-xl p-5">
            <p className="text-muted text-xs mb-1">{modo === "fijo" ? t("detalleProyecto.tarifaRealImplicita") : t("detalleProyecto.totalAcumulado")}</p>
            <p className="text-2xl font-bold text-accent">
              {modo === "fijo"
                ? totalHoras >= 1
                  ? formatearMoneda(Math.round(presupuesto / totalHoras), moneda) + "/hr"
                  : "—"
                : formatearMoneda(Math.round(totalHoras * presupuesto), moneda)
              }
            </p>
            {modo === "fijo" && totalHoras < 1 && totalSegundos > 0 && (
              <p className="text-muted text-xs mt-1">{t("detalleProyecto.disponible1h")}</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-canvas border border-edge rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1A1F2E" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1DB8A0" strokeWidth="3.5"
                  strokeLinecap="round" strokeDasharray={`${progreso} 100`}
                  className="transition-all duration-500" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-primary text-sm font-semibold">{progreso}%</span>
            </div>
            <div>
              <p className="text-primary font-medium text-[15px]">{t("detalleProyecto.progreso")}</p>
              <p className="text-muted text-sm mt-0.5">{t("detalleProyecto.tareasCompletadas", { count: completadas, total: tareas.length })}</p>
              {!finalizado && todasCompletadas && (
                <p className="text-accent text-xs mt-0.5 font-medium">{t("detalleProyecto.todasListas")}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!finalizado && todasCompletadas && !confirmandoFinalizar && (
              <button onClick={() => setConfirmandoFinalizar(true)}
                className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90">
                {t("detalleProyecto.finalizarProyecto")}
              </button>
            )}
            {!finalizado && confirmandoFinalizar && (
              <>
                <p className="text-muted text-xs">{t("detalleProyecto.confirmarFinalizar")}</p>
                <button onClick={aceptarFinalizar}
                  className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  {t("detalleProyecto.aceptar")}
                </button>
                <button onClick={() => setConfirmandoFinalizar(false)}
                  className="text-muted px-3 py-1.5 rounded-lg text-xs hover:text-primary">
                  {t("detalleProyecto.cancelar")}
                </button>
              </>
            )}
            {finalizado && (
              <button onClick={() => onGenerarFactura && onGenerarFactura(proyecto.id)}
                className="bg-violet text-white font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90">
                {t("detalleProyecto.generarComprobante")}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 h-2.5 w-full bg-surface rounded-full overflow-hidden">
          <div
            className={"h-full rounded-full transition-all duration-500 " + (finalizado ? "bg-gray" : "bg-gradient-to-r from-accent to-accent2")}
            style={{ width: progreso + "%" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

        <div className="bg-canvas border border-edge rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setColapsado(c => ({ ...c, tareas: !c.tareas }))}
              className="flex items-center gap-2 group cursor-pointer">
              <svg className={"w-4 h-4 text-muted transition-transform " + (colapsado.tareas ? "" : "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-primary font-medium">{t("detalleProyecto.tareas")}</h3>
            </button>
            <div className="flex items-center gap-3">
              {!finalizado && !esViewer && (
                <button onClick={() => setMostrarFormTarea(!mostrarFormTarea)}
                  className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10">
                  {t("detalleProyecto.nueva")}
                </button>
              )}
            </div>
          </div>

          {!colapsado.tareas && (<>

          {mostrarFormTarea && (
            <div className="bg-surface border border-edge rounded-lg p-3 mb-4">
              <input value={nuevoTitulo} onChange={(e) => setNuevoTitulo(e.target.value)}
                placeholder={t("detalleProyecto.placeholderTarea")}
                className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent mb-3" />
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
                  {(["alta", "media", "baja"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setNuevaPrioridad(p)}
                      className={"text-xs px-3 py-1 rounded-md transition-colors font-medium " +
                        (nuevaPrioridad === p ? prioridadConfig[p].color : "text-muted hover:text-primary")}>
                      {t("detalleProyecto.prioridad." + p)}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setNuevaPublica(!nuevaPublica)}
                  className={"flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium " +
                    (nuevaPublica
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "bg-surface border-edge text-muted hover:text-primary")}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    {nuevaPublica ? (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    )}
                  </svg>
                  {nuevaPublica ? t("detalleProyecto.visibleCliente") : t("detalleProyecto.ocultaCliente")}
                </button>
              </div>

              {modoEquipo && miembros.length > 0 && (
                <div className="mb-3">
                  <p className="text-muted text-xs mb-2">{t("equipos.asignadosLabel")}</p>
                  <div className="flex flex-wrap gap-2">
                    {miembros.map((m) => {
                      const activo = nuevosAsignados.includes(m.user_id);
                      return (
                        <button key={m.user_id} type="button"
                          onClick={() => setNuevosAsignados((prev) =>
                            prev.includes(m.user_id) ? prev.filter((u) => u !== m.user_id) : [...prev, m.user_id]
                          )}
                          className={"flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs transition-colors " +
                            (activo
                              ? "bg-accent/10 border-accent/40 text-accent font-medium"
                              : "bg-canvas border-edge text-muted hover:text-primary")}>
                          <span className={"w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0 " +
                            (activo ? "bg-accent text-onaccent" : "bg-gray text-muted2")}>
                            {m.nombre.charAt(0).toUpperCase()}
                          </span>
                          <span className="max-w-[120px] truncate">{m.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {hayDrive && (
                proyectoTieneCarpeta ? (
                  <div className="flex items-center gap-2 mb-3 bg-canvas border border-edge rounded-lg px-3 py-2">
                    <input type="checkbox" id="checkbox-drive-tarea"
                      checked={crearCarpetaTarea}
                      onChange={(e) => setCrearCarpetaTarea(e.target.checked)}
                      className="w-3.5 h-3.5 accent-accent cursor-pointer" />
                    <label htmlFor="checkbox-drive-tarea" className="cursor-pointer">
                      <p className="text-muted text-xs">{t("detalleProyecto.crearCarpetaDriveTarea")}</p>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-3 bg-canvas border border-edge rounded-lg px-3 py-2 opacity-50">
                    <div className="w-3.5 h-3.5 rounded border border-edge flex-shrink-0" />
                    <p className="text-muted text-xs">{t("detalleProyecto.sinCarpetaDrive")}</p>
                  </div>
                )
              )}

              <div className="mb-3">
                <p className="text-muted text-xs mb-2">{t("detalleProyecto.subtareas")}</p>
                <div className="flex gap-2 mb-2">
                  <input value={subtareaInput} onChange={(e) => setSubtareaInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarSubtareaInput(); } }}
                    placeholder={t("detalleProyecto.placeholderSubtarea")}
                    className="flex-1 bg-canvas border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                  <button type="button" onClick={agregarSubtareaInput}
                    className="bg-surface border border-edge text-primary text-xs font-medium px-3 py-1.5 rounded-lg hover:border-accent/40">
                    {t("detalleProyecto.agregar")}
                  </button>
                </div>
                {nuevasSubtareas.length > 0 && (
                  <div className="space-y-1">
                    {nuevasSubtareas.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 bg-canvas border border-edge rounded-lg px-3 py-1.5">
                        <p className="text-primary text-xs flex-1">{s}</p>
                        <button type="button" onClick={() => quitarSubtareaInput(i)}
                          className="text-muted text-xs hover:text-coral">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {proyecto.cobro_por_tareas && (
                <div className="mb-3">
                  <p className="text-muted text-xs mb-2">{t("detalleProyecto.valorTarea")}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-xs">$</span>
                    <input value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)}
                      type="number" placeholder="0"
                      className="w-32 bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent" />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <p className="text-muted text-xs mb-2">{t("detalleProyecto.nota")}</p>
                <textarea value={nuevaNotaTarea} onChange={(e) => setNuevaNotaTarea(e.target.value)}
                  placeholder={t("detalleProyecto.placeholderNotaTarea")}
                  rows={2}
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none" />
              </div>

              <div className="flex gap-2">
                <button onClick={agregarTarea} className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  {t("detalleProyecto.guardar")}
                </button>
                <button onClick={() => { setMostrarFormTarea(false); setNuevaNotaTarea(""); setNuevasSubtareas([]); setSubtareaInput(""); }} className="text-muted px-3 py-1.5 rounded-lg text-xs hover:text-primary">
                  {t("detalleProyecto.cancelar")}
                </button>
              </div>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tareasConAsignados.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {tareasConAsignados.map((tarea) => (
                  <TareaItemSortable key={tarea.id} tarea={tarea} deshabilitado={finalizado || esViewer} {...tareaItemProps} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          </>)}
        </div>

        {/* Tiempo registrado — agrupado por tarea */}
        <div className="bg-canvas border border-edge rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setColapsado(c => ({ ...c, tiempo: !c.tiempo }))}
              className="flex items-center gap-2 cursor-pointer">
              <svg className={"w-4 h-4 text-muted transition-transform " + (colapsado.tiempo ? "" : "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-primary font-medium">{t("detalleProyecto.tiempoRegistrado")}</h3>
            </button>
            <span className="text-accent text-sm font-medium">{formatTiempo(totalSegundos)} {t("detalleProyecto.total")}</span>
          </div>
          {!colapsado.tiempo && (
          <div className="space-y-2">
            {registrosMostrados.length === 0 && (
              <p className="text-muted text-sm">{t("detalleProyecto.sinRegistros")}</p>
            )}
            {registrosMostrados.map((registro) => (
              <div key={registro.id} className="flex items-center justify-between py-2 border-b border-edge last:border-0">
                <div>
                  <p className="text-primary text-sm">{registro.descripcion}</p>
                  <p className="text-muted text-xs mt-0.5">{t("detalleProyecto.tiempoTotalAcumulado")}</p>
                </div>
                <span className="text-accent font-mono text-sm font-medium">{formatTiempo(registro.duracion)}</span>
              </div>
            ))}
          </div>
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

      <div className="bg-canvas border border-edge rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setColapsado(c => ({ ...c, notas: !c.notas }))}
            className="flex items-center gap-2 cursor-pointer">
            <svg className={"w-4 h-4 text-muted transition-transform " + (colapsado.notas ? "" : "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-primary font-medium">Notas del proyecto</h3>
          </button>
          {!finalizado && !colapsado.notas && (
            <button onClick={() => setMostrarFormNota(!mostrarFormNota)}
              className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10">
              + Nueva nota
            </button>
          )}
        </div>

        {!colapsado.notas && (<>


        {mostrarFormNota && (
          <div className="mb-4">
            <textarea value={nuevaNotaProyecto} onChange={(e) => setNuevaNotaProyecto(e.target.value)}
              placeholder="Escribe una nota sobre este proyecto..." rows={3}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent resize-none mb-2" />
            <div className="flex gap-2">
              <button onClick={agregarNotaProyecto}
                className="bg-accent text-onaccent font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">Guardar nota</button>
              <button onClick={() => setMostrarFormNota(false)}
                className="text-muted px-4 py-1.5 rounded-lg text-xs hover:text-primary">Cancelar</button>
            </div>
          </div>
        )}

        {notas.length === 0 && !mostrarFormNota && <p className="text-muted text-sm">Sin notas aun</p>}

        <div className="space-y-3">
          {notas.map((nota) => (
            <div key={nota.id} className="bg-surface rounded-lg px-4 py-3">
              {editandoNotaId === nota.id ? (
                <div>
                  <textarea value={notaProyectoEdit} onChange={(e) => setNotaProyectoEdit(e.target.value)} rows={2}
                    placeholder="Escribe una nota sobre este proyecto..."
                    className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent resize-none mb-2" />
                  <div className="flex gap-2">
                    <button onClick={() => guardarNotaProyecto(nota.id)}
                      className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">Guardar</button>
                    <button onClick={() => { setEditandoNotaId(null); setNotaProyectoEdit(""); }}
                      className="text-muted px-3 py-1.5 rounded-lg text-xs hover:text-primary">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-primary text-sm">{nota.texto}</p>
                    <p className="text-muted text-xs mt-1">{nota.fecha}</p>
                  </div>
                  {!finalizado && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button onClick={() => { setEditandoNotaId(nota.id); setNotaProyectoEdit(nota.texto); }}
                        className="text-muted text-xs hover:text-accent">Editar</button>
                      <button onClick={() => eliminarNotaProyecto(nota.id)}
                        className="text-muted text-xs hover:text-coral">Eliminar</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        </>)}
      </div>

      {mostrarActividad && (
      <div className="bg-canvas border border-edge rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setColapsado(c => ({ ...c, actividad: !c.actividad }))}
            className="flex items-center gap-2 cursor-pointer">
            <svg className={"w-4 h-4 text-muted transition-transform " + (colapsado.actividad ? "" : "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div>
              <h3 className="text-primary font-medium">Actividad del cliente</h3>
              <p className="text-muted text-xs mt-0.5">Mensajes, feedbacks y aprobaciones desde el portal</p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {tareasAprobadas > 0 && (
              <span className="text-accent text-xs bg-accent/10 px-2 py-1 rounded-lg">
                {tareasAprobadas} tarea{tareasAprobadas > 1 ? "s" : ""} aprobada{tareasAprobadas > 1 ? "s" : ""}
              </span>
            )}
            {feedbacks.length > 0 && (
              <span className="text-violet text-xs bg-violet/10 px-2 py-1 rounded-lg">
                {feedbacks.length} feedback{feedbacks.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {!colapsado.actividad && (<>

        {mensajesPortal.length === 0 ? (
          <p className="text-muted text-sm">Sin actividad del cliente aún.</p>
        ) : (
          <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
            {mensajesPortal.map((msg) => {
              const esCliente = msg.autor === "cliente";
              const esAprobacion = msg.tipo === "aprobacion";
              const esFeedback = msg.tipo === "feedback";
              return (
                <div key={msg.id} className={"flex gap-3 " + (esCliente ? "" : "flex-row-reverse")}>
                  <div className={"flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold " +
                    (esCliente ? "bg-violet/20 text-violet" : "bg-accent/20 text-accent")}>
                    {esCliente ? "C" : "F"}
                  </div>
                  <div className={"max-w-[75%] " + (esCliente ? "" : "text-right")}>
                    <div className={"rounded-xl px-3 py-2 " +
                      (esAprobacion ? "bg-accent/10 border border-accent/30" :
                       esFeedback ? "bg-violet/10 border border-violet/30" :
                       esCliente ? "bg-edge" : "bg-accent/10 border border-accent/30")}>
                      <p className="text-primary text-xs">{msg.contenido}</p>
                    </div>
                    <p className="text-muted text-xs mt-1">{formatFecha(msg.creado_en, localeFechas)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t border-edge">
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarRespuesta(); } }}
            placeholder="Responder al cliente desde el portal..."
            rows={2}
            className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none"
          />
          <button onClick={enviarRespuesta} disabled={!respuesta.trim() || enviandoRespuesta}
            className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-xs hover:opacity-90 disabled:opacity-50 self-end">
            {enviandoRespuesta ? "..." : "Enviar"}
          </button>
        </div>
        <p className="text-muted text-xs mt-1">Enter para enviar · El cliente lo verá en su portal</p>

        </>)}
      </div>
      )}

      </div>

    </div>
  );
}

export default DetalleProyecto;