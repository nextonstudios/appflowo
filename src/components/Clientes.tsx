import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buscarCarpeta, crearCarpeta } from "../lib/drive";

interface Nota {
  id: number;
  texto: string;
  fecha: string;
}

interface Cliente {
  id: string;
  nombre: string;
  empresa: string;
  telefono: string;
  email: string;
  notas: Nota[];
  folder_id?: string;
  folder_url?: string;
}

const estadoProyecto: Record<string, { label: string; color: string }> = {
  "por-iniciar": { label: "Por iniciar", color: "text-muted bg-gray/10" },
  "en-proceso": { label: "En proceso", color: "text-accent bg-accent/10" },
  "finalizado": { label: "Finalizado", color: "text-violet bg-violet/10" },
};

function getDiasRestantes(deadline: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(deadline);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [vista, setVista] = useState<"lista" | "tarjetas">("lista");
  const [clientesAbiertos, setClientesAbiertos] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [notaClienteId, setNotaClienteId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [portalToken, setPortalToken] = useState<string | null>(null);
const [linkCopiado, setLinkCopiado] = useState(false);
const [generandoToken, setGenerandoToken] = useState(false);
const [mostrarModalPortal, setMostrarModalPortal] = useState<string | null>(null);
const [tokenPorCliente, setTokenPorCliente] = useState<Record<string, string>>({});
const [tokenDataPorCliente, setTokenDataPorCliente] = useState<Record<string, {
  token: string;
  codigo_acceso: string | null;
  codigo_activo: boolean;
}>>({});
const [codigoGuardado, setCodigoGuardado] = useState(false);
const [notaInicial, setNotaInicial] = useState("");
const [proyectosPorCliente, setProyectosPorCliente] = useState<Record<string, number>>({});
const [clienteAEliminar, setClienteAEliminar] = useState<Cliente | null>(null);
const [editandoId, setEditandoId] = useState<string | null>(null);

  // Drive
  const [tieneDrive, setTieneDrive] = useState(false);
  const [crearCarpetaDrive, setCrearCarpetaDrive] = useState(true);
  const [modalCarpeta, setModalCarpeta] = useState<{
    nombre: string;
    carpetaExistenteId: string;
    carpetaExistenteUrl: string;
    resolve: (opcion: "usar" | "nueva") => void;
  } | null>(null);

  useEffect(() => {
    cargarClientes();
    verificarDrive();
    cargarTokensPortal();
    cargarProyectos();
  }, []);

  async function cargarProyectos() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("proyectos")
      .select("id, cliente_id, estado")
      .eq("user_id", user.id);
    const conteo: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      if (p.estado !== "completado") conteo[p.cliente_id] = (conteo[p.cliente_id] || 0) + 1;
    });
    setProyectosPorCliente(conteo);
  }

  async function verificarDrive() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("integraciones")
      .select("id")
      .eq("user_id", user.id)
      .eq("proveedor", "google_drive")
      .single();
    setTieneDrive(!!data);
  }
async function cargarTokensPortal() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { setTokenPorCliente({}); setTokenDataPorCliente({}); return; }
  const { data: clientesIds } = await supabase
    .from("clientes")
    .select("id")
    .eq("user_id", user.id);
  const ids = (clientesIds || []).map((c: any) => c.id);
  if (ids.length === 0) { setTokenPorCliente({}); setTokenDataPorCliente({}); return; }
  const { data } = await supabase
    .from("portal_tokens")
    .select("token, cliente_id, codigo_acceso, codigo_activo")
    .eq("activo", true)
    .in("cliente_id", ids);
  const mapa: Record<string, string> = {};
  const mapaData: Record<string, any> = {};
  (data || []).forEach((row: any) => {
    mapa[row.cliente_id] = row.token;
    mapaData[row.cliente_id] = {
      token: row.token,
      codigo_acceso: row.codigo_acceso,
      codigo_activo: row.codigo_activo,
    };
  });
  setTokenPorCliente(mapa);
  setTokenDataPorCliente(mapaData);
}

