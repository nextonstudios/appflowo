import { useState, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import jsPDF from "jspdf";
import logoFlowo from "../assets/logoFlowo.png?inline";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { formatearMoneda } from "../lib/moneda";
import { useMoneda } from "../hooks/useMoneda";
import { marcarFirmaReciente } from "../lib/firmaReciente";
import ModalCrearCliente from "./ModalCrearCliente";
import type { ContratoClienteInfo } from "../lib/clientesContrato";
import { contratoRequiereCrearCliente } from "../lib/clientesContrato";

interface Clausulas {
  formaPago: string;
  entrega: string;
  confidencialidad: string;
  cancelacion: string;
  otras: string;
}

interface Contrato {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_correo: string;
  descripcion: string;
  monto: number | null;
  moneda: string;
  fecha_inicio: string;
  fecha_fin: string;
  clausulas: Clausulas;
  firma_usuario: string | null;
  firma_cliente: string | null;
  nombre_firmante_cliente: string;
  fecha_firma_usuario: string | null;
  fecha_firma_cliente: string | null;
  estado: "borrador" | "firmado";
  fecha_emision: string;
  firma_token: string | null;
  cliente_id: string | null;
  abierta: boolean;
}

function getClausulasDefecto(t: TFunction): Clausulas {
  return {
    formaPago: t("contratos.clausulasDefecto.formaPago"),
    entrega: t("contratos.clausulasDefecto.entrega"),
    confidencialidad: t("contratos.clausulasDefecto.confidencialidad"),
    cancelacion: t("contratos.clausulasDefecto.cancelacion"),
    otras: "",
  };
}

function getEstadoConfig(t: TFunction) {
  return {
    "borrador": { label: t("contratos.estados.borrador"), color: "text-muted bg-gray/10" },
    "firmado": { label: t("contratos.estados.firmado"), color: "text-accent bg-accent/10" },
  };
}

const bordeEstado = {
  "borrador": "border-l-gray",
  "firmado": "border-l-accent",
};

function hoyISO() {  return new Date().toISOString().split("T")[0];
}

function sumarDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split("T")[0];
}

