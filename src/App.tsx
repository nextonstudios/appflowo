import "./App.css";
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Clientes from "./components/Clientes";
import Proyectos from "./components/Proyectos";
import Tareas from "./components/Tareas";
import Timer from "./components/Timer";
import Facturas from "./components/Facturas";
import Perfil from "./components/Perfil";
import { useNotificaciones } from "./hooks/useNotificaciones";
import { useUpdater } from "./hooks/useUpdater";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

function App() {
  const [logueado, setLogueado] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [activePage, setActivePage] = useState("dashboard");
  const [proyectoFacturaId, setProyectoFacturaId] = useState<string | null>(null);
  const [mensajeAuth, setMensajeAuth] = useState<string | null>(null);

  useNotificaciones(userId);
  const { estado: estadoUpdate, verificar: verificarUpdate, reiniciar, descargar } = useUpdater();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLogueado(!!data.session);
      setUserId(data.session?.user?.id ?? null);
      setCargando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLogueado(!!session);
      setUserId(session?.user?.id ?? null);
    });

    const unlistenPromise = onOpenUrl((urls) => {
      const url = urls[0];
      if (!url) return;

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

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center">
        <p className="text-[#1DB8A0] text-sm">Cargando...</p>
      </div>
    );
  }

  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} mensajeExterno={mensajeAuth} />;
  }

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        hayUpdate={estadoUpdate.disponible}
      />
      <main className="flex-1 flex flex-col ml-56">
        <div className="flex-1">
          {activePage === "dashboard" && <Dashboard />}
          {activePage === "clientes" && <Clientes />}
          {activePage === "proyectos" && <Proyectos onGenerarFactura={(id) => { setProyectoFacturaId(id); setActivePage("facturas"); }} />}
          {activePage === "tareas" && <Tareas />}
          {activePage === "timer" && <Timer />}
          {activePage === "facturas" && <Facturas proyectoPreseleccionado={proyectoFacturaId} onLimpiarProyecto={() => setProyectoFacturaId(null)} />}
          {activePage === "perfil" && (
            <Perfil
              onLogout={() => setLogueado(false)}
              estadoUpdate={estadoUpdate}
              onVerificarUpdate={verificarUpdate}
              onReiniciar={reiniciar}
              onDescargar={descargar}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;