async function obtenerOCrearTokenCliente(clienteId: string) {
  setGenerandoToken(true);
  try {
    const existente = tokenPorCliente[clienteId];
    if (existente) {
      setPortalToken(existente);
      setMostrarModalPortal(clienteId);
      return;
    }
    const { data } = await supabase
      .from("portal_tokens")
      .insert({ cliente_id: clienteId })
      .select("token")
      .single();
    if (data?.token) {
      setTokenPorCliente(prev => ({ ...prev, [clienteId]: data.token }));
      setPortalToken(data.token);
      setMostrarModalPortal(clienteId);
    }
  } catch (err) {
    console.error("Error generando token:", err);
  } finally {
    setGenerandoToken(false);
  }
}

function copiarLink() {
  if (!portalToken) return;
  navigator.clipboard.writeText("https://portal.appflowo.com/p/" + portalToken);
  setLinkCopiado(true);
  setTimeout(() => setLinkCopiado(false), 2500);
}
  async function cargarClientes() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCargando(false); return; }
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const clientesConNotas = (data || []).map((c: any) => ({
      ...c,
      notas: Array.isArray(c.notas) ? c.notas : [],
    }));
    setClientes(clientesConNotas);
    setCargando(false);
  }

  async function toggleCodigoAcceso(clienteId: string) {
  const actual = tokenDataPorCliente[clienteId];
  if (!actual) return;
  const nuevoEstado = !actual.codigo_activo;
  await supabase
    .from("portal_tokens")
    .update({ codigo_activo: nuevoEstado })
    .eq("cliente_id", clienteId);
  setTokenDataPorCliente(prev => ({
    ...prev,
    [clienteId]: { ...prev[clienteId], codigo_activo: nuevoEstado }
  }));
}

function actualizarCodigoLocal(clienteId: string, valor: string) {
  setTokenDataPorCliente(prev => ({
    ...prev,
    [clienteId]: { ...prev[clienteId], codigo_acceso: valor }
  }));
}