function Firma({ label, value, onChange }: { label: string; value: string | null; onChange: (d: string | null) => void }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dibujandoRef = useRef(false);
  const [modoDibujo, setModoDibujo] = useState(false);

  useEffect(() => {
    if (modoDibujo) preparar();
  }, [modoDibujo]);

  function preparar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300;
    const cssH = cssW * (130 / 300);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "#1a1f2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#c0c4cc";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("contratos.firma.aqui"), cssW / 2, cssH / 2);
  }

  function posicion(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function iniciar(e: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = posicion(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    dibujandoRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function mover(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dibujandoRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = posicion(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function soltar() {
    dibujandoRef.current = false;
  }

  function usarFirma() {
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
    setModoDibujo(false);
  }

  function subirArchivo(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/png") {
      alert(t("contratos.firma.soloPng"));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <p className="text-muted text-xs mb-2">{label}</p>

      {modoDibujo ? (
        <div>
          <canvas ref={canvasRef}
            onPointerDown={iniciar}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerLeave={soltar}
            className="w-full max-w-[300px] border border-edge rounded-lg cursor-crosshair"
            style={{ touchAction: "none", aspectRatio: "300/130" }}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={usarFirma}
              className="bg-accent text-onaccent font-medium text-xs px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
              {t("contratos.firma.usarFirma")}
            </button>
            <button onClick={preparar}
              className="text-muted text-xs border border-edge px-3 py-1.5 rounded-lg hover:text-primary hover:bg-surface transition-colors">
              {t("contratos.firma.borrar")}
            </button>
            <button onClick={() => setModoDibujo(false)}
              className="text-muted text-xs px-3 py-1.5 rounded-lg hover:text-primary transition-colors">
              {t("contratos.firma.cancelar")}
            </button>
          </div>
        </div>
      ) : value ? (
        <div>
          <img src={value} alt={label} className="max-w-[300px] max-h-20 border border-edge rounded-lg bg-white p-1" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setModoDibujo(true)}
              className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
              {t("contratos.firma.cambiar")}
            </button>
            <button onClick={() => onChange(null)}
              className="text-coral text-xs px-3 py-1.5 rounded-lg hover:bg-coral/10 transition-colors">
              {t("contratos.firma.quitar")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setModoDibujo(true)}
            className="text-sm text-primary border border-edge px-3 py-2 rounded-lg hover:bg-surface transition-colors flex-1">
            {t("contratos.firma.dibujarFirma")}
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="text-sm text-primary border border-edge px-3 py-2 rounded-lg hover:bg-surface transition-colors flex-1">
            {t("contratos.firma.cargarPng")}
          </button>
          <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={(e) => subirArchivo(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}

function Contratos() {
  const monedaUi = useMoneda();
  const { t } = useTranslation();
  const clausulasDefecto = getClausulasDefecto(t);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [modalEliminarId, setModalEliminarId] = useState<string | null>(null);
  const [modalWhatsAppId, setModalWhatsAppId] = useState<string | null>(null);
  const [modalCrearClienteContrato, setModalCrearClienteContrato] = useState<ContratoClienteInfo | null>(null);
  const [modalFirmaId, setModalFirmaId] = useState<string | null>(null);
  const [enlaceFirma, setEnlaceFirma] = useState("");
  const [linkCopiado, setLinkCopiado] = useState(false);

  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteCorreo, setClienteCorreo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [clausulas, setClausulas] = useState<Clausulas>({ ...clausulasDefecto });
  const [firmaUsuario, setFirmaUsuario] = useState<string | null>(null);
  const [firmaCliente, setFirmaCliente] = useState<string | null>(null);
  const [nombreFirmanteCliente, setNombreFirmanteCliente] = useState("");
  const [fechaFirmaUsuario, setFechaFirmaUsuario] = useState<string | null>(null);
  const [fechaFirmaCliente, setFechaFirmaCliente] = useState<string | null>(null);
  const [nombreFreelancer, setNombreFreelancer] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: contratosData } = await supabase
      .from("contratos")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });

    const mapeados = (contratosData || []).map((c: any) => ({
      ...c,
      clausulas: { ...clausulasDefecto, ...(c.clausulas || {}) },
      abierta: false,
    }));
    setContratos(mapeados);
    setNombreFreelancer(user?.user_metadata?.nombre || "");
    setCargando(false);
  }

  function proximoNumero() {
    let max = 0;
    contratos.forEach((c) => {
      const m = c.numero.match(/CNT-(\d+)/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return "CNT-" + String(max + 1).padStart(3, "0");
  }

  function abrirForm() {
    setEditandoId(null);
    setClienteNombre("");
    setClienteTelefono("");
    setClienteCorreo("");
    setDescripcion("");
    setMonto("");
    setFechaInicio(hoyISO());
    setFechaFin(sumarDias(30));
    setClausulas({ ...clausulasDefecto });
    setFirmaUsuario(null);
    setFirmaCliente(null);
    setNombreFirmanteCliente("");
    setFechaFirmaUsuario(null);
    setFechaFirmaCliente(null);
    setErrorForm(null);
    setMostrarForm(true);
  }

  function abrirEdicion(c: Contrato) {
    setEditandoId(c.id);
    setClienteNombre(c.cliente_nombre);
    setClienteTelefono(c.cliente_telefono || "");
    setClienteCorreo(c.cliente_correo || "");
    setDescripcion(c.descripcion || "");
    setMonto(c.monto != null ? String(c.monto) : "");
    setFechaInicio(c.fecha_inicio || hoyISO());
    setFechaFin(c.fecha_fin || "");
    setClausulas({ ...clausulasDefecto, ...(c.clausulas || {}) });
    setFirmaUsuario(c.firma_usuario || null);
    setFirmaCliente(c.firma_cliente || null);
    setNombreFirmanteCliente(c.nombre_firmante_cliente || "");
    setFechaFirmaUsuario(c.fecha_firma_usuario || null);
    setFechaFirmaCliente(c.fecha_firma_cliente || null);
    setErrorForm(null);
    setMostrarForm(true);
  }

  function toggleAbierta(id: string) {
    setContratos(contratos.map((c) => c.id === id ? { ...c, abierta: !c.abierta } : c));
  }

  async function guardarContrato() {
    if (!clienteNombre.trim()) {
      setErrorForm(t("contratos.errores.nombreCliente"));
      return;
    }
    if (!descripcion.trim()) {
      setErrorForm(t("contratos.errores.descripcion"));
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    const { data: { user } } = await supabase.auth.getUser();

    const existente = editandoId ? contratos.find((c) => c.id === editandoId) : null;
    const numero = existente?.numero || proximoNumero();
    const montoNum = monto.trim() === "" ? null : Number(monto);
    const firmado = Boolean(firmaUsuario && firmaCliente);
    const estadoNuevo = firmado ? "firmado" : (existente?.estado === "firmado" ? "firmado" : "borrador");

    const payload = {
      user_id: user?.id,
      numero,
      cliente_nombre: clienteNombre.trim(),
      cliente_telefono: clienteTelefono.trim(),
      cliente_correo: clienteCorreo.trim(),
      descripcion: descripcion.trim(),
      monto: montoNum,
      moneda: monedaUi,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      clausulas,
      firma_usuario: firmaUsuario,
      firma_cliente: firmaCliente,
      nombre_firmante_cliente: nombreFirmanteCliente.trim(),
      fecha_firma_usuario: firmaUsuario ? (fechaFirmaUsuario || hoyISO()) : null,
      fecha_firma_cliente: firmaCliente ? (fechaFirmaCliente || hoyISO()) : null,
      estado: estadoNuevo,
      fecha_emision: existente?.fecha_emision || hoyISO(),
    };

    if (editandoId) {
      const { error } = await supabase.from("contratos").update(payload).eq("id", editandoId);
      if (error) {
        setErrorForm(t("contratos.errores.guardar", { mensaje: error.message }));
      } else {
        setContratos(contratos.map((c) => c.id === editandoId ? ({ ...c, ...payload, abierta: c.abierta } as Contrato) : c));
        setMostrarForm(false);
        setEditandoId(null);
        if (estadoNuevo === "firmado") {
          if (firmaCliente) marcarFirmaReciente(editandoId);
          verificarYOfrecerCrearCliente({
            id: editandoId,
            numero,
            cliente_nombre: payload.cliente_nombre,
            cliente_telefono: payload.cliente_telefono || null,
            cliente_correo: payload.cliente_correo || null,
          });
        }
      }
    } else {
      const { data, error } = await supabase.from("contratos").insert(payload).select().single();
      if (error) {
        setErrorForm(t("contratos.errores.guardar", { mensaje: error.message }));
      } else if (data) {
        const nuevo = data as any;
        setContratos([{ ...nuevo, clausulas: { ...clausulasDefecto, ...(nuevo.clausulas || {}) }, abierta: false }, ...contratos]);
        setMostrarForm(false);
        if (estadoNuevo === "firmado") {
          if (firmaCliente) marcarFirmaReciente(nuevo.id);
          verificarYOfrecerCrearCliente({
            id: nuevo.id,
            numero: nuevo.numero,
            cliente_nombre: nuevo.cliente_nombre,
            cliente_telefono: nuevo.cliente_telefono || null,
            cliente_correo: nuevo.cliente_correo || null,
          });
        }
      }
    }
    setGuardando(false);
  }

  async function verificarYOfrecerCrearCliente(info: ContratoClienteInfo) {
    const requiere = await contratoRequiereCrearCliente(info);
    if (requiere) setModalCrearClienteContrato(info);
  }

  async function eliminarContrato(id: string) {
    await supabase.from("contratos").delete().eq("id", id);
    setContratos(contratos.filter((c) => c.id !== id));
    setModalEliminarId(null);
  }

  async function cambiarEstado(id: string, nuevo: "borrador" | "firmado") {
    await supabase.from("contratos").update({ estado: nuevo }).eq("id", id);
    const actualizados = contratos.map((c) => c.id === id ? { ...c, estado: nuevo } : c);
    setContratos(actualizados);
    if (nuevo === "firmado") {
      const contrato = actualizados.find((c) => c.id === id);
      if (contrato) verificarYOfrecerCrearCliente(contrato);
    }
  }

  function generarSlug(texto: string): string {
    const normalizado = (texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    return normalizado || "firma";
  }

  function generarSufijo(longitud = 6): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const arr = new Uint8Array(longitud);
    crypto.getRandomValues(arr);
    let s = "";
    for (let i = 0; i < longitud; i++) s += chars[arr[i] % chars.length];
    return s;
  }

  function generarTokenFirma(nombre: string) {
    return generarSlug(nombre) + "-" + generarSufijo(6);
  }

  async function crearTokenFirmaUnico(nombre: string): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const token = generarTokenFirma(nombre);
      const { data } = await supabase.from("contratos").select("id").eq("firma_token", token).limit(1);
      if (!data || data.length === 0) return token;
    }
    return generarSlug(nombre) + "-" + Date.now().toString(36) + generarSufijo(4);
  }

  async function abrirFirmaEnLinea(c: Contrato) {
    let token = c.firma_token;
    if (!token) {
      token = await crearTokenFirmaUnico(c.cliente_nombre);
      const { error } = await supabase.from("contratos").update({ firma_token: token }).eq("id", c.id);
      if (!error) {
        setContratos(contratos.map((x) => x.id === c.id ? { ...x, firma_token: token } : x));
      }
    }
    setEnlaceFirma("https://portal.appflowo.com/f/" + token);
    setLinkCopiado(false);
    setModalFirmaId(c.id);
  }

  function copiarEnlaceFirma() {
    navigator.clipboard.writeText(enlaceFirma);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2500);
  }

  function compartirFirmaWhatsApp(c: Contrato) {
    const mensaje = encodeURIComponent(
      t("contratos.firmaEnLinea.whatsappMensaje", { nombre: c.cliente_nombre, numero: c.numero, enlace: enlaceFirma })
    );
    openUrl("https://wa.me/" + (c.cliente_telefono || "") + "?text=" + mensaje);
    setModalFirmaId(null);
  }

  async function duplicarContrato(c: Contrato) {
    const { data: { user } } = await supabase.auth.getUser();
    const nuevo = {
      user_id: user?.id,
      numero: proximoNumero(),
      cliente_nombre: c.cliente_nombre,
      cliente_telefono: c.cliente_telefono || "",
      cliente_correo: c.cliente_correo || "",
      descripcion: c.descripcion || "",
      monto: c.monto,
      moneda: c.moneda || monedaUi,
      fecha_inicio: c.fecha_inicio || hoyISO(),
      fecha_fin: c.fecha_fin || "",
      clausulas: { ...clausulasDefecto, ...(c.clausulas || {}) },
      firma_usuario: null,
      firma_cliente: null,
      nombre_firmante_cliente: c.nombre_firmante_cliente || "",
      fecha_firma_usuario: null,
      fecha_firma_cliente: null,
      estado: "borrador",
      fecha_emision: hoyISO(),
    };
    const { data } = await supabase.from("contratos").insert(nuevo).select().single();
    if (data) {
      const duplicado = data as any;
      setContratos([{ ...duplicado, clausulas: { ...clausulasDefecto, ...(duplicado.clausulas || {}) }, abierta: false }, ...contratos]);
    }
  }

  function compartirWhatsApp(c: Contrato) {
    const mensaje = encodeURIComponent(
      t("contratos.whatsapp.compartirSaludo", { nombre: c.cliente_nombre }) +
      "📄 " + c.numero + "\n" +
      (c.descripcion ? t("contratos.whatsapp.compartirServicio", { servicio: c.descripcion }) + "\n" : "") +
      (c.monto != null ? t("contratos.whatsapp.compartirMonto", { monto: formatearMoneda(c.monto, monedaUi) }) + "\n" : "") +
      "\n" + t("contratos.whatsapp.compartirCierre")
    );
    openUrl("https://wa.me/" + (c.cliente_telefono || "") + "?text=" + mensaje);
  }

  async function generarPDF(c: Contrato) {
    const doc = new jsPDF();
    const teal = [29, 184, 160] as [number, number, number];
    const ink = [26, 31, 46] as [number, number, number];
    const gris = [107, 114, 128] as [number, number, number];

    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("marca_nombre, marca_desc, marca_web, telefono, moneda")
      .eq("user_id", user?.id)
      .single();

    const nombreFreelancerPdf = user?.user_metadata?.nombre || "";
    const marcaNombre = perfil?.marca_nombre || "";
    const marcaDesc = perfil?.marca_desc || "";
    const marcaWeb = perfil?.marca_web || "";
    const telefono = perfil?.telefono || "";
    const emailFreelancer = user?.email || "";
    const moneda = c.moneda || "USD";

    const footerHeight = 32;
    const footerY = 297 - footerHeight;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 50, "F");

    try {
      const { data: logoData } = await supabase.storage
        .from("avatars")
        .download(user?.id + "/logo");

      if (logoData) {
        const reader = new FileReader();
        const logoBase64User: string = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoData);
        });

        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = logoBase64User;
        });

        const maxW = 50;
        const maxH = 28;
        const ratio = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = 12;
        const y = 10 + (maxH - h) / 2;

        const formato = logoBase64User.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(logoBase64User, formato, x, y, w, h);
      }
    } catch (_) {
      // Sin logo, espacio vacío
    }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(t("contratos.pdf.contrato"), 155, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(c.numero, 155, 20);
    doc.text(t("contratos.pdf.emision", { fecha: c.fecha_emision }), 155, 26);

    const estadoColor = c.estado === "firmado" ? teal : [160, 160, 160] as [number, number, number];
    doc.setFillColor(...estadoColor);
    doc.roundedRect(155, 30, 35, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(t("contratos.estados." + c.estado).toUpperCase(), 157, 35.5);

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(0, 52, 210, 52);

    let y = 62;
    doc.setTextColor(...gris);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(t("contratos.pdf.prestadorServicios"), 14, y);
    doc.text(t("contratos.pdf.cliente"), 110, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(nombreFreelancerPdf, 14, y);
    doc.text(c.cliente_nombre, 110, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    if (marcaNombre) doc.text(marcaNombre, 14, y);
    if (c.cliente_telefono) doc.text(c.cliente_telefono, 110, y);
    y += 4;
    if (marcaDesc) doc.text(marcaDesc, 14, y);
    if (c.cliente_correo) doc.text(c.cliente_correo, 110, y);
    y += 4;
    if (emailFreelancer) doc.text(emailFreelancer, 14, y);
    y += 4;
    if (telefono) doc.text(telefono, 14, y);
    y += 4;
    if (marcaWeb) doc.text(marcaWeb, 14, y);

    y += 6;
    doc.setDrawColor(...teal);
    doc.setLineWidth(0.8);
    doc.line(14, y, 196, y);
    y += 8;

    if (c.fecha_inicio || c.fecha_fin) {
      doc.setFillColor(245, 245, 247);
      doc.rect(14, y - 4, 89, 12, "F");
      doc.rect(107, y - 4, 89, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...gris);
      doc.text(t("contratos.pdf.inicio"), 19, y);
      doc.text(t("contratos.pdf.fin"), 112, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.text(c.fecha_inicio || "—", 19, y + 5);
      doc.text(c.fecha_fin || "—", 112, y + 5);
      y += 16;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(t("contratos.pdf.montoTotal"), 14, y);
    if (c.monto != null) {
      doc.setTextColor(...teal);
      doc.text(formatearMoneda(c.monto, moneda), 196, y, { align: "right" });
    }
    y += 6;

    if (c.descripcion) {
      if (y > 240) { doc.addPage(); y = 25; }
      y += 2;
      doc.setDrawColor(220, 220, 220);
      doc.line(14, y, 196, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...gris);
      doc.text(t("contratos.pdf.descripcionServicio"), 14, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const lineasDesc = doc.splitTextToSize(c.descripcion, 178);
      doc.text(lineasDesc, 14, y);
      y += lineasDesc.length * 5 + 4;
    }

    const clausulasTitulos: [keyof Clausulas, string][] = [
      ["formaPago", t("contratos.pdf.formaPago")],
      ["entrega", t("contratos.pdf.entrega")],
      ["confidencialidad", t("contratos.pdf.confidencialidad")],
      ["cancelacion", t("contratos.pdf.cancelacion")],
      ["otras", t("contratos.pdf.otrasCondiciones")],
    ];

    const clausulasPresentes = clausulasTitulos.filter(([k]) => c.clausulas?.[k]?.trim());
    if (clausulasPresentes.length > 0) {
      if (y > 240) { doc.addPage(); y = 25; }
      y += 2;
      doc.setDrawColor(220, 220, 220);
      doc.line(14, y, 196, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...gris);
      doc.text(t("contratos.pdf.clausulas"), 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      clausulasPresentes.forEach(([k, titulo]) => {
        if (y > 240) { doc.addPage(); y = 25; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        doc.text(titulo, 14, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        const lineas = doc.splitTextToSize(c.clausulas![k], 178);
        doc.text(lineas, 14, y);
        y += lineas.length * 5 + 5;
      });
    }

    // Nota legal IMPORTANTE (va antes de las firmas)
    if (y + 30 > 262) { doc.addPage(); y = 25; }
    y += 2;
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ink);
    doc.text(t("contratos.pdf.importante"), 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    const lineasNota = doc.splitTextToSize(t("contratos.pdf.notaLegal"), 178);
    for (let i = 0; i < lineasNota.length; i++) {
      if (y > 250) { doc.addPage(); y = 25; }
      doc.text(lineasNota[i], 14, y);
      y += 4.2;
    }

    // Firmas
    const precargar = async (dato: string | null): Promise<HTMLImageElement | null> => {
      if (!dato) return null;
      try {
        const img = new Image();
        img.src = dato;
        await new Promise<void>((resolve) => {
          if (img.complete) { resolve(); return; }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        return img.width > 0 ? img : null;
      } catch {
        return null;
      }
    };
    const imgPrestador = await precargar(c.firma_usuario);
    const imgCliente = await precargar(c.firma_cliente);

    if (y + 75 > 262) { doc.addPage(); y = 25; }
    y += 2;
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...gris);
    doc.text(t("contratos.pdf.firmas"), 14, y);
    y += 8;

    const anchoFirma = 82;
    const altoFirma = 26;
    const xIzq = 14;
    const xDer = 110;

    function dibujarFirma(x: number, img: HTMLImageElement | null, dato: string | null, nombre: string) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...gris);
      doc.text(nombre, x, y);
      y += 4;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.4);
      doc.rect(x, y, anchoFirma, altoFirma);
      if (img) {
        const maxW = anchoFirma - 10;
        const maxH = altoFirma - 8;
        const ratio = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        doc.addImage(img.src, "PNG", x + (anchoFirma - w) / 2, y + (altoFirma - h) / 2, w, h);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(dato ? t("contratos.pdf.firmaNoDisponible") : t("contratos.pdf.pendienteFirma"), x + 5, y + 15);
      }
      y += altoFirma + 3;
    }

    const signerCliente = c.nombre_firmante_cliente || c.cliente_nombre;
    const yFirmas = y;
    dibujarFirma(xIzq, imgPrestador, c.firma_usuario, t("contratos.pdf.firmaPrestador"));
    const yDespuesIzq = y;
    y = yFirmas;
    dibujarFirma(xDer, imgCliente, c.firma_cliente, t("contratos.pdf.firmaCliente"));
    const yDespuesDer = y;
    y = Math.max(yDespuesIzq, yDespuesDer);

    doc.setDrawColor(220, 220, 220);
    doc.line(xIzq, y, xIzq + anchoFirma, y);
    doc.line(xDer, y, xDer + anchoFirma, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(nombreFreelancerPdf, xIzq, y + 5);
    doc.text(signerCliente, xDer, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...gris);
    doc.text(t("contratos.pdf.fecha", { fecha: c.fecha_firma_usuario || "—" }), xIzq, y + 10);
    doc.text(t("contratos.pdf.fecha", { fecha: c.fecha_firma_cliente || "—" }), xDer, y + 10);
    y += 18;

    // Footer
    doc.setFillColor(...ink);
    doc.rect(0, footerY, 210, footerHeight, "F");

    const logoH = 4.5;
    const logoW = (logoH * 7575) / 1089;
    doc.addImage(logoFlowo, "PNG", 14, footerY + (footerHeight - logoH) / 2, logoW, logoH);

    const nota = t("contratos.pdf.notaFooter");

    doc.setTextColor(220, 220, 220);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    const lineasFooter = doc.splitTextToSize(nota, 120);
    doc.text(lineasFooter, 70, footerY + 12);

    doc.setFontSize(5);
    doc.setTextColor(180, 180, 180);
    doc.text(t("contratos.pdf.generadoCon"), 70, footerY + 22);

    const pdfBytes = doc.output("arraybuffer");
    const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await writeFile(
      c.numero + ".pdf",
      new Uint8Array(pdfBytes),
      { baseDir: BaseDirectory.Download }
    );
    sendNotification({ title: t("contratos.pdf.notifTitulo"), body: t("contratos.pdf.notifCuerpo", { nombre: c.numero + ".pdf" }) });
  }

  const totalBorradores = contratos.filter((c) => c.estado === "borrador").length;
  const firmados = contratos.filter((c) => c.estado === "firmado");
  const totalFirmados = firmados.reduce((a, c) => a + (c.monto || 0), 0);
  const totalMonto = contratos.reduce((a, c) => a + (c.monto || 0), 0);

  const filtrosEstado = [
    { id: "todas", label: t("contratos.filtros.todas"), conteo: contratos.length },
    { id: "borrador", label: t("contratos.estados.borradores"), conteo: totalBorradores },
    { id: "firmado", label: t("contratos.estados.firmados"), conteo: firmados.length },
  ];

  const estadoConfig = getEstadoConfig(t);

  const contratosFiltrados = contratos.filter((c) => {
    const coincideEstado = filtroEstado === "todas" || c.estado === filtroEstado;
    const coincideBusqueda =
      c.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.cliente_correo.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.descripcion.toLowerCase().includes(busqueda.toLowerCase());
    return coincideEstado && coincideBusqueda;
  });

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">{t("contratos.cargando")}</p></div>;
  }

  const botonSecundario = "text-sm text-primary border border-edge px-3 py-2 rounded-lg hover:bg-surface transition-colors flex-shrink-0";

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-primary">{t("contratos.titulo")}</h2>
          <p className="text-muted mt-1">{t("contratos.totalContratos", { count: contratos.length })}</p>
          <p className="text-muted text-xs mt-1 opacity-70">{t("contratos.disclaimer")}</p>
        </div>
        <button onClick={abrirForm}
          className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
          {t("contratos.nuevoContrato")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("contratos.titulo")}</p>
          <p className="text-2xl font-bold text-primary">{contratos.length}</p>
          <p className="text-muted text-xs mt-1">{t("contratos.resumen.enTotal", { monto: formatearMoneda(totalMonto, monedaUi) })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("contratos.resumen.borradores")}</p>
          <p className="text-2xl font-bold text-primary">{totalBorradores}</p>
          <p className="text-muted text-xs mt-1">{t("contratos.resumen.porFirmar")}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("contratos.resumen.firmados")}</p>
          <p className="text-2xl font-bold text-primary">{firmados.length}</p>
          <p className="text-accent text-xs mt-1">{t("contratos.resumen.firmado", { monto: formatearMoneda(totalFirmados, monedaUi) })}</p>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-primary text-lg font-semibold tracking-tight">
                {editandoId ? t("contratos.form.tituloEditar") : t("contratos.form.tituloNuevo")}
              </h3>
              <p className="text-muted text-xs mt-0.5">{t("contratos.form.numero", { numero: editandoId ? "" : proximoNumero() })}</p>
            </div>
            <button onClick={() => { setMostrarForm(false); setEditandoId(null); }}
              className="text-muted text-xs px-3 py-1.5 rounded-lg hover:text-primary hover:bg-surface transition-colors">
              {t("contratos.form.cerrar")}
            </button>
          </div>

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">{t("contratos.form.datosCliente")}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="text-muted text-xs mb-1.5 block">
                  {t("contratos.form.nombre")} <span className="text-accent">*</span>
                </label>
                <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder={t("contratos.form.placeholderNombreCliente")}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">{t("contratos.form.telefonoWhatsApp")}</label>
                <input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder={t("contratos.form.placeholderTelefono")}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-muted text-xs mb-1.5 block">{t("contratos.form.correo")}</label>
                <input value={clienteCorreo} onChange={(e) => setClienteCorreo(e.target.value)}
                  placeholder={t("contratos.form.placeholderCorreo")}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">{t("contratos.form.firmaCliente")}</label>
                <p className="text-muted text-xs">{t("contratos.form.firmaClienteNota")}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Servicio</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-muted text-xs mb-1.5 block">
                  Descripción del servicio <span className="text-accent">*</span>
                </label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2}
                  placeholder="Ej: Diseño de identidad visual (logo, paleta, tipografía) con entrega de archivos finales."
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors resize-y" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">Monto total</label>
                <input value={monto} onChange={(e) => setMonto(e.target.value)} type="number" min={0}
                  placeholder="0.00"
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                {monto !== "" && !isNaN(Number(monto)) && (
                  <p className="text-muted text-xs mt-1">{formatearMoneda(Number(monto), monedaUi)}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-muted text-xs mb-1.5 block">Inicio</label>
                  <input value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} type="date"
                    className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1.5 block">Fin</label>
                  <input value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} type="date"
                    className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Cláusulas</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-muted text-xs mb-1.5 block">Forma de pago</label>
                <input value={clausulas.formaPago}
                  onChange={(e) => setClausulas({ ...clausulas, formaPago: e.target.value })}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">Entrega</label>
                <input value={clausulas.entrega}
                  onChange={(e) => setClausulas({ ...clausulas, entrega: e.target.value })}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">Confidencialidad</label>
                <input value={clausulas.confidencialidad}
                  onChange={(e) => setClausulas({ ...clausulas, confidencialidad: e.target.value })}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">Cancelación</label>
                <input value={clausulas.cancelacion}
                  onChange={(e) => setClausulas({ ...clausulas, cancelacion: e.target.value })}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div className="col-span-2">
                <label className="text-muted text-xs mb-1.5 block">Otras condiciones <span className="text-muted/60 normal-case">— opcional</span></label>
                <textarea value={clausulas.otras}
                  onChange={(e) => setClausulas({ ...clausulas, otras: e.target.value })} rows={2}
                  placeholder="Cualquier otra cláusula que quieras incluir..."
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors resize-y" />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Firmas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-surface border border-edge rounded-lg p-4">
                <p className="text-primary text-sm font-medium mb-3">Tu firma</p>
                <p className="text-muted text-xs mb-3">Firma como {nombreFreelancer || "prestador del servicio"}</p>
                <Firma label="Prestador de servicios" value={firmaUsuario}
                  onChange={(d) => { setFirmaUsuario(d); setFechaFirmaUsuario(d ? hoyISO() : null); }} />
              </div>
              <div className="bg-surface border border-edge rounded-lg p-4">
                <p className="text-primary text-sm font-medium mb-3">Firma del cliente</p>
                <div className="mb-3">
                  <label className="text-muted text-xs mb-1 block">Nombre completo del firmante</label>
                  <input value={nombreFirmanteCliente} onChange={(e) => setNombreFirmanteCliente(e.target.value)}
                    placeholder="Nombre y apellido del cliente"
                    className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                </div>
                <Firma label="Cliente" value={firmaCliente}
                  onChange={(d) => { setFirmaCliente(d); setFechaFirmaCliente(d ? hoyISO() : null); }} />
              </div>
            </div>
            <p className="text-muted text-xs mt-3">Cuando ambas partes firmen, el contrato pasa a estado <span className="text-accent">Firmado</span> automáticamente. También puedes marcarlo como firmado manualmente desde la lista.</p>
          </div>

          {errorForm && <p className="text-coral text-xs mb-4">{errorForm}</p>}

          <div className="flex gap-3 pt-5 border-t border-edge">
            <button onClick={guardarContrato} disabled={guardando}
              className="bg-accent text-onaccent font-medium px-5 py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
              {guardando ? "Guardando..." : "Guardar contrato"}
            </button>
            <button onClick={() => { setMostrarForm(false); setEditandoId(null); }}
              className="text-muted px-4 py-2.5 rounded-lg text-sm hover:text-primary transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, número o servicio..."
            className="w-full bg-canvas border border-edge rounded-lg pl-9 pr-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
        </div>
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5 overflow-x-auto">
          {filtrosEstado.map((f) => (
            <button key={f.id} onClick={() => setFiltroEstado(f.id)}
              className={"text-xs px-2.5 py-1.5 rounded-md transition-colors font-medium whitespace-nowrap " +
                (filtroEstado === f.id ? "bg-accent text-onaccent" : "text-muted hover:text-primary")}>
              {f.label} ({f.conteo})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {contratosFiltrados.length === 0 && (
          <div className="bg-surface border border-dashed border-edge rounded-xl p-10 text-center">
            <p className="text-muted text-sm">
              {contratos.length === 0
                ? "Aún no tienes contratos. Crea el primero con el botón de arriba."
                : "No hay contratos que coincidan con esta búsqueda."}
            </p>
          </div>
        )}

        {contratosFiltrados.map((c) => (
          <div key={c.id} className={"bg-canvas border border-edge border-l-2 rounded-xl overflow-hidden transition-colors " + bordeEstado[c.estado]}>
            <div onClick={() => toggleAbierta(c.id)}
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-muted flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-primary text-sm font-semibold font-mono">{c.numero}</p>
                    <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + estadoConfig[c.estado].color}>
                      {estadoConfig[c.estado].label}
                    </span>
                  </div>
                  <p className="text-muted text-xs truncate">
                    {c.cliente_nombre}{c.cliente_telefono ? " · " + c.cliente_telefono : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  {c.monto != null && <p className="text-primary text-base font-semibold">{formatearMoneda(c.monto, monedaUi)}</p>}
                  {c.fecha_fin && <p className="text-muted text-xs">Fin: {c.fecha_fin}</p>}
                </div>
                <svg className={"w-4 h-4 text-muted transition-transform duration-200 " + (c.abierta ? "rotate-180" : "")}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {c.abierta && (
              <div className="border-t border-edge px-5 py-5 space-y-6">

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-muted text-[10px] uppercase tracking-wide mb-1">Cliente</p>
                    <p className="text-primary text-sm">{c.cliente_nombre}</p>
                    {c.cliente_telefono && <p className="text-muted text-xs">{c.cliente_telefono}</p>}
                    {c.cliente_correo && <p className="text-muted text-xs">{c.cliente_correo}</p>}
                  </div>
                  <div>
                    <p className="text-muted text-[10px] uppercase tracking-wide mb-1">Emisión</p>
                    <p className="text-primary text-sm font-mono">{c.fecha_emision}</p>
                  </div>
                  <div>
                    <p className="text-muted text-[10px] uppercase tracking-wide mb-1">Vigencia</p>
                    <p className="text-primary text-sm font-mono">
                      {c.fecha_inicio || "—"} → {c.fecha_fin || "—"}
                    </p>
                  </div>
                </div>

                {c.descripcion && (
                  <div>
                    <p className="text-muted text-xs uppercase tracking-wide font-medium mb-1">Servicio</p>
                    <p className="text-primary text-sm">{c.descripcion}</p>
                  </div>
                )}

                {c.clausulas && (
                  <div>
                    <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Cláusulas</p>
                    <div className="space-y-1.5">
                      {(["formaPago", "entrega", "confidencialidad", "cancelacion", "otras"] as (keyof Clausulas)[]).map((k) => {
                        if (!c.clausulas[k]?.trim()) return null;
                        return (
                          <div key={k} className="bg-surface border border-edge rounded-lg px-3 py-2">
                            <p className="text-primary text-xs">{c.clausulas[k]}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Firmas</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface border border-edge rounded-lg p-3">
                      <p className="text-muted text-xs mb-1">Prestador</p>
                      <p className="text-primary text-sm">{c.firma_usuario ? "✓ Firmado" : "— Pendiente"}</p>
                      {c.fecha_firma_usuario && <p className="text-muted text-xs">{c.fecha_firma_usuario}</p>}
                    </div>
                    <div className="bg-surface border border-edge rounded-lg p-3">
                      <p className="text-muted text-xs mb-1">Cliente</p>
                      <p className="text-primary text-sm">{c.firma_cliente ? "✓ Firmado" : "— Pendiente"}</p>
                      {c.fecha_firma_cliente && <p className="text-muted text-xs">{c.fecha_firma_cliente}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-edge">
                  <button onClick={() => generarPDF(c)} className={botonSecundario}>
                    Descargar PDF
                  </button>
                  {c.cliente_telefono && (
                    <button onClick={() => setModalWhatsAppId(c.id)} className={botonSecundario}>
                      WhatsApp
                    </button>
                  )}
                  <button onClick={() => abrirFirmaEnLinea(c)} className={botonSecundario}>
                    Firma en línea
                  </button>
                  {c.estado === "borrador" ? (
                    <button onClick={() => cambiarEstado(c.id, "firmado")}
                      className="bg-accent text-onaccent font-medium text-sm px-3 py-2 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                      Marcar como firmado
                    </button>
                  ) : (
                    <button onClick={() => cambiarEstado(c.id, "borrador")}
                      className="text-muted text-sm border border-edge px-3 py-2 rounded-lg hover:bg-surface transition-colors flex-shrink-0">
                      Volver a borrador
                    </button>
                  )}
                  <button onClick={() => abrirEdicion(c)} className={botonSecundario}>
                    Editar
                  </button>
                  <button onClick={() => duplicarContrato(c)} className={botonSecundario}>
                    Duplicar
                  </button>
                  <button onClick={() => setModalEliminarId(c.id)}
                    className="text-coral text-sm border border-coral/30 px-3 py-2 rounded-lg hover:bg-coral/10 transition-colors flex-shrink-0">
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {modalWhatsAppId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-accent flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-primary font-medium mb-1">Enviar por WhatsApp</h3>
                <p className="text-muted text-sm">
                  Recuerda descargar el PDF y adjuntarlo en la conversación antes de enviar el contrato.
                  WhatsApp no permite adjuntar archivos automáticamente.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 mt-5">
              <button onClick={() => { if (modalWhatsAppId) { const c = contratos.find((x) => x.id === modalWhatsAppId); if (c) generarPDF(c); } }}
                className="w-full bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
                Descargar PDF
              </button>
              <button onClick={() => { if (modalWhatsAppId) { const c = contratos.find((x) => x.id === modalWhatsAppId); if (c) compartirWhatsApp(c); } setModalWhatsAppId(null); }}
                className="w-full text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                Abrir WhatsApp
              </button>
              <button onClick={() => setModalWhatsAppId(null)}
                className="w-full text-muted text-sm px-4 py-1.5 rounded-lg hover:text-primary transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFirmaId && (() => {
        const c = contratos.find((x) => x.id === modalFirmaId);
        if (!c) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-accent flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-primary font-medium mb-1">Firma en línea</h3>
                  <p className="text-muted text-sm">
                    Comparte este enlace con <span className="text-primary font-medium">{c.cliente_nombre}</span> para que firme el contrato {c.numero} desde su navegador. Cuando firme, recibirás una notificación.
                  </p>
                </div>
              </div>
              <div className="bg-surface border border-edge rounded-lg px-3 py-2 mt-4 flex items-center gap-2">
                <input readOnly value={enlaceFirma} onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-transparent text-primary text-xs font-mono focus:outline-none" />
              </div>
              <div className="flex flex-col gap-2.5 mt-4">
                <button onClick={copiarEnlaceFirma}
                  className="w-full text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                  {linkCopiado ? "Enlace copiado" : "Copiar enlace"}
                </button>
                {c.cliente_telefono && (
                  <button onClick={() => compartirFirmaWhatsApp(c)}
                    className="w-full bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
                    Enviar por WhatsApp
                  </button>
                )}
                <button onClick={() => setModalFirmaId(null)}
                  className="w-full text-muted text-sm px-4 py-1.5 rounded-lg hover:text-primary transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {modalCrearClienteContrato && (
        <ModalCrearCliente
          contrato={modalCrearClienteContrato}
          onConfirmado={() => setModalCrearClienteContrato(null)}
          onCancelar={() => setModalCrearClienteContrato(null)}
        />
      )}

      {modalEliminarId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-primary font-medium mb-1">¿Eliminar contrato?</h3>
            <p className="text-muted text-sm mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalEliminarId(null)}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                Cancelar
              </button>
              <button onClick={() => eliminarContrato(modalEliminarId)}
                className="flex-1 bg-coral text-white font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Contratos;
