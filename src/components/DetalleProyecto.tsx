import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buscarCarpeta, crearCarpeta, tieneDriveConectado } from "../lib/drive";

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
  completada: boolean;
  publica: boolean;
  prioridad: "alta" | "media" | "baja";
  nota: string;
  folder_id?: string;
  folder_url?: string;
  subtareas: Subtarea[];
  aprobada_cliente: boolean;
}

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
}

const estadoConfig = {
  "activo": { label: "En tiempo", color: "text-[#1DB8A0] bg-[#1DB8A0]/10" },
  "en-riesgo": { label: "En riesgo", color: "text-[#F47C5C] bg-[#F47C5C]/10" },
  "retrasado": { label: "Retrasado", color: "text-red-400 bg-red-400/10" },
  "completado": { label: "Completado", color: "text-[#6B7280] bg-[#6B7280]/10" },
};

const prioridadConfig = {
  "alta": { label: "Alta", color: "text-[#F47C5C] bg-[#F47C5C]/10" },
  "media": { label: "Media", color: "text-[#7C5CBF] bg-[#7C5CBF]/10" },
  "baja": { label: "Baja", color: "text-[#6B7280] bg-[#6B7280]/10" },
};

function formatTiempo(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h + "h " + String(m).padStart(2, "0") + "m";
}

