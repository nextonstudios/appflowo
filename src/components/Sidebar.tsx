import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "clientes", label: "Clientes", icon: "◎" },
  { id: "proyectos", label: "Proyectos", icon: "▦" },
  { id: "tareas", label: "Tareas", icon: "✓" },
  { id: "timer", label: "Timer", icon: "◷" },
  { id: "facturas", label: "Facturas", icon: "◈" },
];

function Sidebar({ activePage, setActivePage, hayUpdate }: {
  activePage: string;
  setActivePage: (id: string) => void;
  hayUpdate: boolean;
}) {
  const [nombre, setNombre] = useState("Freelancer");
  const [marcaNombre, setMarcaNombre] = useState("Pro");
  const [avatar, setAvatar] = useState<string | null>(null);

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
    <aside className="w-56 h-screen bg-[#141824] flex flex-col py-6 px-3 fixed top-0 left-0 z-10">

      <div className="px-3 mb-8">
        <img src="/logoFlowo.png" alt="Logo Flowo" className="w-25" />
      </div>

      <nav className="flex flex-col gap-1 flex-1 overflow-hidden">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full
              ${activePage === item.id
                ? "bg-[#1DB8A0] text-[#1A1F2E] font-medium"
                : "text-[#6B7280] hover:text-white hover:bg-[#1A1F2E]"
              }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div
        onClick={() => setActivePage("perfil")}
        className="px-3 pt-4 border-t border-[#1A1F2E] cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          {avatar ? (
            <div className="relative flex-shrink-0">
              <img src={avatar} className="w-8 h-8 rounded-full object-cover" />
              {hayUpdate && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#F05C5C] rounded-full border-2 border-[#141824]" />
              )}
            </div>
          ) : (
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#7C5CBF] flex items-center justify-center text-white text-sm font-medium">
                {nombre.charAt(0).toUpperCase()}
              </div>
              {hayUpdate && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#F05C5C] rounded-full border-2 border-[#141824]" />
              )}
            </div>
          )}
          <div>
            <p className="text-white text-sm font-medium">{nombre}</p>
            <p className="text-[#6B7280] text-xs">{marcaNombre}</p>
          </div>
        </div>
      </div>

    </aside>
  );
}

export default Sidebar;