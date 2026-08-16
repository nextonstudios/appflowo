import { useState, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import Select from "./Select";
import { openUrl } from "@tauri-apps/plugin-opener";
import { signIn, signOut } from "@choochmeque/tauri-plugin-google-auth-api";
import { UpdateState } from "../hooks/useUpdater";
import { getVersion } from "@tauri-apps/api/app";
import { formatearMoneda } from "../lib/moneda";
import { contrasenaValida } from "../lib/contrasena";
import ChecklistContrasena from "./ChecklistContrasena";
import { cambiarIdioma, IDIOMAS } from "../i18n";

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
  onReiniciar: () => void;
  onDescargar: () => void;
  onCambiosSinGuardar?: (hayCambios: boolean) => void;
  onRegistrarGuardar?: (fn: () => void) => void;
  onRegistrarDescartar?: (fn: () => void) => void;
}

function getAcentos(t: TFunction): { id: string; nombre: string; muestra: string; check: string }[] {
  return [
    { id: "teal", nombre: t("perfil.acentos.teal"), muestra: "#1DB8A0", check: "#0E1A16" },
    { id: "violeta", nombre: t("perfil.acentos.violeta"), muestra: "#7C5CBF", check: "#FFFFFF" },
    { id: "azul", nombre: t("perfil.acentos.azul"), muestra: "#3B82F6", check: "#FFFFFF" },
    { id: "ambar", nombre: t("perfil.acentos.ambar"), muestra: "#F59E0B", check: "#0E1A16" },
    { id: "rosa", nombre: t("perfil.acentos.rosa"), muestra: "#EC4899", check: "#FFFFFF" },
  ];
}

function getFuentes(t: TFunction): { id: string; nombre: string; css: string }[] {
  return [
    { id: "quicksand", nombre: t("perfil.fuentes.quicksand"), css: "'Quicksand', sans-serif" },
    { id: "poppins", nombre: t("perfil.fuentes.poppins"), css: "'Poppins', sans-serif" },
    { id: "jakarta", nombre: t("perfil.fuentes.jakarta"), css: "'Plus Jakarta Sans', sans-serif" },
    { id: "inter", nombre: t("perfil.fuentes.inter"), css: "'Inter', sans-serif" },
    { id: "nunito", nombre: t("perfil.fuentes.nunito"), css: "'Nunito', sans-serif" },
    { id: "grotesk", nombre: t("perfil.fuentes.grotesk"), css: "'Space Grotesk', sans-serif" },
  ];
}

function getTamanos(t: TFunction): { id: string; nombre: string; px: number }[] {
  return [
    { id: "pequena", nombre: t("perfil.tamanos.pequena"), px: 13 },
    { id: "normal", nombre: t("perfil.tamanos.normal"), px: 15 },
    { id: "grande", nombre: t("perfil.tamanos.grande"), px: 17 },
    { id: "muy-grande", nombre: t("perfil.tamanos.muyGrande"), px: 20 },
  ];
}

