import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import { signIn, signOut } from "@choochmeque/tauri-plugin-google-auth-api";
import { UpdateState } from "../hooks/useUpdater";
import { getVersion } from "@tauri-apps/api/app";

interface Servicio {
  id: number;
  nombre: string;
  descripcion: string;
  modo: "fijo" | "horas";
  precio: number;
}

interface Integracion {
  proveedor: string;
  cuenta_email: string;
  access_token: string;
}

interface Props {
  onLogout: () => void;
  estadoUpdate: UpdateState;
  onVerificarUpdate: () => void;
  onReiniciar: () => void;
  onDescargar: () => void;
}

function Perfil({ onLogout, estadoUpdate, onVerificarUpdate, onReiniciar, onDescargar }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [marcaDesc, setMarcaDesc] = useState("");
  const [marcaWeb, setMarcaWeb] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [idioma, setIdioma] = useState("es");
  const [tema, setTema] = useState("oscuro");
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [mostrarFormServicio, setMostrarFormServicio] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoDesc, setNuevoDesc] = useState("");
  const [nuevoModo, setNuevoModo] = useState<"fijo" | "horas">("fijo");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [integraciones, setIntegraciones] = useState<Integracion[]>([]);
  const [conectandoDrive, setConectandoDrive] = useState(false);
  const [errorDrive, setErrorDrive] = useState<string | null>(null);

  useEffect(() => {
  getVersion().then(setVersion);
}, []);

  useEffect(() => {
    cargarPerfil();
    cargarIntegraciones();
  }, []);

  async function cargarPerfil() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setEmail(user.email || "");
    setNombre(user.user_metadata?.nombre || "");

    const { data } = await supabase
      .from("perfiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (data) {
      setTelefono(data.telefono || "");
      setMarcaNombre(data.marca_nombre || "");
      setMarcaDesc(data.marca_desc || "");
      setMarcaWeb(data.marca_web || "");
      setMoneda(data.moneda || "USD");
      setIdioma(data.idioma || "es");
      setTema(data.tema || "oscuro");
      setServicios(Array.isArray(data.servicios) ? data.servicios : []);
    }

    setCargando(false);

    const { data: avatarData } = await supabase.storage
      .from("avatars")
      .getPublicUrl(user.id + "/avatar");
    if (avatarData?.publicUrl) setAvatar(avatarData.publicUrl + "?t=" + Date.now());

    const { data: logoData } = await supabase.storage
      .from("avatars")
      .getPublicUrl(user.id + "/logo");
    if (logoData?.publicUrl) setLogo(logoData.publicUrl + "?t=" + Date.now());
  }

  async function subirLogo(file: File) {
    setErrorLogo(null);

    // Validar formato
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setErrorLogo("Solo se aceptan archivos PNG o JPG.");
      return;
    }

    // Validar peso (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorLogo("El logo no puede superar 5MB.");
      return;
    }

    setSubiendoLogo(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(user.id + "/logo", file, { upsert: true, contentType: file.type });

    if (error) {
      setErrorLogo("Error al subir el logo. Intenta de nuevo.");
    } else {
      const { data } = await supabase.storage
        .from("avatars")
        .getPublicUrl(user.id + "/logo");
      setLogo(data.publicUrl + "?t=" + Date.now());
    }

    setSubiendoLogo(false);
  }

  async function eliminarLogo() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.storage.from("avatars").remove([user.id + "/logo"]);
    setLogo(null);
  }

  async function cargarIntegraciones() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("integraciones")
      .select("proveedor, cuenta_email, access_token")
      .eq("user_id", user.id);

    if (data) setIntegraciones(data);
  }

  function tieneIntegracion(proveedor: string) {
    return integraciones.some((i) => i.proveedor === proveedor);
  }

  function emailIntegracion(proveedor: string) {
    return integraciones.find((i) => i.proveedor === proveedor)?.cuenta_email || "";
  }
