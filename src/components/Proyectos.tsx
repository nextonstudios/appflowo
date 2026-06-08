import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import DetalleProyecto from "./DetalleProyecto";
import { buscarCarpeta, crearCarpeta, tieneDriveConectado } from "../lib/drive";

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
  "activo": { label: "En tiempo", color: "text-[#1DB8A0] bg-[#1DB8A0]/10" },
  "en-riesgo": { label: "En riesgo", color: "text-[#F47C5C] bg-[#F47C5C]/10" },
  "retrasado": { label: "Retrasado", color: "text-red-400 bg-red-400/10" },
  "completado": { label: "Completado", color: "text-[#6B7280] bg-[#6B7280]/10" },
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
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [vista, setVista] = useState<"lista" | "tarjetas">("tarjetas");
  const [filtroEstado, setFiltroEstado] = useState("todos");
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

  async function agregarProyecto() {
    if (!nombre || !clienteId || !deadline || serviciosSeleccionados.length === 0) return;
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

    const payload = {
      user_id: user?.id,
      cliente_id: clienteId,
      nombre,
      servicios: serviciosSeleccionados,
      fecha_inicio: fechaInicio || null,
      deadline,
      estado: "activo",
      tareas_total: 0,
      tareas_completadas: 0,
      folder_id,
      folder_url,
    };

    const { error } = await supabase.from("proyectos").insert(payload);

    setGuardando(false);
    if (!error) {
      setNombre("");
      setClienteId("");
      setDeadline("");
      setFechaInicio("");
      setServiciosSeleccionados([]);
      setMostrarForm(false);
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
    return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando proyectos...</p></div>;
  }

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-white font-medium mb-2">Subcarpeta ya existe</h3>
            <p className="text-[#6B7280] text-sm mb-6">
              Ya existe una carpeta <span className="text-white">"{modalCarpeta.nombre}"</span> dentro de la carpeta del cliente en Drive. ¿Qué deseas hacer?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-[#1A1F2E] border border-[#1DB8A0]/40 text-white text-sm px-4 py-3 rounded-lg hover:bg-[#1DB8A0]/10 transition-colors text-left">
                <p className="font-medium text-[#1DB8A0]">Usar carpeta existente</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Vincular el proyecto a la carpeta que ya existe</p>
              </button>
              <button
                onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] text-white text-sm px-4 py-3 rounded-lg hover:border-[#7C5CBF]/40 transition-colors text-left">
                <p className="font-medium">Crear subcarpeta nueva</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Se creará una carpeta adicional con el mismo nombre</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Proyectos</h2>
          <p className="text-[#6B7280] mt-1">{proyectos.length} proyectos en total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
            <button onClick={() => setVista("lista")}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (vista === "lista" ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}>
              Lista
            </button>
            <button onClick={() => setVista("tarjetas")}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (vista === "tarjetas" ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}>
              Tarjetas
            </button>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90">
            + Nuevo proyecto
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto o cliente..."
          className="flex-1 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
        <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
          {[
            { id: "todos", label: "Todos" },
            { id: "activo", label: "En tiempo" },
            { id: "en-riesgo", label: "En riesgo" },
            { id: "retrasado", label: "Retrasado" },
            { id: "completado", label: "Completado" },
          ].map((f) => (
            <button key={f.id} onClick={() => setFiltroEstado(f.id)}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (filtroEstado === f.id ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
          <h3 className="text-white font-medium mb-4">Nuevo proyecto</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Nombre del proyecto *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Rediseño web"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Cliente *</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="">Selecciona un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.folder_id ? " 📁" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Fecha de inicio</label>
              <input value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} type="date"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Deadline *</label>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
          </div>

          {/* Opcion Drive */}
          {hayDrive && clienteId ? (
            clienteTieneCarpeta ? (
              <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
                <input type="checkbox" id="checkbox-drive-proyecto"
                  checked={crearCarpetaDrive}
                  onChange={(e) => setCrearCarpetaDrive(e.target.checked)}
                  className="w-4 h-4 accent-[#1DB8A0] cursor-pointer" />
                <label htmlFor="checkbox-drive-proyecto" className="cursor-pointer">
                  <p className="text-white text-sm">Crear subcarpeta en Google Drive</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">
                    Se creará <span className="text-[#1DB8A0]">"{nombre || "nombre del proyecto"}"</span> dentro de la carpeta de <span className="text-white">{clienteSeleccionado?.nombre}</span>
                  </p>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
                <div className="w-4 h-4 rounded border border-[#252B3B] bg-[#141824] flex-shrink-0" />
                <div>
                  <p className="text-[#6B7280] text-sm">Crear subcarpeta en Google Drive</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">
                    Este cliente no tiene carpeta en Drive. Créala desde <span className="text-[#1DB8A0]">Clientes</span> para activar esta opción
                  </p>
                </div>
              </div>
            )
          ) : hayDrive && !clienteId ? (
            <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
              <div className="w-4 h-4 rounded border border-[#252B3B] bg-[#141824] flex-shrink-0" />
              <p className="text-[#6B7280] text-sm">Selecciona un cliente para ver las opciones de Drive</p>
            </div>
          ) : !hayDrive ? (
            <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
              <div className="w-4 h-4 rounded border border-[#252B3B] bg-[#141824] flex-shrink-0" />
              <div>
                <p className="text-[#6B7280] text-sm">Crear subcarpeta en Google Drive</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Conecta tu Drive en <span className="text-[#1DB8A0]">Perfil → Almacenamiento</span> para activar esta opción</p>
              </div>
            </div>
          ) : null}

          <div className="mb-4">
            <label className="text-[#6B7280] text-xs mb-2 block">Servicios del catálogo — clic para agregar</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {catalogo.map((s) => (
                <button key={s.id} onClick={() => agregarServicioCatalogo(s)}
                  className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " +
                    (serviciosSeleccionados.find((sel) => sel.nombre === s.nombre)
                      ? "border-[#1DB8A0] text-[#1DB8A0] bg-[#1DB8A0]/10"
                      : "border-[#252B3B] text-[#6B7280] hover:border-[#1DB8A0] hover:text-white")
                  }>
                  {s.nombre} — ${s.precio}{s.modo === "horas" ? "/hr" : ""}
                </button>
              ))}
            </div>

            {serviciosSeleccionados.length > 0 && (
              <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg p-3 mb-3">
                <p className="text-[#6B7280] text-xs mb-2">Servicios agregados — puedes editar el precio</p>
                <div className="space-y-2">
                  {serviciosSeleccionados.map((s, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <p className="text-white text-xs flex-1">{s.nombre}</p>
                      <span className="text-[#6B7280] text-xs">{s.modo === "fijo" ? "Fijo" : "Por hora"}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[#6B7280] text-xs">$</span>
                        <input value={s.precio} onChange={(e) => actualizarPrecioServicio(index, e.target.value)}
                          type="number"
                          className="w-20 bg-[#141824] border border-[#252B3B] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                      </div>
                      <button onClick={() => quitarServicio(index)} className="text-[#6B7280] text-xs hover:text-[#F47C5C]">Quitar</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-dashed border-[#252B3B] rounded-lg p-3">
              <p className="text-[#6B7280] text-xs mb-2">Agregar servicio que no está en el catálogo</p>
              <div className="flex gap-2">
                <input value={servicioCustom} onChange={(e) => setServicioCustom(e.target.value)}
                  placeholder="Nombre del servicio"
                  className="flex-1 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                <select value={modoCustom} onChange={(e) => setModoCustom(e.target.value as "fijo" | "horas")}
                  className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]">
                  <option value="fijo">Fijo</option>
                  <option value="horas">Por hora</option>
                </select>
                <input value={precioCustom} onChange={(e) => setPrecioCustom(e.target.value)}
                  placeholder="Precio" type="number"
                  className="w-24 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                <button onClick={agregarServicioCustom}
                  className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                  Agregar
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={agregarProyecto}
              disabled={guardando || !nombre || !clienteId || !deadline || serviciosSeleccionados.length === 0}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {guardando ? "Guardando..." : "Guardar proyecto"}
            </button>
            <button onClick={() => { setMostrarForm(false); setServiciosSeleccionados([]); }}
              className="text-[#6B7280] px-4 py-2 rounded-lg text-sm hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {urgentes.length > 0 && (
        <div className="bg-[#F47C5C]/10 border border-[#F47C5C]/30 rounded-xl p-4 mb-6">
          <h3 className="text-[#F47C5C] font-medium text-sm mb-3">Urgente — vence en 3 días o menos</h3>
          <div className="space-y-2">
            {urgentes.map((p) => (
              <div key={p.id} onClick={() => setProyectoSeleccionado(p)}
                className="flex items-center justify-between bg-[#F47C5C]/5 rounded-lg px-3 py-2 cursor-pointer hover:bg-[#F47C5C]/10">
                <div>
                  <p className="text-white text-sm">{p.nombre}</p>
                  <p className="text-[#6B7280] text-xs">{p.cliente_nombre}</p>
                </div>
                <span className="text-[#F47C5C] text-xs font-medium">
                  {getDiasRestantes(p.deadline) === 0 ? "Hoy" : getDiasRestantes(p.deadline) + " días"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={vista === "tarjetas" ? "grid grid-cols-2 gap-4" : "space-y-3"}>
        {noUrgentes.map((proyecto) => {
          const progreso = proyecto.tareas > 0 ? Math.round((proyecto.tareas_completadas / proyecto.tareas) * 100) : 0;
          const config = estadoConfig[proyecto.estado];
          const totalPresupuesto = proyecto.servicios.reduce((acc, s) => acc + s.precio, 0);

          if (vista === "lista") {
            return (
              <div key={proyecto.id} onClick={() => setProyectoSeleccionado(proyecto)}
                className="bg-[#141824] border border-[#252B3B] rounded-xl px-5 py-4 flex items-center gap-4 hover:border-[#1DB8A0]/50 transition-colors cursor-pointer">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white text-sm font-medium">{proyecto.nombre}</p>
                    <span className={"text-xs px-2 py-0.5 rounded-full " + config.color}>{config.label}</span>
                    {proyecto.folder_url && <span className="text-[#1DB8A0] text-xs bg-[#1DB8A0]/10 px-2 py-0.5 rounded-md">Drive ✓</span>}
                  </div>
                  <p className="text-[#6B7280] text-xs">{proyecto.cliente_nombre}</p>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-medium">${totalPresupuesto.toLocaleString()}</p>
                  <p className="text-[#6B7280] text-xs">Entrega: {proyecto.deadline}</p>
                </div>
                <div className="w-24">
                  <div className="flex justify-between text-xs text-[#6B7280] mb-1">
                    <span>{progreso}%</span>
                  </div>
                  <div className="w-full bg-[#1A1F2E] rounded-full h-1.5">
                    <div className="bg-[#1DB8A0] h-1.5 rounded-full" style={{ width: progreso + "%" }} />
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={proyecto.id} onClick={() => setProyectoSeleccionado(proyecto)}
              className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 hover:border-[#1DB8A0]/50 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-medium">{proyecto.nombre}</h3>
                  <p className="text-[#6B7280] text-xs mt-1">{proyecto.cliente_nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  {proyecto.folder_url && <span className="text-[#1DB8A0] text-xs bg-[#1DB8A0]/10 px-2 py-0.5 rounded-md">Drive ✓</span>}
                  <span className={"text-xs px-2 py-1 rounded-full font-medium " + config.color}>{config.label}</span>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-[#6B7280] mb-1">
                  <span>Progreso</span>
                  <span>{proyecto.tareas_completadas}/{proyecto.tareas} tareas</span>
                </div>
                <div className="w-full bg-[#1A1F2E] rounded-full h-1.5">
                  <div className="bg-[#1DB8A0] h-1.5 rounded-full" style={{ width: progreso + "%" }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-[#6B7280]">
                <span className="text-white font-medium">${totalPresupuesto.toLocaleString()}</span>
                <p>Entrega: {proyecto.deadline}</p>
              </div>
            </div>
          );
        })}
      </div>

      {proyectosFiltrados.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[#6B7280]">
            {proyectos.length === 0 ? "No tienes proyectos todavía. Crea el primero con el botón de arriba." : "No se encontraron proyectos"}
          </p>
        </div>
      )}

    </div>
  );
}

export default Proyectos;