import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Select from "./Select";
import { openUrl } from "@tauri-apps/plugin-opener";
import jsPDF from "jspdf";
import logoFlowo from "../assets/logoFlowo.png?inline";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { formatearMoneda } from "../lib/moneda";
import { useMoneda } from "../hooks/useMoneda";
import { politicasPorDefecto, construirPoliticas, type Politicas } from "../lib/terminos";

interface Item {
  descripcion: string;
  cantidad: number;
  valor: number;
}

interface Cotizacion {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_correo: string;
  items: Item[];
  notas: string;
  estado: "pendiente" | "aprobada" | "rechazada" | "vencida";
  fecha_emision: string;
  fecha_validez: string;
  moneda: string;
  politicas: Politicas;
  politicas_custom: string | null;
  abierta: boolean;
}

interface ServicioCatalogo {
  id: number;
  nombre: string;
  precio: number;
  modo: "fijo" | "horas";
}

interface Props {
  onIrAFacturas?: () => void;
}

function getEstadoConfig(t: TFunction) {
  return {
    "pendiente": { label: t("cotizaciones.estados.pendiente"), color: "text-violet bg-violet/10" },
    "aprobada": { label: t("cotizaciones.estados.aprobada"), color: "text-accent bg-accent/10" },
    "rechazada": { label: t("cotizaciones.estados.rechazada"), color: "text-coral bg-coral/10" },
    "vencida": { label: t("cotizaciones.estados.vencida"), color: "text-muted bg-gray/10" },
  };
}

const bordeEstado = {
  "pendiente": "border-l-violet",
  "aprobada": "border-l-accent",
  "rechazada": "border-l-coral",
  "vencida": "border-l-gray",
};

type Estado = Cotizacion["estado"];

function hoyISO() {
  return new Date().toISOString().split("T")[0];
}

function sumarDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split("T")[0];
}

function getDiasVencida(fechaValidez: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaValidez);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((hoy.getTime() - fecha.getTime()) / (1000 * 60 * 60 * 24));
}

function getTotal(c: Cotizacion) {
  return c.items.reduce((a, i) => a + (i.cantidad || 0) * (i.valor || 0), 0);
}

