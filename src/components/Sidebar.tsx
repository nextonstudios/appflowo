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

function Sidebar({ activePage, setActivePage, hayUpdate }: {
  activePage: string;
  setActivePage: (id: string) => void;
  hayUpdate: boolean;
}) {
  const [nombre, setNombre] = useState("Freelancer");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [showTeams, setShowTeams] = useState(false);
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

  return (
    <aside className="w-56 h-screen bg-canvas flex flex-col py-6 px-3 fixed top-0 left-0 z-10">

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

      <button onClick={() => setShowTeams(true)}
        className="mx-1 mb-3 px-3 py-2.5 rounded-lg text-left hover:opacity-90 transition-opacity"
        style={{ background: "linear-gradient(90deg, #79EFFF, #92D4FF, #AFB7FF, #C9A1FF, #FFABF8, #FFC0C0)" }}>
        <p className="text-xs font-semibold" style={{ color: "#1A1F2E" }}>Próximamente</p>
        <p className="text-xs font-bold mt-0.5" style={{ color: "#0D1117" }}>Flowo Teams</p>
      </button>

      {showTeams && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTeams(false)}>
          <div className="bg-canvas border border-edge rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <h3 className="text-primary font-semibold text-lg">Flowo Teams</h3>
            </div>
            <p className="text-muted2 text-sm leading-relaxed mb-6">
              Flowo está creciendo y queremos que crezcas con nosotros. Estamos construyendo <span className="text-accent font-medium">Flowo Teams</span>, para que desde una empresa pequeña hasta una grande, puedas gestionar proyectos, tareas, clientes y facturas junto a tu equipo, todo en un solo lugar.
            </p>
            <p className="text-muted text-xs mb-5">Llega pronto. Mantente atento.</p>
            <button onClick={() => setShowTeams(false)}
              className="font-medium px-5 py-2 rounded-lg text-sm hover:opacity-90 w-full text-onaccent"
              style={{ background: "linear-gradient(90deg, #79EFFF, #92D4FF, #AFB7FF, #C9A1FF, #FFABF8, #FFC0C0)" }}>
              Entendido
            </button>
          </div>
        </div>
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
  );
}

export default Sidebar;