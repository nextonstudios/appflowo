import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buscarCarpeta, crearCarpeta } from "../lib/drive";
import { usePersistedState } from "../hooks/usePersistedState";
import { buscarCarpeta as buscarCarpetaDropbox, crearCarpeta as crearCarpetaDropbox } from "../lib/dropbox";
import { buscarCarpeta as buscarCarpetaOneDrive, crearCarpeta as crearCarpetaOneDrive } from "../lib/onedrive";

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

function Clientes({ equipoId, miRolEquipo }: { equipoId?: string | null; miRolEquipo?: string | null }) {
  const { t } = useTranslation();
  const modoEquipo = !!equipoId;
  const esViewer = miRolEquipo === "viewer";
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [vista, setVista] = usePersistedState<"lista" | "tarjetas">("flowo:clientes-vista", "lista");
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
  const [tieneDropbox, setTieneDropbox] = useState(false);
  const [activarCarpetaDropbox, setActivarCarpetaDropbox] = useState(true);
  const [tieneOneDrive, setTieneOneDrive] = useState(false);
  const [activarCarpetaOneDrive, setActivarCarpetaOneDrive] = useState(true);
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
    const baseQuery = supabase
      .from("proyectos")
      .select("id, cliente_id, estado");
    const { data } = modoEquipo
      ? await baseQuery.eq("equipo_id", equipoId)
      : await baseQuery.eq("user_id", user.id);
    const conteo: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      if (p.estado !== "completado") conteo[p.cliente_id] = (conteo[p.cliente_id] || 0) + 1;
    });
    setProyectosPorCliente(conteo);
  }

  async function verificarDrive() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: driveData } = await supabase
      .from("integraciones")
      .select("id")
      .eq("user_id", user.id)
      .eq("proveedor", "google_drive")
      .single();
    setTieneDrive(!!driveData);
    const { data: dropboxData } = await supabase
      .from("integraciones")
      .select("id")
      .eq("user_id", user.id)
      .eq("proveedor", "dropbox")
      .single();
    setTieneDropbox(!!dropboxData);
    const { data: onedriveData } = await supabase
      .from("integraciones")
      .select("id")
      .eq("user_id", user.id)
      .eq("proveedor", "onedrive")
      .single();
    setTieneOneDrive(!!onedriveData);
  }
