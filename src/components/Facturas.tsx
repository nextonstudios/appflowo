import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import jsPDF from "jspdf";
import Select from "./Select";
import logoFlowo from "../assets/logoFlowo.png?inline";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { formatearMoneda } from "../lib/moneda";
import { useMoneda } from "../hooks/useMoneda";

interface HistorialEstado {
  estado: string;
  fecha: string;
}

interface Concepto {
  descripcion: string;
  monto: number;
}

interface Factura {
  id: string;
  numero: string;
  cliente_nombre: string;
  proyecto_nombre: string;
  proyecto_id: string;
  conceptos: Concepto[];
  abonado: number;
  estado: "pendiente" | "abonada" | "pagada" | "vencida";
  fecha_emision: string;
  fecha_vencimiento: string;
  notas: string;
  historial: HistorialEstado[];
  tareas_realizadas: string[];
  abierta: boolean;
  editando: boolean;
}

interface ProyectoOpcion {
  id: string;
  nombre: string;
  cliente_nombre: string;
  cliente_id: string;
}

function getEstadoConfig(t: TFunction) {
  return {
    "pendiente": { label: t("facturas.estado.pendiente"), color: "text-violet bg-violet/10" },
    "abonada": { label: t("facturas.estado.abonada"), color: "text-accent bg-accent/10" },
    "pagada": { label: t("facturas.estado.pagada"), color: "text-muted bg-gray/10" },
    "vencida": { label: t("facturas.estado.vencida"), color: "text-coral bg-coral/10" },
  };
}

function getDiasVencida(fechaVencimiento: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaVencimiento);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((hoy.getTime() - fecha.getTime()) / (1000 * 60 * 60 * 24));
}

interface FacturasProps {
  proyectoPreseleccionado?: string | null;
  onLimpiarProyecto?: () => void;
}