const [version, setVersion] = useState("");



  async function conectarGoogleDrive() {
    setConectandoDrive(true);
    setErrorDrive(null);
    try {
      const response = await signIn({
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
        scopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/drive.file",
        ],
      });

      let cuentaEmail = "";
      if (response.idToken) {
        const payload = JSON.parse(atob(response.idToken.split(".")[1]));
        cuentaEmail = payload.email || "";
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("integraciones").upsert({
        user_id: user.id,
        proveedor: "google_drive",
        access_token: response.accessToken,
        refresh_token: response.refreshToken || null,
        cuenta_email: cuentaEmail,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,proveedor" });

      if (error) {
        setErrorDrive("Error: " + error.message + " | code: " + error.code);
      } else {
        await cargarIntegraciones();
      }
    } catch (err: any) {
      setErrorDrive("No se pudo conectar. Intenta de nuevo.");
    } finally {
      setConectandoDrive(false);
    }
  }

  async function desconectarGoogleDrive() {
    const integracion = integraciones.find((i) => i.proveedor === "google_drive");
    if (!integracion) return;

    try {
      await signOut({ token: integracion.access_token });
    } catch (_) {}

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("integraciones")
      .delete()
      .eq("user_id", user.id)
      .eq("proveedor", "google_drive");

    await cargarIntegraciones();
  }

  async function guardarCambios() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.auth.updateUser({ data: { nombre } });

    const { error } = await supabase.from("perfiles").upsert({
      user_id: user.id,
      telefono,
      marca_nombre: marcaNombre,
      marca_desc: marcaDesc,
      marca_web: marcaWeb,
      moneda,
      idioma,
      tema,
      servicios,
    }, { onConflict: "user_id" });

    if (error) {
      console.error("Error guardando perfil:", error);
    } else {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    onLogout();
  }

  function abrirFormNuevo() {
    setEditandoId(null);
    setNuevoNombre("");
    setNuevoDesc("");
    setNuevoModo("fijo");
    setNuevoPrecio("");
    setMostrarFormServicio(true);
  }

  function abrirFormEditar(servicio: Servicio) {
    setEditandoId(servicio.id);
    setNuevoNombre(servicio.nombre);
    setNuevoDesc(servicio.descripcion);
    setNuevoModo(servicio.modo);
    setNuevoPrecio(String(servicio.precio));
    setMostrarFormServicio(true);
  }

  function guardarServicio() {
    if (!nuevoNombre || !nuevoPrecio) return;
    if (editandoId !== null) {
      setServicios(servicios.map((s) =>
        s.id === editandoId
          ? { ...s, nombre: nuevoNombre, descripcion: nuevoDesc, modo: nuevoModo, precio: Number(nuevoPrecio) }
          : s
      ));
    } else {
      const nuevo: Servicio = {
        id: Date.now(),
        nombre: nuevoNombre,
        descripcion: nuevoDesc,
        modo: nuevoModo,
        precio: Number(nuevoPrecio),
      };
      setServicios([...servicios, nuevo]);
    }
    setNuevoNombre("");
    setNuevoDesc("");
    setNuevoModo("fijo");
    setNuevoPrecio("");
    setEditandoId(null);
    setMostrarFormServicio(false);
  }

  function eliminarServicio(id: number) {
    setServicios(servicios.filter((s) => s.id !== id));
  }

function labelBotonUpdate() {
  if (estadoUpdate.disponible) return `Descargar v${estadoUpdate.version}`;
  return "Buscar actualizaciones";
}
  function accionBotonUpdate() {
  if (estadoUpdate.disponible) return onDescargar();
  return onVerificarUpdate();
}

function colorBotonUpdate() {
  if (estadoUpdate.disponible) return "bg-[#1DB8A0] text-[#1A1F2E] hover:opacity-90";
  return "bg-[#252B3B] text-white hover:bg-[#2B3044]";
}

if (cargando) {
  return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando perfil...</p></div>;
}

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Perfil y ajustes</h2>
          <p className="text-[#6B7280] mt-1">Configura tu cuenta y preferencias</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={cerrarSesion} className="text-[#F47C5C] text-sm hover:underline">
            Cerrar sesion
          </button>
          <button onClick={guardarCambios}
            className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-6 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
            {guardado ? "Guardado!" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Informacion personal */}
      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 mb-4">
        <div className="flex items-center gap-6 mb-6">
          <div className="flex flex-col items-center gap-1">
            {avatar ? (
              <img src={avatar} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#7C5CBF] flex items-center justify-center text-white text-3xl font-medium flex-shrink-0">
                {nombre.charAt(0) || "F"}
              </div>
            )}
            <label className="text-[#1DB8A0] text-xs cursor-pointer hover:underline">
              Cambiar foto
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const { data: { user } } = await supabase.auth.getUser();
                await supabase.storage.from("avatars").upload(user?.id + "/avatar", file, { upsert: true });
                const { data } = await supabase.storage.from("avatars").getPublicUrl(user?.id + "/avatar");
                setAvatar(data.publicUrl + "?t=" + Date.now());
              }} />
            </label>
          </div>
          <div>
            <p className="text-white font-medium text-lg">{nombre || "Freelancer"}</p>
            <p className="text-[#6B7280] text-sm mt-0.5">{marcaNombre || "Sin marca personal"}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-[#6B7280] text-xs mb-1 block">Nombre completo</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
          </div>
          <div>
            <label className="text-[#6B7280] text-xs mb-1 block">Email</label>
            <input value={email} disabled
              className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-[#6B7280] text-sm focus:outline-none opacity-60" />
          </div>
          <div>
            <label className="text-[#6B7280] text-xs mb-1 block">Telefono / WhatsApp</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
              placeholder="573001234567"
              className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Marca personal */}
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-white font-medium">Marca personal</h3>
            <span className="text-[#6B7280] text-xs">Opcional — aparece en facturas y portal</span>
          </div>
          <p className="text-[#6B7280] text-xs mb-4">Si ofreces tus servicios bajo una marca configurala aqui</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Nombre de marca</label>
              <input value={marcaNombre} onChange={(e) => setMarcaNombre(e.target.value)}
                placeholder="JP Studio"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Sitio web</label>
              <input value={marcaWeb} onChange={(e) => setMarcaWeb(e.target.value)}
                placeholder="www.jpstudio.com"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
            <div className="col-span-2">
              <label className="text-[#6B7280] text-xs mb-1 block">Descripcion corta</label>
              <input value={marcaDesc} onChange={(e) => setMarcaDesc(e.target.value)}
                placeholder="Disenador UI/UX freelance"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
          </div>

          {/* Logo de marca */}
          <div>
            <label className="text-[#6B7280] text-xs mb-2 block">
              Logotipo — aparece en tus facturas PDF
            </label>
            <div className="flex items-center gap-3">
              {logo ? (
                <div className="flex items-center gap-3 flex-1">
                  <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg p-2 flex items-center justify-center" style={{ minWidth: "80px", height: "48px" }}>
                    <img
                      src={logo}
                      alt="Logo de marca"
                      className="max-h-8 max-w-full object-contain"
                      onError={() => setLogo(null)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[#1DB8A0] text-xs cursor-pointer hover:underline">
                      Cambiar logo
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) subirLogo(file);
                      }} />
                    </label>
                    <button onClick={eliminarLogo} className="text-[#F47C5C] text-xs hover:underline text-left">
                      Eliminar logo
                    </button>
                  </div>
                </div>
              ) : (
                <label className={"flex items-center gap-2 cursor-pointer border border-dashed rounded-lg px-4 py-3 flex-1 transition-colors " +
                  (subiendoLogo ? "border-[#1DB8A0]/50 bg-[#1DB8A0]/5 cursor-not-allowed" : "border-[#252B3B] hover:border-[#1DB8A0]/50 hover:bg-[#1DB8A0]/5")}>
                  <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={subiendoLogo} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) subirLogo(file);
                  }} />
                  <span className="text-[#1DB8A0] text-sm">{subiendoLogo ? "Subiendo..." : "+"}</span>
                  <div>
                    <p className="text-[#6B7280] text-xs">{subiendoLogo ? "Subiendo logo..." : "Subir logotipo"}</p>
                    <p className="text-[#6B7280] text-xs opacity-60">PNG o JPG · Máx. 5MB</p>
                  </div>
                </label>
              )}
            </div>
            {errorLogo && <p className="text-[#F47C5C] text-xs mt-2">{errorLogo}</p>}
          </div>
        </div>

        {/* Preferencias */}
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6">
          <h3 className="text-white font-medium mb-4">Preferencias</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Moneda</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="USD">USD — Dolar</option>
                <option value="COP">COP — Peso colombiano</option>
                <option value="EUR">EUR — Euro</option>
                <option value="MXN">MXN — Peso mexicano</option>
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Idioma</label>
              <div className="relative">
                <select
                  value="es"
                  disabled
                  className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none opacity-70 cursor-not-allowed appearance-none">
                  <option value="es">Español</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7C5CBF] text-xs font-medium pointer-events-none">
                  + idiomas pronto
                </span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-[#6B7280] text-xs mb-1 block">Tema</label>
            <div className="flex gap-2">
               <button onClick={() => setTema("oscuro")}
    className={"flex-1 text-xs py-2.5 rounded-lg font-medium border transition-colors " + (tema === "oscuro" ? "bg-[#1A1F2E] border-[#1DB8A0] text-white" : "bg-[#1A1F2E] border-[#252B3B] text-[#6B7280] hover:text-white")}>
    Oscuro
  </button>
  <div className="flex-1 relative">
              <button disabled
  className="w-full text-xs py-2.5 rounded-lg font-medium border bg-[#1A1F2E] border-[#252B3B] text-[#6B7280] opacity-70 cursor-not-allowed flex items-center justify-center gap-2">
  Claro
  <span className="text-[#7C5CBF] text-xs font-medium">Proximamente</span>
</button>
                  </div>
</div>
        </div>
      </div>
</div>
      {/* Almacenamiento */}
      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 mb-4">
        <div className="mb-4">
          <h3 className="text-white font-medium">Almacenamiento en la nube</h3>
          <p className="text-[#6B7280] text-xs mt-1">
            Conecta tu nube para crear carpetas automaticamente al registrar clientes y proyectos
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className={"rounded-xl border p-4 flex flex-col gap-3 " + (tieneIntegracion("google_drive") ? "border-[#1DB8A0]/40 bg-[#1DB8A0]/5" : "border-[#252B3B] bg-[#1A1F2E]")}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#252B3B] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                  <path d="M8.5 2L3 11.5L8.5 21H15.5L21 11.5L15.5 2H8.5Z" fill="none" stroke="#1DB8A0" strokeWidth="1.5"/>
                  <path d="M3 11.5H21" stroke="#1DB8A0" strokeWidth="1.5"/>
                  <path d="M8.5 2L15.5 21" stroke="#7C5CBF" strokeWidth="1.5"/>
                  <path d="M15.5 2L8.5 21" stroke="#F47C5C" strokeWidth="1.5"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Google Drive</p>
                {tieneIntegracion("google_drive") ? (
                  <p className="text-[#1DB8A0] text-xs mt-0.5">{emailIntegracion("google_drive")}</p>
                ) : (
                  <p className="text-[#6B7280] text-xs mt-0.5">No conectado</p>
                )}
              </div>
            </div>
            {tieneIntegracion("google_drive") ? (
              <button onClick={desconectarGoogleDrive}
                className="w-full text-xs py-2 rounded-lg border border-[#F47C5C]/30 text-[#F47C5C] hover:bg-[#F47C5C]/10 transition-colors">
                Desconectar
              </button>
            ) : (
              <button onClick={conectarGoogleDrive} disabled={conectandoDrive}
                className="w-full text-xs py-2 rounded-lg border border-[#1DB8A0]/30 text-[#1DB8A0] hover:bg-[#1DB8A0]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {conectandoDrive ? "Conectando..." : "Conectar"}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-[#252B3B] bg-[#1A1F2E] p-4 flex flex-col gap-3 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#252B3B] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#6B7280">
                  <path d="M12 2L6 6.5L12 11L6 15.5L12 20L18 15.5L12 11L18 6.5L12 2Z"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Dropbox</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Proximamente</p>
              </div>
            </div>
            <div className="w-full text-xs py-2 rounded-lg border border-[#252B3B] text-[#6B7280] text-center">No disponible</div>
          </div>

          <div className="rounded-xl border border-[#252B3B] bg-[#1A1F2E] p-4 flex flex-col gap-3 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#252B3B] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#6B7280">
                  <path d="M20 17.5C21.4 17.5 22.5 16.4 22.5 15C22.5 13.7 21.6 12.6 20.3 12.5C20.1 10 18 8 15.5 8C14.3 8 13.2 8.5 12.4 9.2C11.7 7.3 9.9 6 7.8 6C5 6 2.8 8.2 2.8 11C2.8 11.1 2.8 11.2 2.8 11.3C1.6 11.8 0.8 13 0.8 14.3C0.8 16.1 2.2 17.5 4 17.5H20Z"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">OneDrive</p>
                <p className="text-[#6B7280] text-xs mt-0.5">Proximamente</p>
              </div>
            </div>
            <div className="w-full text-xs py-2 rounded-lg border border-[#252B3B] text-[#6B7280] text-center">No disponible</div>
          </div>
        </div>
        {errorDrive && <p className="text-[#F47C5C] text-xs mt-3">{errorDrive}</p>}
      </div>

      {/* Catalogo de servicios */}
      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-medium">Catalogo de servicios</h3>
            <p className="text-[#6B7280] text-xs mt-1">Tus tarifas base — se autocompletan al crear un proyecto</p>
          </div>
          <button onClick={abrirFormNuevo}
            className="text-[#1DB8A0] text-xs border border-[#1DB8A0]/30 px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/10">
            + Agregar servicio
          </button>
        </div>

        {mostrarFormServicio && (
          <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg p-4 mb-4">
            <h4 className="text-white text-sm font-medium mb-3">
              {editandoId !== null ? "Editar servicio" : "Nuevo servicio"}
            </h4>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Nombre *</label>
                <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Logo + Branding"
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
              </div>
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Descripcion</label>
                <input value={nuevoDesc} onChange={(e) => setNuevoDesc(e.target.value)}
                  placeholder="Logo y manual de marca"
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
              </div>
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Modo de cobro</label>
                <select value={nuevoModo} onChange={(e) => setNuevoModo(e.target.value as "fijo" | "horas")}
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                  <option value="fijo">Precio fijo</option>
                  <option value="horas">Por horas</option>
                </select>
              </div>
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">
                  {nuevoModo === "fijo" ? "Precio ($) *" : "Tarifa/hora ($) *"}
                </label>
                <input value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)}
                  placeholder={nuevoModo === "fijo" ? "1400" : "75"} type="number"
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={guardarServicio}
                className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
                {editandoId !== null ? "Guardar cambios" : "Agregar servicio"}
              </button>
              <button onClick={() => setMostrarFormServicio(false)}
                className="text-[#6B7280] px-4 py-1.5 rounded-lg text-xs hover:text-white">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {servicios.map((servicio) => (
            <div key={servicio.id} className="flex items-center justify-between bg-[#1A1F2E] rounded-lg px-4 py-3">
              <div>
                <p className="text-white text-sm">{servicio.nombre}</p>
                <p className="text-[#6B7280] text-xs mt-0.5">{servicio.descripcion}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[#1DB8A0] text-sm font-medium">
                    ${servicio.precio}{servicio.modo === "horas" ? "/hr" : ""}
                  </p>
                  <p className="text-[#6B7280] text-xs">{servicio.modo === "fijo" ? "Precio fijo" : "Por horas"}</p>
                </div>
                <button onClick={() => abrirFormEditar(servicio)} className="text-[#6B7280] text-xs hover:text-[#1DB8A0]">Editar</button>
                <button onClick={() => eliminarServicio(servicio.id)} className="text-[#6B7280] text-xs hover:text-[#F47C5C]">Eliminar</button>
              </div>
            </div>
          ))}
          {servicios.length === 0 && (
            <p className="text-[#6B7280] text-sm col-span-2">Sin servicios aún. Agrega tu primera tarifa.</p>
          )}
        </div>
      </div>

      {/* Version y actualizaciones */}
      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-medium">Version</h3>
            <p className="text-[#6B7280] text-sm mt-0.5">Flowo v{version} — creado por NextOn Studios</p>
          </div>
        </div>

        {/* Panel de actualización */}
        <div className="bg-[#1A1F2E] rounded-lg p-4 flex items-center justify-between mb-4">
          <div>
            {estadoUpdate.listo && (
              <p className="text-[#1DB8A0] text-sm font-medium">
                ✓ Versión {estadoUpdate.version} lista para instalar
              </p>
            )}
            {estadoUpdate.descargando && (
              <p className="text-white text-sm">Descargando v{estadoUpdate.version}...</p>
            )}
            {estadoUpdate.disponible && !estadoUpdate.descargando && !estadoUpdate.listo && (
              <p className="text-white text-sm">Nueva versión disponible: v{estadoUpdate.version}</p>
            )}
            {!estadoUpdate.disponible && !estadoUpdate.descargando && !estadoUpdate.listo && (
              <p className="text-[#6B7280] text-sm">Tu app está al día</p>
            )}
            {estadoUpdate.descargando && (
              <div className="mt-2 w-48 h-1.5 bg-[#252B3B] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1DB8A0] rounded-full transition-all duration-300"
                  style={{ width: `${estadoUpdate.progreso}%` }}
                />
              </div>
            )}
          </div>
          <button
   onClick={accionBotonUpdate}
   className={`text-xs font-medium px-4 py-2 rounded-lg transition-all ${colorBotonUpdate()}`}>
   {labelBotonUpdate()}
 </button>
        </div>

        {/* Donación */}
        <div className="bg-[#1A1F2E] rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">¿Te gusta Flowo?</p>
            <p className="text-[#6B7280] text-xs mt-0.5">Si Flowo te está ahorrando tiempo, considera apoyarnos</p>
          </div>
          <button
            onClick={() => openUrl("https://www.paypal.com/ncp/payment/CAYESPSBEHB42")}
            className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity flex-shrink-0">
            Donanos un cafe ☕
          </button>
        </div>
      </div>

    </div>
  );
}

export default Perfil;