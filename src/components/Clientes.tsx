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
  "por-iniciar": { label: "Por iniciar", color: "text-[#6B7280] bg-[#6B7280]/10" },
  "en-proceso": { label: "En proceso", color: "text-[#1DB8A0] bg-[#1DB8A0]/10" },
  "finalizado": { label: "Finalizado", color: "text-[#7C5CBF] bg-[#7C5CBF]/10" },
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
  const [filtroEstado, setFiltroEstado] = useState("todos");
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
  }, []);

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
  const { data } = await supabase
    .from("portal_tokens")
    .select("token, cliente_id, codigo_acceso, codigo_activo")
    .eq("activo", true);
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
    const { data } = await supabase
      .from("clientes")
      .select("*")
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

  async function agregarCliente() {
    if (!nombre || !email) return;
    setGuardando(true);

    const { data: { user } } = await supabase.auth.getUser();
    let folder_id: string | null = null;
    let folder_url: string | null = null;

    // Crear carpeta en Drive si corresponde
    if (tieneDrive && crearCarpetaDrive) {
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

    await supabase.from("clientes").insert({
      user_id: user?.id,
      nombre,
      empresa,
      email,
      telefono: whatsapp,
      notas: [],
      folder_id,
      folder_url,
    });

    setNombre("");
    setEmpresa("");
    setWhatsapp("");
    setEmail("");
    setMostrarForm(false);
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

  async function eliminarCliente(id: string) {
    await supabase.from("clientes").delete().eq("id", id);
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
    if (!coincideBusqueda) return false;
    if (filtroEstado === "sin-notas") return cliente.notas.length === 0;
    return true;
  });

  if (cargando) {
    return (
      <div className="p-8">
        <p className="text-[#6B7280] text-sm">Cargando clientes...</p>
      </div>
    );
  }

  return (
    <div className="p-8">

      {/* Modal carpeta existente */}
      {modalCarpeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-white font-medium mb-2">Carpeta ya existe</h3>
            <p className="text-[#6B7280] text-sm mb-6">
              Ya existe una carpeta llamada <span className="text-white">"{modalCarpeta.nombre}"</span> en tu Google Drive. ¿Qué deseas hacer?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { modalCarpeta.resolve("usar"); setModalCarpeta(null); }}
                className="w-full bg-[#1A1F2E] border border-[#1DB8A0]/40 text-white text-sm px-4 py-3 rounded-lg hover:bg-[#1DB8A0]/10 transition-colors text-left">
                <p className="font-medium text-[#1DB8A0]">Usar carpeta existente</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Vincular el cliente a la carpeta que ya existe</p>
              </button>
              <button
                onClick={() => { modalCarpeta.resolve("nueva"); setModalCarpeta(null); }}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] text-white text-sm px-4 py-3 rounded-lg hover:border-[#7C5CBF]/40 transition-colors text-left">
                <p className="font-medium">Crear carpeta nueva</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Se creará una carpeta adicional con el mismo nombre</p>
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
      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-medium">Portal del cliente</h3>
          <button onClick={() => setMostrarModalPortal(null)} className="text-[#6B7280] hover:text-white text-lg leading-none">✕</button>
        </div>
        <p className="text-[#6B7280] text-sm mb-5">
          Comparte este link con <span className="text-white font-medium">{clienteActual?.nombre}</span>. Accede sin instalar nada ni crear cuenta.
        </p>

        {/* Link */}
        <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 mb-3">
          <p className="text-[#6B7280] text-xs font-mono break-all">
            {"https://portal.appflowo.com/p/" + portalToken}
          </p>
        </div>

        {/* Botones principales — siempre visibles */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={copiarLink}
            className={"flex-1 font-medium px-4 py-2.5 rounded-lg text-sm transition-all " +
              (linkCopiado
                ? "bg-[#1DB8A0]/20 border border-[#1DB8A0]/40 text-[#1DB8A0]"
                : "bg-[#1DB8A0] text-[#1A1F2E] hover:opacity-90"
              )}>
            {linkCopiado ? "✓ Copiado" : "Copiar link"}
          </button>
          <button
            onClick={() => openUrl("https://wa.me/" + (clienteActual?.telefono || "") + "?text=" + encodeURIComponent(mensajeWA))}
            className="flex-1 bg-[#1A1F2E] border border-[#252B3B] text-white font-medium px-4 py-2.5 rounded-lg text-sm hover:border-[#1DB8A0]/40 transition-colors">
            Enviar por WhatsApp
          </button>
        </div>

        {/* Codigo de acceso — opcional */}
        <div className="border-t border-[#252B3B] pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white text-sm">Código de acceso</p>
              <p className="text-[#6B7280] text-xs mt-0.5">Opcional — el cliente deberá ingresarlo para ver el portal</p>
            </div>
            <button
              onClick={() => toggleCodigoAcceso(mostrarModalPortal)}
              className={"relative w-10 h-5 rounded-full transition-colors " +
                (tokenData?.codigo_activo ? "bg-[#1DB8A0]" : "bg-[#252B3B]")}>
              <span className={"absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all " +
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
                className="flex-1 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0] font-mono"
              />
             <button
  onClick={() => guardarCodigoAcceso(mostrarModalPortal)}
  className={"font-medium px-4 py-2 rounded-lg text-sm transition-all " +
    (codigoGuardado
      ? "bg-[#1DB8A0]/20 border border-[#1DB8A0]/40 text-[#1DB8A0]"
      : "bg-[#7C5CBF] text-white hover:opacity-90"
    )}>
  {codigoGuardado ? "✓ Guardado" : "Guardar"}
</button>
            </div>
          )}
        </div>

        <p className="text-[#6B7280] text-xs mt-4 text-center">
          El link no tiene fecha de vencimiento.
        </p>
      </div>
    </div>
  );
})()}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Clientes</h2>
          <p className="text-[#6B7280] mt-1">{clientes.length} clientes registrados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
            <button
              onClick={() => setVista("lista")}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (vista === "lista" ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}
            >
              Lista
            </button>
            <button
              onClick={() => setVista("tarjetas")}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (vista === "tarjetas" ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}
            >
              Tarjetas
            </button>
          </div>
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity"
          >
            + Nuevo cliente
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
          <h3 className="text-white font-medium mb-4">Nuevo cliente</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Nombre *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Perez"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Empresa</label>
              <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nombre de la empresa"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">WhatsApp</label>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="573001234567"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Email *</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
          </div>

          {/* Opcion Drive */}
          {tieneDrive ? (
            <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
              <input
                type="checkbox"
                id="checkbox-drive-cliente"
                checked={crearCarpetaDrive}
                onChange={(e) => setCrearCarpetaDrive(e.target.checked)}
                className="w-4 h-4 accent-[#1DB8A0] cursor-pointer"
              />
              <label htmlFor="checkbox-drive-cliente" className="cursor-pointer">
                <p className="text-white text-sm">Crear carpeta en Google Drive</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Se creará la carpeta <span className="text-[#1DB8A0]">"{nombre || "nombre del cliente"}"</span> en la raíz de tu Drive</p>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-4 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-4 py-3">
              <div className="w-4 h-4 rounded border border-[#252B3B] bg-[#141824] flex-shrink-0" />
              <div>
                <p className="text-[#6B7280] text-sm">Crear carpeta en Google Drive</p>
                <p className="text-[#6B7280] text-xs mt-0.5">
                  Conecta tu Drive en{" "}
                  <span className="text-[#1DB8A0]">Perfil → Almacenamiento</span>
                  {" "}para activar esta opción
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={agregarCliente}
              disabled={guardando || !nombre || !email}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar cliente"}
            </button>
            <button onClick={() => setMostrarForm(false)} className="text-[#6B7280] px-4 py-2 rounded-lg text-sm hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o empresa..."
          className="flex-1 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]"
        />
        <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
          {[
            { id: "todos", label: "Todos" },
            { id: "sin-notas", label: "Sin notas" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroEstado(f.id)}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (filtroEstado === f.id ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className={vista === "tarjetas" ? "grid grid-cols-2 gap-4" : "space-y-3"}>
        {clientesFiltrados.map((cliente) => {
          const abierto = clientesAbiertos.includes(cliente.id);
          return (
            <div key={cliente.id} className="bg-[#141824] border border-[#252B3B] rounded-xl overflow-hidden">
              <div
                onClick={() => toggleCliente(cliente.id)}
                className="flex items-center justify-between px-5 py-4 hover:bg-[#1A1F2E] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#7C5CBF] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {cliente.nombre.charAt(0)}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{cliente.nombre}</p>
                    <p className="text-[#6B7280] text-xs">{cliente.empresa || "Sin empresa"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {cliente.folder_url && (
                    <span className="text-[#1DB8A0] text-xs bg-[#1DB8A0]/10 px-2 py-0.5 rounded-md">Drive ✓</span>
                  )}
                  <span className="text-[#6B7280] text-xs">{abierto ? "▲" : "▼"}</span>
                </div>
              </div>

              {abierto && (
                
                <div className="border-t border-[#252B3B] px-5 py-4 space-y-5">
                    <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[#6B7280] text-xs">{cliente.email}</p>
                      <p className="text-[#6B7280] text-xs">{cliente.telefono || "Sin WhatsApp"}</p>
                    </div>
                    
                    <div className="flex gap-2 flex-wrap justify-end">
                      {cliente.folder_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openUrl(cliente.folder_url!); }}
                          className="bg-[#1DB8A0]/10 border border-[#1DB8A0]/30 text-[#1DB8A0] text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/20"
                        >
                          
                          Ver carpeta
                        </button>
                        
                      )}
                      <button
  onClick={(e) => { e.stopPropagation(); obtenerOCrearTokenCliente(cliente.id); }}
  disabled={generandoToken}
  className="bg-[#7C5CBF] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
>
  {tokenPorCliente[cliente.id] ? "Ver portal" : "Compartir portal"}
</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openUrl("https://wa.me/" + cliente.telefono); }}
                        className="bg-[#1DB8A0] text-[#1A1F2E] text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90"
                      >
                        WhatsApp
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirCalendar(cliente); }}
                        className="bg-[#7C5CBF] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90"
                      >
                        Agendar reunión
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminarCliente(cliente.id); }}
                        className="text-[#6B7280] text-xs hover:text-[#F47C5C] px-2"
                      >                        
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[#6B7280] text-xs uppercase tracking-wide">Notas privadas</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setNotaClienteId(notaClienteId === cliente.id ? null : cliente.id); }}
                        className="text-[#1DB8A0] text-xs hover:underline"
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
                          className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0] resize-none mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); agregarNota(cliente.id); }}
                            className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setNotaClienteId(null); }}
                            className="text-[#6B7280] px-3 py-1.5 rounded-lg text-xs hover:text-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {(cliente.notas || []).length === 0 && notaClienteId !== cliente.id && (
                      <p className="text-[#6B7280] text-xs">Sin notas aún</p>
                    )}

                    <div className="space-y-2">
                      {(cliente.notas || []).map((nota) => (
                        <div key={nota.id} className="bg-[#1A1F2E] rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-white text-xs">{nota.texto}</p>
                            <p className="text-[#6B7280] text-xs mt-1">{nota.fecha}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); eliminarNota(cliente.id, nota.id); }}
                            className="text-[#6B7280] text-xs hover:text-[#F47C5C] flex-shrink-0"
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
          <p className="text-[#6B7280]">
            {clientes.length === 0 ? "No tienes clientes todavía. Crea tu primero con el botón de arriba." : "No se encontraron clientes"}
          </p>
        </div>
      )}

    </div>
  );
}

export default Clientes;