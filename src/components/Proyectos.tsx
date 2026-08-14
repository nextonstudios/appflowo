import { useState, useEffect } from "react";
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
}

interface ClienteOpcion {
  id: string;
  nombre: string;
  folder_id?: string;
  folder_url?: string;
}

const estadoConfig = {
  "activo": { label: "En tiempo", color: "text-accent bg-accent/10" },
  "en-riesgo": { label: "En riesgo", color: "text-coral bg-coral/10" },
  "retrasado": { label: "Retrasado", color: "text-red-400 bg-red-400/10" },
  "completado": { label: "Completado", color: "text-muted bg-gray/10" },
};

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
      cliente_nombre: clientesMap[p.cliente_id] || "Cliente desconocido",
      servicios: Array.isArray(p.servicios) ? p.servicios : [],
      tareas: p.tareas_total || 0,
      tareas_completadas: p.tareas_completadas || 0,
      fecha_inicio: p.fecha_inicio || "",
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
  }

  async function agregarProyecto() {
    if (!nombre || !clienteId || serviciosSeleccionados.length === 0) return;
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();

    let folder_id: string | null = null;
    let folder_url: string | null = null;

    if (hayDrive && crearCarpetaDrive && clienteTieneCarpeta) {
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
    };

    const { error } = await supabase.from("proyectos").insert(payload);

    setGuardando(false);
    if (!error) {
      cerrarForm();
      cargarDatos();
    }
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
      />
    );
  }

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">Cargando proyectos...</p></div>;
  }

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-medium mb-2">Subcarpeta ya existe</h3>
            <p className="text-muted text-sm mb-6">
              Ya existe una carpeta <span className="text-primary">"{modalCarpeta.nombre}"</span> dentro de la carpeta del cliente en Drive. ¿Qué deseas hacer?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-accent/40 text-primary text-sm px-4 py-3 rounded-lg hover:bg-accent/10 transition-colors text-left">
                <p className="font-medium text-accent">Usar carpeta existente</p>
                <p className="text-muted text-xs mt-0.5">Vincular el proyecto a la carpeta que ya existe</p>
              </button>
              <button
                onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-3 rounded-lg hover:border-violet/40 transition-colors text-left">
                <p className="font-medium">Crear subcarpeta nueva</p>
                <p className="text-muted text-xs mt-0.5">Se creará una carpeta adicional con el mismo nombre</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-primary">Proyectos</h1>
          <p className="text-sm font-medium text-muted mt-1">{proyectos.length} proyecto{proyectos.length === 1 ? "" : "s"} en total</p>
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
            {guardando ? "Creando proyecto..." : mostrarForm ? "Cancelar" : "+ Nuevo proyecto"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto o cliente..."
          className="flex-1 min-w-[200px] bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          <button onClick={() => setVista("lista")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "lista" ? "bg-surface text-primary" : "text-muted hover:text-primary")}>
            Lista
          </button>
          <button onClick={() => setVista("tarjetas")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "tarjetas" ? "bg-surface text-primary" : "text-muted hover:text-primary")}>
            Tarjetas
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
          Filtros
          {filtroEstado !== "todos" && <span className="w-2 h-2 rounded-full bg-accent" />}
        </button>
      </div>

      {filtrosAbierto && (
        <div className="bg-canvas border border-edge rounded-lg p-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="min-w-[180px] flex-1">
            <label className="text-muted text-xs mb-1 block">Estado</label>
            <Select value={filtroEstado} onChange={setFiltroEstado}
              options={[
                { value: "todos", label: "Todos los estados" },
                { value: "activo", label: "En tiempo" },
                { value: "en-riesgo", label: "En riesgo" },
                { value: "retrasado", label: "Retrasado" },
                { value: "completado", label: "Completado" },
              ]} />
          </div>
          {filtroEstado !== "todos" && (
            <button onClick={() => setFiltroEstado("todos")}
              className="text-accent text-sm font-medium px-3 py-2 hover:opacity-90">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-2xl p-5 mb-6">
          <h3 className="text-primary font-semibold mb-1">Nuevo proyecto</h3>
          <p className="text-muted text-xs mb-4">Solo el nombre y el cliente son obligatorios. Lo demás lo puedes completar después.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-muted text-xs mb-1 block">Nombre del proyecto *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Rediseño web"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">Cliente *</label>
              <Select value={clienteId} onChange={setClienteId}
                options={[
                  { value: "", label: "Selecciona un cliente" },
                  ...clientes.map((c) => ({ value: c.id, label: c.nombre + (c.folder_id ? " 📁" : "") })),
                ]} />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">Fecha de inicio</label>
              <input value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} type="date"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">Fecha de entrega</label>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          {/* Crear subcarpeta en */}
          <div className="mb-4">
            <p className="text-muted2 text-xs font-medium mb-2">Crear carpeta en</p>
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
                      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">Google Drive</p>
                    <p className="text-muted text-[11px] mt-1">
                      {!hayDrive ? "Sin conectar" : !clienteId ? "Selecciona un cliente" : !clienteTieneCarpeta ? "Cliente sin carpeta" : "Conectado"}
                    </p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  {hayDrive && clienteId && clienteTieneCarpeta
                    ? crearCarpetaDrive
                      ? <>Se creará <span className="text-accent">"{nombre || "nombre del proyecto"}"</span> dentro de la carpeta de <span className="text-primary">{clienteSeleccionado?.nombre}</span></>
                      : "Toca para activar la creación automática"
                    : !hayDrive
                      ? <>Conecta tu Drive en <span className="text-accent">Perfil → Almacenamiento</span></>
                      : !clienteId
                        ? "Selecciona un cliente para ver las opciones de Drive"
                        : <>Este cliente no tiene carpeta. Créala desde <span className="text-accent">Clientes</span></>}
                </p>
              </button>

              <div className="relative text-left rounded-xl border border-edge bg-surface p-3.5 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0061FF]/15 flex items-center justify-center flex-shrink-0 text-[#0061FF]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">Dropbox</p>
                    <p className="text-muted text-[11px] mt-1">Sin conectar</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">Conecta en <span className="text-accent">Perfil → Almacenamiento</span></p>
              </div>

              <div className="relative text-left rounded-xl border border-edge bg-surface p-3.5 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0078D4]/15 flex items-center justify-center flex-shrink-0 text-[#0078D4]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">OneDrive</p>
                    <p className="text-muted text-[11px] mt-1">Sin conectar</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">Conecta en <span className="text-accent">Perfil → Almacenamiento</span></p>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-muted text-xs mb-2 block">Servicios del catálogo — clic para agregar</label>
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
                <p className="text-muted text-xs mb-2">Servicios agregados — puedes editar el precio</p>
                <div className="space-y-2">
                  {serviciosSeleccionados.map((s, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <p className="text-primary text-xs flex-1">{s.nombre}</p>
                      <span className="text-muted text-xs">{s.modo === "fijo" ? "Fijo" : "Por hora"}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted text-xs">$</span>
                        <input value={s.precio} onChange={(e) => actualizarPrecioServicio(index, e.target.value)}
                          type="number"
                          className="w-20 bg-canvas border border-edge rounded px-2 py-1 text-primary text-xs focus:outline-none focus:border-accent" />
                      </div>
                      <button onClick={() => quitarServicio(index)} className="text-muted text-xs hover:text-coral">Quitar</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-dashed border-edge rounded-lg p-3">
              <p className="text-muted text-xs mb-2">Agregar servicio que no está en el catálogo</p>
              <div className="flex gap-2">
                <input value={servicioCustom} onChange={(e) => setServicioCustom(e.target.value)}
                  placeholder="Nombre del servicio"
                  className="flex-1 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                <Select value={modoCustom} onChange={(v) => setModoCustom(v as "fijo" | "horas")}
                  triggerClassName="bg-surface border border-edge rounded-lg px-2 py-1.5 text-primary text-xs focus:outline-none focus:border-accent flex items-center gap-2"
                  options={[
                    { value: "fijo", label: "Fijo" },
                    { value: "horas", label: "Por hora" },
                  ]} />
                <input value={precioCustom} onChange={(e) => setPrecioCustom(e.target.value)}
                  placeholder="Precio" type="number"
                  className="w-24 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                <button onClick={agregarServicioCustom}
                  className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  Agregar
                </button>
              </div>
            </div>
          </div>

          {/* Nota inicial */}
          <div className="mb-4">
            <label className="text-muted2 text-xs font-medium mb-1.5 block">Nota</label>
            <textarea
              value={notaInicial}
              onChange={(e) => setNotaInicial(e.target.value)}
              placeholder="Escribe una nota privada sobre este proyecto (opcional)..."
              rows={2}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={agregarProyecto}
              disabled={guardando || !nombre || !clienteId || serviciosSeleccionados.length === 0}
              className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {guardando ? "Creando proyecto..." : "Crear proyecto"}
            </button>
            <button onClick={cerrarForm}
              className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {urgentes.length > 0 && (
        <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
          <h3 className="text-coral font-medium text-sm mb-3">Urgente — vence en 3 días o menos</h3>
          <div className="space-y-2">
            {urgentes.map((p) => (
              <div key={p.id} onClick={() => setProyectoSeleccionado(p)}
                className="flex items-center justify-between bg-coral/5 rounded-lg px-3 py-2 cursor-pointer hover:bg-coral/10">
                <div>
                  <p className="text-primary text-sm">{p.nombre}</p>
                  <p className="text-muted text-xs">{p.cliente_nombre}</p>
                </div>
                <span className="text-coral text-xs font-medium">
                  {getDiasRestantes(p.deadline) === 0 ? "Hoy" : getDiasRestantes(p.deadline) + " días"}
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
                  {proyecto.deadline && <p className="text-muted text-xs">Entrega: {proyecto.deadline}</p>}
                </div>
                <div className="w-24">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>{progreso}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-1.5">
                    <div className="bg-accent h-1.5 rounded-full" style={{ width: progreso + "%" }} />
                  </div>
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
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>Progreso</span>
                  <span>{proyecto.tareas_completadas}/{proyecto.tareas} tareas</span>
                </div>
                <div className="w-full bg-surface rounded-full h-1.5">
                  <div className="bg-accent h-1.5 rounded-full" style={{ width: progreso + "%" }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="text-primary font-medium">{formatearMoneda(totalPresupuesto, moneda)}</span>
                {proyecto.deadline && <p>Entrega: {proyecto.deadline}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {proyectosFiltrados.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted">
            {proyectos.length === 0 ? "No tienes proyectos todavía. Crea el primero con el botón de arriba." : "No se encontraron proyectos"}
          </p>
        </div>
      )}

    </div>
  );
}

export default Proyectos;