async function cargarTokensPortal() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { setTokenPorCliente({}); setTokenDataPorCliente({}); return; }
  const baseQuery = supabase.from("clientes").select("id");
  const { data: clientesIds } = modoEquipo
    ? await baseQuery.eq("equipo_id", equipoId)
    : await baseQuery.eq("user_id", user.id);
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
    const baseQuery = supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });
    const { data } = modoEquipo
      ? await baseQuery.eq("equipo_id", equipoId)
      : await baseQuery.eq("user_id", user.id);
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
    let dropbox_folder_path: string | null = null;
    let dropbox_folder_url: string | null = null;
    let onedrive_folder_path: string | null = null;
    let onedrive_folder_url: string | null = null;

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

    // Crear carpeta en Dropbox si corresponde (solo al crear)
    if (!editandoId && tieneDropbox && activarCarpetaDropbox) {
      try {
        const existentes = await buscarCarpetaDropbox(nombre);
        if (existentes.length > 0) {
          dropbox_folder_path = existentes[0].path;
          dropbox_folder_url = existentes[0].url;
        } else {
          const nueva = await crearCarpetaDropbox(nombre);
          if (nueva) { dropbox_folder_path = nueva.path; dropbox_folder_url = nueva.url; }
        }
      } catch (err) {
        console.error("Error creando carpeta en Dropbox:", err);
      }
    }

    // Crear carpeta en OneDrive si corresponde (solo al crear)
    if (!editandoId && tieneOneDrive && activarCarpetaOneDrive) {
      try {
        const existentes = await buscarCarpetaOneDrive(nombre);
        if (existentes.length > 0) {
          onedrive_folder_path = existentes[0].path;
          onedrive_folder_url = existentes[0].url;
        } else {
          const nueva = await crearCarpetaOneDrive(nombre);
          if (nueva) { onedrive_folder_path = nueva.path; onedrive_folder_url = nueva.url; }
        }
      } catch (err) {
        console.error("Error creando carpeta en OneDrive:", err);
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
      const clienteData: any = {
        user_id: user?.id,
        nombre,
        empresa,
        email,
        telefono: whatsapp,
        notas,
        folder_id,
        folder_url,
      };
      if (modoEquipo) clienteData.equipo_id = equipoId;
      if (dropbox_folder_path) {
        clienteData.dropbox_folder_path = dropbox_folder_path;
        clienteData.dropbox_folder_url = dropbox_folder_url;
      }
      if (onedrive_folder_path) {
        clienteData.onedrive_folder_path = onedrive_folder_path;
        clienteData.onedrive_folder_url = onedrive_folder_url;
      }
      await supabase.from("clientes").insert(clienteData);
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
        <p className="text-muted text-sm">{t("clientes.cargando")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-medium mb-2">{t("clientes.carpetaExiste")}</h3>
            <p className="text-muted text-sm mb-6">
              {t("clientes.carpetaExisteDesc", { nombre: modalCarpeta.nombre })}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-accent/40 text-primary text-sm px-4 py-3 rounded-lg hover:bg-accent/10 transition-colors text-left">
                <p className="font-medium text-accent">{t("clientes.usarCarpeta")}</p>
                <p className="text-muted text-xs mt-0.5">{t("clientes.usarCarpetaDesc")}</p>
              </button>
              <button
                onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-3 rounded-lg hover:border-violet/40 transition-colors text-left">
                <p className="font-medium">{t("clientes.crearCarpetaNueva")}</p>
                <p className="text-muted text-xs mt-0.5">{t("clientes.crearCarpetaNuevaDesc")}</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {clienteAEliminar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-canvas border border-edge rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-primary font-semibold mb-2">{t("clientes.eliminarTitulo")}</h3>
            <p className="text-muted text-sm mb-6">
              {t("clientes.eliminarDescPre")}{" "}
              <span className="text-primary font-medium">{clienteAEliminar.nombre}</span>{" "}
              {t("clientes.eliminarDescPost", {
                empresa: clienteAEliminar.empresa ? "(" + clienteAEliminar.empresa + ")" : "",
              })}{" "}
              {proyectosPorCliente[clienteAEliminar.id] > 0 && (
                <span className="text-coral">
                  {t("clientes.eliminarProyectos", { count: proyectosPorCliente[clienteAEliminar.id] })}
                </span>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setClienteAEliminar(null)}
                className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary"
              >
                {t("clientes.cancelar")}
              </button>
              <button
                onClick={confirmarEliminarCliente}
                className="bg-danger text-white font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90"
              >
                {t("clientes.siEliminar")}
              </button>
            </div>
          </div>
        </div>
      )}
{mostrarModalPortal && portalToken && (() => {
  const clienteActual = clientes.find(c => c.id === mostrarModalPortal);
  const tokenData = tokenDataPorCliente[mostrarModalPortal];
  const linkPortal = "https://portal.appflowo.com/p/" + portalToken;
  const mensajeWA = tokenData?.codigo_activo && tokenData?.codigo_acceso
    ? t("clientes.mensajeWaCodigo", { nombre: clienteActual?.nombre || "", link: linkPortal, codigo: tokenData.codigo_acceso })
    : t("clientes.mensajeWa", { nombre: clienteActual?.nombre || "", link: linkPortal });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-primary font-medium">{t("clientes.portalTitulo")}</h3>
          <button onClick={() => setMostrarModalPortal(null)} className="text-muted hover:text-primary text-lg leading-none">✕</button>
        </div>
        <p className="text-muted text-sm mb-5">
          {t("clientes.portalDescPre")} <span className="text-primary font-medium">{clienteActual?.nombre}</span>. {t("clientes.portalDescPost")}
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
            {linkCopiado ? t("clientes.linkCopiado") : t("clientes.copiarLink")}
          </button>
          <button
            onClick={() => openUrl("https://wa.me/" + (clienteActual?.telefono || "") + "?text=" + encodeURIComponent(mensajeWA))}
            className="flex-1 bg-surface border border-edge text-primary font-medium px-4 py-2.5 rounded-lg text-sm hover:border-accent/40 transition-colors">
            {t("clientes.enviarWhatsapp")}
          </button>
        </div>

        {/* Codigo de acceso — opcional */}
        <div className="border-t border-edge pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-primary text-sm">{t("clientes.codigoAcceso")}</p>
              <p className="text-muted text-xs mt-0.5">{t("clientes.codigoAccesoDesc")}</p>
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
                placeholder={t("clientes.placeholderCodigo")}
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
  {codigoGuardado ? t("clientes.guardado") : t("clientes.guardar")}
</button>
            </div>
          )}
        </div>

        <p className="text-muted text-xs mt-4 text-center">
          {t("clientes.linkSinVencimiento")}
        </p>
      </div>
    </div>
  );
})()}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-primary">{t("clientes.titulo")}</h1>
          <p className="text-sm font-medium text-muted mt-1">{t("clientes.registrados", { count: clientes.length })}</p>
        </div>
        <div className="flex items-center gap-3">
          {!esViewer && (
            <button
              onClick={() => (mostrarForm ? cerrarForm() : setMostrarForm(true))}
              disabled={guardando}
              className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 " +
                (mostrarForm
                  ? "bg-surface border border-edge text-primary hover:border-coral/40"
                  : "bg-accent text-onaccent hover:opacity-90")}
            >
              {guardando ? (editandoId ? t("clientes.guardando") : t("clientes.creando")) : mostrarForm ? t("clientes.cancelar") : t("clientes.nuevoCliente")}
            </button>
          )}
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-2xl p-5 mb-6">
          <h3 className="text-primary font-semibold mb-1">{editandoId ? t("clientes.editarCliente") : t("clientes.nuevoCliente")}</h3>
          <p className="text-muted text-xs mb-4">{editandoId ? t("clientes.formEditarDesc") : t("clientes.formNuevoDesc")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">{t("clientes.nombre")} *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Perez"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">{t("clientes.empresa")}</label>
              <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder={t("clientes.placeholderEmpresa")}
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">WhatsApp</label>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder={t("clientes.placeholderTelefono")}
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent font-mono" />
              <p className="text-muted text-[11px] mt-1.5">
                {t("clientes.telefonoAyudaPre")} <span className="text-accent">+</span> {t("clientes.telefonoAyudaPost")}
              </p>
            </div>
            <div>
              <label className="text-muted2 text-xs font-medium mb-1.5 block">{t("clientes.email")}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
              <p className="text-muted text-[11px] mt-1.5">{t("clientes.emailAyuda")}</p>
            </div>
          </div>

          {/* Crear carpeta en */}
          {!editandoId && (
          <div className="mb-4">
            <p className="text-muted2 text-xs font-medium mb-2">{t("clientes.crearCarpetaEn")}</p>
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
                      <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">Google Drive</p>
                    <p className="text-muted text-[11px] mt-1">{tieneDrive ? t("clientes.conectado") : t("clientes.sinConectar")}</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  {tieneDrive
                    ? crearCarpetaDrive
                      ? t("clientes.seCreara", { nombre: nombre || t("clientes.nombreDelCliente") })
                      : t("clientes.tocaActivar")
                    : <>{t("clientes.conectaDrivePre")} <span className="text-accent">{t("clientes.perfilAlmacenamiento")}</span></>}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActivarCarpetaDropbox(!activarCarpetaDropbox)}
                disabled={!tieneDropbox}
                className={
                  "relative text-left rounded-xl border p-3.5 transition-all " +
                  (tieneDropbox
                    ? activarCarpetaDropbox
                      ? "bg-[#0061FF]/10 border-[#0061FF]/50"
                      : "bg-surface border-edge hover:border-[#0061FF]/40"
                    : "bg-surface border-edge opacity-50 cursor-not-allowed")
                }
              >
                {tieneDropbox && (
                  <span className={"absolute top-2.5 right-2.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors " +
                    (activarCarpetaDropbox ? "bg-[#0061FF] border-[#0061FF]" : "border-edge2")}>
                    {activarCarpetaDropbox && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0061FF]/15 flex items-center justify-center flex-shrink-0 text-[#0061FF]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">Dropbox</p>
                    <p className="text-muted text-[11px] mt-1">{tieneDropbox ? t("clientes.conectado") : t("clientes.sinConectar")}</p>
                  </div>
                </div>
                <p className="text-muted text-[11px]">
                  {tieneDropbox
                    ? activarCarpetaDropbox
                      ? t("clientes.seCreara", { nombre: nombre || t("clientes.nombreDelCliente") })
                      : t("clientes.tocaActivar")
                    : <>{t("clientes.conectaPre")} <span className="text-accent">{t("clientes.perfilAlmacenamiento")}</span></>}
                </p>
              </button>

              <div className={"relative text-left rounded-xl border bg-surface p-3.5" + (tieneOneDrive ? " border-edge" : " border-edge opacity-50 cursor-not-allowed")}>
                <button
                  onClick={() => tieneOneDrive && setActivarCarpetaOneDrive(!activarCarpetaOneDrive)}
                  disabled={!tieneOneDrive}
                  className="absolute inset-0 w-full h-full text-left"
                />
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0078D4]/15 flex items-center justify-center flex-shrink-0 text-[#0078D4]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28zm-7.265-4.137q-1.325 0-2.52.544-1.195.545-2.04 1.565.446.117.85.299.405.181.792.416l4.78 2.86 2.731-1.15q.27-.117.545-.204.276-.088.58-.147-.293-.937-.855-1.705-.563-.768-1.319-1.318-.755-.551-1.658-.856-.902-.304-1.886-.304zM2.414 16.395l9.914-4.184-3.832-2.297q-.586-.351-1.23-.539-.645-.188-1.325-.188-.914 0-1.722.364-.809.363-1.412.978-.604.616-.955 1.436-.352.82-.352 1.723 0 .703.234 1.423.235.721.68 1.284zm16.711 1.793q.563 0 1.078-.176.516-.176.961-.516l-7.23-4.324-10.301 4.336q.527.328 1.13.504.604.175 1.237.175zm3.012-1.852q.363-.727.363-1.523 0-.774-.293-1.407t-.791-1.072q-.498-.44-1.166-.68-.668-.24-1.406-.24-.422 0-.838.1t-.815.252q-.398.152-.785.334-.386.181-.761.345Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-primary text-sm font-medium leading-none">OneDrive</p>
                    {tieneOneDrive ? (
                      <p className="text-muted text-[11px] mt-1">{activarCarpetaOneDrive ? t("clientes.carpetaActiva") : t("clientes.carpetaDesactivada")}</p>
                    ) : (
                      <p className="text-muted text-[11px] mt-1">{t("clientes.sinConectar")}</p>
                    )}
                  </div>
                  {tieneOneDrive && (
                    <div className={`ml-auto w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${activarCarpetaOneDrive ? 'bg-[#0078D4]' : 'bg-edge'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${activarCarpetaOneDrive ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {tieneOneDrive
                    ? activarCarpetaOneDrive
                      ? t("clientes.seCreara", { nombre: nombre || t("clientes.nombreDelCliente") })
                      : t("clientes.tocaActivar")
                    : <>{t("clientes.conectaPre")} <span className="text-accent">{t("clientes.perfilAlmacenamiento")}</span></>}
                </p>
              </div>
            </div>
          </div>
          )}

          {/* Nota inicial */}
          {!editandoId && (
          <div className="mb-4">
            <label className="text-muted2 text-xs font-medium mb-1.5 block">{t("clientes.nota")}</label>
            <textarea
              value={notaInicial}
              onChange={(e) => setNotaInicial(e.target.value)}
              placeholder={t("clientes.placeholderNotaInicial")}
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
              {guardando ? (editandoId ? t("clientes.guardando") : t("clientes.creando")) : editandoId ? t("clientes.guardarCambios") : t("clientes.crearCliente")}
            </button>
            <button onClick={cerrarForm} className="text-muted px-4 py-2 rounded-lg text-sm hover:text-primary">
              {t("clientes.cancelar")}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("clientes.placeholderBuscar")}
          className="flex-1 min-w-[220px] bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          <button
            onClick={() => setVista("lista")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "lista" ? "bg-surface text-primary" : "text-muted hover:text-primary")}
          >
            {t("clientes.lista")}
          </button>
          <button
            onClick={() => setVista("tarjetas")}
            className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " + (vista === "tarjetas" ? "bg-surface text-primary" : "text-muted hover:text-primary")}
          >
            {t("clientes.tarjetas")}
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
                    <p className="text-muted text-xs">{cliente.empresa || t("clientes.sinEmpresa")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!esViewer && (
                    <button
                      onClick={(e) => { e.stopPropagation(); editarCliente(cliente); }}
                      className="text-muted2 text-[11px] font-medium px-2 py-1 rounded-md hover:text-primary hover:bg-surface border border-transparent hover:border-edge"
                    >
                      {t("clientes.editar")}
                    </button>
                  )}
                  {miRolEquipo === "admin" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); eliminarCliente(cliente); }}
                      className="text-coral text-[11px] font-medium px-2 py-1 rounded-md hover:bg-danger/10"
                    >
                      {t("clientes.eliminar")}
                    </button>
                  )}
                  {proyectosPorCliente[cliente.id] > 0 && (
                    <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-md">
                      {t("clientes.proyectosConteo", { count: proyectosPorCliente[cliente.id] })}
                    </span>
                  )}
                  {tokenPorCliente[cliente.id] && (
                    <span className="text-violet text-xs bg-violet/10 px-2 py-0.5 rounded-md">Portal</span>
                  )}
                  {cliente.folder_url && (
                    <span className="text-accent text-xs bg-accent/10 px-2 py-0.5 rounded-md">Drive ✓</span>
                  )}
                  {(cliente as any).dropbox_folder_url && (
                    <span className="text-[#0061FF] text-xs bg-[#0061FF]/10 px-2 py-0.5 rounded-md">Dropbox ✓</span>
                  )}
                  {(cliente as any).onedrive_folder_url && (
                    <span className="text-[#0078D4] text-xs bg-[#0078D4]/10 px-2 py-0.5 rounded-md">OneDrive ✓</span>
                  )}
                  <span className="text-muted text-xs">{abierto ? "▲" : "▼"}</span>
                </div>
              </div>

              {abierto && (
                
                <div className="border-t border-edge px-5 py-4 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-muted2 text-sm">{cliente.email}</p>
                      <p className="text-muted2 text-sm">{cliente.telefono ? "WhatsApp: " + cliente.telefono : t("clientes.sinWhatsapp")}</p>
                      <p className="text-muted2 text-sm">
                        {proyectosPorCliente[cliente.id] > 0
                          ? t("clientes.proyectosActivos", { count: proyectosPorCliente[cliente.id] })
                          : t("clientes.sinProyectosActivos")}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 flex-wrap justify-end">
                      {cliente.folder_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openUrl(cliente.folder_url!); }}
                          className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/20"
                        >
                          
                          {t("clientes.verCarpeta")}
                        </button>
                        
                      )}
                      {(cliente as any).dropbox_folder_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openUrl((cliente as any).dropbox_folder_url); }}
                          className="bg-[#0061FF]/10 border border-[#0061FF]/30 text-[#0061FF] text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#0061FF]/20"
                        >
                          Dropbox
                        </button>
                      )}
                      {(cliente as any).onedrive_folder_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openUrl((cliente as any).onedrive_folder_url); }}
                          className="bg-[#0078D4]/10 border border-[#0078D4]/30 text-[#0078D4] text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#0078D4]/20"
                        >
                          OneDrive
                        </button>
                      )}
                      <button
  onClick={(e) => { e.stopPropagation(); obtenerOCrearTokenCliente(cliente.id); }}
  disabled={generandoToken}
  className="bg-violet text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
>
  {tokenPorCliente[cliente.id] ? t("clientes.verPortal") : t("clientes.compartirPortal")}
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
                        {t("clientes.agendarReunion")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-muted text-xs uppercase tracking-wide">{t("clientes.notasPrivadas")}</p>
                      {!esViewer && (
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
                          {t("clientes.agregarNota")}
                        </button>
                      )}
                    </div>

                    {notaClienteId === cliente.id && (
                      <div className="mb-3">
                        <textarea
                          value={nuevaNota}
                          onChange={(e) => setNuevaNota(e.target.value)}
                          placeholder={t("clientes.placeholderNota")}
                          rows={2}
                          className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); agregarNota(cliente.id); }}
                            className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90"
                          >
                            {t("clientes.guardar")}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setNotaClienteId(null); setNuevaNota(""); }}
                            className="text-muted px-3 py-1.5 rounded-lg text-xs hover:text-primary"
                          >
                            {t("clientes.cancelar")}
                          </button>
                        </div>
                      </div>
                    )}

                    {(cliente.notas || []).length === 0 && notaClienteId !== cliente.id && (
                      <p className="text-muted text-xs">{t("clientes.sinNotas")}</p>
                    )}

                    <div className="space-y-2">
                      {(cliente.notas || []).map((nota) => (
                        <div key={nota.id} className="bg-surface rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-primary text-xs">{nota.texto}</p>
                            <p className="text-muted text-xs mt-1">{nota.fecha}</p>
                          </div>
                          {!esViewer && (
                            <button
                              onClick={(e) => { e.stopPropagation(); eliminarNota(cliente.id, nota.id); }}
                              className="text-muted text-xs hover:text-coral flex-shrink-0"
                            >
                              {t("clientes.eliminar")}
                            </button>
                          )}
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
            {clientes.length === 0 ? t("clientes.sinClientes") : t("clientes.sinResultados")}
          </p>
        </div>
      )}

    </div>
  );
}

export default Clientes;