async function guardarCodigoAcceso(clienteId: string) {
  const actual = tokenDataPorCliente[clienteId];
  if (!actual) return;
  await supabase
    .from("portal_tokens")
    .update({ codigo_acceso: actual.codigo_acceso })
    .eq("cliente_id", clienteId);
  setCodigoGuardado(true);
  setTimeout(() => setCodigoGuardado(false), 2500);
}

  // Muestra modal y espera respuesta del usuario
  function preguntarCarpetaExistente(nombre: string, carpetaExistenteId: string, carpetaExistenteUrl: string): Promise<"usar" | "nueva"> {
    return new Promise((resolve) => {
      setModalCarpeta({ nombre, carpetaExistenteId, carpetaExistenteUrl, resolve });
    });
  }

  function editarCliente(cliente: Cliente) {
    setEditandoId(cliente.id);
    setNombre(cliente.nombre);
    setEmpresa(cliente.empresa || "");
    setWhatsapp(cliente.telefono || "");
    setEmail(cliente.email || "");
    setNotaInicial("");
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditandoId(null);
    setNombre("");
    setEmpresa("");
    setWhatsapp("");
    setEmail("");
    setNotaInicial("");
  }

  async function agregarCliente() {
    if (!nombre) return;
    setGuardando(true);

    const { data: { user } } = await supabase.auth.getUser();
    let folder_id: string | null = null;
    let folder_url: string | null = null;

    // Crear carpeta en Drive si corresponde (solo al crear)
    if (!editandoId && tieneDrive && crearCarpetaDrive) {
      try {
        const existentes = await buscarCarpeta(nombre);
        if (existentes.length > 0) {
          const opcion = await preguntarCarpetaExistente(nombre, existentes[0].id, existentes[0].url);
          if (opcion === "usar") {
            folder_id = existentes[0].id;
            folder_url = existentes[0].url;
          } else {
            const nueva = await crearCarpeta(nombre);
            if (nueva) { folder_id = nueva.id; folder_url = nueva.url; }
          }
        } else {
          const nueva = await crearCarpeta(nombre);
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
      await supabase.from("clientes").update({
        nombre,
        empresa,
        email,
        telefono: whatsapp,
      }).eq("id", editandoId);
    } else {
      await supabase.from("clientes").insert({
        user_id: user?.id,
        nombre,
        empresa,
        email,
        telefono: whatsapp,
        notas,
        folder_id,
        folder_url,
      });
    }

    cerrarForm();
    setGuardando(false);
    cargarClientes();
  }

  async function agregarNota(clienteId: string) {
    if (!nuevaNota.trim()) return;
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;
    const nota: Nota = {
      id: Date.now(),
      texto: nuevaNota,
      fecha: new Date().toISOString().split("T")[0],
    };
    const nuevasNotas = [...cliente.notas, nota];
    await supabase.from("clientes").update({ notas: nuevasNotas }).eq("id", clienteId);
    setNuevaNota("");
    setNotaClienteId(null);
    setClientes(clientes.map((c) =>
      c.id === clienteId ? { ...c, notas: nuevasNotas } : c
    ));
  }

  async function eliminarNota(clienteId: string, notaId: number) {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;
    const nuevasNotas = cliente.notas.filter((n) => n.id !== notaId);
    await supabase.from("clientes").update({ notas: nuevasNotas }).eq("id", clienteId);
    setClientes(clientes.map((c) =>
      c.id === clienteId ? { ...c, notas: nuevasNotas } : c
    ));
  }

  function eliminarCliente(cliente: Cliente) {
    setClienteAEliminar(cliente);
  }

  async function confirmarEliminarCliente() {
    if (!clienteAEliminar) return;
    await supabase.from("clientes").delete().eq("id", clienteAEliminar.id);
    setClienteAEliminar(null);
    cargarClientes();
  }

  function toggleCliente(id: string) {
    setClientesAbiertos(clientesAbiertos.includes(id)
      ? clientesAbiertos.filter((c) => c !== id)
      : [...clientesAbiertos, id]
    );
  }

  function abrirCalendar(cliente: Cliente) {
    openUrl("https://calendar.google.com/calendar/r/eventedit?text=Reunion+con+" + cliente.nombre);
  }

  const clientesFiltrados = clientes.filter((cliente) => {
    const coincideBusqueda =
      cliente.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (cliente.empresa || "").toLowerCase().includes(busqueda.toLowerCase());
    return coincideBusqueda;
  });

  if (cargando) {
    return (
      <div className="p-8">
        <p className="text-muted text-sm">Cargando clientes...</p>
      </div>
    );
  }

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-medium mb-2">Carpeta ya existe</h3>
            <p className="text-muted text-sm mb-6">
              Ya existe una carpeta llamada <span className="text-primary">"{modalCarpeta.nombre}"</span> en tu Google Drive. ¿Qué deseas hacer?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-accent/40 text-primary text-sm px-4 py-3 rounded-lg hover:bg-accent/10 transition-colors text-left">
                <p className="font-medium text-accent">Usar carpeta existente</p>
                <p className="text-muted text-xs mt-0.5">Vincular el cliente a la carpeta que ya existe</p>
              </button>
              <button
                onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-3 rounded-lg hover:border-violet/40 transition-colors text-left">
                <p className="font-medium">Crear carpeta nueva</p>
                <p className="text-muted text-xs mt-0.5">Se creará una carpeta adicional con el mismo nombre</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {clienteAEliminar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-semibold mb-2">¿Eliminar cliente?</h3>
            <p className="text-muted text-sm mb-6">
              Se eliminará a <span className="text-primary font-medium">{clienteAEliminar.nombre}</span>{" "}
              {clienteAEliminar.empresa ? "(" + clienteAEliminar.empresa + ")" : ""} y su acceso al portal.{" "}
              {proyectosPorCliente[clienteAEliminar.id] > 0 && (
                <span className="text-coral">
                  Tiene {proyectosPorCliente[clienteAEliminar.id]} proyecto(s) activo(s) que quedarán sin cliente.
                </span>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setClienteAEliminar(null)}
                className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminarCliente}
                className="bg-danger text-white font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
{mostrarModalPortal && portalToken && (() => {
  const clienteActual = clientes.find(c => c.id === mostrarModalPortal);
  const tokenData = tokenDataPorCliente[mostrarModalPortal];
  const mensajeWA = tokenData?.codigo_activo && tokenData?.codigo_acceso
    ? "Hola " + (clienteActual?.nombre || "") + ", aqui esta el link de acceso a tu portal: https://portal.appflowo.com/p/" + portalToken + " — Codigo de acceso: " + tokenData.codigo_acceso
    : "Hola " + (clienteActual?.nombre || "") + ", aqui esta el link de acceso a tu portal: https://portal.appflowo.com/p/" + portalToken;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-primary font-medium">Portal del cliente</h3>
          <button onClick={() => setMostrarModalPortal(null)} className="text-muted hover:text-primary text-lg leading-none">✕</button>
        </div>
        <p className="text-muted text-sm mb-5">
          Comparte este link con <span className="text-primary font-medium">{clienteActual?.nombre}</span>. Accede sin instalar nada ni crear cuenta.
        </p>

        {/* Link */}
        <div className="bg-surface border border-edge rounded-lg px-3 py-2.5 mb-3">
          <p className="text-muted text-xs font-mono break-all">
            {"https://portal.appflowo.com/p/" + portalToken}
          </p>
        </div>

        {/* Botones principales — siempre visibles */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={copiarLink}
            className={"flex-1 font-medium px-4 py-2.5 rounded-lg text-sm transition-all " +
              (linkCopiado
                ? "bg-accent/20 border border-accent/40 text-accent"
                : "bg-accent text-onaccent hover:opacity-90"
              )}>
            {linkCopiado ? "✓ Copiado" : "Copiar link"}
          </button>
          <button
            onClick={() => openUrl("https://wa.me/" + (clienteActual?.telefono || "") + "?text=" + encodeURIComponent(mensajeWA))}
            className="flex-1 bg-surface border border-edge text-primary font-medium px-4 py-2.5 rounded-lg text-sm hover:border-accent/40 transition-colors">
            Enviar por WhatsApp
          </button>
        </div>

        {/* Codigo de acceso — opcional */}
        <div className="border-t border-edge pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-primary text-sm">Código de acceso</p>
              <p className="text-muted text-xs mt-0.5">Opcional — el cliente deberá ingresarlo para ver el portal</p>
            </div>
            <button
              onClick={() => toggleCodigoAcceso(mostrarModalPortal)}
              className={"relative w-10 h-5 rounded-full transition-colors " +
                (tokenData?.codigo_activo ? "bg-accent" : "bg-edge")}>
              <span className={"absolute top-0.5 w-4 h-4 bg-primary rounded-full transition-all " +
                (tokenData?.codigo_activo ? "left-5" : "left-0.5")} />
            </button>
          </div>

          {tokenData?.codigo_activo && (
            <div className="flex gap-2">
              <input
                value={tokenData?.codigo_acceso || ""}
                onChange={(e) => actualizarCodigoLocal(mostrarModalPortal, e.target.value)}
                placeholder="Escribe un código..."
                maxLength={20}
                className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent font-mono"
              />
             <button
  onClick={() => guardarCodigoAcceso(mostrarModalPortal)}
  className={"font-medium px-4 py-2 rounded-lg text-sm transition-all " +
    (codigoGuardado
      ? "bg-accent/20 border border-accent/40 text-accent"
      : "bg-violet text-white hover:opacity-90"
    )}>
  {codigoGuardado ? "✓ Guardado" : "Guardar"}
</button>
            </div>
          )}
        </div>

        <p className="text-muted text-xs mt-4 text-center">
          El link no tiene fecha de vencimiento.
        </p>
      </div>
    </div>
  );
})()}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-primary">Clientes</h1>
          <p className="text-sm font-medium text-muted mt-1">{clientes.length} cliente{clientes.length === 1 ? "" : "s"} registrado{clientes.length === 1 ? "" : "s"}</p>
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
            {guardando ? (editandoId ? "Guardando..." : "Creando cliente...") : mostrarForm ? "Cancelar" : "+ Nuevo cliente"}
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-2xl p-5 mb-6">
          <h3 className="text-primary font-semibold mb-1">{editandoId ? "Editar cliente" : "Nuevo cliente"}</h3>
          <p className="text-muted text-xs mb-4">{editandoId ? "Actualiza los datos del cliente." : "Solo el nombre es obligatorio. Lo demás lo puedes completar después."}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">Nombre *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Perez"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">Empresa</label>
              <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nombre de la empresa"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">WhatsApp</label>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ej: +57 3001234567"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent font-mono" />
              <p className="text-muted text-[11px] mt-1.5">
                Debe llevar el <span className="text-accent">+</span> y el indicativo de país para poder contactarlo por WhatsApp (ej: +57 3001234567)
              </p>
            </div>
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
              <p className="text-muted text-[11px] mt-1.5">Opcional — por si el cliente no lo proporciona.</p>
            </div>
          </div>

          {/* Crear carpeta en */}
          {!editandoId && (
          <div className="mb-4">
            <p className="text-muted2 text-xs font-medium mb-2">Crear carpeta en</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setCrearCarpetaDrive(!crearCarpetaDrive)}
                disabled={!tieneDrive}
                className={
                  "relative text-left rounded-xl border p-3.5 transition-all " +
                  (tieneDrive
                    ? crearCarpetaDrive
                      ? "bg-accent/10 border-accent/50"
                      : "bg-surface border-edge hover:border-accent/40"
                    : "bg-surface border-edge opacity-50 cursor-not-allowed")
                }
              >
                {tieneDrive && (
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
                    <p className="text-muted text-[11px] mt-1">{tieneDrive ? "Conectado" : "Sin conectar"}</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  {tieneDrive
                    ? crearCarpetaDrive
                      ? <>Se creará <span className="text-accent">"{nombre || "nombre del cliente"}"</span> en tu Drive</>
                      : "Toca para activar la creación automática"
                    : <>Conecta tu Drive en <span className="text-accent">Perfil → Almacenamiento</span></>}
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
          )}

          {/* Nota inicial */}
          {!editandoId && (
          <div className="mb-4">
            <label className="text-muted2 text-xs font-medium mb-1.5 block">Nota</label>
            <textarea
              value={notaInicial}
              onChange={(e) => setNotaInicial(e.target.value)}
              placeholder="Escribe una nota privada sobre este cliente (opcional)..."
              rows={2}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={agregarCliente}
              disabled={guardando || !nombre}
              className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? (editandoId ? "Guardando..." : "Creando cliente...") : editandoId ? "Guardar cambios" : "Crear cliente"}
            </button>
            <button onClick={cerrarForm} className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o empresa..."
          className="flex-1 min-w-[220px] bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          <button
            onClick={() => setVista("lista")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "lista" ? "bg-surface text-primary" : "text-muted hover:text-primary")}
          >
            Lista
          </button>
          <button
            onClick={() => setVista("tarjetas")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "tarjetas" ? "bg-surface text-primary" : "text-muted hover:text-primary")}
          >
            Tarjetas
          </button>
        </div>
      </div>

      <div className={vista === "tarjetas" ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-3"}>
        {clientesFiltrados.map((cliente) => {
          const abierto = clientesAbiertos.includes(cliente.id);
          return (
            <div key={cliente.id} className="bg-canvas border border-edge rounded-xl overflow-hidden">
              <div
                onClick={() => toggleCliente(cliente.id)}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {cliente.nombre.charAt(0)}
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium">{cliente.nombre}</p>
                    <p className="text-muted text-xs">{cliente.empresa || "Sin empresa"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); editarCliente(cliente); }}
                    className="text-muted2 text-[11px] font-medium px-2 py-1 rounded-md hover:text-primary hover:bg-surface border border-transparent hover:border-edge"
                  >
                    Editar
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); eliminarCliente(cliente); }}
                    className="text-coral text-[11px] font-medium px-2 py-1 rounded-md hover:bg-danger/10"
                  >
                    Eliminar
                  </button>
                  {proyectosPorCliente[cliente.id] > 0 && (
                    <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-md">
                      {proyectosPorCliente[cliente.id]} proyecto{proyectosPorCliente[cliente.id] === 1 ? "" : "s"}
                    </span>
                  )}
                  {tokenPorCliente[cliente.id] && (
                    <span className="text-violet text-xs bg-violet/10 px-2 py-0.5 rounded-md">Portal</span>
                  )}
                  {cliente.folder_url && (
                    <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-md">Drive ✓</span>
                  )}
                  <span className="text-muted text-xs">{abierto ? "▲" : "▼"}</span>
                </div>
              </div>

              {abierto && (
                
                <div className="border-t border-edge px-5 py-4 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-muted2 text-sm">{cliente.email}</p>
                      <p className="text-muted2 text-sm">{cliente.telefono ? "WhatsApp: " + cliente.telefono : "Sin WhatsApp"}</p>
                      <p className="text-muted2 text-sm">
                        {proyectosPorCliente[cliente.id] > 0
                          ? proyectosPorCliente[cliente.id] + " proyecto" + (proyectosPorCliente[cliente.id] === 1 ? "" : "s") + " activo" + (proyectosPorCliente[cliente.id] === 1 ? "" : "s")
                          : "Sin proyectos activos"}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 flex-wrap justify-end">
                      {cliente.folder_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openUrl(cliente.folder_url!); }}
                          className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/20"
                        >
                          
                          Ver carpeta
                        </button>
                        
                      )}
                      <button
  onClick={(e) => { e.stopPropagation(); obtenerOCrearTokenCliente(cliente.id); }}
  disabled={generandoToken}
  className="bg-violet text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
>
  {tokenPorCliente[cliente.id] ? "Ver portal" : "Compartir portal"}
</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openUrl("https://wa.me/" + cliente.telefono); }}
                        disabled={!cliente.telefono}
                        className="bg-accent text-onaccent text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        WhatsApp
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirCalendar(cliente); }}
                        className="bg-surface border border-edge text-primary text-xs font-medium px-3 py-1.5 rounded-lg hover:border-violet/40"
                      >
                        Agendar reunión
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-muted text-xs uppercase tracking-wide">Notas privadas</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (notaClienteId === cliente.id) {
                            setNotaClienteId(null);
                            setNuevaNota("");
                          } else {
                            setNuevaNota("");
                            setNotaClienteId(cliente.id);
                          }
                        }}
                        className="text-accent text-xs hover:underline"
                      >
                        + Agregar nota
                      </button>
                    </div>

                    {notaClienteId === cliente.id && (
                      <div className="mb-3">
                        <textarea
                          value={nuevaNota}
                          onChange={(e) => setNuevaNota(e.target.value)}
                          placeholder="Escribe una nota privada..."
                          rows={2}
                          className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); agregarNota(cliente.id); }}
                            className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setNotaClienteId(null); setNuevaNota(""); }}
                            className="text-muted px-3 py-1.5 rounded-lg text-xs hover:text-primary"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {(cliente.notas || []).length === 0 && notaClienteId !== cliente.id && (
                      <p className="text-muted text-xs">Sin notas aún</p>
                    )}

                    <div className="space-y-2">
                      {(cliente.notas || []).map((nota) => (
                        <div key={nota.id} className="bg-surface rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-primary text-xs">{nota.texto}</p>
                            <p className="text-muted text-xs mt-1">{nota.fecha}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); eliminarNota(cliente.id, nota.id); }}
                            className="text-muted text-xs hover:text-coral flex-shrink-0"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {clientesFiltrados.length === 0 && !cargando && (
        <div className="text-center py-12">
          <p className="text-muted">
            {clientes.length === 0 ? "No tienes clientes todavía. Crea tu primero con el botón de arriba." : "No se encontraron clientes"}
          </p>
        </div>
      )}

    </div>
  );
}

export default Clientes;