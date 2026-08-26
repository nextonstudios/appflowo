import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import Logo from "./Logo";

const menuItems = [
  { id: "dashboard", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
    </svg>
  )},
  { id: "clientes", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )},
  { id: "cotizaciones", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )},
  { id: "contratos", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 001 1h4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17c0-3 3-3.5 3-6M15 17c0-3-3-3.5-3-6" />
    </svg>
  )},
  { id: "proyectos", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
      <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )},
  { id: "tareas", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M7 4a2 2 0 012-2h6a2 2 0 012 2M7 4h10" />
    </svg>
  )},
  { id: "timer", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )},
  { id: "facturas", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6M4 6h16M4 10h16M4 14h8M4 18h6" />
      <rect x="2" y="4" width="20" height="18" rx="2" strokeLinecap="round" />
    </svg>
  )},
];

const menuEquipoItems = [
  { id: "equipo", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )},
];

function Sidebar({ activePage, setActivePage, hayUpdate, invitacionesPendientes = 0, enEquipo = false, equipoNombre, miRol, onSalirAlPersonal }: {
  activePage: string;
  setActivePage: (id: string) => void;
  hayUpdate: boolean;
  invitacionesPendientes?: number;
  enEquipo?: boolean;
  equipoNombre?: string | null;
  miRol?: string | null;
  onSalirAlPersonal?: () => void;
}) {
  const [nombre, setNombre] = useState("Freelancer");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [mostrarTeams, setMostrarTeams] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const nombreMeta = user.user_metadata?.nombre;
      if (nombreMeta) setNombre(nombreMeta);

      const { data } = await supabase
        .from("perfiles")
        .select("marca_nombre")
        .eq("user_id", user.id)
        .single();

      if (data?.marca_nombre) setMarcaNombre(data.marca_nombre);

      const { data: avatarData } = await supabase.storage
        .from("avatars")
        .getPublicUrl(user.id + "/avatar");

      if (avatarData?.publicUrl) setAvatar(avatarData.publicUrl + "?t=" + Date.now());
    }

    cargarPerfil();
  }, []);

  const esAdminEquipo = miRol === "admin";

  return (
    <>
    <aside className="w-56 h-screen bg-canvas flex flex-col py-6 px-3 fixed top-0 left-0 z-10">

      {enEquipo ? (
        /* ── MODO EQUIPO: header del equipo + menú de equipo ── */
        <>
          <div className="px-3 mb-4 mt-5">
            <Logo className="w-30" />
          </div>

          <div className="mx-1 mb-3 bg-surface border border-edge rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet/15 text-violet flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {(equipoNombre || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-primary text-sm font-medium truncate">{equipoNombre}</p>
                {miRol && (
                  <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-medium">
                    {t("equipos.roles." + miRol)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1 flex-1 overflow-hidden">
            <button
              onClick={onSalirAlPersonal}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-muted hover:text-primary hover:bg-surface transition-colors text-left w-full"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              {t("equipos.volverPersonal")}
            </button>

            <button
              onClick={() => setActivePage("flowo-teams")}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full
                ${activePage === "flowo-teams"
                  ? "bg-accent text-onaccent font-medium"
                  : "text-muted2 hover:text-primary hover:bg-surface"
                }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.75m-.75 3h.75m-.75 3h.75M3 21h18" />
              </svg>
              {t("equipos.misEquipos")}
            </button>

            <button
              onClick={() => setActivePage("equipo")}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full relative
                ${activePage === "equipo"
                  ? "bg-accent text-onaccent font-medium"
                  : "text-muted2 hover:text-primary hover:bg-surface"
                }`}
            >
              <span className="flex-shrink-0">{menuEquipoItems[0].icon}</span>
              {t("equipos.tab.miembros")}
            </button>

            {esAdminEquipo && (
              <button
                onClick={() => setActivePage("equipo-ajustes")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full
                  ${activePage === "equipo-ajustes"
                    ? "bg-accent text-onaccent font-medium"
                    : "text-muted2 hover:text-primary hover:bg-surface"
                  }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t("equipos.tab.ajustes")}
              </button>
            )}

            {["clientes", "proyectos", "tareas"].map((id) => {
              const item = menuItems.find((m) => m.id === id);
              if (!item) return null;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full
                    ${activePage === item.id
                      ? "bg-accent text-onaccent font-medium"
                      : "text-muted2 hover:text-primary hover:bg-surface"
                    }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {t("menu." + item.id)}
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        /* ── MODO PERSONAL ── */
        <>
          <div className="px-3 mb-10 mt-5">
            <Logo className="w-30" />
          </div>

          <nav className="flex flex-col gap-1 flex-1 overflow-hidden">
            {menuItems.map((item) => (
              <button
                key={item.id}
                data-tutorial={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors text-left w-full
                  ${activePage === item.id
                    ? "bg-accent text-onaccent font-medium"
                    : "text-muted2 hover:text-primary hover:bg-surface"
                  }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {t("menu." + item.id)}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setMostrarTeams(true)}
            className={`relative mx-1 mb-3 px-3 py-2.5 rounded-lg text-left transition-opacity ${
              activePage === "flowo-teams"
                ? "ring-2 ring-accent ring-offset-1 ring-offset-canvas"
                : "hover:opacity-90"
            }`}
            style={{ background: "linear-gradient(90deg, #79EFFF, #92D4FF, #AFB7FF, #C9A1FF, #FFABF8, #FFC0C0)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "#0D1117" }}>Flowo Teams</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#1A1F2E" }}>{t("equipos.tagline")}</p>
            {invitacionesPendientes > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                {invitacionesPendientes}
              </span>
            )}
          </button>
        </>
      )}

      <div
        onClick={() => setActivePage("perfil")}
        className="px-3 pt-4 border-t border-surface cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          {avatar ? (
            <div className="relative flex-shrink-0">
              <img src={avatar} className="w-8 h-8 rounded-full object-cover" />
              {hayUpdate && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-danger rounded-full border-2 border-canvas" />
              )}
            </div>
          ) : (
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-violet flex items-center justify-center text-white text-sm font-medium">
                {nombre.charAt(0).toUpperCase()}
              </div>
              {hayUpdate && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-danger rounded-full border-2 border-canvas" />
              )}
            </div>
          )}
          <div>
            <p className="text-primary text-sm font-medium">{nombre}</p>
            {marcaNombre && marcaNombre !== "Pro" && (
              <p className="text-muted text-xs">{marcaNombre}</p>
            )}
          </div>
        </div>
      </div>

    </aside>

    {mostrarTeams && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-canvas border border-edge rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "linear-gradient(135deg, #79EFFF, #92D4FF, #AFB7FF, #C9A1FF, #FFABF8, #FFC0C0)" }}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#0D1117" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-primary font-semibold text-lg mb-2">{t("equipos.proximamente")}</h3>
          <p className="text-muted text-sm mb-6">{t("equipos.proximamenteNota")}</p>
          <button onClick={() => setMostrarTeams(false)}
            className="bg-accent text-onaccent font-medium px-6 py-2 rounded-lg text-sm hover:opacity-90">
            {t("comunes.listo")}
          </button>
        </div>
      </div>
    )}
    </>
  );
}

export default Sidebar;