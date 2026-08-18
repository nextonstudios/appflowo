import { useState, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import Select from "./Select";
import DetalleProyecto from "./DetalleProyecto";
import { buscarCarpeta, crearCarpeta, tieneDriveConectado } from "../lib/drive";
import { formatearMoneda } from "../lib/moneda";
import { useMoneda } from "../hooks/useMoneda";

interface ServicioProyecto {
  nombre: string;
  modo: "fijo" | "horas";
  precio: number;
}

interface Proyecto {
  id: string;
  nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  servicios: ServicioProyecto[];
  fecha_inicio: string;
  deadline: string;
  estado: "activo" | "en-riesgo" | "retrasado" | "completado";
  tareas: number;
  tareas_completadas: number;
  folder_id?: string;
  folder_url?: string;
  cobro_por_tareas?: boolean;
}

interface ClienteOpcion {
  id: string;
  nombre: string;
  folder_id?: string;
  folder_url?: string;
}

function getEstadoConfig(t: TFunction) {
  return {
    "activo": { label: t("proyectos.estadoActivo"), color: "text-accent bg-accent/10" },
    "en-riesgo": { label: t("proyectos.estadoEnRiesgo"), color: "text-coral bg-coral/10" },
    "retrasado": { label: t("proyectos.estadoRetrasado"), color: "text-red-400 bg-red-400/10" },
    "completado": { label: t("proyectos.estadoCompletado"), color: "text-muted bg-gray/10" },
  };
}

function getDiasRestantes(deadline: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(deadline);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

interface ProyectosProps {
  onGenerarFactura: (id: string) => void;
}

function Proyectos({ onGenerarFactura }: ProyectosProps) {
  const moneda = useMoneda();
  const { t } = useTranslation();
  const estadoConfig = getEstadoConfig(t);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [vista, setVista] = useState<"lista" | "tarjetas">("tarjetas");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtrosAbierto, setFiltrosAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<ServicioProyecto[]>([]);
  const [servicioCustom, setServicioCustom] = useState("");
  const [modoCustom, setModoCustom] = useState<"fijo" | "horas">("fijo");
  const [precioCustom, setPrecioCustom] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [catalogo, setCatalogo] = useState<{id: number, nombre: string, modo: "fijo" | "horas", precio: number}[]>([]);
  const [notaInicial, setNotaInicial] = useState("");
  const [cobroPorTareas, setCobroPorTareas] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null);

  // Drive
  const [hayDrive, setHayDrive] = useState(false);
  const [crearCarpetaDrive, setCrearCarpetaDrive] = useState(true);
  const [modalCarpeta, setModalCarpeta] = useState<{
    nombre: string;
    carpetaExistenteId: string;
    carpetaExistenteUrl: string;
    resolve: (opcion: "usar" | "nueva") => void;
  } | null>(null);

  useEffect(() => {
    cargarDatos();
    tieneDriveConectado().then(setHayDrive);
  }, []);

  useEffect(() => {
    if (!menuAbiertoId) return;
    function cerrar(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-menu-proyecto]")) setMenuAbiertoId(null);
    }
    document.addEventListener("click", cerrar);
    return () => document.removeEventListener("click", cerrar);
  }, [menuAbiertoId]);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [{ data: proyectosData }, { data: clientesData }, { data: perfilData }] = await Promise.all([
      supabase.from("proyectos").select("*").eq("user_id", user?.id).order("created_at", { ascending: false }),
      supabase.from("clientes").select("id, nombre, folder_id, folder_url").eq("user_id", user?.id),
      supabase.from("perfiles").select("servicios").eq("user_id", user?.id).single(),
    ]);

    setClientes(clientesData || []);

    const clientesMap = Object.fromEntries((clientesData || []).map((c: ClienteOpcion) => [c.id, c.nombre]));

    const proyectosMapeados = (proyectosData || []).map((p: any) => ({
      ...p,
      cliente_nombre: clientesMap[p.cliente_id] || t("proyectos.clienteDesconocido"),
      servicios: Array.isArray(p.servicios) ? p.servicios : [],
      tareas: p.tareas_total || 0,
      tareas_completadas: p.tareas_completadas || 0,
      fecha_inicio: p.fecha_inicio || "",
      cobro_por_tareas: p.cobro_por_tareas || false,
    }));

    setProyectos(proyectosMapeados);
    setCargando(false);
    setCatalogo(Array.isArray(perfilData?.servicios) ? perfilData.servicios : []);
  }

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const clienteTieneCarpeta = !!clienteSeleccionado?.folder_id;

  function preguntarCarpetaExistente(nombre: string, carpetaExistenteId: string, carpetaExistenteUrl: string): Promise<"usar" | "nueva"> {
    return new Promise((resolve) => {
      setModalCarpeta({ nombre, carpetaExistenteId, carpetaExistenteUrl, resolve });
    });
  }

  function agregarServicioCatalogo(servicio: { nombre: string; modo: "fijo" | "horas"; precio: number }) {
    const yaExiste = serviciosSeleccionados.find((s) => s.nombre === servicio.nombre);
    if (yaExiste) return;
    setServiciosSeleccionados([...serviciosSeleccionados, {
      nombre: servicio.nombre,
      modo: servicio.modo,
      precio: servicio.precio,
    }]);
  }

  function agregarServicioCustom() {
    if (!servicioCustom || !precioCustom) return;
    setServiciosSeleccionados([...serviciosSeleccionados, {
      nombre: servicioCustom,
      modo: modoCustom,
      precio: Number(precioCustom),
    }]);
    setServicioCustom("");
    setPrecioCustom("");
  }

  function actualizarPrecioServicio(index: number, nuevoPrecio: string) {
    setServiciosSeleccionados(serviciosSeleccionados.map((s, i) =>
      i === index ? { ...s, precio: Number(nuevoPrecio) } : s
    ));
  }

  function quitarServicio(index: number) {
    setServiciosSeleccionados(serviciosSeleccionados.filter((_, i) => i !== index));
  }

  function cerrarForm() {
    setMostrarForm(false);
    setServiciosSeleccionados([]);
    setServicioCustom("");
    setPrecioCustom("");
    setNotaInicial("");
    setCobroPorTareas(false);
    setEditandoId(null);
  }

  async function agregarProyecto() {
    if (!nombre || !clienteId || (!cobroPorTareas && serviciosSeleccionados.length === 0)) return;
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();

    let folder_id: string | null = null;
    let folder_url: string | null = null;

    if (!editandoId && hayDrive && crearCarpetaDrive && clienteTieneCarpeta) {
      try {
        const parentId = clienteSeleccionado!.folder_id!;
        const existentes = await buscarCarpeta(nombre, parentId);
        if (existentes.length > 0) {
          const opcion = await preguntarCarpetaExistente(nombre, existentes[0].id, existentes[0].url);
          if (opcion === "usar") {
            folder_id = existentes[0].id;
            folder_url = existentes[0].url;
          } else {
            const nueva = await crearCarpeta(nombre, parentId);
            if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
          }
        } else {
          const nueva = await crearCarpeta(nombre, parentId);
          if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
        }
      } catch (err) {
        console.error("Error creando carpeta en Drive:", err);
      }
    }

    const notas = notaInicial.trim()
      ? [{ id: Date.now(), texto: notaInicial.trim(), fecha: new Date().toISOString().split("T")[0] }]
      : [];

    if (editandoId) {
      const payload: Record<string, unknown> = {
        cliente_id: clienteId,
        nombre,
        servicios: serviciosSeleccionados,
        fecha_inicio: fechaInicio || null,
        deadline: deadline || null,
        cobro_por_tareas: cobroPorTareas,
      };
      if (folder_id) { payload.folder_id = folder_id; payload.folder_url = folder_url; }
      if (notas.length > 0) payload.notas = notas;

      const { error } = await supabase.from("proyectos").update(payload).eq("id", editandoId);
      setGuardando(false);
      if (!error) {
        cerrarForm();
        cargarDatos();
      }
    } else {
      const payload = {
        user_id: user?.id,
        cliente_id: clienteId,
        nombre,
        servicios: serviciosSeleccionados,
        fecha_inicio: fechaInicio || null,
        deadline: deadline || null,
        estado: "activo",
        tareas_total: 0,
        tareas_completadas: 0,
        folder_id,
        folder_url,
        notas,
        cobro_por_tareas: cobroPorTareas,
      };

      const { error } = await supabase.from("proyectos").insert(payload);
      setGuardando(false);
      if (!error) {
        cerrarForm();
        cargarDatos();
      }
    }
  }

  function abrirEdicion(proyecto: Proyecto) {
    setEditandoId(proyecto.id);
    setNombre(proyecto.nombre);
    setClienteId(proyecto.cliente_id);
    setFechaInicio(proyecto.fecha_inicio || "");
    setDeadline(proyecto.deadline || "");
    setServiciosSeleccionados([...proyecto.servicios]);
    setCobroPorTareas(proyecto.cobro_por_tareas || false);
    setNotaInicial("");
    setMostrarForm(true);
    setMenuAbiertoId(null);
  }

  async function eliminarProyecto(id: string) {
    await supabase.from("tareas").delete().eq("proyecto_id", id);
    await supabase.from("proyectos").delete().eq("id", id);
    setConfirmandoEliminarId(null);
    setMenuAbiertoId(null);
    cargarDatos();
  }

  const proyectosFiltrados = proyectos.filter((p) => {
    const coincideBusqueda =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase());
    const coincideEstado = filtroEstado === "todos" || p.estado === filtroEstado;
    return coincideBusqueda && coincideEstado;
  });

  const urgentes = proyectosFiltrados.filter((p) =>
    getDiasRestantes(p.deadline) <= 3 && getDiasRestantes(p.deadline) >= 0 && p.estado !== "completado"
  );
  const noUrgentes = proyectosFiltrados.filter((p) =>
    !(getDiasRestantes(p.deadline) <= 3 && getDiasRestantes(p.deadline) >= 0) || p.estado === "completado"
  );

  if (proyectoSeleccionado) {
    return (
      <DetalleProyecto
        proyecto={proyectoSeleccionado}
        onVolver={() => setProyectoSeleccionado(null)}
        onGenerarFactura={onGenerarFactura}
        onEditar={(p) => { setProyectoSeleccionado(null); abrirEdicion(p as any); }}
      />
    );
  }

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">{t("proyectos.cargando")}</p></div>;
  }

  return (
    <div className="p-8">

      {/* Modal eliminar proyecto */}
      {confirmandoEliminarId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-primary font-medium mb-2">{t("proyectos.confirmarEliminar.titulo")}</h3>
            <p className="text-muted text-sm mb-6">{t("proyectos.confirmarEliminar.desc")}</p>
            <div className="flex gap-3">
              <button onClick={() => eliminarProyecto(confirmandoEliminarId)}
                className="bg-coral text-white font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 flex-1">
                {t("proyectos.confirmarEliminar.confirmar")}
              </button>
              <button onClick={() => setConfirmandoEliminarId(null)}
                className="bg-surface border border-edge text-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface2 transition-colors flex-1">
                {t("proyectos.cancelar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-medium mb-2">{t("proyectos.carpetaExisteTitulo")}</h3>
            <p className="text-muted text-sm mb-6">
              <Trans i18nKey="proyectos.carpetaExiste" values={{ nombre: modalCarpeta.nombre }}>
                Ya existe una carpeta <span className="text-primary">"X"</span> dentro de la carpeta del cliente en Drive. ¿Qué deseas hacer?
              </Trans>
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-accent/40 text-primary text-sm px-4 py-3 rounded-lg hover:bg-accent/10 transition-colors text-left">
                <p className="font-medium text-accent">{t("proyectos.usarCarpetaExistente")}</p>
                <p className="text-muted text-xs mt-0.5">{t("proyectos.usarCarpetaExistenteDesc")}</p>
              </button>
              <button
                onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-3 rounded-lg hover:border-violet/40 transition-colors text-left">
                <p className="font-medium">{t("proyectos.crearSubcarpetaNueva")}</p>
                <p className="text-muted text-xs mt-0.5">{t("proyectos.crearSubcarpetaNuevaDesc")}</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-primary">{t("proyectos.titulo")}</h1>
          <p className="text-sm font-medium text-muted mt-1">{t("proyectos.totalProyectos", { count: proyectos.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => (mostrarForm ? cerrarForm() : setMostrarForm(true))}
            disabled={guardando}
            className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 " +
              (mostrarForm
                ? "bg-surface border border-edge text-primary hover:border-coral/40"
                : "bg-accent text-onaccent hover:opacity-90")}
          >
            {guardando ? t("proyectos.creandoProyecto") : mostrarForm ? t("proyectos.cancelar") : "+ " + t("proyectos.nuevoProyecto")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("proyectos.placeholderBuscar")}
          className="flex-1 min-w-[200px] bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          <button onClick={() => setVista("lista")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "lista" ? "bg-surface text-primary" : "text-muted hover:text-primary")}>
            {t("proyectos.vistaLista")}
          </button>
          <button onClick={() => setVista("tarjetas")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "tarjetas" ? "bg-surface text-primary" : "text-muted hover:text-primary")}>
            {t("proyectos.vistaTarjetas")}
          </button>
        </div>
        <button onClick={() => setFiltrosAbierto(!filtrosAbierto)}
          className={"flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors " +
            (filtrosAbierto || filtroEstado !== "todos"
              ? "bg-surface border-edge text-primary"
              : "bg-canvas border-edge text-muted hover:text-primary hover:border-accent/40")}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          {t("proyectos.filtros")}
          {filtroEstado !== "todos" && <span className="w-2 h-2 rounded-full bg-accent" />}
        </button>
      </div>

      {filtrosAbierto && (
        <div className="bg-canvas border border-edge rounded-lg p-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="min-w-[180px] flex-1">
            <label className="text-muted text-xs mb-1 block">{t("proyectos.estado")}</label>
            <Select value={filtroEstado} onChange={setFiltroEstado}
              options={[
                { value: "todos", label: t("proyectos.todosLosEstados") },
                { value: "activo", label: estadoConfig["activo"].label },
                { value: "en-riesgo", label: estadoConfig["en-riesgo"].label },
                { value: "retrasado", label: estadoConfig["retrasado"].label },
                { value: "completado", label: estadoConfig["completado"].label },
              ]} />
          </div>
          {filtroEstado !== "todos" && (
            <button onClick={() => setFiltroEstado("todos")}
              className="text-accent text-sm font-medium px-3 py-2 hover:opacity-90">
              {t("proyectos.limpiarFiltros")}
            </button>
          )}
        </div>
      )}

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-2xl p-5 mb-6">
          <h3 className="text-primary font-semibold mb-1">{editandoId ? t("proyectos.editarProyecto") : t("proyectos.nuevoProyecto")}</h3>
          <p className="text-muted text-xs mb-4">{t("proyectos.soloNombreCliente")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-muted text-xs mb-1 block">{t("proyectos.nombreProyecto")} *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("proyectos.placeholderNombreProyecto")}
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">{t("proyectos.cliente")} *</label>
              <Select value={clienteId} onChange={setClienteId}
                options={[
                  { value: "", label: t("proyectos.seleccionaCliente") },
                  ...clientes.map((c) => ({ value: c.id, label: c.nombre + (c.folder_id ? " 📁" : "") })),
                ]} />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">{t("proyectos.fechaInicio")}</label>
              <input value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} type="date"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">{t("proyectos.fechaEntrega")}</label>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          {/* Cobro por tareas */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setCobroPorTareas(!cobroPorTareas)}
              className={"flex items-center gap-3 w-full text-left rounded-xl border p-3.5 transition-all " +
                (cobroPorTareas
                  ? "bg-accent/10 border-accent/50"
                  : "bg-surface border-edge hover:border-accent/40")}
            >
              <span className={"w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors " +
                (cobroPorTareas ? "bg-accent border-accent" : "border-edge2")}>
                {cobroPorTareas && (
                  <svg className="w-3 h-3 text-onaccent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <div>
                <p className={"text-sm font-medium " + (cobroPorTareas ? "text-accent" : "text-primary")}>{t("proyectos.cobroPorTareas")}</p>
                <p className="text-muted text-xs mt-0.5">{t("proyectos.cobroPorTareasDesc")}</p>
              </div>
            </button>
          </div>

          {/* Crear subcarpeta en */}
          <div className="mb-4">
            <p className="text-muted2 text-xs font-medium mb-2">{t("proyectos.crearCarpetaEn")}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setCrearCarpetaDrive(!crearCarpetaDrive)}
                disabled={!hayDrive || !clienteId || !clienteTieneCarpeta}
                className={"relative text-left rounded-xl border p-3.5 transition-all " +
                  (hayDrive && clienteId && clienteTieneCarpeta
                    ? crearCarpetaDrive
                      ? "bg-accent/10 border-accent/50"
                      : "bg-surface border-edge hover:border-accent/40"
                    : "bg-surface border-edge opacity-50 cursor-not-allowed")}
              >
                {hayDrive && clienteId && clienteTieneCarpeta && (
                  <span className={"absolute top-2.5 right-2.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors " +
                    (crearCarpetaDrive ? "bg-accent border-accent" : "border-edge2")}>
                    {crearCarpetaDrive && (
                      <svg className="w-2.5 h-2.5 text-onaccent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#34A853]/15 flex items-center justify-center flex-shrink-0 text-[#34A853]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">Google Drive</p>
                    <p className="text-muted text-[11px] mt-1">
                      {!hayDrive ? t("proyectos.sinConectar") : !clienteId ? t("proyectos.seleccionaCliente") : !clienteTieneCarpeta ? t("proyectos.clienteSinCarpeta") : t("proyectos.conectado")}
                    </p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  {hayDrive && clienteId && clienteTieneCarpeta
                    ? crearCarpetaDrive
                      ? (
                          <Trans i18nKey="proyectos.seCrearaCarpeta"
                            values={{ nombre: nombre || t("proyectos.nombreProyectoFallback"), cliente: clienteSeleccionado?.nombre }}>
                            Se creará <span className="text-accent">"X"</span> dentro de la carpeta de <span className="text-primary">Y</span>
                          </Trans>
                        )
                      : t("proyectos.tocaActivarCreacion")
                    : !hayDrive
                      ? (
                          <Trans i18nKey="proyectos.conectaDriveEn">
                            Conecta tu Drive en <span className="text-accent">Perfil → Almacenamiento</span>
                          </Trans>
                        )
                      : !clienteId
                        ? t("proyectos.seleccionaClienteDrive")
                        : (
                            <Trans i18nKey="proyectos.clienteSinCarpetaCrear">
                              Este cliente no tiene carpeta. Créala desde <span className="text-accent">Clientes</span>
                            </Trans>
                          )}
                </p>
              </button>

              <div className="relative text-left rounded-xl border border-edge bg-surface p-3.5 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0061FF]/15 flex items-center justify-center flex-shrink-0 text-[#0061FF]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">Dropbox</p>
                    <p className="text-muted text-[11px] mt-1">{t("proyectos.sinConectar")}</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  <Trans i18nKey="proyectos.conectaEn">
                    Conecta en <span className="text-accent">Perfil → Almacenamiento</span>
                  </Trans>
                </p>
              </div>

              <div className="relative text-left rounded-xl border border-edge bg-surface p-3.5 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0078D4]/15 flex items-center justify-center flex-shrink-0 text-[#0078D4]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28zm-7.265-4.137q-1.325 0-2.52.544-1.195.545-2.04 1.565.446.117.85.299.405.181.792.416l4.78 2.86 2.731-1.15q.27-.117.545-.204.276-.088.58-.147-.293-.937-.855-1.705-.563-.768-1.319-1.318-.755-.551-1.658-.856-.902-.304-1.886-.304zM2.414 16.395l9.914-4.184-3.832-2.297q-.586-.351-1.23-.539-.645-.188-1.325-.188-.914 0-1.722.364-.809.363-1.412.978-.604.616-.955 1.436-.352.82-.352 1.723 0 .703.234 1.423.235.721.68 1.284zm16.711 1.793q.563 0 1.078-.176.516-.176.961-.516l-7.23-4.324-10.301 4.336q.527.328 1.13.504.604.175 1.237.175zm3.012-1.852q.363-.727.363-1.523 0-.774-.293-1.407t-.791-1.072q-.498-.44-1.166-.68-.668-.24-1.406-.24-.422 0-.838.1t-.815.252q-.398.152-.785.334-.386.181-.761.345Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">OneDrive</p>
                    <p className="text-muted text-[11px] mt-1">{t("proyectos.sinConectar")}</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  <Trans i18nKey="proyectos.conectaEn">
                    Conecta en <span className="text-accent">Perfil → Almacenamiento</span>
                  </Trans>
                </p>
              </div>
            </div>
          </div>

          {!cobroPorTareas && (
          <div className="mb-4">
            <label className="text-muted text-xs mb-2 block">{t("proyectos.serviciosCatalogo")}</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {catalogo.map((s) => (
                <button key={s.id} onClick={() => agregarServicioCatalogo(s)}
                  className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " +
                    (serviciosSeleccionados.find((sel) => sel.nombre === s.nombre)
                      ? "border-accent text-accent bg-accent/10"
                      : "border-edge text-muted hover:border-accent hover:text-primary")
                  }>
                  {s.nombre} — {formatearMoneda(s.precio, moneda)}{s.modo === "horas" ? "/hr" : ""}
                </button>
              ))}
            </div>

            {serviciosSeleccionados.length > 0 && (
              <div className="bg-surface border border-edge rounded-lg p-3 mb-3">
                <p className="text-muted text-xs mb-2">{t("proyectos.serviciosAgregados")}</p>
                <div className="space-y-2">
                  {serviciosSeleccionados.map((s, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <p className="text-primary text-xs flex-1">{s.nombre}</p>
                      <span className="text-muted text-xs">{s.modo === "fijo" ? t("proyectos.modoFijo") : t("proyectos.modoPorHora")}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted text-xs">$</span>
                        <input value={s.precio} onChange={(e) => actualizarPrecioServicio(index, e.target.value)}
                          type="number"
                          className="w-20 bg-canvas border border-edge rounded px-2 py-1 text-primary text-xs focus:outline-none focus:border-accent" />
                      </div>
                      <button onClick={() => quitarServicio(index)} className="text-muted text-xs hover:text-coral">{t("proyectos.quitar")}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-dashed border-edge rounded-lg p-3">
              <p className="text-muted text-xs mb-2">{t("proyectos.agregarServicioNoCatalogo")}</p>
              <div className="flex gap-2">
                <input value={servicioCustom} onChange={(e) => setServicioCustom(e.target.value)}
                  placeholder={t("proyectos.nombreServicio")}
                  className="flex-1 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                <Select value={modoCustom} onChange={(v) => setModoCustom(v as "fijo" | "horas")}
                  triggerClassName="bg-surface border border-edge rounded-lg px-2 py-1.5 text-primary text-xs focus:outline-none focus:border-accent flex items-center gap-2"
                  options={[
                    { value: "fijo", label: t("proyectos.modoFijo") },
                    { value: "horas", label: t("proyectos.modoPorHora") },
                  ]} />
                <input value={precioCustom} onChange={(e) => setPrecioCustom(e.target.value)}
                  placeholder={t("proyectos.precio")} type="number"
                  className="w-24 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                <button onClick={agregarServicioCustom}
                  className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  {t("proyectos.agregar")}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Nota inicial */}
          <div className="mb-4">
            <label className="text-muted2 text-xs font-medium mb-1.5 block">{t("proyectos.nota")}</label>
            <textarea
              value={notaInicial}
              onChange={(e) => setNotaInicial(e.target.value)}
              placeholder={t("proyectos.placeholderNota")}
              rows={2}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={agregarProyecto}
              disabled={guardando || !nombre || !clienteId || (!cobroPorTareas && serviciosSeleccionados.length === 0)}
              className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {guardando ? t("proyectos.guardando") : editandoId ? t("proyectos.guardarCambios") : t("proyectos.crearProyecto")}
            </button>
            <button onClick={cerrarForm}
              className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary">
              {t("proyectos.cancelar")}
            </button>
          </div>
        </div>
      )}

      {urgentes.length > 0 && (
        <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
          <h3 className="text-coral font-medium text-sm mb-3">{t("proyectos.urgenteVence")}</h3>
          <div className="space-y-2">
            {urgentes.map((p) => (
              <div key={p.id} onClick={() => setProyectoSeleccionado(p)}
                className="flex items-center justify-between bg-coral/5 rounded-lg px-3 py-2 cursor-pointer hover:bg-coral/10">
                <div>
                  <p className="text-primary text-sm">{p.nombre}</p>
                  <p className="text-muted text-xs">{p.cliente_nombre}</p>
                </div>
                <span className="text-coral text-xs font-medium">
                  {getDiasRestantes(p.deadline) === 0 ? t("proyectos.hoy") : t("proyectos.diasRestantes", { count: getDiasRestantes(p.deadline) })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={vista === "tarjetas" ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-3"}>
        {noUrgentes.map((proyecto) => {
          const progreso = proyecto.tareas > 0 ? Math.round((proyecto.tareas_completadas / proyecto.tareas) * 100) : 0;
          const config = estadoConfig[proyecto.estado];
          const totalPresupuesto = proyecto.servicios.reduce((acc, s) => acc + s.precio, 0);

          if (vista === "lista") {
            return (
              <div key={proyecto.id} onClick={() => setProyectoSeleccionado(proyecto)}
                className="bg-canvas border border-edge rounded-xl px-5 py-4 flex items-center gap-4 hover:border-accent/50 transition-colors cursor-pointer">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-primary text-sm font-medium">{proyecto.nombre}</p>
                    <span className={"text-xs px-2 py-0.5 rounded-full " + config.color}>{config.label}</span>
                    {proyecto.folder_url && <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-md">Drive ✓</span>}
                  </div>
                  <p className="text-muted text-xs">{proyecto.cliente_nombre}</p>
                </div>
                <div className="text-right">
                  <p className="text-primary text-sm font-medium">{formatearMoneda(totalPresupuesto, moneda)}</p>
                  {proyecto.deadline && <p className="text-muted text-xs">{t("proyectos.entrega", { fecha: proyecto.deadline })}</p>}
                </div>
                <div className="w-24">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>{progreso}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-1.5">
                    <div className="bg-accent h-1.5 rounded-full" style={{ width: progreso + "%" }} />
                  </div>
                </div>
                <div className="relative" data-menu-proyecto>
                  <button onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(menuAbiertoId === proyecto.id ? null : proyecto.id); }}
                    className="text-muted hover:text-primary p-1 rounded-lg hover:bg-surface transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                    </svg>
                  </button>
                  {menuAbiertoId === proyecto.id && (
                    <div className="absolute right-0 top-8 z-30 bg-surface border border-edge rounded-xl shadow-xl py-1 min-w-[140px]">
                      <button onClick={(e) => { e.stopPropagation(); abrirEdicion(proyecto); }}
                        className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-canvas transition-colors">
                        {t("proyectos.editar")}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmandoEliminarId(proyecto.id); setMenuAbiertoId(null); }}
                        className="w-full text-left px-3 py-2 text-sm text-coral hover:bg-coral/10 transition-colors">
                        {t("proyectos.eliminar")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={proyecto.id} onClick={() => setProyectoSeleccionado(proyecto)}
              className="bg-canvas border border-edge rounded-xl p-5 hover:border-accent/50 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-primary font-medium">{proyecto.nombre}</h3>
                  <p className="text-muted text-xs mt-1">{proyecto.cliente_nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  {proyecto.folder_url && <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-md">Drive ✓</span>}
                  <span className={"text-xs px-2 py-1 rounded-full font-medium " + config.color}>{config.label}</span>
                  <div className="relative" data-menu-proyecto>
                    <button onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(menuAbiertoId === proyecto.id ? null : proyecto.id); }}
                      className="text-muted hover:text-primary p-1 rounded-lg hover:bg-surface transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                      </svg>
                    </button>
                    {menuAbiertoId === proyecto.id && (
                      <div className="absolute right-0 top-8 z-30 bg-surface border border-edge rounded-xl shadow-xl py-1 min-w-[140px]">
                        <button onClick={(e) => { e.stopPropagation(); abrirEdicion(proyecto); }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-canvas transition-colors">
                          {t("proyectos.editar")}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmandoEliminarId(proyecto.id); setMenuAbiertoId(null); }}
                          className="w-full text-left px-3 py-2 text-sm text-coral hover:bg-coral/10 transition-colors">
                          {t("proyectos.eliminar")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>{t("proyectos.progreso")}</span>
                  <span>{t("proyectos.tareasConteo", { completadas: proyecto.tareas_completadas, total: proyecto.tareas })}</span>
                </div>
                <div className="w-full bg-surface rounded-full h-1.5">
                  <div className="bg-accent h-1.5 rounded-full" style={{ width: progreso + "%" }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="text-primary font-medium">{formatearMoneda(totalPresupuesto, moneda)}</span>
                {proyecto.deadline && <p>{t("proyectos.entrega", { fecha: proyecto.deadline })}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {proyectosFiltrados.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted">
            {proyectos.length === 0 ? t("proyectos.sinProyectos") : t("proyectos.sinResultados")}
          </p>
        </div>
      )}

    </div>
  );
}

export default Proyectos;