function Cotizaciones({ onIrAFacturas }: Props) {
  const { t } = useTranslation();
  const monedaUi = useMoneda();
  const estadoConfig = getEstadoConfig(t);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [servicios, setServicios] = useState<ServicioCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [modalEliminarId, setModalEliminarId] = useState<string | null>(null);

  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteCorreo, setClienteCorreo] = useState("");
  const [items, setItems] = useState<Item[]>([{ descripcion: "", cantidad: 1, valor: 0 }]);
  const [catalogoSel, setCatalogoSel] = useState("");
  const [fechaValidez, setFechaValidez] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [politicas, setPoliticas] = useState<Politicas>(politicasPorDefecto(t));
  const [politicasCustom, setPoliticasCustom] = useState<string | null>(null);
  const [modalPoliticas, setModalPoliticas] = useState(false);
  const [textoCustomTemp, setTextoCustomTemp] = useState("");
  const [modalWhatsAppId, setModalWhatsAppId] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [{ data: cotizacionesData }, { data: perfil }] = await Promise.all([
      supabase.from("cotizaciones").select("*").eq("user_id", user?.id).order("created_at", { ascending: false }),
      supabase.from("perfiles").select("servicios").eq("user_id", user?.id).single(),
    ]);

    setServicios(Array.isArray(perfil?.servicios) ? perfil.servicios : []);

    const mapeadas = (cotizacionesData || []).map((c: any) => ({
      ...c,
      items: Array.isArray(c.items) ? c.items : [],
      abierta: false,
    }));
    setCotizaciones(mapeadas);
    setCargando(false);
  }

  function estadoEfectivo(c: Cotizacion): Estado {
    if (c.estado === "pendiente" && c.fecha_validez && c.fecha_validez < hoyISO()) {
      return "vencida";
    }
    return c.estado;
  }

  function proximoNumero() {
    let max = 0;
    cotizaciones.forEach((c) => {
      const m = c.numero.match(/COT-(\d+)/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return "COT-" + String(max + 1).padStart(3, "0");
  }

  function abrirForm() {
    setEditandoId(null);
    setClienteNombre("");
    setClienteTelefono("");
    setClienteCorreo("");
    setItems([{ descripcion: "", cantidad: 1, valor: 0 }]);
    setCatalogoSel("");
    setFechaValidez(sumarDias(15));
    setNotas("");
    setPoliticas(politicasPorDefecto(t));
    setPoliticasCustom(null);
    setErrorForm(null);
    setMostrarForm(true);
  }

  function abrirEdicion(c: Cotizacion) {
    setEditandoId(c.id);
    setClienteNombre(c.cliente_nombre);
    setClienteTelefono(c.cliente_telefono || "");
    setClienteCorreo(c.cliente_correo || "");
    setItems(c.items.length > 0 ? c.items.map((i) => ({ ...i })) : [{ descripcion: "", cantidad: 1, valor: 0 }]);
    setCatalogoSel("");
    setFechaValidez(c.fecha_validez || sumarDias(15));
    setNotas(c.notas || "");
    setPoliticas({ ...politicasPorDefecto(t), ...(c.politicas || {}) });
    setPoliticasCustom(c.politicas_custom || null);
    setErrorForm(null);
    setMostrarForm(true);
  }

  function toggleAbierta(id: string) {
    setCotizaciones(cotizaciones.map((c) => c.id === id ? { ...c, abierta: !c.abierta } : c));
  }

  function agregarItem() {
    setItems([...items, { descripcion: "", cantidad: 1, valor: 0 }]);
  }

  function actualizarItem(index: number, campo: keyof Item, valor: string | number) {
    setItems(items.map((i, idx) => idx === index ? { ...i, [campo]: valor } : i));
  }

  function quitarItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function agregarDelCatalogo(id: string) {
    const servicio = servicios.find((s) => String(s.id) === id);
    if (!servicio) return;
    const vacio = items.findIndex((i) => !i.descripcion.trim());
    if (vacio !== -1) {
      setItems(items.map((i, idx) => idx === vacio ? { descripcion: servicio.nombre, cantidad: 1, valor: servicio.precio } : i));
    } else {
      setItems([...items, { descripcion: servicio.nombre, cantidad: 1, valor: servicio.precio }]);
    }
    setCatalogoSel("");
  }

  async function guardarCotizacion() {
    if (!clienteNombre.trim()) {
      setErrorForm(t("cotizaciones.errorNombreCliente"));
      return;
    }
    const itemsValidos = items.filter((i) => i.descripcion.trim() && (i.cantidad || 0) > 0);
    if (itemsValidos.length === 0) {
      setErrorForm(t("cotizaciones.errorSinItems"));
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    const { data: { user } } = await supabase.auth.getUser();

    const existente = editandoId ? cotizaciones.find((c) => c.id === editandoId) : null;
    const numero = existente?.numero || proximoNumero();
    const payload = {
      user_id: user?.id,
      numero,
      cliente_nombre: clienteNombre.trim(),
      cliente_telefono: clienteTelefono.trim(),
      cliente_correo: clienteCorreo.trim(),
      items: itemsValidos,
      notas,
      estado: existente?.estado || "pendiente",
      fecha_emision: hoyISO(),
      fecha_validez: fechaValidez,
      moneda: monedaUi,
      politicas,
      politicas_custom: politicasCustom,
    };

    if (editandoId) {
      const { error } = await supabase.from("cotizaciones").update(payload).eq("id", editandoId);
      if (error) {
        setErrorForm(t("cotizaciones.errorGuardar") + error.message);
      } else {
        setCotizaciones(cotizaciones.map((c) => c.id === editandoId ? { ...c, ...payload, abierta: c.abierta } : c));
        setMostrarForm(false);
        setEditandoId(null);
      }
    } else {
      const { data, error } = await supabase.from("cotizaciones").insert(payload).select().single();
      if (error) {
        setErrorForm(t("cotizaciones.errorGuardar") + error.message);
      } else if (data) {
        setCotizaciones([{ ...data, items: Array.isArray(data.items) ? data.items : [], abierta: false }, ...cotizaciones]);
        setMostrarForm(false);
      }
    }
    setGuardando(false);
  }

  async function cambiarEstado(id: string, nuevoEstado: "aprobada" | "rechazada") {
    await supabase.from("cotizaciones").update({ estado: nuevoEstado }).eq("id", id);
    setCotizaciones(cotizaciones.map((c) => c.id === id ? { ...c, estado: nuevoEstado } : c));
  }

  async function eliminarCotizacion(id: string) {
    await supabase.from("cotizaciones").delete().eq("id", id);
    setCotizaciones(cotizaciones.filter((c) => c.id !== id));
    setModalEliminarId(null);
  }

  async function duplicarCotizacion(c: Cotizacion) {
    const { data: { user } } = await supabase.auth.getUser();
    const nuevo = {
      user_id: user?.id,
      numero: proximoNumero(),
      cliente_nombre: c.cliente_nombre,
      cliente_telefono: c.cliente_telefono || "",
      cliente_correo: c.cliente_correo || "",
      items: c.items,
      notas: c.notas || "",
      estado: "pendiente",
      fecha_emision: hoyISO(),
      fecha_validez: sumarDias(15),
      moneda: c.moneda || monedaUi,
      politicas: { ...politicasPorDefecto(t), ...(c.politicas || {}) },
      politicas_custom: c.politicas_custom || null,
    };
    const { data } = await supabase.from("cotizaciones").insert(nuevo).select().single();
    if (data) {
      setCotizaciones([{ ...data, items: Array.isArray(data.items) ? data.items : [], abierta: false }, ...cotizaciones]);
    }
  }

  function compartirWhatsApp(c: Cotizacion) {
    const total = getTotal(c);
    const mensaje = encodeURIComponent(
      t("cotizaciones.whatsapp.saludo", { nombre: c.cliente_nombre }) +
      t("cotizaciones.whatsapp.numero", { numero: c.numero }) +
      t("cotizaciones.whatsapp.total", { total: formatearMoneda(total, monedaUi) }) +
      (c.fecha_validez ? t("cotizaciones.whatsapp.validaHasta", { fecha: c.fecha_validez }) : "") +
      t("cotizaciones.whatsapp.despedida")
    );
    openUrl("https://wa.me/" + (c.cliente_telefono || "") + "?text=" + mensaje);
  }

  async function generarPDF(c: Cotizacion) {
    const doc = new jsPDF();
    const total = getTotal(c);

    const teal = [29, 184, 160] as [number, number, number];
    const ink = [26, 31, 46] as [number, number, number];
    const gris = [107, 114, 128] as [number, number, number];

    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("marca_nombre, marca_desc, marca_web, telefono, moneda")
      .eq("user_id", user?.id)
      .single();

    const nombreFreelancer = user?.user_metadata?.nombre || "";
    const marcaNombre = perfil?.marca_nombre || "";
    const marcaDesc = perfil?.marca_desc || "";
    const marcaWeb = perfil?.marca_web || "";
    const telefono = perfil?.telefono || "";
    const moneda = perfil?.moneda || "USD";
    const emailFreelancer = user?.email || "";
    const textoTerminos = c.politicas_custom || construirPoliticas(c.politicas || politicasPorDefecto(t), t);

    const footerHeight = 32;
    const footerY = 297 - footerHeight;

    // Header blanco
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 50, "F");

    // Logo del usuario en el header (desde Supabase Storage)
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

    // Número de cotización y estado
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(t("cotizaciones.pdf.cotizacion"), 155, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(c.numero, 155, 20);
    doc.text(t("cotizaciones.pdf.emision", { fecha: c.fecha_emision }), 155, 26);
    doc.text(t("cotizaciones.pdf.validez", { fecha: c.fecha_validez || "—" }), 155, 32);

    const estadoColors: Record<string, [number, number, number]> = {
      aprobada: [29, 184, 160],
      pendiente: [124, 92, 191],
      rechazada: [244, 124, 92],
      vencida: [160, 160, 160],
    };
    const estadoColor = estadoColors[estadoEfectivo(c)] || gris;
    doc.setFillColor(...estadoColor);
    doc.roundedRect(155, 35, 35, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(estadoConfig[estadoEfectivo(c)].label.toUpperCase(), 157, 40.5);

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(0, 52, 210, 52);

    let y = 62;
    doc.setTextColor(...gris);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(t("cotizaciones.pdf.emitidoPor"), 14, y);
    doc.text(t("cotizaciones.pdf.cliente"), 110, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(nombreFreelancer, 14, y);
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

    doc.setFillColor(245, 245, 247);
    doc.rect(14, y - 2, 182, 8, "F");
    doc.setTextColor(...gris);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(t("cotizaciones.pdf.concepto"), 17, y + 3.5);
    doc.text(t("cotizaciones.pdf.cantidad"), 112, y + 3.5, { align: "right" });
    doc.text(t("cotizaciones.pdf.valor"), 143, y + 3.5, { align: "right" });
    doc.text(t("cotizaciones.pdf.subtotal"), 178, y + 3.5, { align: "right" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);

    c.items.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(252, 252, 252);
        doc.rect(14, y - 4, 182, 8, "F");
      }
      doc.text(item.descripcion, 17, y);
      doc.text(String(item.cantidad || 0), 112, y, { align: "right" });
      doc.text(formatearMoneda(item.valor || 0, moneda), 143, y, { align: "right" });
      doc.text(formatearMoneda((item.cantidad || 0) * (item.valor || 0), moneda), 178, y, { align: "right" });
      y += 9;
    });

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.4);
    doc.line(14, y, 196, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(t("cotizaciones.pdf.total"), 17, y);
    doc.setTextColor(...teal);
    doc.text(formatearMoneda(total, moneda), 178, y, { align: "right" });
    y += 8;

    if (c.notas) {
      if (y > 245) { doc.addPage(); y = 25; }
      y += 4;
      doc.setDrawColor(220, 220, 220);
      doc.line(14, y, 196, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...gris);
      doc.text(t("cotizaciones.pdf.notas"), 17, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      const lineasNotas = doc.splitTextToSize(c.notas, 170);
      doc.text(lineasNotas, 17, y);
      y += lineasNotas.length * 5;
    }

    if (textoTerminos) {
      if (y > 245) { doc.addPage(); y = 25; }
      y += 4;
      doc.setDrawColor(220, 220, 220);
      doc.line(14, y, 196, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...gris);
      doc.text(t("cotizaciones.pdf.terminos"), 17, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      const lineasTerminos = doc.splitTextToSize(textoTerminos, 170);
      doc.text(lineasTerminos, 17, y);
      y += lineasTerminos.length * 4.5;
    }

    // Footer
    doc.setFillColor(...ink);
    doc.rect(0, footerY, 210, footerHeight, "F");

    const logoH = 4.5;
    const logoW = (logoH * 7575) / 1089;
    doc.addImage(logoFlowo, "PNG", 14, footerY + (footerHeight - logoH) / 2, logoW, logoH);

    const nota = t("cotizaciones.pdf.nota");

    doc.setTextColor(220, 220, 220);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    const lineasNota = doc.splitTextToSize(nota, 120);
    doc.text(lineasNota, 70, footerY + 12);

    doc.setFontSize(5);
    doc.setTextColor(180, 180, 180);
    doc.text(t("cotizaciones.pdf.generadoPor"), 70, footerY + 22);

    const pdfBytes = doc.output("arraybuffer");
    const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await writeFile(
      c.numero + ".pdf",
      new Uint8Array(pdfBytes),
      { baseDir: BaseDirectory.Download }
    );
    sendNotification({
      title: t("cotizaciones.pdfGuardadoTitulo"),
      body: t("cotizaciones.pdfGuardadoBody", { archivo: c.numero + ".pdf" }),
    });
  }

  async function generarComprobante(c: Cotizacion) {
    const { data: { user } } = await supabase.auth.getUser();
    const { count } = await supabase
      .from("facturas")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user?.id);
    const numero = "CMP-" + String((count || 0) + 1).padStart(3, "0");
    const hoy = hoyISO();
    const conceptos = c.items.map((i) => ({
      descripcion: i.descripcion + (i.cantidad > 1 ? " × " + i.cantidad : ""),
      monto: (i.cantidad || 0) * (i.valor || 0),
    }));

    const { error } = await supabase.from("facturas").insert({
      user_id: user?.id,
      proyecto_id: null,
      numero,
      cliente_nombre: c.cliente_nombre,
      proyecto_nombre: "Cotización " + c.numero,
      conceptos,
      tareas_realizadas: [],
      abonado: 0,
      estado: "pendiente",
      fecha_emision: hoy,
      fecha_vencimiento: sumarDias(15),
      notas: c.notas || "",
      historial: [{ estado: "Creada", fecha: hoy }],
    });

    if (!error) {
      sendNotification({ title: t("cotizaciones.comprobanteCreadoTitulo"), body: t("cotizaciones.comprobanteCreadoBody", { numero, origen: c.numero }) });
      if (onIrAFacturas) onIrAFacturas();
    }
  }

  const totalAprobadas = cotizaciones.filter((c) => estadoEfectivo(c) === "aprobada").reduce((a, c) => a + getTotal(c), 0);
  const totalPendientes = cotizaciones.filter((c) => estadoEfectivo(c) === "pendiente").reduce((a, c) => a + getTotal(c), 0);
  const totalRechazadas = cotizaciones.filter((c) => estadoEfectivo(c) === "rechazada").reduce((a, c) => a + getTotal(c), 0);
  const totalVencidas = cotizaciones.filter((c) => estadoEfectivo(c) === "vencida").reduce((a, c) => a + getTotal(c), 0);

  const filtrosEstado = [
    { id: "todas", label: t("cotizaciones.todas"), conteo: cotizaciones.length },
    { id: "pendiente", label: t("cotizaciones.estados.pendientes"), conteo: cotizaciones.filter((c) => estadoEfectivo(c) === "pendiente").length },
    { id: "aprobada", label: t("cotizaciones.estados.aprobadas"), conteo: cotizaciones.filter((c) => estadoEfectivo(c) === "aprobada").length },
    { id: "rechazada", label: t("cotizaciones.estados.rechazadas"), conteo: cotizaciones.filter((c) => estadoEfectivo(c) === "rechazada").length },
    { id: "vencida", label: t("cotizaciones.estados.vencidas"), conteo: cotizaciones.filter((c) => estadoEfectivo(c) === "vencida").length },
  ];

  const cotizacionesFiltradas = cotizaciones.filter((c) => {
    const coincideEstado = filtroEstado === "todas" || estadoEfectivo(c) === filtroEstado;
    const coincideBusqueda =
      c.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.cliente_correo.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.numero.toLowerCase().includes(busqueda.toLowerCase());
    return coincideEstado && coincideBusqueda;
  });

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">{t("cotizaciones.cargando")}</p></div>;
  }

  const botonSecundario = "text-sm text-primary border border-edge px-3 py-2 rounded-lg hover:bg-surface transition-colors flex-shrink-0";

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-primary">{t("cotizaciones.titulo")}</h2>
          <p className="text-muted mt-1">{t("cotizaciones.total", { count: cotizaciones.length })}</p>
        </div>
        <button onClick={abrirForm}
          className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
          + {t("cotizaciones.nuevaCotizacion")}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("cotizaciones.estados.aprobadas")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalAprobadas, monedaUi)}</p>
          <p className="text-accent text-xs mt-1">{t("cotizaciones.aprobadasCaption", { count: cotizaciones.filter((c) => estadoEfectivo(c) === "aprobada").length })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("cotizaciones.estados.pendientes")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalPendientes, monedaUi)}</p>
          <p className="text-violet text-xs mt-1">{t("cotizaciones.porResponder", { count: cotizaciones.filter((c) => estadoEfectivo(c) === "pendiente").length })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("cotizaciones.estados.rechazadas")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalRechazadas, monedaUi)}</p>
          <p className="text-coral text-xs mt-1">{t("cotizaciones.rechazadasCaption", { count: cotizaciones.filter((c) => estadoEfectivo(c) === "rechazada").length })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("cotizaciones.estados.vencidas")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalVencidas, monedaUi)}</p>
          <p className="text-muted text-xs mt-1">{t("cotizaciones.vencidasCaption", { count: cotizaciones.filter((c) => estadoEfectivo(c) === "vencida").length })}</p>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-primary text-lg font-semibold tracking-tight">
                {editandoId ? t("cotizaciones.editarCotizacion") : t("cotizaciones.nuevaCotizacionTitulo")}
              </h3>
              <p className="text-muted text-xs mt-0.5">{t("cotizaciones.noNecesitaCliente")}</p>
            </div>
            <button onClick={() => { setMostrarForm(false); setEditandoId(null); }}
              className="text-muted text-xs px-3 py-1.5 rounded-lg hover:text-primary hover:bg-surface transition-colors">
              {t("cotizaciones.cerrar")}
            </button>
          </div>

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">{t("cotizaciones.datosCliente")}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="text-muted text-xs mb-1.5 block">
                  {t("cotizaciones.nombre")} <span className="text-accent">*</span>
                </label>
                <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder={t("cotizaciones.nombreClientePlaceholder")}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">
                  {t("cotizaciones.validez")} <span className="text-accent">*</span>
                </label>
                <input value={fechaValidez} onChange={(e) => setFechaValidez(e.target.value)}
                  type="date"
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-muted text-xs mb-1.5 block">{t("cotizaciones.telefonoWhatsApp")}</label>
                <input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder={t("cotizaciones.telefonoPlaceholder")}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">{t("cotizaciones.correo")}</label>
                <input value={clienteCorreo} onChange={(e) => setClienteCorreo(e.target.value)}
                  placeholder={t("cotizaciones.correoPlaceholder")}
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-muted text-xs uppercase tracking-wide font-medium">
                {t("cotizaciones.items")} <span className="text-accent">*</span>
              </p>
              <div className="flex items-center gap-2">
                {servicios.length > 0 && (
                  <Select value={catalogoSel} onChange={(v) => { if (v) agregarDelCatalogo(v); }}
                    triggerClassName="bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent flex items-center gap-2"
                    options={[
                      { value: "", label: t("cotizaciones.delCatalogo") },
                      ...servicios.map((s) => ({ value: String(s.id), label: s.nombre + " — " + formatearMoneda(s.precio, monedaUi) })),
                    ]} />
                )}
                <button onClick={agregarItem}
                  className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
                  {t("cotizaciones.agregarItem")}
                </button>
              </div>
            </div>
            {servicios.length === 0 && (
              <p className="text-muted text-xs mb-2">{t("cotizaciones.sinServicios")}</p>
            )}
            <div className="space-y-2 mb-3">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input value={item.descripcion}
                    onChange={(e) => actualizarItem(index, "descripcion", e.target.value)}
                    placeholder={t("cotizaciones.descripcionServicioPlaceholder")}
                    className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  <input value={item.cantidad || ""}
                    onChange={(e) => actualizarItem(index, "cantidad", Number(e.target.value))}
                    placeholder={t("cotizaciones.cantidadPlaceholder")} type="number" min={1}
                    className="w-20 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  <input value={item.valor || ""}
                    onChange={(e) => actualizarItem(index, "valor", Number(e.target.value))}
                    placeholder={t("cotizaciones.valorUnitarioPlaceholder")} type="number"
                    className="w-32 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  <p className="text-primary text-xs font-medium w-28 text-right">
                    {formatearMoneda((item.cantidad || 0) * (item.valor || 0), monedaUi)}
                  </p>
                  {items.length > 1 && (
                    <button onClick={() => quitarItem(index)}
                      className="text-muted text-xs px-2 py-2 hover:text-coral transition-colors">
                      {t("cotizaciones.quitar")}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-surface border border-edge rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">{t("cotizaciones.totalCotizacion")}</span>
                <span className="text-primary text-lg font-semibold">
                  {formatearMoneda(items.reduce((acc, i) => acc + (i.cantidad || 0) * (i.valor || 0), 0), monedaUi)}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="text-muted text-xs uppercase tracking-wide font-medium mb-3 block">
              {t("cotizaciones.notas")} <span className="text-muted/60 normal-case">{t("cotizaciones.opcional")}</span>
            </label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3}
              placeholder={t("cotizaciones.notasPlaceholder")}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors resize-y" />
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-muted text-xs uppercase tracking-wide font-medium">{t("cotizaciones.terminosPoliticas")}</p>
              {politicasCustom ? (
                <button onClick={() => { setTextoCustomTemp(politicasCustom); setModalPoliticas(true); }}
                  className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
                  {t("cotizaciones.editarPoliticasPersonalizadas")}
                </button>
              ) : (
                <button onClick={() => { setTextoCustomTemp(construirPoliticas(politicas, t)); setModalPoliticas(true); }}
                  className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
                  {t("cotizaciones.politicasPersonalizadas")}
                </button>
              )}
            </div>

            {politicasCustom ? (
              <div className="bg-surface border border-accent/30 rounded-lg p-4">
                <p className="text-accent text-xs font-medium mb-2">{t("cotizaciones.politicasPersonalizadasCheck")}</p>
                <p className="text-primary text-sm whitespace-pre-wrap">{politicasCustom}</p>
                <button onClick={() => setPoliticasCustom(null)}
                  className="text-muted text-xs mt-3 hover:text-primary transition-colors">
                  {t("cotizaciones.volverPoliticasFlowo")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-muted text-xs mb-1.5 block">{t("cotizaciones.politicas.formaPago")}</label>
                    <input value={politicas.formaPago}
                      onChange={(e) => setPoliticas({ ...politicas, formaPago: e.target.value })}
                      placeholder={t("cotizaciones.formaPagoPlaceholder")}
                      className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1.5 block">{t("cotizaciones.politicas.fechaEntregaPlazo")}</label>
                    <input value={politicas.fechasEntrega}
                      onChange={(e) => setPoliticas({ ...politicas, fechasEntrega: e.target.value })}
                      placeholder={t("cotizaciones.fechaEntregaPlaceholder")}
                      className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-muted text-xs mb-1.5 block">{t("cotizaciones.politicas.validez")}</label>
                  <input value={politicas.validez}
                    onChange={(e) => setPoliticas({ ...politicas, validez: e.target.value })}
                    placeholder={t("cotizaciones.validezPlaceholder")}
                    className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1.5 block">{t("cotizaciones.politicas.otras")} <span className="text-muted/60 normal-case">{t("cotizaciones.opcional")}</span></label>
                  <textarea value={politicas.otras}
                    onChange={(e) => setPoliticas({ ...politicas, otras: e.target.value })} rows={2}
                    placeholder={t("cotizaciones.otrasCondicionesPlaceholder")}
                    className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors resize-y" />
                </div>
              </div>
            )}
          </div>

          {errorForm && <p className="text-coral text-xs mb-4">{errorForm}</p>}

          <div className="flex gap-3 pt-5 border-t border-edge">
            <button onClick={guardarCotizacion} disabled={guardando}
              className="bg-accent text-onaccent font-medium px-5 py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
              {guardando ? t("cotizaciones.guardando") : t("cotizaciones.guardarCotizacion")}
            </button>
            <button onClick={() => { setMostrarForm(false); setEditandoId(null); }}
              className="text-muted px-4 py-2.5 rounded-lg text-sm hover:text-primary transition-colors">
              {t("cotizaciones.cancelar")}
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
            placeholder={t("cotizaciones.buscarPlaceholder")}
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
        {cotizacionesFiltradas.length === 0 && (
          <div className="bg-surface border border-dashed border-edge rounded-xl p-10 text-center">
            <p className="text-muted text-sm">
              {cotizaciones.length === 0
                ? t("cotizaciones.sinCotizaciones")
                : t("cotizaciones.sinResultados")}
            </p>
          </div>
        )}

        {cotizacionesFiltradas.map((c) => {
          const estado = estadoEfectivo(c);
          const total = getTotal(c);

          return (
            <div key={c.id} className={"bg-canvas border border-edge border-l-2 rounded-xl overflow-hidden transition-colors " + bordeEstado[estado]}>
              <div onClick={() => toggleAbierta(c.id)}
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-muted flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-primary text-sm font-semibold font-mono">{c.numero}</p>
                      <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + estadoConfig[estado].color}>
                        {estadoConfig[estado].label}
                      </span>
                      {estado === "vencida" && c.fecha_validez && (
                        <span className="text-coral text-xs">{t("cotizaciones.vencidaHace", { count: getDiasVencida(c.fecha_validez) })}</span>
                      )}
                    </div>
                    <p className="text-muted text-xs truncate">
                      {c.cliente_nombre}{c.cliente_telefono ? " · " + c.cliente_telefono : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-primary text-base font-semibold">{formatearMoneda(total, monedaUi)}</p>
                    {c.fecha_validez && <p className="text-muted text-xs">{t("cotizaciones.vence", { fecha: c.fecha_validez })}</p>}
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
                      <p className="text-muted text-[10px] uppercase tracking-wide mb-1">{t("cotizaciones.cliente")}</p>
                      <p className="text-primary text-sm">{c.cliente_nombre}</p>
                      {c.cliente_telefono && <p className="text-muted text-xs">{c.cliente_telefono}</p>}
                      {c.cliente_correo && <p className="text-muted text-xs">{c.cliente_correo}</p>}
                    </div>
                    <div>
                      <p className="text-muted text-[10px] uppercase tracking-wide mb-1">{t("cotizaciones.emision")}</p>
                      <p className="text-primary text-sm font-mono">{c.fecha_emision}</p>
                    </div>
                    <div>
                      <p className="text-muted text-[10px] uppercase tracking-wide mb-1">{t("cotizaciones.validez")}</p>
                      <p className="text-primary text-sm font-mono">{c.fecha_validez || t("cotizaciones.sinFecha")}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">{t("cotizaciones.items")}</p>
                    <div className="space-y-1.5">
                      {c.items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between bg-surface border border-edge rounded-lg px-3 py-2">
                          <p className="text-primary text-xs">{item.descripcion}</p>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <p className="text-muted text-xs">{item.cantidad} × {formatearMoneda(item.valor, monedaUi)}</p>
                            <p className="text-primary text-xs font-medium">{formatearMoneda((item.cantidad || 0) * (item.valor || 0), monedaUi)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {c.notas && (
                    <div>
                      <p className="text-muted text-xs uppercase tracking-wide font-medium mb-1">{t("cotizaciones.notas")}</p>
                      <p className="text-muted text-sm whitespace-pre-wrap">{c.notas}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-4 border-t border-edge">
                    <button onClick={() => generarPDF(c)} className={botonSecundario}>
                      {t("cotizaciones.descargarPDF")}
                    </button>
                    {c.cliente_telefono && (
                      <button onClick={() => setModalWhatsAppId(c.id)} className={botonSecundario}>
                        {t("cotizaciones.whatsApp")}
                      </button>
                    )}
                    {estado === "pendiente" && (
                      <>
                        <button onClick={() => cambiarEstado(c.id, "aprobada")}
                          className="bg-accent text-onaccent font-medium text-sm px-3 py-2 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                          {t("cotizaciones.aprobar")}
                        </button>
                        <button onClick={() => cambiarEstado(c.id, "rechazada")}
                          className="text-coral text-sm border border-coral/30 px-3 py-2 rounded-lg hover:bg-coral/10 transition-colors flex-shrink-0">
                          {t("cotizaciones.rechazar")}
                        </button>
                      </>
                    )}
                    {estado === "aprobada" && (
                      <button onClick={() => generarComprobante(c)}
                        className="bg-accent text-onaccent font-medium text-sm px-3 py-2 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                        {t("cotizaciones.generarComprobante")}
                      </button>
                    )}
                    <button onClick={() => abrirEdicion(c)} className={botonSecundario}>
                      {t("cotizaciones.editar")}
                    </button>
                    <button onClick={() => duplicarCotizacion(c)} className={botonSecundario}>
                      {t("cotizaciones.duplicar")}
                    </button>
                    <button onClick={() => setModalEliminarId(c.id)}
                      className="text-coral text-sm border border-coral/30 px-3 py-2 rounded-lg hover:bg-coral/10 transition-colors flex-shrink-0">
                      {t("cotizaciones.eliminar")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modalPoliticas && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
            <h3 className="text-primary font-medium mb-1">{t("cotizaciones.modalPoliticas.titulo")}</h3>
            <p className="text-muted text-sm mb-4">{t("cotizaciones.modalPoliticas.desc")}</p>
            <textarea value={textoCustomTemp} onChange={(e) => setTextoCustomTemp(e.target.value)} rows={8}
              placeholder={t("cotizaciones.modalPoliticas.placeholder")}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors resize-y mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setModalPoliticas(false)}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                {t("cotizaciones.cancelar")}
              </button>
              <button onClick={() => {
                setPoliticasCustom(textoCustomTemp.trim());
                setModalPoliticas(false);
              }}
                className="flex-1 bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
                {t("cotizaciones.modalPoliticas.usar")}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h3 className="text-primary font-medium mb-1">{t("cotizaciones.modalWhatsApp.titulo")}</h3>
                <p className="text-muted text-sm">
                  {t("cotizaciones.modalWhatsApp.desc")}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 mt-5">
              <button onClick={() => { if (modalWhatsAppId) { const c = cotizaciones.find((x) => x.id === modalWhatsAppId); if (c) generarPDF(c); } }}
                className="w-full bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
                {t("cotizaciones.descargarPDF")}
              </button>
              <button onClick={() => { if (modalWhatsAppId) { const c = cotizaciones.find((x) => x.id === modalWhatsAppId); if (c) compartirWhatsApp(c); } setModalWhatsAppId(null); }}
                className="w-full text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                {t("cotizaciones.modalWhatsApp.abrir")}
              </button>
              <button onClick={() => setModalWhatsAppId(null)}
                className="w-full text-muted text-sm px-4 py-1.5 rounded-lg hover:text-primary transition-colors">
                {t("cotizaciones.cancelar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEliminarId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-primary font-medium mb-1">{t("cotizaciones.modalEliminar.titulo")}</h3>
            <p className="text-muted text-sm mb-6">{t("cotizaciones.modalEliminar.desc")}</p>
            <div className="flex gap-3">
              <button onClick={() => setModalEliminarId(null)}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
                Cancelar
              </button>
              <button onClick={() => eliminarCotizacion(modalEliminarId)}
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

export default Cotizaciones;
