import "./App.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Clientes from "./components/Clientes";
import Cotizaciones from "./components/Cotizaciones";
import Contratos from "./components/Contratos";
import Proyectos from "./components/Proyectos";
import Tareas from "./components/Tareas";
import Timer from "./components/Timer";
import Facturas from "./components/Facturas";
import Perfil from "./components/Perfil";
import Tutorial from "./components/Tutorial";
import Novedades, { debeMostrarNovedades, marcarNovedadesVista } from "./components/Novedades";
import ModalCrearCliente from "./components/ModalCrearCliente";
import { useNotificaciones } from "./hooks/useNotificaciones";
import { useUpdater } from "./hooks/useUpdater";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import type { ContratoClienteInfo } from "./lib/clientesContrato";
import { contratoRequiereCrearCliente } from "./lib/clientesContrato";

const TUTORIAL_VERSION = 1;

function App() {
  const [logueado, setLogueado] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [activePage, setActivePage] = useState("dashboard");
  const [proyectoFacturaId, setProyectoFacturaId] = useState<string | null>(null);
  const [mensajeAuth, setMensajeAuth] = useState<string | null>(null);
  const [mostrarTutorial, setMostrarTutorial] = useState(false);
  const [mostrarNovedades, setMostrarNovedades] = useState(false);
  const [cambiosSinGuardar, setCambiosSinGuardar] = useState(false);
  const [paginaPendiente, setPaginaPendiente] = useState<string | null>(null);
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const [contratoDetectado, setContratoDetectado] = useState<ContratoClienteInfo | null>(null);
  const guardarPerfilRef = useRef<(() => void) | null>(null);
  const descartarPerfilRef = useRef<(() => void) | null>(null);

  function navegar(pagina: string) {
    if (pagina === activePage) return;
    if (activePage === "perfil" && cambiosSinGuardar) {
      setPaginaPendiente(pagina);
      setMostrarAviso(true);
    } else {
      setActivePage(pagina);
    }
  }

  function salirConCambios(aplicar: boolean) {
    setMostrarAviso(false);
    if (aplicar) {
      guardarPerfilRef.current?.();
    } else {
      descartarPerfilRef.current?.();
    }
    setCambiosSinGuardar(false);
    if (paginaPendiente) setActivePage(paginaPendiente);
  }

  const onContratoFirmado = useCallback((c: ContratoClienteInfo) => {
    contratoRequiereCrearCliente(c).then((requiere) => {
      if (requiere) setContratoDetectado(c);
    });
  }, []);

  useNotificaciones(userId, onContratoFirmado);
  const { estado: estadoUpdate, reiniciar, descargar } = useUpdater();

  useEffect(() => {
    const tema = localStorage.getItem("flowo_tema") || "oscuro";
    document.documentElement.classList.toggle("light", tema === "claro");
    const acento = localStorage.getItem("flowo_acento") || "teal";
    document.documentElement.setAttribute("data-accent", acento);
    const fuente = localStorage.getItem("flowo_fuente") || "quicksand";
    document.documentElement.setAttribute("data-fuente", fuente);
    const tamFuente = localStorage.getItem("flowo_tamfuente") || "normal";
    document.documentElement.setAttribute("data-tam", tamFuente);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLogueado(!!data.session);
      setUserId(data.session?.user?.id ?? null);
      setCargando(false);
      document.addEventListener("contextmenu", (e) => {
        const target = e.target as HTMLElement;
        const esTexto = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
        if (!esTexto) e.preventDefault();
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLogueado(!!session);
      setUserId(session?.user?.id ?? null);
    });

    const unlistenPromise = onOpenUrl((urls) => {
      const url = urls[0];
      if (!url) return;

      if (url.includes("oauth/dropbox")) {
        const parts = url.split("?");
        if (parts[1]) {
          const params = new URLSearchParams(parts[1]);
          const code = params.get("code");
          const codeVerifier = sessionStorage.getItem("dropbox_pkce_verifier");
          if (code && codeVerifier) {
            sessionStorage.removeItem("dropbox_pkce_verifier");
            import("./lib/dropbox").then(({ handleDropboxCallback }) => {
              handleDropboxCallback(code, codeVerifier).then((success) => {
                if (success) {
                  window.dispatchEvent(new Event("cloud-storage-updated"));
                }
              });
            });
          }
        }
        return;
      }

      if (url.includes("oauth/onedrive")) {
        const parts = url.split("?");
        if (parts[1]) {
          const params = new URLSearchParams(parts[1]);
          const code = params.get("code");
          const codeVerifier = sessionStorage.getItem("onedrive_pkce_verifier");
          if (code && codeVerifier) {
            sessionStorage.removeItem("onedrive_pkce_verifier");
            import("./lib/onedrive").then(({ handleOneDriveCallback }) => {
              handleOneDriveCallback(code, codeVerifier).then((success) => {
                if (success) {
                  window.dispatchEvent(new Event("cloud-storage-updated"));
                }
              });
            });
          }
        }
        return;
      }

      const hash = url.includes("#") ? url.split("#")[1] : url.split("?")[1];
      if (!hash) return;

      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ error }) => {
          if (error) {
            setMensajeAuth("Error al confirmar la cuenta. Intenta de nuevo.");
          } else {
            if (type === "signup") {
              setMensajeAuth("¡Cuenta confirmada! Ya puedes iniciar sesión.");
            } else if (type === "recovery") {
              setMensajeAuth("Puedes restablecer tu contraseña ahora.");
            }
          }
        });
      }
    });

    return () => {
      listener.subscription.unsubscribe();
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!logueado || !userId) return;
    async function verificarTutorial() {
      const { data } = await supabase
        .from("perfiles")
        .select("tutorial_version")
        .eq("user_id", userId)
        .single();
      const version = data?.tutorial_version ?? 0;
      const tutorialCompletado = version >= TUTORIAL_VERSION;
      if (!tutorialCompletado) {
        setMostrarTutorial(true);
      } else if (debeMostrarNovedades(true)) {
        setMostrarNovedades(true);
      }
    }
    verificarTutorial();
  }, [logueado, userId]);

  if (cargando) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-accent text-sm">Cargando...</p>
      </div>
    );
  }

  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} mensajeExterno={mensajeAuth} />;
  }

  return (
    <div className="min-h-screen bg-canvas flex">
      <Sidebar
        activePage={activePage}
        setActivePage={navegar}
        hayUpdate={estadoUpdate.disponible}
      />
      <main className="flex-1 flex flex-col ml-56">
        <div className="flex-1">
          {activePage === "dashboard" && <Dashboard />}
          {activePage === "clientes" && <Clientes />}
          {activePage === "cotizaciones" && <Cotizaciones onIrAFacturas={() => setActivePage("facturas")} />}
          {activePage === "contratos" && <Contratos />}
          {activePage === "proyectos" && <Proyectos onGenerarFactura={(id) => { setProyectoFacturaId(id); setActivePage("facturas"); }} />}
          {activePage === "tareas" && <Tareas />}
          <div className={activePage === "timer" ? "block" : "hidden"}>
            <Timer activo={activePage === "timer"} />
          </div>
          {activePage === "facturas" && <Facturas proyectoPreseleccionado={proyectoFacturaId} onLimpiarProyecto={() => setProyectoFacturaId(null)} />}
          {activePage === "perfil" && (
            <Perfil
              onLogout={() => setLogueado(false)}
              estadoUpdate={estadoUpdate}
              onReiniciar={reiniciar}
              onDescargar={descargar}
              onCambiosSinGuardar={setCambiosSinGuardar}
              onRegistrarGuardar={(fn) => { guardarPerfilRef.current = fn; }}
              onRegistrarDescartar={(fn) => { descartarPerfilRef.current = fn; }}
            />
          )}
        </div>
      </main>

      {mostrarTutorial && (
        <Tutorial onTerminar={() => setMostrarTutorial(false)} />
      )}

      {mostrarNovedades && (
        <Novedades onTerminar={() => { marcarNovedadesVista(); setMostrarNovedades(false); }} />
      )}

      {contratoDetectado && (
        <ModalCrearCliente
          contrato={contratoDetectado}
          onConfirmado={() => setContratoDetectado(null)}
          onCancelar={() => setContratoDetectado(null)}
        />
      )}

      {mostrarAviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMostrarAviso(false)}>
          <div className="bg-surface border border-edge rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-primary font-semibold text-lg">Tienes cambios sin aplicar</h3>
            <p className="text-muted text-sm mt-1.5">Los cambios que hiciste en Perfil y ajustes no se han guardado. ¿Quieres aplicarlos?</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => salirConCambios(true)}
                className="bg-accent text-onaccent px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex-1">
                Aplicar
              </button>
              <button onClick={() => salirConCambios(false)}
                className="bg-surface border border-edge text-primary px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-surface2 transition-colors flex-1">
                No aplicar
              </button>
            </div>
            <button onClick={() => setMostrarAviso(false)}
              className="w-full text-center text-muted text-xs mt-4 hover:text-primary transition-colors">
              Seguir editando
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;