function formatFecha(iso: string) {
  const fecha = new Date(iso);
  return fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) +
    " " + fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function DetalleProyecto({ proyecto, onVolver, onGenerarFactura }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [mostrarFormTarea, setMostrarFormTarea] = useState(false);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevaPrioridad, setNuevaPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [nuevaPublica, setNuevaPublica] = useState(false);
  const [nuevaNota, setNuevaNota] = useState("");
  const [notaTareaId, setNotaTareaId] = useState<string | null>(null);
  const [nuevaNotaProyecto, setNuevaNotaProyecto] = useState("");
  const [mostrarFormNota, setMostrarFormNota] = useState(false);
  const [finalizado, setFinalizado] = useState(proyecto.estado === "completado");
  const [fechaFinalizacion, setFechaFinalizacion] = useState("");
  const [confirmandoFinalizar, setConfirmandoFinalizar] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [clienteWhatsapp, setClienteWhatsapp] = useState("");

  // Subtareas
  const [subtareaAbiertaId, setSubtareaAbiertaId] = useState<string | null>(null);
  const [nuevoTituloSubtarea, setNuevoTituloSubtarea] = useState("");
  const [nuevaSubtareaPublica, setNuevaSubtareaPublica] = useState(false);

  // Drive para tareas
  const [hayDrive, setHayDrive] = useState(false);
  const [crearCarpetaTarea, setCrearCarpetaTarea] = useState(false);
  const [modalCarpeta, setModalCarpeta] = useState<{
    nombre: string;
    carpetaExistenteId: string;
    resolve: (opcion: "usar" | "nueva") => void;
  } | null>(null);

  // Actividad del cliente
  const [mensajesPortal, setMensajesPortal] = useState<MensajePortal[]>([]);
  const [respuesta, setRespuesta] = useState("");
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);

  useEffect(() => {
    cargarDatos();
    cargarMensajesPortal();
    tieneDriveConectado().then(setHayDrive);

    // Suscripción en tiempo real a mensajes del portal
    const canal = supabase
      .channel("portal_msgs_" + proyecto.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "portal_mensajes",
        filter: "proyecto_id=eq." + proyecto.id,
      }, (payload) => {
        setMensajesPortal(prev => [...prev, payload.new as MensajePortal]);
        // Actualizar aprobaciones en tareas
        const nuevo = payload.new as MensajePortal;
        if (nuevo.tipo === "aprobacion" && nuevo.tarea_id) {
          setTareas(prev => prev.map(t =>
            t.id === nuevo.tarea_id ? { ...t, aprobada_cliente: true } : t
          ));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  async function cargarDatos() {
    const [
      { data: tareasData },
      { data: registrosData },
      { data: proyectoData },
      { data: clienteData },
    ] = await Promise.all([
      supabase.from("tareas").select("*").eq("proyecto_id", proyecto.id).order("created_at", { ascending: true }),
      supabase.from("registros_tiempo").select("*").eq("proyecto_id", proyecto.id).order("created_at", { ascending: false }),
      supabase.from("proyectos").select("notas, fecha_finalizacion").eq("id", proyecto.id).single(),
      supabase.from("clientes").select("telefono").eq("id", proyecto.cliente_id).single(),
    ]);

    const tareasMapeadas = (tareasData || []).map((t: any) => ({
      id: t.id,
      titulo: t.nombre,
      completada: t.completada,
      publica: t.visible_cliente,
      prioridad: t.prioridad,
      nota: t.nota || "",
      folder_id: t.folder_id || undefined,
      folder_url: t.folder_url || undefined,
      subtareas: Array.isArray(t.subtareas) ? t.subtareas : [],
      aprobada_cliente: t.aprobada_cliente || false,
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

  const totalSegundos = registros.reduce((acc, r) => acc + r.duracion, 0);
  const totalHoras = totalSegundos / 3600;
  const completadas = tareas.filter((t) => t.completada).length;
  const progreso = tareas.length > 0 ? Math.round((completadas / tareas.length) * 100) : 0;
  const todasCompletadas = tareas.length > 0 && completadas === tareas.length;
  const presupuesto = proyecto.servicios?.reduce((acc, s) => acc + s.precio, 0) || 0;
  const modo = proyecto.servicios?.[0]?.modo || "fijo";
  const proyectoTieneCarpeta = !!proyecto.folder_id;

  function preguntarCarpetaExistente(nombre: string, carpetaExistenteId: string): Promise<"usar" | "nueva"> {
    return new Promise((resolve) => {
      setModalCarpeta({ nombre, carpetaExistenteId, resolve });
    });
  }

  async function toggleTarea(id: string) {
    if (finalizado) return;
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea) return;
    const nuevaCompletada = !tarea.completada;
    await supabase.from("tareas").update({ completada: nuevaCompletada }).eq("id", id);
    const nuevasTareas = tareas.map((t) => t.id === id ? { ...t, completada: nuevaCompletada } : t);
    setTareas(nuevasTareas);
    const total = nuevasTareas.length;
    const completadasCount = nuevasTareas.filter((t) => t.completada).length;
    await supabase.from("proyectos").update({
      tareas_total: total,
      tareas_completadas: completadasCount,
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

    const { data } = await supabase.from("tareas").insert({
      user_id: user?.id,
      proyecto_id: proyecto.id,
      nombre: nuevoTitulo,
      prioridad: nuevaPrioridad,
      visible_cliente: nuevaPublica,
      completada: false,
      notas: [],
      subtareas: [],
      estado: "pendiente",
      folder_id,
      folder_url,
    }).select().single();

    if (data) {
      const nuevasTareas = [...tareas, {
        id: data.id,
        titulo: data.nombre,
        completada: false,
        publica: nuevaPublica,
        prioridad: nuevaPrioridad,
        nota: "",
        folder_id: data.folder_id || undefined,
        folder_url: data.folder_url || undefined,
        subtareas: [],
        aprobada_cliente: false,
      }];
      setTareas(nuevasTareas);
      await supabase.from("proyectos").update({
        tareas_total: nuevasTareas.length,
        tareas_completadas: nuevasTareas.filter((t) => t.completada).length,
      }).eq("id", proyecto.id);
    }
    setNuevoTitulo("");
    setNuevaPrioridad("media");
    setNuevaPublica(false);
    setCrearCarpetaTarea(false);
    setMostrarFormTarea(false);
  }

  async function guardarNotaTarea(id: string, texto: string) {
    await supabase.from("tareas").update({ nota: texto }).eq("id", id);
    setTareas(tareas.map((t) => t.id === id ? { ...t, nota: texto } : t));
    setNotaTareaId(null);
    setNuevaNota("");
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

  async function agregarNotaProyecto() {
    if (!nuevaNotaProyecto.trim()) return;
    const nota: Nota = {
      id: Date.now(),
      texto: nuevaNotaProyecto,
      fecha: new Date().toISOString().split("T")[0],
    };
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

  async function aceptarFinalizar() {
    const fecha = new Date().toISOString().split("T")[0];
    await supabase.from("proyectos").update({
      estado: "completado",
      fecha_finalizacion: fecha,
    }).eq("id", proyecto.id);
    setFinalizado(true);
    setFechaFinalizacion(fecha);
    setConfirmandoFinalizar(false);
  }

  async function eliminarProyecto() {
    await supabase.from("tareas").delete().eq("proyecto_id", proyecto.id);
    await supabase.from("proyectos").delete().eq("id", proyecto.id);
    onVolver();
  }

  function abrirWhatsApp() {
    openUrl("https://wa.me/" + clienteWhatsapp);
  }

  function abrirCalendar() {
    openUrl("https://calendar.google.com/calendar/r/eventedit?text=Reunion+con+" + proyecto.cliente_nombre);
  }

  // Estadísticas de actividad del cliente
  const aprobaciones = mensajesPortal.filter(m => m.tipo === "aprobacion");
  const feedbacks = mensajesPortal.filter(m => m.tipo === "feedback");
  const mensajesGenerales = mensajesPortal.filter(m => !m.tipo);
  const tareasAprobadas = tareas.filter(t => t.aprobada_cliente).length;

  return (
    <div className="p-8">

      {/* Modal carpeta existente en tarea */}
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

      <button onClick={onVolver} className="text-[#6B7280] text-sm hover:text-white mb-6 flex items-center gap-2">
        Volver a proyectos
      </button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-white">{proyecto.nombre}</h2>
            {finalizado ? (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-[#6B7280]/20 text-[#6B7280] border border-[#6B7280]/30">
                Proyecto finalizado
              </span>
            ) : (
              <span className={"text-xs px-2 py-1 rounded-full font-medium " + estadoConfig[proyecto.estado].color}>
                {estadoConfig[proyecto.estado].label}
              </span>
            )}
            {proyecto.folder_url && (
              <button onClick={() => openUrl(proyecto.folder_url!)}
                className="text-xs bg-[#1DB8A0]/10 border border-[#1DB8A0]/30 text-[#1DB8A0] px-2 py-1 rounded-lg hover:bg-[#1DB8A0]/20">
                Ver carpeta Drive
              </button>
            )}
          </div>
          <p className="text-[#6B7280] text-sm">{proyecto.cliente_nombre} · Entrega: {proyecto.deadline}</p>
          {finalizado && fechaFinalizacion && (
            <p className="text-[#6B7280] text-xs mt-1">Finalizado el {fechaFinalizacion}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={abrirWhatsApp} className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-2 rounded-lg text-sm hover:opacity-90">
            WhatsApp
          </button>
          <button onClick={abrirCalendar} className="bg-[#7C5CBF] text-white font-medium px-3 py-2 rounded-lg text-sm hover:opacity-90">
            Agendar reunion
          </button>
          {!finalizado && (
            <button onClick={() => setConfirmandoEliminar(true)}
              className="border border-[#F47C5C]/30 text-[#F47C5C] font-medium px-3 py-2 rounded-lg text-sm hover:bg-[#F47C5C]/10">
              Eliminar
            </button>
          )}
        </div>
      </div>

      {confirmandoEliminar && (
        <div className="bg-[#F47C5C]/10 border border-[#F47C5C]/30 rounded-xl p-4 mb-6">
          <p className="text-white text-sm font-medium mb-1">Eliminar proyecto</p>
          <p className="text-[#6B7280] text-xs mb-3">Esta accion no se puede deshacer. Todos los datos del proyecto se perderan.</p>
          <div className="flex gap-2">
            <button onClick={eliminarProyecto} className="bg-[#F47C5C] text-white font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90">
              Confirmar eliminacion
            </button>
            <button onClick={() => setConfirmandoEliminar(false)} className="text-[#6B7280] px-4 py-2 rounded-lg text-sm hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5">
          <p className="text-[#6B7280] text-xs mb-1">{modo === "fijo" ? "Presupuesto total" : "Tarifa por hora"}</p>
          <p className="text-2xl font-bold text-white">${presupuesto}{modo === "horas" ? "/hr" : ""}</p>
        </div>
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5">
          <p className="text-[#6B7280] text-xs mb-1">Horas trabajadas</p>
          <p className="text-2xl font-bold text-white">{formatTiempo(totalSegundos)}</p>
        </div>
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5">
          <p className="text-[#6B7280] text-xs mb-1">{modo === "fijo" ? "Tarifa real implicita" : "Total acumulado"}</p>
          <p className="text-2xl font-bold text-[#1DB8A0]">
            {modo === "fijo"
              ? "$" + (totalHoras > 0 ? Math.round(presupuesto / totalHoras) : 0) + "/hr"
              : "$" + Math.round(totalHoras * presupuesto)
            }
          </p>
        </div>
      </div>

      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
        <div className="flex justify-between items-center mb-2">
          <p className="text-white font-medium">Progreso general</p>
          <div className="flex items-center gap-3">
            <p className="text-[#6B7280] text-sm">{completadas}/{tareas.length} tareas · {progreso}%</p>
            {!finalizado && todasCompletadas && !confirmandoFinalizar && (
              <button onClick={() => setConfirmandoFinalizar(true)}
                className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                Finalizar proyecto
              </button>
            )}
            {!finalizado && confirmandoFinalizar && (
              <div className="flex items-center gap-2">
                <p className="text-[#6B7280] text-xs">Confirmas que el proyecto esta listo?</p>
                <button onClick={aceptarFinalizar}
                  className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  Aceptar
                </button>
                <button onClick={() => setConfirmandoFinalizar(false)}
                  className="text-[#6B7280] px-3 py-1.5 rounded-lg text-xs hover:text-white">
                  Cancelar
                </button>
              </div>
            )}
            {finalizado && (
              <button onClick={() => onGenerarFactura && onGenerarFactura(proyecto.id)}
                className="bg-[#7C5CBF] text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                Generar factura
              </button>
            )}
          </div>
        </div>
        <div className="w-full bg-[#1A1F2E] rounded-full h-2">
          <div
            className={"h-2 rounded-full transition-all " + (finalizado ? "bg-[#6B7280]" : "bg-[#1DB8A0]")}
            style={{ width: progreso + "%" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">

        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Tareas</h3>
            {!finalizado && (
              <button onClick={() => setMostrarFormTarea(!mostrarFormTarea)}
                className="text-[#1DB8A0] text-xs border border-[#1DB8A0]/30 px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/10">
                + Nueva
              </button>
            )}
          </div>

          {mostrarFormTarea && (
            <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg p-3 mb-4">
              <input value={nuevoTitulo} onChange={(e) => setNuevoTitulo(e.target.value)}
                placeholder="Titulo de la tarea"
                className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0] mb-3" />
              <div className="flex items-center gap-3 mb-3">
                <select value={nuevaPrioridad} onChange={(e) => setNuevaPrioridad(e.target.value as "alta" | "media" | "baja")}
                  className="bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
                <label className="flex items-center gap-2 text-[#6B7280] text-xs cursor-pointer">
                  <input type="checkbox" checked={nuevaPublica} onChange={(e) => setNuevaPublica(e.target.checked)} className="accent-[#1DB8A0]" />
                  Visible al cliente
                </label>
              </div>

              {hayDrive && (
                proyectoTieneCarpeta ? (
                  <div className="flex items-center gap-2 mb-3 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2">
                    <input type="checkbox" id="checkbox-drive-tarea"
                      checked={crearCarpetaTarea}
                      onChange={(e) => setCrearCarpetaTarea(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#1DB8A0] cursor-pointer" />
                    <label htmlFor="checkbox-drive-tarea" className="cursor-pointer">
                      <p className="text-[#6B7280] text-xs">Crear carpeta en Drive para esta tarea <span className="text-[#6B7280]">(opcional)</span></p>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-3 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 opacity-50">
                    <div className="w-3.5 h-3.5 rounded border border-[#252B3B] flex-shrink-0" />
                    <p className="text-[#6B7280] text-xs">El proyecto no tiene carpeta en Drive</p>
                  </div>
                )
              )}

              <div className="flex gap-2">
                <button onClick={agregarTarea} className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  Guardar
                </button>
                <button onClick={() => setMostrarFormTarea(false)} className="text-[#6B7280] px-3 py-1.5 rounded-lg text-xs hover:text-white">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {tareas.map((tarea) => (
              <div key={tarea.id} className="border-b border-[#252B3B] last:border-0 pb-3 last:pb-0">

                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={tarea.completada} onChange={() => toggleTarea(tarea.id)}
                    disabled={finalizado} className="w-4 h-4 accent-[#1DB8A0] cursor-pointer flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={"text-sm truncate " + (tarea.completada ? "line-through text-[#6B7280]" : "text-white")}>
                      {tarea.titulo}
                    </p>
                    {tarea.subtareas.length > 0 && (
                      <p className="text-[#6B7280] text-xs mt-0.5">
                        {tarea.subtareas.filter((s) => s.completada).length}/{tarea.subtareas.length} subtareas
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tarea.aprobada_cliente && (
                      <span className="text-[#1DB8A0] text-xs bg-[#1DB8A0]/10 px-2 py-0.5 rounded-full font-medium">
                        ✓ Aprobada
                      </span>
                    )}
                    {tarea.folder_url && (
                      <button onClick={() => openUrl(tarea.folder_url!)} className="text-[#1DB8A0] text-xs hover:underline">
                        📁
                      </button>
                    )}
                    {tarea.publica && <span className="text-[#1DB8A0] text-xs">👁</span>}
                    <span className={"text-xs px-2 py-0.5 rounded-full " + prioridadConfig[tarea.prioridad].color}>
                      {prioridadConfig[tarea.prioridad].label}
                    </span>
                    {!finalizado && (
                      <button onClick={() => { setNotaTareaId(notaTareaId === tarea.id ? null : tarea.id); setNuevaNota(tarea.nota); }}
                        className="text-[#6B7280] text-xs hover:text-[#1DB8A0]">
                        {tarea.nota ? "Ver nota" : "+ Nota"}
                      </button>
                    )}
                  </div>
                </div>

                {tarea.nota && notaTareaId !== tarea.id && (
                  <div className="mt-2 ml-7 bg-[#1A1F2E] rounded-lg px-3 py-2">
                    <p className="text-[#6B7280] text-xs">{tarea.nota}</p>
                  </div>
                )}

                {notaTareaId === tarea.id && (
                  <div className="mt-2 ml-7">
                    <textarea value={nuevaNota} onChange={(e) => setNuevaNota(e.target.value)}
                      placeholder="Escribe una nota para esta tarea..."
                      rows={2}
                      className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0] resize-none mb-2" />
                    <div className="flex gap-2">
                      <button onClick={() => guardarNotaTarea(tarea.id, nuevaNota)}
                        className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1 rounded-lg text-xs hover:opacity-90">
                        Guardar
                      </button>
                      <button onClick={() => { setNotaTareaId(null); setNuevaNota(""); }}
                        className="text-[#6B7280] px-3 py-1 rounded-lg text-xs hover:text-white">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Subtareas */}
                <div className="mt-2 ml-7">
                  {tarea.subtareas.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {tarea.subtareas.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 group">
                          <input type="checkbox" checked={sub.completada}
                            onChange={() => toggleSubtarea(tarea.id, sub.id)}
                            disabled={finalizado}
                            className="w-3 h-3 accent-[#1DB8A0] cursor-pointer flex-shrink-0" />
                          <p className={"text-xs flex-1 " + (sub.completada ? "line-through text-[#6B7280]" : "text-[#8B93A8]")}>
                            {sub.titulo}
                          </p>
                          {sub.publica && <span className="text-[#1DB8A0] text-xs">👁</span>}
                          {!finalizado && (
                            <button onClick={() => eliminarSubtarea(tarea.id, sub.id)}
                              className="text-[#6B7280] text-xs hover:text-[#F47C5C] opacity-0 group-hover:opacity-100 transition-opacity">
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!finalizado && (
                    subtareaAbiertaId === tarea.id ? (
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
                            <button onClick={() => agregarSubtarea(tarea.id)}
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
                    )
                  )}
                </div>

              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Tiempo registrado</h3>
            <span className="text-[#1DB8A0] text-sm font-medium">{formatTiempo(totalSegundos)} total</span>
          </div>
          <div className="space-y-2">
            {registros.length === 0 && (
              <p className="text-[#6B7280] text-sm">Sin registros de tiempo aún.</p>
            )}
            {registros.map((registro) => (
              <div key={registro.id} className="flex items-center justify-between py-2 border-b border-[#252B3B] last:border-0">
                <div>
                  <p className="text-white text-sm">{registro.descripcion}</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">{registro.fecha}</p>
                </div>
                <span className="text-[#1DB8A0] font-mono text-sm">{formatTiempo(registro.duracion)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">Notas del proyecto</h3>
          {!finalizado && (
            <button onClick={() => setMostrarFormNota(!mostrarFormNota)}
              className="text-[#1DB8A0] text-xs border border-[#1DB8A0]/30 px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/10">
              + Nueva nota
            </button>
          )}
        </div>

        {mostrarFormNota && (
          <div className="mb-4">
            <textarea value={nuevaNotaProyecto} onChange={(e) => setNuevaNotaProyecto(e.target.value)}
              placeholder="Escribe una nota sobre este proyecto..."
              rows={3}
              className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0] resize-none mb-2" />
            <div className="flex gap-2">
              <button onClick={agregarNotaProyecto}
                className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
                Guardar nota
              </button>
              <button onClick={() => setMostrarFormNota(false)}
                className="text-[#6B7280] px-4 py-1.5 rounded-lg text-xs hover:text-white">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {notas.length === 0 && !mostrarFormNota && (
          <p className="text-[#6B7280] text-sm">Sin notas aun</p>
        )}

        <div className="space-y-3">
          {notas.map((nota) => (
            <div key={nota.id} className="bg-[#1A1F2E] rounded-lg px-4 py-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-white text-sm">{nota.texto}</p>
                <p className="text-[#6B7280] text-xs mt-1">{nota.fecha}</p>
              </div>
              {!finalizado && (
                <button onClick={() => eliminarNotaProyecto(nota.id)}
                  className="text-[#6B7280] text-xs hover:text-[#F47C5C] flex-shrink-0">
                  Eliminar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actividad del cliente */}
      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-medium">Actividad del cliente</h3>
            <p className="text-[#6B7280] text-xs mt-0.5">Mensajes, feedbacks y aprobaciones desde el portal</p>
          </div>
          <div className="flex items-center gap-3">
            {tareasAprobadas > 0 && (
              <span className="text-[#1DB8A0] text-xs bg-[#1DB8A0]/10 px-2 py-1 rounded-lg">
                {tareasAprobadas} tarea{tareasAprobadas > 1 ? "s" : ""} aprobada{tareasAprobadas > 1 ? "s" : ""}
              </span>
            )}
            {feedbacks.length > 0 && (
              <span className="text-[#7C5CBF] text-xs bg-[#7C5CBF]/10 px-2 py-1 rounded-lg">
                {feedbacks.length} feedback{feedbacks.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {mensajesPortal.length === 0 ? (
          <p className="text-[#6B7280] text-sm">Sin actividad del cliente aún.</p>
        ) : (
          <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
            {mensajesPortal.map((msg) => {
              const esCliente = msg.autor === "cliente";
              const esAprobacion = msg.tipo === "aprobacion";
              const esFeedback = msg.tipo === "feedback";

              return (
                <div key={msg.id} className={"flex gap-3 " + (esCliente ? "" : "flex-row-reverse")}>
                  <div className={"flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold " +
                    (esCliente ? "bg-[#7C5CBF]/20 text-[#7C5CBF]" : "bg-[#1DB8A0]/20 text-[#1DB8A0]")}>
                    {esCliente ? "C" : "F"}
                  </div>
                  <div className={"max-w-[75%] " + (esCliente ? "" : "text-right")}>
                    <div className={"rounded-xl px-3 py-2 " +
                      (esAprobacion ? "bg-[#1DB8A0]/10 border border-[#1DB8A0]/30" :
                       esFeedback ? "bg-[#7C5CBF]/10 border border-[#7C5CBF]/30" :
                       esCliente ? "bg-[#252B3B]" : "bg-[#1DB8A0]/10 border border-[#1DB8A0]/30")}>
                      <p className="text-white text-xs">{msg.contenido}</p>
                    </div>
                    <p className="text-[#6B7280] text-xs mt-1">{formatFecha(msg.creado_en)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Input para responder */}
        <div className="flex gap-2 pt-3 border-t border-[#252B3B]">
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarRespuesta(); }
            }}
            placeholder="Responder al cliente desde el portal..."
            rows={2}
            className="flex-1 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0] resize-none"
          />
          <button
            onClick={enviarRespuesta}
            disabled={!respuesta.trim() || enviandoRespuesta}
            className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-xs hover:opacity-90 disabled:opacity-50 self-end">
            {enviandoRespuesta ? "..." : "Enviar"}
          </button>
        </div>
        <p className="text-[#6B7280] text-xs mt-1">Enter para enviar · El cliente lo verá en su portal</p>
      </div>

    </div>
  );
}

export default DetalleProyecto;