function Facturas({ proyectoPreseleccionado, onLimpiarProyecto }: FacturasProps) {
  const { t } = useTranslation();
  const monedaUi = useMoneda();
  const estadoConfig = getEstadoConfig(t);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});
  const [clientesEmailMap, setClientesEmailMap] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("activas");
  const [filtrosAbierto, setFiltrosAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [conceptos, setConceptos] = useState<Concepto[]>([{ descripcion: "", monto: 0 }]);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [montoAbono, setMontoAbono] = useState("");
  const [porcentajeAbono, setPorcentajeAbono] = useState("");
  const [modoAbono, setModoAbono] = useState<"monto" | "porcentaje">("monto");
  const [registrandoAbonoId, setRegistrandoAbonoId] = useState<string | null>(null);
  const [nuevoConceptoDesc, setNuevoConceptoDesc] = useState("");
  const [nuevoConceptoMonto, setNuevoConceptoMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [tareasRealizadasForm, setTareasRealizadasForm] = useState<string[]>([]);
  const [abonoInicial, setAbonoInicial] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    if (proyectoPreseleccionado && proyectos.length > 0) {
      setProyectoId(proyectoPreseleccionado);
      setMostrarForm(true);
      autocompletarDesdeProyecto(proyectoPreseleccionado);
      if (onLimpiarProyecto) onLimpiarProyecto();
    }
  }, [proyectoPreseleccionado, proyectos]);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [{ data: facturasData }, { data: proyectosData }, { data: clientesData }] = await Promise.all([
      supabase.from("facturas").select("*").eq("user_id", user?.id).order("created_at", { ascending: false }),
      supabase.from("proyectos").select("id, nombre, cliente_id").eq("user_id", user?.id),
      supabase.from("clientes").select("id, nombre, telefono, email").eq("user_id", user?.id),
    ]);

    const clientesNombres = Object.fromEntries((clientesData || []).map((c: any) => [c.id, c.nombre]));
    const clientesTelefonos = Object.fromEntries((clientesData || []).map((c: any) => [c.id, c.telefono]));
    const clientesEmails = Object.fromEntries((clientesData || []).map((c: any) => [c.id, c.email]));
    setClientesMap(clientesTelefonos);
    setClientesEmailMap(clientesEmails);

    const proyectosMapeados = (proyectosData || []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      cliente_id: p.cliente_id,
      cliente_nombre: clientesNombres[p.cliente_id] || "Sin cliente",
    }));
    setProyectos(proyectosMapeados);

    const facturasMapeadas = (facturasData || []).map((f: any) => ({
      ...f,
      conceptos: Array.isArray(f.conceptos) ? f.conceptos : [],
      historial: Array.isArray(f.historial) ? f.historial : [],
      tareas_realizadas: Array.isArray(f.tareas_realizadas) ? f.tareas_realizadas : [],
      abierta: false,
      editando: false,
    }));
    setFacturas(facturasMapeadas);
    setCargando(false);
  }

  function getTotalFactura(factura: Factura) {
    return factura.conceptos.reduce((acc, c) => acc + c.monto, 0);
  }

  async function autocompletarDesdeProyecto(pid: string) {
    if (!pid) {
      setConceptos([{ descripcion: "", monto: 0 }]);
      setTareasRealizadasForm([]);
      return;
    }

    const [{ data: proyectoData }, { data: registrosData }, { data: tareasData }] = await Promise.all([
      supabase.from("proyectos").select("servicios, deadline").eq("id", pid).single(),
      supabase.from("registros_tiempo").select("duracion, descripcion").eq("proyecto_id", pid),
      supabase.from("tareas").select("nombre").eq("proyecto_id", pid).eq("completada", true),
    ]);

    const nuevosConceptos: Concepto[] = [];

    if (proyectoData?.servicios && Array.isArray(proyectoData.servicios)) {
      proyectoData.servicios.forEach((s: any) => {
        if (s.modo === "fijo") {
          nuevosConceptos.push({ descripcion: s.nombre, monto: s.precio });
        } else {
          const totalSegundos = (registrosData || []).reduce((acc: number, r: any) => acc + r.duracion, 0);
          const totalHoras = Math.ceil(totalSegundos / 3600);
          const montoHoras = totalHoras * s.precio;
          nuevosConceptos.push({
            descripcion: s.nombre + " (" + totalHoras + "h × " + formatearMoneda(s.precio, monedaUi) + "/hr)",
            monto: montoHoras,
          });
        }
      });
    }

    if (nuevosConceptos.length === 0) {
      nuevosConceptos.push({ descripcion: "", monto: 0 });
    }

    setConceptos(nuevosConceptos);
    setTareasRealizadasForm((tareasData || []).map((t: any) => t.nombre));

    const vencimiento = new Date();
    vencimiento.setDate(vencimiento.getDate() + 15);
    setFechaVencimiento(vencimiento.toISOString().split("T")[0]);
  }

  async function agregarFactura() {
    if (!proyectoId || !fechaVencimiento || conceptos.some((c) => !c.descripcion || !c.monto)) return;
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();

    const proyecto = proyectos.find((p) => p.id === proyectoId);
    const numero = "CMP-" + String(facturas.length + 1).padStart(3, "0");
    const hoy = new Date().toISOString().split("T")[0];
    const totalConceptos = conceptos.reduce((a, c) => a + c.monto, 0);
    const abonoNum = abonoInicial ? Number(abonoInicial) : 0;
    const estadoInicial = abonoNum >= totalConceptos && abonoNum > 0 ? "pagada" : abonoNum > 0 ? "abonada" : "pendiente";

    const historialInicial = [{ estado: t("facturas.historialEvento.creada"), fecha: hoy }];
    if (abonoNum > 0) {
      historialInicial.push({ estado: t("facturas.historialEvento.abonoInicial", { monto: formatearMoneda(abonoNum, monedaUi) }), fecha: hoy });
    }

    const { data } = await supabase.from("facturas").insert({
      user_id: user?.id,
      proyecto_id: proyectoId,
      numero,
      cliente_nombre: proyecto?.cliente_nombre || "",
      proyecto_nombre: proyecto?.nombre || "",
      conceptos,
      tareas_realizadas: tareasRealizadasForm,
      abonado: abonoNum,
      estado: estadoInicial,
      fecha_emision: hoy,
      fecha_vencimiento: fechaVencimiento,
      notas: "",
      historial: historialInicial,
    }).select().single();

    if (data) {
      setFacturas((prev) => [{
        ...data,
        conceptos: Array.isArray(data.conceptos) ? data.conceptos : [],
        historial: Array.isArray(data.historial) ? data.historial : [],
        tareas_realizadas: Array.isArray(data.tareas_realizadas) ? data.tareas_realizadas : [],
        abierta: false,
        editando: false,
      }, ...prev]);
    }

    setProyectoId("");
    setConceptos([{ descripcion: "", monto: 0 }]);
    setTareasRealizadasForm([]);
    setFechaVencimiento("");
    setAbonoInicial("");
    setMostrarForm(false);
    setGuardando(false);
  }

  function toggleFactura(id: string) {
    setFacturas(facturas.map((f) => f.id === id ? { ...f, abierta: !f.abierta } : f));
  }

  function toggleEdicion(id: string) {
    setFacturas(facturas.map((f) => f.id === id ? { ...f, editando: !f.editando } : f));
  }

  async function cambiarEstado(id: string, nuevoEstado: Factura["estado"]) {
    const factura = facturas.find((f) => f.id === id);
    if (!factura) return;
    const total = getTotalFactura(factura);
    const nuevoHistorial = [...factura.historial, {
      estado: nuevoEstado === "pagada" ? t("facturas.historialEvento.pagadaCompleta") : nuevoEstado === "vencida" ? t("facturas.historialEvento.marcadaVencida") : t("facturas.historialEvento.pendiente"),
      fecha: new Date().toISOString().split("T")[0],
    }];
    const nuevoAbonado = nuevoEstado === "pagada" ? total : factura.abonado;

    await supabase.from("facturas").update({
      estado: nuevoEstado,
      abonado: nuevoAbonado,
      historial: nuevoHistorial,
    }).eq("id", id);

    setFacturas(facturas.map((f) =>
      f.id === id ? { ...f, estado: nuevoEstado, abonado: nuevoAbonado, historial: nuevoHistorial } : f
    ));
  }

  async function registrarAbono(id: string) {
    const factura = facturas.find((f) => f.id === id);
    if (!factura) return;
    const total = getTotalFactura(factura);
    let nuevoAbono = 0;
    if (modoAbono === "monto") {
      nuevoAbono = Math.min(Number(montoAbono), total);
    } else {
      nuevoAbono = Math.min(Math.round((Number(porcentajeAbono) / 100) * total), total);
    }
    const totalAbonado = factura.abonado + nuevoAbono;
    const nuevoEstado = totalAbonado >= total ? "pagada" : "abonada";
    const nuevoHistorial = [...factura.historial, {
      estado: nuevoEstado === "pagada" ? t("facturas.historialEvento.pagadaCompleta") : t("facturas.historialEvento.abono", { monto: formatearMoneda(nuevoAbono, monedaUi) }),
      fecha: new Date().toISOString().split("T")[0],
    }];

    await supabase.from("facturas").update({
      abonado: totalAbonado,
      estado: nuevoEstado,
      historial: nuevoHistorial,
    }).eq("id", id);

    setFacturas(facturas.map((f) =>
      f.id === id ? { ...f, abonado: totalAbonado, estado: nuevoEstado, historial: nuevoHistorial } : f
    ));
    setMontoAbono("");
    setPorcentajeAbono("");
    setRegistrandoAbonoId(null);
  }

  async function agregarConceptoAFactura(id: string) {
    if (!nuevoConceptoDesc || !nuevoConceptoMonto) return;
    const factura = facturas.find((f) => f.id === id);
    if (!factura) return;
    const nuevosConceptos = [...factura.conceptos, { descripcion: nuevoConceptoDesc, monto: Number(nuevoConceptoMonto) }];
    const nuevoHistorial = [...factura.historial, { estado: t("facturas.historialEvento.conceptoAgregado", { concepto: nuevoConceptoDesc }), fecha: new Date().toISOString().split("T")[0] }];
    await supabase.from("facturas").update({ conceptos: nuevosConceptos, historial: nuevoHistorial }).eq("id", id);
    setFacturas(facturas.map((f) => f.id === id ? { ...f, conceptos: nuevosConceptos, historial: nuevoHistorial } : f));
    setNuevoConceptoDesc("");
    setNuevoConceptoMonto("");
  }

  async function quitarConceptoDeFactura(facturaId: string, index: number) {
    const factura = facturas.find((f) => f.id === facturaId);
    if (!factura) return;
    const nuevosConceptos = factura.conceptos.filter((_, i) => i !== index);
    const nuevoHistorial = [...factura.historial, { estado: t("facturas.historialEvento.conceptoEliminado"), fecha: new Date().toISOString().split("T")[0] }];
    await supabase.from("facturas").update({ conceptos: nuevosConceptos, historial: nuevoHistorial }).eq("id", facturaId);
    setFacturas(facturas.map((f) => f.id === facturaId ? { ...f, conceptos: nuevosConceptos, historial: nuevoHistorial } : f));
  }

  async function actualizarNotas(id: string, notas: string) {
    await supabase.from("facturas").update({ notas }).eq("id", id);
    setFacturas(facturas.map((f) => f.id === id ? { ...f, notas } : f));
  }

  async function eliminarFactura(id: string) {
    await supabase.from("facturas").delete().eq("id", id);
    setFacturas(facturas.filter((f) => f.id !== id));
  }

  function enviarPorWhatsApp(factura: Factura) {
    const proyecto = proyectos.find((p) => p.id === factura.proyecto_id);
    const telefono = proyecto ? clientesMap[proyecto.cliente_id] : "";
    const total = getTotalFactura(factura);
    const restante = total - factura.abonado;
    const mensaje = encodeURIComponent(
      t("facturas.wa.saludo", { cliente: factura.cliente_nombre }) + "\n\n" +
      "📄 " + factura.numero + "\n" +
      t("facturas.wa.proyecto", { nombre: factura.proyecto_nombre }) + "\n" +
      t("facturas.wa.total", { monto: formatearMoneda(total, monedaUi) }) + "\n" +
      (factura.abonado > 0 ? t("facturas.wa.abonado", { monto: formatearMoneda(factura.abonado, monedaUi) }) + "\n" +
      t("facturas.wa.pendiente", { monto: formatearMoneda(restante, monedaUi) }) + "\n" : "") +
      t("facturas.wa.vencimiento", { fecha: factura.fecha_vencimiento }) + "\n\n" +
      t("facturas.wa.despedida")
    );
    openUrl("https://wa.me/" + (telefono || "") + "?text=" + mensaje);
  }

  async function generarPDF(factura: Factura) {
    const doc = new jsPDF();
    const total = getTotalFactura(factura);
    const restante = total - factura.abonado;

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

    // Header oscuro
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

    // Número de factura y estado
    doc.setTextColor(30, 30, 30);
doc.setFontSize(9);
doc.setFont("helvetica", "bold");
doc.text(t("facturas.pdf.comprobante"), 155, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(factura.numero, 155, 20);
    doc.text(t("facturas.pdf.emision", { fecha: factura.fecha_emision }), 155, 26);
    doc.text(t("facturas.pdf.vencimiento", { fecha: factura.fecha_vencimiento }), 155, 32);

    const estadoColors: Record<string, [number, number, number]> = {
      pagada: [29, 184, 160],
      pendiente: [124, 92, 191],
      abonada: [29, 184, 160],
      vencida: [244, 124, 92],
    };
    const estadoColor = estadoColors[factura.estado] || gris;
    doc.setFillColor(...estadoColor);
    doc.roundedRect(155, 35, 35, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(estadoConfig[factura.estado].label.toUpperCase(), 157, 40.5);

    doc.setDrawColor(220, 220, 220);
doc.setLineWidth(0.3);
doc.line(0, 52, 210, 52);

let y = 62;
    doc.setTextColor(...gris);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(t("facturas.pdf.emitidoPor"), 14, y);
    doc.text(t("facturas.pdf.cliente"), 110, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(nombreFreelancer, 14, y);
    doc.text(factura.cliente_nombre, 110, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    if (marcaNombre) doc.text(marcaNombre, 14, y);
    doc.text(t("facturas.pdf.proyecto", { nombre: factura.proyecto_nombre }), 110, y);
    y += 4;
    if (marcaDesc) doc.text(marcaDesc, 14, y);
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
    doc.text(t("facturas.pdf.concepto"), 17, y + 3.5);
    doc.text(t("facturas.pdf.monto"), 178, y + 3.5, { align: "right" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);

    factura.conceptos.forEach((c, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(252, 252, 252);
        doc.rect(14, y - 4, 182, 8, "F");
      }
      doc.text(c.descripcion, 17, y);
      doc.text(formatearMoneda(c.monto, moneda), 178, y, { align: "right" });
      y += 9;
    });

    if (factura.tareas_realizadas && factura.tareas_realizadas.length > 0) {
      y += 4;
      doc.setDrawColor(220, 220, 220);
      doc.line(14, y, 196, y);
      y += 8;

      doc.setFillColor(245, 245, 247);
      doc.rect(14, y - 3, 182, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...gris);
      doc.text(t("facturas.pdf.tareasRealizadas"), 17, y + 2);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      factura.tareas_realizadas.forEach((tarea) => {
        doc.setTextColor(...teal);
        doc.text("✓", 17, y);
        doc.setTextColor(50, 50, 50);
        doc.text(tarea, 24, y);
        y += 7;
      });
    }

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.4);
    doc.line(14, y, 196, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(t("facturas.pdf.total"), 17, y);
    doc.setTextColor(...teal);
    doc.text(formatearMoneda(total, moneda), 178, y, { align: "right" });
    y += 8;

    if (factura.abonado > 0 && factura.estado !== "pagada") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...gris);
      doc.text(t("facturas.pdf.abonado"), 17, y);
      doc.text(formatearMoneda(factura.abonado, moneda), 178, y, { align: "right" });
      y += 7;
      doc.setTextColor(244, 124, 92);
      doc.setFont("helvetica", "bold");
      doc.text(t("facturas.pdf.saldoPendiente"), 17, y);
      doc.text(formatearMoneda(restante, moneda), 178, y, { align: "right" });
      y += 7;
    }

    if (factura.estado === "pagada") {
      y += 4;
      doc.setFillColor(...teal);
      doc.roundedRect(14, y, 182, 10, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("✓ " + t("facturas.pdf.pagadoCompleto"), 105, y + 6.5, { align: "center" });
      y += 16;
    }

    if (factura.notas) {
      y += 4;
      doc.setDrawColor(220, 220, 220);
      doc.line(14, y, 196, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...gris);
      doc.text(t("facturas.pdf.notas"), 17, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      const lineas = doc.splitTextToSize(factura.notas, 170);
      doc.text(lineas, 17, y);
      y += lineas.length * 5;
    }

    const footerHeight = 32;
    const footerY = 297 - footerHeight;

    doc.setFillColor(...ink);
    doc.rect(0, footerY, 210, footerHeight, "F");

    const logoH = 4.5;
    const logoW = (logoH * 7575) / 1089;
    doc.addImage(logoFlowo, "PNG", 14, footerY + (footerHeight - logoH) / 2, logoW, logoH);

    const nota = t("facturas.pdf.notaFooter");

    doc.setTextColor(220, 220, 220);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    const lineasNota = doc.splitTextToSize(nota, 120);
    doc.text(lineasNota, 70, footerY + 12);

    doc.setFontSize(5);
    doc.setTextColor(180, 180, 180);
    doc.text(t("facturas.pdf.generadoCon"), 70, footerY + 22);

    const pdfBytes = doc.output("arraybuffer");
    const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await writeFile(
      factura.numero + ".pdf",
      new Uint8Array(pdfBytes),
      { baseDir: BaseDirectory.Download }
    );
    sendNotification({ title: t("facturas.notif.pdfGuardado"), body: t("facturas.notif.pdfGuardadoBody", { nombre: factura.numero }) });
  }

  async function enviarPorEmail(factura: Factura) {
    const proyecto = proyectos.find((p) => p.id === factura.proyecto_id);
    const emailCliente = proyecto ? clientesEmailMap[proyecto.cliente_id] : "";

    if (!emailCliente) {
      sendNotification({ title: t("facturas.notif.sinEmail"), body: t("facturas.notif.sinEmailBody") });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        "https://pvwwfsdlifwiwjiznrku.supabase.co/functions/v1/enviar-factura",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + session?.access_token,
          },
          body: JSON.stringify({ factura, emailCliente }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        sendNotification({ title: t("facturas.notif.enviado"), body: t("facturas.notif.enviadoBody", { email: emailCliente }) });
      } else {
        sendNotification({ title: t("facturas.notif.errorEnviar"), body: t("facturas.notif.errorEnviarBody") });
      }
    } catch (error) {
      sendNotification({ title: t("facturas.notif.errorConexion"), body: t("facturas.notif.errorConexionBody") });
    }
  }

  const facturasActivas = facturas.filter((f) => f.estado !== "pagada");
  const facturasPagadas = facturas.filter((f) => f.estado === "pagada");

  const facturasFiltradas = (filtroEstado === "pagadas" ? facturasPagadas : facturasActivas).filter((f) => {
    const coincideBusqueda =
      f.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      f.proyecto_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      f.numero.toLowerCase().includes(busqueda.toLowerCase());
    if (filtroEstado === "activas" || filtroEstado === "pagadas") return coincideBusqueda;
    return coincideBusqueda && f.estado === filtroEstado;
  });

  const totalCobrado = facturasPagadas.reduce((acc, f) => acc + getTotalFactura(f), 0);
  const totalPendiente = facturasActivas.filter((f) => f.estado === "pendiente").reduce((acc, f) => acc + getTotalFactura(f), 0);
  const totalAbonado = facturasActivas.filter((f) => f.estado === "abonada").reduce((acc, f) => acc + f.abonado, 0);
  const totalVencido = facturasActivas.filter((f) => f.estado === "vencida").reduce((acc, f) => acc + getTotalFactura(f), 0);

  const filtrosEstado = [
    { id: "activas", label: t("facturas.filtro.activas"), conteo: facturasActivas.length },
    { id: "pendiente", label: t("facturas.filtro.pendiente"), conteo: facturas.filter((f) => f.estado === "pendiente").length },
    { id: "abonada", label: t("facturas.filtro.abonada"), conteo: facturas.filter((f) => f.estado === "abonada").length },
    { id: "vencida", label: t("facturas.filtro.vencida"), conteo: facturas.filter((f) => f.estado === "vencida").length },
    { id: "pagadas", label: t("facturas.filtro.pagadas"), conteo: facturasPagadas.length },
  ];

  const bordeEstado: Record<Factura["estado"], string> = {
    "pendiente": "border-l-violet",
    "abonada": "border-l-accent",
    "pagada": "border-l-gray",
    "vencida": "border-l-coral",
  };

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">{t("facturas.cargando")}</p></div>;
  }

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-primary">{t("facturas.titulo")}</h2>
          <p className="text-muted mt-1">{t("facturas.totalComprobantes", { count: facturas.length })}</p>
        </div>
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
          + {t("facturas.nuevoComprobante")}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("facturas.tarjeta.cobrado")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalCobrado, monedaUi)}</p>
          <p className="text-muted text-xs mt-1">{t("facturas.tarjeta.pagados", { count: facturasPagadas.length })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("facturas.tarjeta.pendiente")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalPendiente, monedaUi)}</p>
          <p className="text-violet text-xs mt-1">{t("facturas.conteoComprobantes", { count: facturasActivas.filter((f) => f.estado === "pendiente").length })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("facturas.tarjeta.abonado")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalAbonado, monedaUi)}</p>
          <p className="text-accent text-xs mt-1">{t("facturas.conteoComprobantes", { count: facturasActivas.filter((f) => f.estado === "abonada").length })}</p>
        </div>
        <div className="bg-canvas border border-edge rounded-xl p-4">
          <p className="text-muted text-xs mb-1">{t("facturas.tarjeta.vencido")}</p>
          <p className="text-2xl font-bold text-primary">{formatearMoneda(totalVencido, monedaUi)}</p>
          <p className="text-coral text-xs mt-1">{t("facturas.conteoComprobantes", { count: facturasActivas.filter((f) => f.estado === "vencida").length })}</p>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-canvas border border-edge rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-primary text-lg font-semibold tracking-tight">{t("facturas.form.nuevoComprobante")}</h3>
              <p className="text-muted text-xs mt-0.5">{t("facturas.form.autoDesc")}</p>
            </div>
            <button onClick={() => setMostrarForm(false)}
              className="text-muted text-xs px-3 py-1.5 rounded-lg hover:text-primary hover:bg-surface transition-colors">
              {t("facturas.form.cerrar")}
            </button>
          </div>

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">{t("facturas.form.datosComprobante")}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="text-muted text-xs mb-1.5 block">
                  {t("facturas.form.proyecto")} <span className="text-accent">*</span>
                </label>
                <Select value={proyectoId} onChange={(v) => { setProyectoId(v); autocompletarDesdeProyecto(v); }}
                  options={[
                    { value: "", label: t("facturas.form.seleccionaProyecto") },
                    ...proyectos.map((p) => ({ value: p.id, label: p.nombre + " — " + p.cliente_nombre })),
                  ]} />
              </div>
              <div>
                <label className="text-muted text-xs mb-1.5 block">
                  {t("facturas.form.vencimiento")} <span className="text-accent">*</span>
                </label>
                <input value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)}
                  type="date"
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-muted text-xs uppercase tracking-wide font-medium">
                {t("facturas.conceptos")} <span className="text-accent">*</span>
              </p>
              <button onClick={() => setConceptos([...conceptos, { descripcion: "", monto: 0 }])}
                className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
                + {t("facturas.form.agregarConcepto")}
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {conceptos.map((c, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input value={c.descripcion}
                    onChange={(e) => setConceptos(conceptos.map((con, i) => i === index ? { ...con, descripcion: e.target.value } : con))}
                    placeholder="Descripción del concepto"
                    className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  <input value={c.monto || ""}
                    onChange={(e) => setConceptos(conceptos.map((con, i) => i === index ? { ...con, monto: Number(e.target.value) } : con))}
                    placeholder="Monto" type="number"
                    className="w-32 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
                  {conceptos.length > 1 && (
                    <button onClick={() => setConceptos(conceptos.filter((_, i) => i !== index))}
                      className="text-muted text-xs px-2 py-2 hover:text-coral transition-colors">
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-surface border border-edge rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">Total del comprobante</span>
                <span className="text-primary text-lg font-semibold">{formatearMoneda(conceptos.reduce((acc, c) => acc + (c.monto || 0), 0), monedaUi)}</span>
              </div>
              {abonoInicial && Number(abonoInicial) > 0 && (
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-muted">Restante después del abono</span>
                  <span className="text-accent font-medium">{formatearMoneda(conceptos.reduce((acc, c) => acc + (c.monto || 0), 0) - Number(abonoInicial), monedaUi)}</span>
                </div>
              )}
            </div>
          </div>

          {tareasRealizadasForm.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-muted text-xs uppercase tracking-wide font-medium">Tareas realizadas</p>
                <span className="text-muted text-xs bg-gray/10 px-2 py-0.5 rounded-full">{tareasRealizadasForm.length} incluidas</span>
              </div>
              <div className="bg-surface border border-edge rounded-lg p-3 space-y-1.5">
                {tareasRealizadasForm.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-accent text-xs">✓</span>
                      <p className="text-primary text-xs">{t}</p>
                    </div>
                    <button
                      onClick={() => setTareasRealizadasForm(tareasRealizadasForm.filter((_, idx) => idx !== i))}
                      className="text-muted text-xs hover:text-coral flex-shrink-0 transition-colors"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-muted text-xs mt-1.5">Solo las tareas que dejes aquí aparecerán en el PDF.</p>
            </div>
          )}

          <div className="mb-6">
            <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">
              Pago inicial del cliente <span className="text-muted/60 normal-case">— opcional</span>
            </p>
            <div className="flex items-center gap-3">
              <input
                value={abonoInicial}
                onChange={(e) => setAbonoInicial(e.target.value)}
                placeholder="0"
                type="number"
                className="w-40 bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
              />
              <p className="text-muted text-xs">Define el monto que el cliente ya abonó. Si cubre el total, el comprobante se crea como pagado.</p>
            </div>
          </div>

          <div className="flex gap-3 pt-5 border-t border-edge">
            <button onClick={agregarFactura} disabled={guardando || !proyectoId || !fechaVencimiento}
              className="bg-accent text-onaccent font-medium px-5 py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
              {guardando ? "Guardando..." : "Guardar comprobante"}
            </button>
            <button onClick={() => setMostrarForm(false)}
              className="text-muted px-4 py-2.5 rounded-lg text-sm hover:text-primary transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, proyecto o número..."
              className="w-full bg-canvas border border-edge rounded-lg pl-9 pr-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors" />
          </div>
          <button onClick={() => setFiltrosAbierto(!filtrosAbierto)}
            className={"flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex-shrink-0 " +
              (filtrosAbierto || filtroEstado !== "activas"
                ? "bg-surface border-edge text-primary"
                : "bg-canvas border-edge text-muted hover:text-primary hover:border-accent/40")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            Filtros
            {filtroEstado !== "activas" && <span className="w-2 h-2 rounded-full bg-accent" />}
          </button>
        </div>

        {filtrosAbierto && (
          <div className="bg-canvas border border-edge rounded-lg p-4 mt-3 flex flex-wrap items-end gap-4">
            <div className="min-w-[160px] flex-1">
              <label className="text-muted text-xs mb-1 block">Estado</label>
              <Select value={filtroEstado} onChange={setFiltroEstado}
                options={filtrosEstado.map((f) => ({ value: f.id, label: f.label }))} />
            </div>
            {filtroEstado !== "activas" && (
              <button onClick={() => setFiltroEstado("activas")}
                className="text-accent text-sm font-medium px-3 py-2 hover:opacity-90">
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {facturasFiltradas.map((factura) => {
          const total = getTotalFactura(factura);
          const restante = total - factura.abonado;
          const porcentajeAbonado = total > 0 ? Math.round((factura.abonado / total) * 100) : 0;
          const diasVencida = factura.estado === "vencida" ? getDiasVencida(factura.fecha_vencimiento) : 0;

          return (
            <div key={factura.id} className={"bg-canvas border border-edge border-l-2 rounded-xl overflow-hidden transition-colors " + bordeEstado[factura.estado]}>
              <div onClick={() => toggleFactura(factura.id)}
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-muted flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-primary text-sm font-semibold font-mono">{factura.numero}</p>
                      <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + estadoConfig[factura.estado].color}>
                        {estadoConfig[factura.estado].label}
                      </span>
                      {factura.estado === "vencida" && (
                        <span className="text-coral text-xs">· Vencida hace {diasVencida} días</span>
                      )}
                    </div>
                    <p className="text-muted text-xs truncate">{factura.cliente_nombre} · {factura.proyecto_nombre}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-primary text-base font-semibold">{formatearMoneda(total, monedaUi)}</p>
                    {factura.estado === "abonada" && (
                      <p className="text-accent text-xs">Restante: {formatearMoneda(restante, monedaUi)}</p>
                    )}
                  </div>
                  <svg className={"w-4 h-4 text-muted transition-transform duration-200 " + (factura.abierta ? "rotate-180" : "")}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {factura.abierta && (
                <div className="border-t border-edge px-5 py-5 space-y-6">

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-muted text-[10px] uppercase tracking-wide mb-1">Cliente</p>
                      <p className="text-primary text-sm">{factura.cliente_nombre || "Sin cliente"}</p>
                    </div>
                    <div>
                      <p className="text-muted text-[10px] uppercase tracking-wide mb-1">Proyecto</p>
                      <p className="text-primary text-sm">{factura.proyecto_nombre}</p>
                    </div>
                    <div>
                      <p className="text-muted text-[10px] uppercase tracking-wide mb-1">Emisión · Vencimiento</p>
                      <p className="text-primary text-sm font-mono">{factura.fecha_emision} → {factura.fecha_vencimiento}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-muted text-xs uppercase tracking-wide font-medium">Conceptos</p>
                      {factura.estado !== "pagada" && (
                        <button onClick={() => toggleEdicion(factura.id)}
                          className="text-accent text-xs border border-accent/30 px-2.5 py-1 rounded-lg hover:bg-accent/10 transition-colors">
                          {factura.editando ? "Cerrar edición" : "Editar conceptos"}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {factura.conceptos.map((c, index) => (
                        <div key={index} className="flex items-center justify-between bg-surface border border-edge rounded-lg px-3 py-2">
                          <p className="text-primary text-xs">{c.descripcion}</p>
                          <div className="flex items-center gap-3">
                            <p className="text-primary text-xs font-medium">{formatearMoneda(c.monto, monedaUi)}</p>
                            {factura.editando && (
                              <button onClick={() => quitarConceptoDeFactura(factura.id, index)}
                                className="text-muted text-xs hover:text-coral transition-colors">Quitar</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {factura.editando && (
                      <div className="flex gap-2 mt-2">
                        <input value={nuevoConceptoDesc} onChange={(e) => setNuevoConceptoDesc(e.target.value)}
                          placeholder="Nuevo concepto"
                          className="flex-1 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                        <input value={nuevoConceptoMonto} onChange={(e) => setNuevoConceptoMonto(e.target.value)}
                          placeholder="Monto" type="number"
                          className="w-24 bg-surface border border-edge rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none focus:border-accent" />
                        <button onClick={() => agregarConceptoAFactura(factura.id)}
                          className="bg-accent text-onaccent font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                          Agregar
                        </button>
                      </div>
                    )}
                    <div className="bg-surface border border-edge rounded-lg px-4 py-3 mt-3 flex items-center justify-between">
                      <span className="text-muted text-sm">Total</span>
                      <span className="text-primary text-base font-semibold">{formatearMoneda(total, monedaUi)}</span>
                    </div>
                  </div>

                  {factura.tareas_realizadas && factura.tareas_realizadas.length > 0 && (
                    <div>
                      <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Tareas realizadas</p>
                      <div className="space-y-1.5">
                        {factura.tareas_realizadas.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-accent text-xs">✓</span>
                            <p className="text-primary text-xs">{t}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {factura.estado === "abonada" && (
                    <div className="bg-surface border border-edge rounded-lg p-4">
                      <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Progreso de pago</p>
                      <div className="flex justify-between text-xs text-muted mb-1.5">
                        <span>{porcentajeAbonado}% abonado</span>
                        <span>{formatearMoneda(factura.abonado, monedaUi)} de {formatearMoneda(total, monedaUi)}</span>
                      </div>
                      <div className="w-full bg-canvas rounded-full h-2">
                        <div className="bg-accent h-2 rounded-full transition-all" style={{ width: porcentajeAbonado + "%" }} />
                      </div>
                      <p className="text-muted text-xs mt-2">Restante por cobrar: <span className="text-primary font-medium">{formatearMoneda(restante, monedaUi)}</span></p>
                    </div>
                  )}

                  {factura.estado !== "pagada" && (
                    <div>
                      {registrandoAbonoId === factura.id ? (
                        <div className="bg-surface border border-edge rounded-lg p-3">
                          <p className="text-primary text-xs font-medium mb-3">Registrar abono del cliente</p>
                          <div className="flex gap-2 mb-3">
                            <button onClick={() => setModoAbono("monto")}
                              className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (modoAbono === "monto" ? "border-accent text-accent bg-accent/10" : "border-edge text-muted hover:text-primary")}>
                              Por monto
                            </button>
                            <button onClick={() => setModoAbono("porcentaje")}
                              className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (modoAbono === "porcentaje" ? "border-accent text-accent bg-accent/10" : "border-edge text-muted hover:text-primary")}>
                              Por porcentaje
                            </button>
                          </div>
                          {modoAbono === "monto" ? (
                            <div className="flex gap-2 mb-3">
                              <input value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)}
                                placeholder="Monto abonado" type="number"
                                className="flex-1 bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
                              {montoAbono && (
                                <div className="flex items-center text-xs text-muted">
                                  Restante: <span className="text-primary ml-1">{formatearMoneda(total - factura.abonado - Number(montoAbono), monedaUi)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2 mb-3">
                              <input value={porcentajeAbono} onChange={(e) => setPorcentajeAbono(e.target.value)}
                                placeholder="Porcentaje (ej: 50)" type="number"
                                className="flex-1 bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
                              {porcentajeAbono && (
                                <div className="flex items-center text-xs text-muted">
                                  Equivale a: <span className="text-accent ml-1">{formatearMoneda(Math.round((Number(porcentajeAbono) / 100) * total), monedaUi)}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => registrarAbono(factura.id)}
                              className="bg-accent text-onaccent font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90 transition-opacity">
                              Confirmar abono
                            </button>
                            <button onClick={() => setRegistrandoAbonoId(null)}
                              className="text-muted px-4 py-1.5 rounded-lg text-xs hover:text-primary">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setRegistrandoAbonoId(factura.id)}
                          className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
                          + Registrar abono
                        </button>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Historial</p>
                    <div className="space-y-1.5">
                      {factura.historial.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-accent">·</span>
                          <span className="text-primary">{h.estado}</span>
                          <span className="text-muted">{h.fecha}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-muted text-xs uppercase tracking-wide font-medium mb-3">Notas</p>
                    <textarea value={factura.notas} onChange={(e) => actualizarNotas(factura.id, e.target.value)}
                      placeholder="Agregar nota sobre este comprobante..."
                      rows={2}
                      className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent resize-none transition-colors" />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-edge flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                      {factura.estado !== "pagada" && (
                        <>
                          <button onClick={() => cambiarEstado(factura.id, "pagada")}
                            className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
                            Marcar pagada
                          </button>
                          {factura.estado !== "vencida" && (
                            <button onClick={() => cambiarEstado(factura.id, "vencida")}
                              className="text-coral text-xs border border-coral/30 px-3 py-1.5 rounded-lg hover:bg-coral/10 transition-colors">
                              Marcar vencida
                            </button>
                          )}
                        </>
                      )}
                      {factura.estado === "pagada" && (
                        <span className="text-muted text-xs py-1.5">Comprobante cerrado</span>
                      )}
                      <button
                        onClick={() => eliminarFactura(factura.id)}
                        className="text-coral text-xs border border-coral/30 px-3 py-1.5 rounded-lg hover:bg-coral/10 transition-colors">
                        Eliminar
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => enviarPorWhatsApp(factura)}
                        className="bg-accent/10 text-accent text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/20 border border-accent/30 transition-colors">
                        WhatsApp
                      </button>
                      <button
                        onClick={() => enviarPorEmail(factura)}
                        className="bg-edge text-muted text-xs px-3 py-1.5 rounded-lg hover:text-primary transition-colors">
                        Enviar por email
                      </button>
                      <button onClick={() => generarPDF(factura)}
                        className="bg-accent text-onaccent text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
                        Generar PDF
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}

        {facturasFiltradas.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted">
              {facturas.length === 0 ? "No tienes comprobantes todavía. Crea el primero con el botón de arriba." : "No se encontraron comprobantes"}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

export default Facturas;