function Perfil({ onLogout, estadoUpdate, onReiniciar, onDescargar, onCambiosSinGuardar, onRegistrarGuardar, onRegistrarDescartar }: Props) {
  const { t, i18n } = useTranslation();
  const ACENTOS = getAcentos(t);
  const FUENTES = getFuentes(t);
  const TAMANOS = getTamanos(t);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [marcaDesc, setMarcaDesc] = useState("");
  const [marcaWeb, setMarcaWeb] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [idioma, setIdioma] = useState(i18n.language === "en" ? "en" : "es");
  const [snapshot, setSnapshot] = useState("");
  const [tema, setTema] = useState("oscuro");
  const [acento, setAcento] = useState("teal");
  const [fuente, setFuente] = useState("quicksand");
  const [tamFuente, setTamFuente] = useState("normal");
  function aplicarTema(t: string) {
    setTema(t);
    localStorage.setItem("flowo_tema", t);
    document.documentElement.classList.toggle("light", t === "claro");
  }
  function aplicarAcento(a: string) {
    setAcento(a);
    localStorage.setItem("flowo_acento", a);
    document.documentElement.setAttribute("data-accent", a);
  }
  function aplicarFuente(f: string) {
    setFuente(f);
    localStorage.setItem("flowo_fuente", f);
    document.documentElement.setAttribute("data-fuente", f);
  }
  function aplicarTamFuente(t: string) {
    setTamFuente(t);
    localStorage.setItem("flowo_tamfuente", t);
    document.documentElement.setAttribute("data-tam", t);
  }
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
  const [conectandoDropbox, setConectandoDropbox] = useState(false);
  const [conectandoOneDrive, setConectandoOneDrive] = useState(false);
  const [version, setVersion] = useState("");
  const [seccionAbierta, setSeccionAbierta] = useState("perfil");
  const [modalContrasena, setModalContrasena] = useState(false);
  const [contrasenaActual, setContrasenaActual] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [cargandoContrasena, setCargandoContrasena] = useState(false);
  const [errorContrasena, setErrorContrasena] = useState<string | null>(null);
  const [exitoContrasena, setExitoContrasena] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [confirmacionEliminar, setConfirmacionEliminar] = useState("");
  const [contrasenaEliminar, setContrasenaEliminar] = useState("");
  const [cargandoEliminar, setCargandoEliminar] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [modalCerrarSesion, setModalCerrarSesion] = useState(false);

  function valoresActuales() {
    return JSON.stringify({
      telefono, marcaNombre, marcaDesc, marcaWeb, moneda, idioma, tema,
      servicios, avatar, logo, acento, fuente, tamFuente,
    });
  }
  useEffect(() => {
    if (!snapshot) return;
    const hay = valoresActuales() !== snapshot;
    onCambiosSinGuardar?.(hay);
  }, [telefono, marcaNombre, marcaDesc, marcaWeb, moneda, idioma, tema, servicios, avatar, logo, acento, fuente, tamFuente, snapshot]);
  useEffect(() => {
    onRegistrarGuardar?.(guardarCambios);
    onRegistrarDescartar?.(descartar);
  });
  function descartar() {
    if (!snapshot) return;
    const s = JSON.parse(snapshot);
    const temaRestaurado = s.tema || "oscuro";
    localStorage.setItem("flowo_tema", temaRestaurado);
    document.documentElement.classList.toggle("light", temaRestaurado === "claro");
    const acentoRestaurado = s.acento || "teal";
    localStorage.setItem("flowo_acento", acentoRestaurado);
    document.documentElement.setAttribute("data-accent", acentoRestaurado);
    const fuenteRestaurada = s.fuente || "quicksand";
    localStorage.setItem("flowo_fuente", fuenteRestaurada);
    document.documentElement.setAttribute("data-fuente", fuenteRestaurada);
    const tamRestaurado = s.tamFuente || "normal";
    localStorage.setItem("flowo_tamfuente", tamRestaurado);
    document.documentElement.setAttribute("data-tam", tamRestaurado);
    const monedaRestaurada = s.moneda || "USD";
    localStorage.setItem("flowo_moneda", monedaRestaurada);
    setSnapshot(valoresActuales());
  }

  useEffect(() => {
  getVersion().then(setVersion);
}, []);

  useEffect(() => {
    cargarPerfil();
    cargarIntegraciones();
  }, []);

  useEffect(() => {
    const handler = () => {
      setConectandoDropbox(false);
      setConectandoOneDrive(false);
      cargarIntegraciones();
    };
    window.addEventListener("cloud-storage-updated", handler);
    return () => window.removeEventListener("cloud-storage-updated", handler);
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

    const temaGuardado = data?.tema || "oscuro";
    const acentoGuardado = localStorage.getItem("flowo_acento") || "teal";
    const fuenteGuardada = localStorage.getItem("flowo_fuente") || "quicksand";
    const tamGuardado = localStorage.getItem("flowo_tamfuente") || "normal";
    const monedaGuardada = data?.moneda || "USD";
    localStorage.setItem("flowo_moneda", monedaGuardada);

    if (data) {
      setTelefono(data.telefono || "");
      setMarcaNombre(data.marca_nombre || "");
      setMarcaDesc(data.marca_desc || "");
      setMarcaWeb(data.marca_web || "");
      setMoneda(data.moneda || "USD");
      setIdioma(data.idioma || "es");
      setTema(temaGuardado);
      localStorage.setItem("flowo_tema", temaGuardado);
      document.documentElement.classList.toggle("light", temaGuardado === "claro");
      setAcento(acentoGuardado);
      document.documentElement.setAttribute("data-accent", acentoGuardado);
      setFuente(fuenteGuardada);
      document.documentElement.setAttribute("data-fuente", fuenteGuardada);
      setTamFuente(tamGuardado);
      document.documentElement.setAttribute("data-tam", tamGuardado);
      setServicios(Array.isArray(data.servicios) ? data.servicios : []);
    }

    setCargando(false);

    const { data: avatarData } = await supabase.storage
      .from("avatars")
      .getPublicUrl(user.id + "/avatar");
    const avatarUrl = avatarData?.publicUrl ? avatarData.publicUrl + "?t=" + Date.now() : null;
    if (avatarUrl) setAvatar(avatarUrl);

    const { data: logoData } = await supabase.storage
      .from("avatars")
      .getPublicUrl(user.id + "/logo");
    const logoUrl = logoData?.publicUrl ? logoData.publicUrl + "?t=" + Date.now() : null;
    if (logoUrl) setLogo(logoUrl);

    setSnapshot(JSON.stringify({
      telefono: data?.telefono || "",
      marcaNombre: data?.marca_nombre || "",
      marcaDesc: data?.marca_desc || "",
      marcaWeb: data?.marca_web || "",
      moneda: data?.moneda || "USD",
      idioma: data?.idioma || "es",
      tema: temaGuardado,
      servicios: Array.isArray(data?.servicios) ? data.servicios : [],
      avatar: avatarUrl,
      logo: logoUrl,
      acento: acentoGuardado,
      fuente: fuenteGuardada,
      tamFuente: tamGuardado,
    }));
  }

  async function subirLogo(file: File) {
    setErrorLogo(null);

    // Validar formato
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setErrorLogo(t("perfil.logo.errorFormato"));
      return;
    }

    // Validar peso (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorLogo(t("perfil.logo.errorPeso"));
      return;
    }

    setSubiendoLogo(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(user.id + "/logo", file, { upsert: true, contentType: file.type });

    if (error) {
      setErrorLogo(t("perfil.logo.errorSubida"));
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
      setErrorDrive(t("perfil.nube.error"));
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

  async function conectarDropbox() {
    setConectandoDropbox(true);
    setErrorDrive(null);
    try {
      const { iniciarFlujoDropbox } = await import("../lib/dropbox");
      const { authUrl, verifier } = await iniciarFlujoDropbox();
      sessionStorage.setItem("dropbox_pkce_verifier", verifier);
      await openUrl(authUrl);
    } catch (err: any) {
      setErrorDrive(t("perfil.nube.error"));
      setConectandoDropbox(false);
    }
  }

  async function desconectarDropbox() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("integraciones")
      .delete()
      .eq("user_id", user.id)
      .eq("proveedor", "dropbox");

    await cargarIntegraciones();
  }

  async function conectarOneDrive() {
    setConectandoOneDrive(true);
    setErrorDrive(null);
    try {
      const { iniciarFlujoOneDrive } = await import("../lib/onedrive");
      const { authUrl, verifier } = await iniciarFlujoOneDrive();
      sessionStorage.setItem("onedrive_pkce_verifier", verifier);
      await openUrl(authUrl);
    } catch (err: any) {
      setErrorDrive(t("perfil.nube.error"));
      setConectandoOneDrive(false);
    }
  }

  async function desconectarOneDrive() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("integraciones")
      .delete()
      .eq("user_id", user.id)
      .eq("proveedor", "onedrive");

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
      setSnapshot(valoresActuales());
      setTimeout(() => setGuardado(false), 2000);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    onLogout();
  }

  function abrirModalContrasena() {
    setContrasenaActual("");
    setNuevaContrasena("");
    setConfirmarContrasena("");
    setErrorContrasena(null);
    setExitoContrasena(false);
    setModalContrasena(true);
  }

  async function cambiarContrasena() {
    setErrorContrasena(null);
    if (!contrasenaValida(nuevaContrasena)) {
      setErrorContrasena(t("perfil.contrasena.errorLargo"));
      return;
    }
    if (nuevaContrasena !== confirmarContrasena) {
      setErrorContrasena(t("perfil.contrasena.errorConfirmacion"));
      return;
    }
    setCargandoContrasena(true);
    try {
      const { error: errorVerificacion } = await supabase.auth.signInWithPassword({ email, password: contrasenaActual });
      if (errorVerificacion) {
        setErrorContrasena(t("perfil.contrasena.errorActual"));
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: nuevaContrasena });
      if (error) {
        if (error.message.toLowerCase().includes("different")) {
          setErrorContrasena(t("perfil.contrasena.errorDiferente"));
        } else {
          setErrorContrasena(t("perfil.contrasena.errorCambio"));
        }
        return;
      }
      setExitoContrasena(true);
    } catch {
      setErrorContrasena(t("perfil.contrasena.errorGeneral"));
    } finally {
      setCargandoContrasena(false);
    }
  }

  function abrirModalEliminar() {
    setConfirmacionEliminar("");
    setContrasenaEliminar("");
    setErrorEliminar(null);
    setModalEliminar(true);
  }

  async function eliminarCuenta() {
    setErrorEliminar(null);
    if (confirmacionEliminar.trim().toUpperCase() !== "ELIMINAR") {
      setErrorEliminar(t("perfil.eliminar.errorConfirmacion"));
      return;
    }
    if (!contrasenaEliminar) {
      setErrorEliminar(t("perfil.eliminar.errorContrasenaVacia"));
      return;
    }
    setCargandoEliminar(true);
    try {
      const { error: errorVerificacion } = await supabase.auth.signInWithPassword({ email, password: contrasenaEliminar });
      if (errorVerificacion) {
        setErrorEliminar(t("perfil.eliminar.errorContrasena"));
        return;
      }
      const { error } = await supabase.rpc("eliminar_cuenta");
      if (error) {
        setErrorEliminar(t("perfil.eliminar.error"));
        return;
      }
      await supabase.auth.signOut();
      onLogout();
    } catch {
      setErrorEliminar(t("perfil.eliminar.errorGeneral"));
    } finally {
      setCargandoEliminar(false);
    }
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

  function Seccion({ id, titulo, descripcion, icono, children }: { id: string; titulo: string; descripcion: string; icono: ReactNode; children: ReactNode }) {
    const abierta = seccionAbierta === id;
    return (
      <div className="bg-canvas border border-edge rounded-xl overflow-hidden">
        <button onClick={() => setSeccionAbierta(abierta ? "" : id)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-accent flex-shrink-0">
              {icono}
            </div>
            <div className="text-left">
              <h3 className="text-primary font-medium">{titulo}</h3>
              <p className="text-muted text-xs mt-0.5">{descripcion}</p>
            </div>
          </div>
          <svg className={"w-4 h-4 text-muted transition-transform duration-200 flex-shrink-0 " + (abierta ? "rotate-180" : "")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {abierta && <div className="border-t border-edge px-6 py-5">{children}</div>}
      </div>
    );
  }

if (cargando) {
  return <div className="p-8"><p className="text-muted text-sm">{t("perfil.cargando")}</p></div>;
}

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-primary">{t("perfil.titulo")}</h2>
          <p className="text-muted mt-1">{t("perfil.desc")}</p>
        </div>
        <button onClick={guardarCambios}
          className="bg-accent text-onaccent font-medium px-6 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity flex-shrink-0">
          {guardado ? t("perfil.guardado") : t("perfil.guardarCambios")}
        </button>
      </div>

      <div className="space-y-4">

      <Seccion id="perfil" titulo={t("perfil.seccion.perfil.titulo")} descripcion={t("perfil.seccion.perfil.desc")}
        icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Perfil */}
          <div className="bg-surface border border-edge rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-canvas border border-edge flex items-center justify-center text-accent">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h4 className="text-primary text-sm font-medium">{t("perfil.perfil.titulo")}</h4>
            </div>

            <div className="flex items-center gap-6 mb-5">
              <div className="flex flex-col items-center gap-1">
                {avatar ? (
                  <img src={avatar} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-violet flex items-center justify-center text-white text-3xl font-medium flex-shrink-0">
                    {nombre.charAt(0) || "F"}
                  </div>
                )}
                <label className="text-accent text-xs cursor-pointer hover:underline">
                  {t("perfil.perfil.cambiarFoto")}
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
                <p className="text-primary font-medium text-lg">{nombre || t("perfil.perfil.freelancer")}</p>
                <p className="text-muted text-sm mt-0.5">{marcaNombre || t("perfil.perfil.sinMarca")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.perfil.nombreCompleto")}</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                  placeholder={t("perfil.perfil.placeholderNombre")}
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.perfil.descNombre")}</p>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.perfil.email")}</label>
                <input value={email} disabled
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-muted text-sm focus:outline-none opacity-60" />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.perfil.descEmail")}</p>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.perfil.whatsapp")}</label>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder={t("perfil.perfil.placeholderWhatsapp")}
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.perfil.descWhatsapp1")}<span className="text-accent">+</span>{t("perfil.perfil.descWhatsapp2")}</p>
              </div>
            </div>
          </div>

          {/* Marca personal */}
          <div className="bg-surface border border-edge rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-canvas border border-edge flex items-center justify-center text-accent">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                </svg>
              </div>
              <h4 className="text-primary text-sm font-medium">{t("perfil.marca.titulo")}</h4>
            </div>

            <div className="flex items-center gap-5 mb-5">
              <div className="flex flex-col items-center gap-1">
                {logo ? (
                  <div className="w-20 h-20 rounded-xl bg-canvas border border-edge flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={logo} alt={t("perfil.marca.altLogo")} className="max-h-16 max-w-16 object-contain" onError={() => setLogo(null)} />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-canvas border border-edge flex items-center justify-center text-muted flex-shrink-0">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15A2.25 2.25 0 0021.75 17.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-9.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    </svg>
                  </div>
                )}
                <label className="text-accent text-xs cursor-pointer hover:underline">
                  {subiendoLogo ? t("perfil.marca.subiendo") : logo ? t("perfil.marca.cambiarLogo") : t("perfil.marca.subirLogo")}
                  <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={subiendoLogo} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) subirLogo(file);
                  }} />
                </label>
                {logo && (
                  <button onClick={eliminarLogo} className="text-coral text-xs hover:underline">
                    {t("perfil.marca.eliminarLogo")}
                  </button>
                )}
              </div>
              <div>
                <p className="text-primary font-medium text-lg">{logo ? t("perfil.marca.tuLogotipo") : t("perfil.marca.sinLogotipo")}</p>
                <p className="text-muted text-sm mt-0.5">{t("perfil.marca.formatos")}</p>
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.marca.descLogo")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.marca.nombre")}</label>
                <input value={marcaNombre} onChange={(e) => setMarcaNombre(e.target.value)}
                  placeholder="JP Studio"
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.marca.descNombre")}</p>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.marca.sitioWeb")}</label>
                <input value={marcaWeb} onChange={(e) => setMarcaWeb(e.target.value)}
                  placeholder="www.jpstudio.com"
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.marca.descSitioWeb")}</p>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.marca.descripcionCorta")}</label>
                <input value={marcaDesc} onChange={(e) => setMarcaDesc(e.target.value)}
                  placeholder={t("perfil.marca.placeholderDescripcion")}
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.marca.descDescripcion")}</p>
              </div>
            </div>

            {errorLogo && <p className="text-coral text-xs mt-3">{errorLogo}</p>}
          </div>

        </div>
      </Seccion>

      <Seccion id="servicios" titulo={t("perfil.seccion.servicios.titulo")} descripcion={t("perfil.seccion.servicios.desc")}
        icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>}>
        <div className="flex justify-end mb-4">
          <button onClick={abrirFormNuevo}
            className="flex items-center gap-1.5 bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("perfil.servicios.agregar")}
          </button>
        </div>

        {mostrarFormServicio && (
          <div className="bg-surface border border-edge rounded-xl mb-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-edge">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-canvas border border-edge flex items-center justify-center text-accent">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-primary text-sm font-medium">
                    {editandoId !== null ? t("perfil.servicios.editarTitulo") : t("perfil.servicios.nuevoTitulo")}
                  </h4>
                  <p className="text-muted text-xs mt-0.5">
                    {editandoId !== null ? t("perfil.servicios.descEditar") : t("perfil.servicios.descNuevo")}
                  </p>
                </div>
              </div>
              <button onClick={() => setMostrarFormServicio(false)}
                className="text-muted hover:text-primary text-lg leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-canvas transition-colors">
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4">
                <label className="text-muted text-xs mb-1.5 block">{t("perfil.servicios.modoCobro")}</label>
                <div className="grid grid-cols-2 bg-canvas border border-edge rounded-lg p-1 gap-1">
                  <button type="button" onClick={() => setNuevoModo("fijo")}
                    className={"px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                      (nuevoModo === "fijo" ? "bg-accent text-onaccent" : "text-muted hover:text-primary")}>
                    {t("perfil.servicios.precioFijo")}
                  </button>
                  <button type="button" onClick={() => setNuevoModo("horas")}
                    className={"px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                      (nuevoModo === "horas" ? "bg-accent text-onaccent" : "text-muted hover:text-primary")}>
                    {t("perfil.servicios.porHoras")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-muted text-xs mb-1 block">{t("perfil.servicios.nombre")} *</label>
                  <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder={t("perfil.servicios.placeholderNombre")}
                    className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                  <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.servicios.descNombre")}</p>
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">{t("perfil.servicios.descripcion")}</label>
                  <input value={nuevoDesc} onChange={(e) => setNuevoDesc(e.target.value)}
                    placeholder={t("perfil.servicios.placeholderDescripcion")}
                    className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                  <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.servicios.descDescripcion")}</p>
                </div>
              </div>

              <div className="max-w-xs">
                <label className="text-muted text-xs mb-1 block">
                  {nuevoModo === "fijo" ? t("perfil.servicios.precio") : t("perfil.servicios.tarifaHora")} *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-medium">
                    {moneda === "EUR" ? "€" : "$"}
                  </span>
                  <input value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)}
                    placeholder={nuevoModo === "fijo" ? "1400" : "75"} type="number"
                    className="w-full bg-canvas border border-edge rounded-lg pl-7 pr-3 py-2.5 text-primary text-base font-medium focus:outline-none focus:border-accent" />
                </div>
                <p className="text-muted text-xs opacity-70 mt-1">
                  {nuevoModo === "fijo" ? t("perfil.servicios.descPrecio") : t("perfil.servicios.descTarifa")}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 bg-canvas/50 border-t border-edge flex justify-end gap-2">
              <button onClick={() => setMostrarFormServicio(false)}
                className="px-4 py-2 rounded-lg text-sm text-muted hover:text-primary hover:bg-surface transition-colors">
                {t("perfil.servicios.cancelar")}
              </button>
              <button onClick={guardarServicio}
                className="bg-accent text-onaccent font-medium px-5 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
                {editandoId !== null ? t("perfil.servicios.guardarCambios") : t("perfil.servicios.agregar")}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {servicios.map((servicio) => (
            <div key={servicio.id} className="flex items-center justify-between bg-surface border border-edge rounded-lg px-4 py-3">
              <div className="min-w-0">
                <p className="text-primary text-sm">{servicio.nombre}</p>
                <p className="text-muted text-xs mt-0.5 truncate">{servicio.descripcion || t("perfil.servicios.sinDescripcion")}</p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-accent text-sm font-medium">
                    {formatearMoneda(servicio.precio, moneda)}{servicio.modo === "horas" ? "/hr" : ""}
                  </p>
                  <p className="text-muted text-xs">{servicio.modo === "fijo" ? t("perfil.servicios.precioFijo") : t("perfil.servicios.porHoras")}</p>
                </div>
                <button onClick={() => abrirFormEditar(servicio)} className="text-muted text-xs hover:text-accent">{t("perfil.servicios.editar")}</button>
                <button onClick={() => eliminarServicio(servicio.id)} className="text-muted text-xs hover:text-coral">{t("perfil.servicios.eliminar")}</button>
              </div>
            </div>
          ))}
          {servicios.length === 0 && (
            <div className="sm:col-span-2 bg-surface border border-dashed border-edge rounded-lg p-6 text-center">
              <p className="text-primary text-sm">{t("perfil.servicios.vacio")}</p>
              <p className="text-muted text-xs mt-1">{t("perfil.servicios.descVacio")}</p>
            </div>
          )}
        </div>
      </Seccion>

      <Seccion id="preferencias" titulo={t("perfil.seccion.preferencias.titulo")} descripcion={t("perfil.seccion.preferencias.desc")}
        icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Apariencia */}
          <div className="bg-surface border border-edge rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-canvas border border-edge flex items-center justify-center text-accent">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                </svg>
              </div>
              <h4 className="text-primary text-sm font-medium">{t("perfil.apariencia")}</h4>
            </div>

            <label className="text-muted text-xs mb-1.5 block">{t("perfil.tema")}</label>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button onClick={() => aplicarTema("oscuro")}
                className={"flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors " + (tema === "oscuro" ? "bg-accent/5 border-accent text-primary" : "bg-canvas border-edge text-muted hover:text-primary")}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
                <span className="text-xs font-medium">{t("perfil.oscuro")}</span>
              </button>
              <button onClick={() => aplicarTema("claro")}
                className={"flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors " + (tema === "claro" ? "bg-accent/5 border-accent text-primary" : "bg-canvas border-edge text-muted hover:text-primary")}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
                <span className="text-xs font-medium">{t("perfil.claro")}</span>
              </button>
            </div>

            <label className="text-muted text-xs mb-1.5 block">{t("perfil.colorAcento")}</label>
            <div className="flex items-center gap-2">
              {ACENTOS.map((a) => (
                <button key={a.id} title={a.nombre} onClick={() => aplicarAcento(a.id)}
                  className={"w-8 h-8 rounded-full flex items-center justify-center transition-transform " + (acento === a.id ? "ring-2 ring-primary ring-offset-2 ring-offset-surface scale-110" : "hover:scale-110")}
                  style={{ backgroundColor: a.muestra }}>
                  {acento === a.id && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: a.check }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
              <span className="text-xs text-muted ml-1">{ACENTOS.find((a) => a.id === acento)?.nombre}</span>
            </div>
            <p className="text-muted text-xs opacity-70 mt-2">{t("perfil.descColorAcento")}</p>
          </div>

          {/* Tipografía */}
          <div className="bg-surface border border-edge rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-canvas border border-edge flex items-center justify-center text-accent">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H3v2h6V5zm10 0H12v2h7V5zM9 11H3v2h6v-2zm10 0H12v2h7v-2zM9 17H3v2h6v-2zm10 0H12v2h7v-2z" />
                </svg>
              </div>
              <h4 className="text-primary text-sm font-medium">{t("perfil.tipografia")}</h4>
            </div>

            <label className="text-muted text-xs mb-1.5 block">{t("perfil.fuente")}</label>
            <div className="flex flex-wrap gap-2 mb-5">
              {FUENTES.map((f) => (
                <button key={f.id} onClick={() => aplicarFuente(f.id)}
                  className={"px-3 py-2 rounded-lg border transition-colors text-sm " + (fuente === f.id ? "bg-accent/5 border-accent text-primary" : "bg-canvas border-edge text-muted hover:text-primary")}
                  style={{ fontFamily: f.css }}>
                  {f.nombre}
                </button>
              ))}
            </div>

            <label className="text-muted text-xs mb-1.5 block">{t("perfil.tamanoTexto")}</label>
            <div className="grid grid-cols-4 gap-2">
              {TAMANOS.map((tam) => (
                <button key={tam.id} onClick={() => aplicarTamFuente(tam.id)}
                  className={"flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors " + (tamFuente === tam.id ? "bg-accent/5 border-accent text-primary" : "bg-canvas border-edge text-muted hover:text-primary")}>
                  <span className="font-medium leading-none" style={{ fontSize: tam.px }}>Aa</span>
                  <span className="text-xs">{tam.nombre}</span>
                </button>
              ))}
            </div>
            <p className="text-muted text-xs opacity-70 mt-2">{t("perfil.descTipografia")}</p>
          </div>

          {/* General */}
          <div className="bg-surface border border-edge rounded-xl p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded-md bg-canvas border border-edge flex items-center justify-center text-accent">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a9 9 0 003.5-7V5.5M12 21a9 9 0 01-3.5-7V5.5M12 3a9 9 0 019 9h-18a9 9 0 019-9z" />
                </svg>
              </div>
              <h4 className="text-primary text-sm font-medium">{t("perfil.general")}</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.moneda")}</label>
                <Select value={moneda} onChange={(v) => { setMoneda(v); localStorage.setItem("flowo_moneda", v); }}
                  options={[
                    { value: "USD", label: t("perfil.monedas.USD") },
                    { value: "COP", label: t("perfil.monedas.COP") },
                    { value: "EUR", label: t("perfil.monedas.EUR") },
                    { value: "MXN", label: t("perfil.monedas.MXN") },
                  ]} />
                <p className="text-muted text-xs opacity-70 mt-1">{t("perfil.descMoneda")}</p>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.idioma")}</label>
                <Select
                  value={idioma}
                  onChange={(v) => { cambiarIdioma(v); setIdioma(v); }}
                  options={IDIOMAS}
                />
              </div>
            </div>
          </div>

        </div>
      </Seccion>

      <Seccion id="nube" titulo={t("perfil.seccion.nube.titulo")} descripcion={t("perfil.seccion.nube.desc")}
        icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>}>
        <p className="text-muted text-xs opacity-70 mb-4">{t("perfil.nube.desc")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={"rounded-xl border p-4 flex flex-col gap-3 " + (tieneIntegracion("google_drive") ? "border-accent/40 bg-accent/5" : "border-edge bg-surface")}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-edge flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4">
                  <path d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z" fill="currentColor"/>
                </svg>
              </div>
              <div>
                <p className="text-primary text-sm font-medium">Google Drive</p>
                {tieneIntegracion("google_drive") ? (
                  <p className="text-accent text-xs mt-0.5">{emailIntegracion("google_drive")}</p>
                ) : (
                  <p className="text-muted text-xs mt-0.5">{t("perfil.nube.noConectado")}</p>
                )}
              </div>
            </div>
            {tieneIntegracion("google_drive") ? (
              <button onClick={desconectarGoogleDrive}
                className="w-full text-xs py-2 rounded-lg border border-coral/30 text-coral hover:bg-coral/10 transition-colors">
                {t("perfil.nube.desconectar")}
              </button>
            ) : (
              <button onClick={conectarGoogleDrive} disabled={conectandoDrive}
                className="w-full text-xs py-2 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {conectandoDrive ? t("perfil.nube.conectando") : t("perfil.nube.conectar")}
              </button>
            )}
          </div>

          <div className={"rounded-xl border p-4 flex flex-col gap-3 " + (tieneIntegracion("dropbox") ? "border-accent/40 bg-accent/5" : "border-edge bg-surface")}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-edge flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#0061FF">
                  <path d="M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"/>
                </svg>
              </div>
              <div>
                <p className="text-primary text-sm font-medium">Dropbox</p>
                {tieneIntegracion("dropbox") ? (
                  <p className="text-accent text-xs mt-0.5">{emailIntegracion("dropbox")}</p>
                ) : (
                  <p className="text-muted text-xs mt-0.5">{t("perfil.nube.noConectado")}</p>
                )}
              </div>
            </div>
            {tieneIntegracion("dropbox") ? (
              <button onClick={desconectarDropbox}
                className="w-full text-xs py-2 rounded-lg border border-coral/30 text-coral hover:bg-coral/10 transition-colors">
                {t("perfil.nube.desconectar")}
              </button>
            ) : (
              <button onClick={conectarDropbox} disabled={conectandoDropbox}
                className="w-full text-xs py-2 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {conectandoDropbox ? t("perfil.nube.conectando") : t("perfil.nube.conectar")}
              </button>
            )}
          </div>

          <div className={"rounded-xl border bg-surface p-4 flex flex-col gap-3" + (tieneIntegracion("onedrive") ? " border-edge" : " border-edge")}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-edge flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#0078D4">
                  <path d="M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28zm-7.265-4.137q-1.325 0-2.52.544-1.195.545-2.04 1.565.446.117.85.299.405.181.792.416l4.78 2.86 2.731-1.15q.27-.117.545-.204.276-.088.58-.147-.293-.937-.855-1.705-.563-.768-1.319-1.318-.755-.551-1.658-.856-.902-.304-1.886-.304zM2.414 16.395l9.914-4.184-3.832-2.297q-.586-.351-1.23-.539-.645-.188-1.325-.188-.914 0-1.722.364-.809.363-1.412.978-.604.616-.955 1.436-.352.82-.352 1.723 0 .703.234 1.423.235.721.68 1.284zm16.711 1.793q.563 0 1.078-.176.516-.176.961-.516l-7.23-4.324-10.301 4.336q.527.328 1.13.504.604.175 1.237.175zm3.012-1.852q.363-.727.363-1.523 0-.774-.293-1.407t-.791-1.072q-.498-.44-1.166-.68-.668-.24-1.406-.24-.422 0-.838.1t-.815.252q-.398.152-.785.334-.386.181-.761.345Z"/>
                </svg>
              </div>
              <div>
                <p className="text-primary text-sm font-medium">OneDrive</p>
                {tieneIntegracion("onedrive") ? (
                  <p className="text-accent text-xs mt-0.5">{emailIntegracion("onedrive")}</p>
                ) : (
                  <p className="text-muted text-xs mt-0.5">{t("perfil.nube.noConectado")}</p>
                )}
              </div>
            </div>
            {tieneIntegracion("onedrive") ? (
              <button onClick={desconectarOneDrive}
                className="w-full text-xs py-2 rounded-lg border border-coral/30 text-coral hover:bg-coral/10 transition-colors">
                {t("perfil.nube.desconectar")}
              </button>
            ) : (
              <button onClick={conectarOneDrive} disabled={conectandoOneDrive}
                className="w-full text-xs py-2 rounded-lg border border-[#0078D4]/30 text-[#0078D4] hover:bg-[#0078D4]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {conectandoOneDrive ? t("perfil.nube.conectando") : t("perfil.nube.conectar")}
              </button>
            )}
          </div>
        </div>
        {errorDrive && <p className="text-coral text-xs mt-3">{errorDrive}</p>}
      </Seccion>

      <Seccion id="cuenta" titulo={t("perfil.seccion.cuenta.titulo")} descripcion={t("perfil.seccion.cuenta.desc")}
        icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>}>
        {/* Actualizaciones: solo aparece si hay algo que hacer */}
        {(estadoUpdate.listo || estadoUpdate.descargando || estadoUpdate.disponible) && (
          <div className="bg-surface border border-edge rounded-xl p-4 flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-canvas border border-edge flex items-center justify-center text-accent flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div className="min-w-0">
                {estadoUpdate.listo ? (
                  <p className="text-primary text-sm font-medium">{t("perfil.cuenta.update.listo", { version: estadoUpdate.version })}</p>
                ) : estadoUpdate.descargando ? (
                  <p className="text-primary text-sm font-medium">{t("perfil.cuenta.update.descargando", { version: estadoUpdate.version })}</p>
                ) : (
                  <p className="text-primary text-sm font-medium">{t("perfil.cuenta.update.disponible", { version: estadoUpdate.version })}</p>
                )}
                {estadoUpdate.descargando && (
                  <div className="mt-2 w-40 h-1.5 bg-edge rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${estadoUpdate.progreso}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            {estadoUpdate.listo && (
              <button onClick={onReiniciar}
                className="bg-accent text-onaccent text-xs font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                {t("perfil.cuenta.update.instalar")}
              </button>
            )}
            {estadoUpdate.disponible && !estadoUpdate.descargando && !estadoUpdate.listo && (
              <button onClick={onDescargar}
                className="bg-accent text-onaccent text-xs font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                {t("perfil.cuenta.update.descargar", { version: estadoUpdate.version })}
              </button>
            )}
          </div>
        )}

        {/* Seguridad */}
        <div className="bg-surface border border-edge rounded-xl overflow-hidden mb-4">
          <div className="px-4 pt-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-canvas border border-edge flex items-center justify-center text-accent">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h4 className="text-primary text-sm font-medium">{t("perfil.cuenta.seguridad")}</h4>
          </div>
          <div className="p-4 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-canvas border border-edge flex items-center justify-center text-accent flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3.75 3.75 0 013.75 3.75m-7.5 0a3.75 3.75 0 113.75-3.75m-7.5 7.5h9a2.25 2.25 0 012.25 2.25v.75a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-.75a2.25 2.25 0 012.25-2.25z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-primary text-sm font-medium">{t("perfil.cuenta.cambiarContrasena")}</p>
                  <p className="text-muted text-xs mt-0.5">{t("perfil.cuenta.descCambiarContrasena")}</p>
                </div>
              </div>
              <button onClick={abrirModalContrasena}
                className="text-sm text-primary border border-edge px-4 py-2 rounded-lg hover:bg-surface2 transition-colors flex-shrink-0">
                {t("perfil.cuenta.cambiar")}
              </button>
            </div>
            <div className="border-t border-edge my-3" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-coral/10 border border-coral/30 flex items-center justify-center text-coral flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-primary text-sm font-medium">{t("perfil.cuenta.eliminarCuenta")}</p>
                  <p className="text-muted text-xs mt-0.5">{t("perfil.cuenta.descEliminarCuenta")}</p>
                </div>
              </div>
              <button onClick={abrirModalEliminar}
                className="text-sm text-coral border border-coral/30 px-4 py-2 rounded-lg hover:bg-coral/10 transition-colors flex-shrink-0">
                {t("perfil.cuenta.eliminar")}
              </button>
            </div>
            <div className="border-t border-edge my-3" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-canvas border border-edge flex items-center justify-center text-coral flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-primary text-sm font-medium">{t("perfil.cuenta.cerrarSesion")}</p>
                  <p className="text-muted text-xs mt-0.5">{t("perfil.cuenta.descCerrarSesion")}</p>
                </div>
              </div>
              <button onClick={() => setModalCerrarSesion(true)}
                className="text-sm text-coral border border-coral/30 px-4 py-2 rounded-lg hover:bg-coral/10 transition-colors flex-shrink-0">
                {t("perfil.cuenta.cerrarSesion")}
              </button>
            </div>
          </div>
        </div>

        {/* Soporte */}
        <div className="bg-surface border border-edge rounded-xl p-4 flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-canvas border border-edge flex items-center justify-center text-accent flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-primary text-sm font-medium">{t("perfil.cuenta.soporte.titulo")}</p>
              <p className="text-muted text-xs mt-0.5">{t("perfil.cuenta.soporte.desc")}</p>
            </div>
          </div>
          <button
            onClick={() => openUrl("https://www.paypal.com/ncp/payment/CAYESPSBEHB42")}
            className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity flex-shrink-0">
            {t("perfil.cuenta.soporte.invitar")}
          </button>
        </div>
      </Seccion>

      {/* Versión y desarrollador, fuera de los ajustes */}
      <div className="text-center mt-6">
        <p className="text-muted text-xs opacity-70">{t("perfil.footer", { version })}</p>
      </div>

      {/* Modal cambiar contraseña */}
      {modalContrasena && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
            <h3 className="text-primary font-medium mb-1">{t("perfil.contrasena.titulo")}</h3>
            <p className="text-muted text-sm mb-5">{t("perfil.contrasena.cuenta", { email })}</p>
            {exitoContrasena ? (
              <>
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 text-sm text-primary">
                  {t("perfil.contrasena.exito")}
                </div>
                <button onClick={() => setModalContrasena(false)}
                  className="w-full bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity mt-5">
                  {t("perfil.contrasena.listo")}
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-muted text-xs mb-1 block">{t("perfil.contrasena.actual")}</label>
                    <input type="password" value={contrasenaActual} onChange={(e) => setContrasenaActual(e.target.value)}
                      placeholder={t("perfil.contrasena.placeholderActual")}
                      className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">{t("perfil.contrasena.nueva")}</label>
                    <input type="password" value={nuevaContrasena} onChange={(e) => setNuevaContrasena(e.target.value)}
                      placeholder={t("perfil.contrasena.placeholderNueva")}
                      className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                    <ChecklistContrasena password={nuevaContrasena} />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">{t("perfil.contrasena.confirmar")}</label>
                    <input type="password" value={confirmarContrasena} onChange={(e) => setConfirmarContrasena(e.target.value)}
                      placeholder={t("perfil.contrasena.placeholderConfirmar")}
                      className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                {errorContrasena && <p className="text-coral text-xs mt-3">{errorContrasena}</p>}
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setModalContrasena(false)}
                    className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                    {t("perfil.contrasena.cancelar")}
                  </button>
                  <button onClick={cambiarContrasena} disabled={cargandoContrasena}
                    className="flex-1 bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                    {cargandoContrasena ? t("perfil.contrasena.guardando") : t("perfil.contrasena.titulo")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal eliminar cuenta */}
      {modalEliminar && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
            <h3 className="text-primary font-medium mb-1">{t("perfil.eliminar.titulo")}</h3>
            <p className="text-muted text-sm mb-5">{t("perfil.eliminar.desc")}</p>
            <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-primary mb-5">
              {t("perfil.eliminar.aviso1")}<span className="font-medium">{t("perfil.eliminar.aviso2")}</span>{t("perfil.eliminar.aviso3")}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.eliminar.escribe")}</label>
                <input value={confirmacionEliminar} onChange={(e) => setConfirmacionEliminar(e.target.value)}
                  placeholder="ELIMINAR"
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-coral" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("perfil.eliminar.contrasena")}</label>
                <input type="password" value={contrasenaEliminar} onChange={(e) => setContrasenaEliminar(e.target.value)}
                  placeholder={t("perfil.eliminar.placeholderContrasena")}
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2.5 text-primary text-sm focus:outline-none focus:border-coral" />
              </div>
            </div>
            {errorEliminar && <p className="text-coral text-xs mt-3">{errorEliminar}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalEliminar(false)}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                {t("perfil.eliminar.cancelar")}
              </button>
              <button onClick={eliminarCuenta} disabled={cargandoEliminar}
                className="flex-1 bg-coral text-white font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                {cargandoEliminar ? t("perfil.eliminar.eliminando") : t("perfil.eliminar.titulo")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cerrar sesión */}
      {modalCerrarSesion && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-primary font-medium mb-1">{t("perfil.cerrarSesion.titulo")}</h3>
            <p className="text-muted text-sm mb-6">{t("perfil.cerrarSesion.desc")}</p>
            <div className="flex gap-3">
              <button onClick={() => setModalCerrarSesion(false)}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                {t("perfil.cerrarSesion.cancelar")}
              </button>
              <button onClick={cerrarSesion}
                className="flex-1 bg-coral text-white font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
                {t("perfil.cerrarSesion.confirmar")}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

    </div>
  );
}

export default Perfil;