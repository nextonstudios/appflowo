import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { openUrl } from "@tauri-apps/plugin-opener";
import jsPDF from "jspdf";

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

const estadoConfig = {
  "pendiente": { label: "Pendiente", color: "text-[#7C5CBF] bg-[#7C5CBF]/10" },
  "abonada": { label: "Abonada", color: "text-[#1DB8A0] bg-[#1DB8A0]/10" },
  "pagada": { label: "Pagada", color: "text-[#6B7280] bg-[#6B7280]/10" },
  "vencida": { label: "Vencida", color: "text-[#F47C5C] bg-[#F47C5C]/10" },
};

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
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});
  const [clientesEmailMap, setClientesEmailMap] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("activas");
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
            descripcion: s.nombre + " (" + totalHoras + "h × $" + s.precio + "/hr)",
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
    const numero = "FAC-" + String(facturas.length + 1).padStart(3, "0");
    const hoy = new Date().toISOString().split("T")[0];

    const { data } = await supabase.from("facturas").insert({
      user_id: user?.id,
      proyecto_id: proyectoId,
      numero,
      cliente_nombre: proyecto?.cliente_nombre || "",
      proyecto_nombre: proyecto?.nombre || "",
      conceptos,
      tareas_realizadas: tareasRealizadasForm,
      abonado: 0,
      estado: "pendiente",
      fecha_emision: hoy,
      fecha_vencimiento: fechaVencimiento,
      notas: "",
      historial: [{ estado: "Creada", fecha: hoy }],
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
      estado: nuevoEstado === "pagada" ? "Pagada completa" : nuevoEstado === "vencida" ? "Marcada vencida" : "Pendiente",
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
      estado: nuevoEstado === "pagada" ? "Pagada completa" : "Abono de $" + nuevoAbono.toLocaleString() + " registrado",
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
    const nuevoHistorial = [...factura.historial, { estado: "Concepto agregado: " + nuevoConceptoDesc, fecha: new Date().toISOString().split("T")[0] }];
    await supabase.from("facturas").update({ conceptos: nuevosConceptos, historial: nuevoHistorial }).eq("id", id);
    setFacturas(facturas.map((f) => f.id === id ? { ...f, conceptos: nuevosConceptos, historial: nuevoHistorial } : f));
    setNuevoConceptoDesc("");
    setNuevoConceptoMonto("");
  }

  async function quitarConceptoDeFactura(facturaId: string, index: number) {
    const factura = facturas.find((f) => f.id === facturaId);
    if (!factura) return;
    const nuevosConceptos = factura.conceptos.filter((_, i) => i !== index);
    const nuevoHistorial = [...factura.historial, { estado: "Concepto eliminado", fecha: new Date().toISOString().split("T")[0] }];
    await supabase.from("facturas").update({ conceptos: nuevosConceptos, historial: nuevoHistorial }).eq("id", facturaId);
    setFacturas(facturas.map((f) => f.id === facturaId ? { ...f, conceptos: nuevosConceptos, historial: nuevoHistorial } : f));
  }

  async function actualizarNotas(id: string, notas: string) {
    await supabase.from("facturas").update({ notas }).eq("id", id);
    setFacturas(facturas.map((f) => f.id === id ? { ...f, notas } : f));
  }

  function enviarPorWhatsApp(factura: Factura) {
    const proyecto = proyectos.find((p) => p.id === factura.proyecto_id);
    const telefono = proyecto ? clientesMap[proyecto.cliente_id] : "";
    const total = getTotalFactura(factura);
    const restante = total - factura.abonado;
    const mensaje = encodeURIComponent(
      "Hola " + factura.cliente_nombre + ", te comparto el resumen de tu factura:\n\n" +
      "📄 " + factura.numero + "\n" +
      "📁 Proyecto: " + factura.proyecto_nombre + "\n" +
      "💰 Total: $" + total.toLocaleString() + "\n" +
      (factura.abonado > 0 ? "✅ Abonado: $" + factura.abonado.toLocaleString() + "\n" +
      "⏳ Pendiente: $" + restante.toLocaleString() + "\n" : "") +
      "📅 Vencimiento: " + factura.fecha_vencimiento + "\n\n" +
      "Quedo atento a cualquier consulta. ¡Gracias!"
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

  // Cargar perfil del freelancer
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
  doc.setFillColor(...ink);
  doc.rect(0, 0, 210, 50, "F");

// Logo del usuario (desde Supabase Storage)
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
    // Detectar formato
    const esJpeg = logoBase64User.startsWith("data:image/jpeg");
    const formato = esJpeg ? "JPEG" : "PNG";
    doc.addImage(logoBase64User, "PNG", 12, footerY + 6, 40, 12);
  }
} catch (_) {
  // Si no tiene logo subido, el espacio queda vacío
}
  

  // Número de factura y estado
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURA", 155, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(factura.numero, 155, 20);
  doc.text("Emisión: " + factura.fecha_emision, 155, 26);
  doc.text("Vencimiento: " + factura.fecha_vencimiento, 155, 32);

  // Badge de estado
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
  doc.text(factura.estado.toUpperCase(), 157, 40.5);

  // Sección EMISOR + CLIENTE
  let y = 62;
  doc.setTextColor(...gris);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("EMITIDO POR", 14, y);
  doc.text("CLIENTE", 110, y);
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
  doc.text("Proyecto: " + factura.proyecto_nombre, 110, y);
  y += 4;
  if (marcaDesc) doc.text(marcaDesc, 14, y);
  y += 4;
  if (emailFreelancer) doc.text(emailFreelancer, 14, y);
  y += 4;
  if (telefono) doc.text(telefono, 14, y);
  y += 4;
  if (marcaWeb) doc.text(marcaWeb, 14, y);

  // Línea separadora teal
  y += 6;
  doc.setDrawColor(...teal);
  doc.setLineWidth(0.8);
  doc.line(14, y, 196, y);
  y += 8;

  // Tabla de conceptos - Header
  doc.setFillColor(245, 245, 247);
  doc.rect(14, y - 2, 182, 8, "F");
  doc.setTextColor(...gris);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("CONCEPTO", 17, y + 3.5);
  doc.text("MONTO", 178, y + 3.5, { align: "right" });
  y += 10;

  // Conceptos
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  factura.conceptos.forEach((c, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(14, y - 4, 182, 8, "F");
    }
    doc.text(c.descripcion, 17, y);
    doc.text(moneda + " " + c.monto.toLocaleString(), 178, y, { align: "right" });
    y += 9;
  });
  // Tareas realizadas
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
    doc.text("TAREAS REALIZADAS", 17, y + 2);
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
  // Línea y totales
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(14, y, 196, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("TOTAL", 17, y);
  doc.setTextColor(...teal);
  doc.text(moneda + " " + total.toLocaleString(), 178, y, { align: "right" });
  y += 8;

  if (factura.abonado > 0 && factura.estado !== "pagada") {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...gris);
    doc.text("Abonado", 17, y);
    doc.text(moneda + " " + factura.abonado.toLocaleString(), 178, y, { align: "right" });
    y += 7;
    doc.setTextColor(244, 124, 92);
    doc.setFont("helvetica", "bold");
    doc.text("Saldo pendiente", 17, y);
    doc.text(moneda + " " + restante.toLocaleString(), 178, y, { align: "right" });
    y += 7;
  }

  if (factura.estado === "pagada") {
    y += 4;
    doc.setFillColor(...teal);
    doc.roundedRect(14, y, 182, 10, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("✓ FACTURA PAGADA COMPLETAMENTE", 105, y + 6.5, { align: "center" });
    y += 16;
  }

  // Notas
  if (factura.notas) {
    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...gris);
    doc.text("NOTAS", 17, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const lineas = doc.splitTextToSize(factura.notas, 170);
    doc.text(lineas, 17, y);
    y += lineas.length * 5;
  }

  // Footer legal
// =========================
// FOOTER
// =========================

const footerHeight = 32;
const footerY = 297 - footerHeight;

// Fondo
doc.setFillColor(...ink);
doc.rect(0, footerY, 210, footerHeight, "F");

// Logo / Marca
doc.setTextColor(...teal);
doc.setFont("helvetica", "bold");
doc.setFontSize(18);
doc.text("Flowo", 14, footerY + 12);

// Subtítulo pequeño
doc.setFontSize(5);
doc.setFont("helvetica", "normal");
doc.text("Plataforma para Freelancers", 14, footerY + 17);

// Texto legal
const legalText =
  "Este documento ha sido generado electrónicamente como constancia de una transacción entre las partes. Su finalidad es servir como comprobante de pago, registro de servicios prestados y respaldo comercial. La aceptación y uso de este documento estarán sujetos a la legislación aplicable en la jurisdicción correspondiente.";

doc.setTextColor(220, 220, 220);
doc.setFontSize(5.5);

const legalLines = doc.splitTextToSize(legalText, 120);

doc.text(
  legalLines,
  70,
  footerY + 10
);

// Línea inferior
doc.setFontSize(5);
doc.setTextColor(180, 180, 180);

doc.text(
  "Generado con Flowo · appflowo.com",
  70,
  footerY + 23
);

  // Guardar
  const pdfBytes = doc.output("arraybuffer");
  const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  await writeFile(
    factura.numero + ".pdf",
    new Uint8Array(pdfBytes),
    { baseDir: BaseDirectory.Download }
  );
  alert("PDF guardado en Descargas: " + factura.numero + ".pdf");
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

  if (cargando) {
    return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando facturas...</p></div>;
  }
async function enviarPorEmail(factura: Factura) {
  const proyecto = proyectos.find((p) => p.id === factura.proyecto_id);
  const emailCliente = proyecto ? clientesEmailMap[proyecto.cliente_id] : "";

  if (!emailCliente) {
    alert("Este cliente no tiene email registrado.");
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
      alert("Factura enviada a " + emailCliente);
    } else {
      alert("Error al enviar: " + JSON.stringify(data.error));
    }
  } catch (error) {
    alert("Error de conexión: " + error);
  }
}
  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Facturas</h2>
          <p className="text-[#6B7280] mt-1">{facturas.length} facturas en total</p>
        </div>
        <button onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
          + Nueva factura
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-4">
          <p className="text-[#6B7280] text-xs mb-1">Cobrado</p>
          <p className="text-2xl font-bold text-white">${totalCobrado.toLocaleString()}</p>
          <p className="text-[#6B7280] text-xs mt-1">{facturasPagadas.length} pagadas</p>
        </div>
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-4">
          <p className="text-[#6B7280] text-xs mb-1">Pendiente</p>
          <p className="text-2xl font-bold text-white">${totalPendiente.toLocaleString()}</p>
          <p className="text-[#7C5CBF] text-xs mt-1">{facturasActivas.filter((f) => f.estado === "pendiente").length} facturas</p>
        </div>
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-4">
          <p className="text-[#6B7280] text-xs mb-1">Abonado</p>
          <p className="text-2xl font-bold text-white">${totalAbonado.toLocaleString()}</p>
          <p className="text-[#1DB8A0] text-xs mt-1">{facturasActivas.filter((f) => f.estado === "abonada").length} facturas</p>
        </div>
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-4">
          <p className="text-[#6B7280] text-xs mb-1">Vencido</p>
          <p className="text-2xl font-bold text-white">${totalVencido.toLocaleString()}</p>
          <p className="text-[#F47C5C] text-xs mt-1">{facturasActivas.filter((f) => f.estado === "vencida").length} facturas</p>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
          <h3 className="text-white font-medium mb-4">Nueva factura</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-[#6B7280] text-xs mb-1 block">Proyecto *</label>
              <select value={proyectoId} onChange={(e) => { setProyectoId(e.target.value); autocompletarDesdeProyecto(e.target.value); }}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="">Selecciona un proyecto</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — {p.cliente_nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Vencimiento *</label>
              <input value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)}
                type="date"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[#6B7280] text-xs mb-2 block">Conceptos *</label>
            <div className="space-y-2 mb-2">
              {conceptos.map((c, index) => (
                <div key={index} className="flex gap-2">
                  <input value={c.descripcion}
                    onChange={(e) => setConceptos(conceptos.map((con, i) => i === index ? { ...con, descripcion: e.target.value } : con))}
                    placeholder="Descripcion del concepto"
                    className="flex-1 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
                  <input value={c.monto || ""}
                    onChange={(e) => setConceptos(conceptos.map((con, i) => i === index ? { ...con, monto: Number(e.target.value) } : con))}
                    placeholder="Monto" type="number"
                    className="w-28 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
                  {conceptos.length > 1 && (
                    <button onClick={() => setConceptos(conceptos.filter((_, i) => i !== index))}
                      className="text-[#F47C5C] text-xs px-2 hover:opacity-80">
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setConceptos([...conceptos, { descripcion: "", monto: 0 }])}
              className="text-[#1DB8A0] text-xs hover:underline">
              + Agregar concepto
            </button>
            <p className="text-[#6B7280] text-xs mt-2">
              Total: <span className="text-white font-medium">${conceptos.reduce((acc, c) => acc + (c.monto || 0), 0).toLocaleString()}</span>
            </p>
          </div>

{tareasRealizadasForm.length > 0 && (
  <div className="mb-4">
    <label className="text-[#6B7280] text-xs mb-2 block">
      Tareas realizadas — {tareasRealizadasForm.length} incluidas · puedes quitar las que no quieras mostrar
    </label>
    <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg p-3 space-y-2">
      {tareasRealizadasForm.map((t, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[#1DB8A0] text-xs">✓</span>
            <p className="text-white text-xs">{t}</p>
          </div>
          <button
            onClick={() => setTareasRealizadasForm(tareasRealizadasForm.filter((_, idx) => idx !== i))}
            className="text-[#6B7280] text-xs hover:text-[#F47C5C] flex-shrink-0"
          >
            Quitar
          </button>
        </div>
      ))}
    </div>
    <p className="text-[#6B7280] text-xs mt-1">Solo las tareas que dejes aquí aparecerán en el PDF.</p>
  </div>
)}

          <div className="flex gap-3">
            <button onClick={agregarFactura} disabled={guardando || !proyectoId || !fechaVencimiento}
              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {guardando ? "Guardando..." : "Guardar factura"}
            </button>
            <button onClick={() => setMostrarForm(false)}
              className="text-[#6B7280] px-4 py-2 rounded-lg text-sm hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cliente, proyecto o numero..."
          className="flex-1 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
        <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
          {[
            { id: "activas", label: "Activas" },
            { id: "pendiente", label: "Pendientes" },
            { id: "abonada", label: "Abonadas" },
            { id: "vencida", label: "Vencidas" },
            { id: "pagadas", label: "Pagadas" },
          ].map((f) => (
            <button key={f.id} onClick={() => setFiltroEstado(f.id)}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (filtroEstado === f.id ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {facturasFiltradas.map((factura) => {
          const total = getTotalFactura(factura);
          const restante = total - factura.abonado;
          const porcentajeAbonado = total > 0 ? Math.round((factura.abonado / total) * 100) : 0;
          const diasVencida = factura.estado === "vencida" ? getDiasVencida(factura.fecha_vencimiento) : 0;

          return (
            <div key={factura.id} className="bg-[#141824] border border-[#252B3B] rounded-xl overflow-hidden">
              <div onClick={() => toggleFactura(factura.id)}
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#1A1F2E] transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-white text-sm font-medium font-mono">{factura.numero}</p>
                    <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + estadoConfig[factura.estado].color}>
                      {estadoConfig[factura.estado].label}
                    </span>
                    {factura.estado === "vencida" && (
                      <span className="text-[#F47C5C] text-xs">· Vencida hace {diasVencida} dias</span>
                    )}
                  </div>
                  <p className="text-[#6B7280] text-xs">{factura.cliente_nombre} · {factura.proyecto_nombre}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-white text-sm font-medium">${total.toLocaleString()}</p>
                    {factura.estado === "abonada" && (
                      <p className="text-[#1DB8A0] text-xs">Restante: ${restante.toLocaleString()}</p>
                    )}
                  </div>
                  <span className="text-[#6B7280] text-xs">{factura.abierta ? "▲" : "▼"}</span>
                </div>
              </div>

              {factura.abierta && (
                <div className="border-t border-[#252B3B] px-5 py-4 space-y-4">

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[#6B7280] text-xs uppercase tracking-wide">Conceptos</p>
                      {factura.estado !== "pagada" && (
                        <button onClick={() => toggleEdicion(factura.id)} className="text-[#1DB8A0] text-xs hover:underline">
                          {factura.editando ? "Cerrar edicion" : "Editar conceptos"}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1 mb-2">
                      {factura.conceptos.map((c, index) => (
                        <div key={index} className="flex items-center justify-between bg-[#1A1F2E] rounded-lg px-3 py-2">
                          <p className="text-white text-xs">{c.descripcion}</p>
                          <div className="flex items-center gap-3">
                            <p className="text-white text-xs font-medium">${c.monto.toLocaleString()}</p>
                            {factura.editando && (
                              <button onClick={() => quitarConceptoDeFactura(factura.id, index)}
                                className="text-[#F47C5C] text-xs hover:opacity-80">Quitar</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {factura.editando && (
                      <div className="flex gap-2 mt-2">
                        <input value={nuevoConceptoDesc} onChange={(e) => setNuevoConceptoDesc(e.target.value)}
                          placeholder="Nuevo concepto"
                          className="flex-1 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                        <input value={nuevoConceptoMonto} onChange={(e) => setNuevoConceptoMonto(e.target.value)}
                          placeholder="Monto" type="number"
                          className="w-24 bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                        <button onClick={() => agregarConceptoAFactura(factura.id)}
                          className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-3 py-1.5 rounded-lg text-xs hover:opacity-90">
                          Agregar
                        </button>
                      </div>
                    )}
                    <div className="flex justify-between text-xs mt-2 pt-2 border-t border-[#252B3B]">
                      <span className="text-[#6B7280]">Total</span>
                      <span className="text-white font-medium">${total.toLocaleString()}</span>
                    </div>
                  </div>

                  {factura.tareas_realizadas && factura.tareas_realizadas.length > 0 && (
                    <div>
                      <p className="text-[#6B7280] text-xs uppercase tracking-wide mb-2">Tareas realizadas</p>
                      <div className="space-y-1">
                        {factura.tareas_realizadas.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[#1DB8A0] text-xs">✓</span>
                            <p className="text-white text-xs">{t}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {factura.estado === "abonada" && (
                    <div>
                      <div className="flex justify-between text-xs text-[#6B7280] mb-1">
                        <span>Progreso de pago — {porcentajeAbonado}% abonado</span>
                        <span>${factura.abonado.toLocaleString()} de ${total.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-[#1A1F2E] rounded-full h-2">
                        <div className="bg-[#1DB8A0] h-2 rounded-full transition-all" style={{ width: porcentajeAbonado + "%" }} />
                      </div>
                      <p className="text-[#6B7280] text-xs mt-1">Restante por cobrar: <span className="text-white">${restante.toLocaleString()}</span></p>
                    </div>
                  )}

                  {factura.estado !== "pagada" && (
                    <div>
                      {registrandoAbonoId === factura.id ? (
                        <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg p-3">
                          <p className="text-white text-xs font-medium mb-3">Registrar abono del cliente</p>
                          <div className="flex gap-2 mb-3">
                            <button onClick={() => setModoAbono("monto")}
                              className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (modoAbono === "monto" ? "border-[#1DB8A0] text-[#1DB8A0] bg-[#1DB8A0]/10" : "border-[#252B3B] text-[#6B7280] hover:text-white")}>
                              Por monto
                            </button>
                            <button onClick={() => setModoAbono("porcentaje")}
                              className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (modoAbono === "porcentaje" ? "border-[#1DB8A0] text-[#1DB8A0] bg-[#1DB8A0]/10" : "border-[#252B3B] text-[#6B7280] hover:text-white")}>
                              Por porcentaje
                            </button>
                          </div>
                          {modoAbono === "monto" ? (
                            <div className="flex gap-2 mb-3">
                              <input value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)}
                                placeholder="Monto abonado" type="number"
                                className="flex-1 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
                              {montoAbono && (
                                <div className="flex items-center text-xs text-[#6B7280]">
                                  Restante: <span className="text-white ml-1">${(total - factura.abonado - Number(montoAbono)).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2 mb-3">
                              <input value={porcentajeAbono} onChange={(e) => setPorcentajeAbono(e.target.value)}
                                placeholder="Porcentaje (ej: 50)" type="number"
                                className="flex-1 bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]" />
                              {porcentajeAbono && (
                                <div className="flex items-center text-xs text-[#6B7280]">
                                  Equivale a: <span className="text-[#1DB8A0] ml-1">${Math.round((Number(porcentajeAbono) / 100) * total).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => registrarAbono(factura.id)}
                              className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
                              Confirmar abono
                            </button>
                            <button onClick={() => setRegistrandoAbonoId(null)}
                              className="text-[#6B7280] px-4 py-1.5 rounded-lg text-xs hover:text-white">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setRegistrandoAbonoId(factura.id)}
                          className="text-[#1DB8A0] text-xs border border-[#1DB8A0]/30 px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/10">
                          + Registrar abono
                        </button>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-[#6B7280] text-xs uppercase tracking-wide mb-2">Historial</p>
                    <div className="space-y-1">
                      {factura.historial.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-[#1DB8A0]">·</span>
                          <span className="text-white">{h.estado}</span>
                          <span className="text-[#6B7280]">{h.fecha}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[#6B7280] text-xs uppercase tracking-wide mb-2">Notas</p>
                    <textarea value={factura.notas} onChange={(e) => actualizarNotas(factura.id, e.target.value)}
                      placeholder="Agregar nota sobre esta factura..."
                      rows={2}
                      className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0] resize-none" />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#252B3B]">
                    <div className="flex gap-2">
                      {factura.estado !== "pagada" && (
                        <>
                          <button onClick={() => cambiarEstado(factura.id, "pagada")}
                            className="text-[#1DB8A0] text-xs border border-[#1DB8A0]/30 px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/10">
                            Marcar pagada
                          </button>
                          {factura.estado !== "vencida" && (
                            <button onClick={() => cambiarEstado(factura.id, "vencida")}
                              className="text-[#F47C5C] text-xs border border-[#F47C5C]/30 px-3 py-1.5 rounded-lg hover:bg-[#F47C5C]/10">
                              Marcar vencida
                            </button>
                          )}
                        </>
                      )}
                      {factura.estado === "pagada" && (
                        <span className="text-[#6B7280] text-xs">Factura cerrada</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => enviarPorWhatsApp(factura)}
                        className="bg-[#1DB8A0]/10 text-[#1DB8A0] text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/20 border border-[#1DB8A0]/30">
                        WhatsApp
                      </button>
                      <button
  onClick={() => enviarPorEmail(factura)}
  className="bg-[#252B3B] text-[#6B7280] text-xs px-3 py-1.5 rounded-lg hover:text-white transition-colors">
  Enviar por email
</button>
                      <button onClick={() => generarPDF(factura)}
                        className="bg-[#1DB8A0] text-[#1A1F2E] text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90">
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
            <p className="text-[#6B7280]">
              {facturas.length === 0 ? "No tienes facturas todavía. Crea la primera con el botón de arriba." : "No se encontraron facturas"}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

export default Facturas;