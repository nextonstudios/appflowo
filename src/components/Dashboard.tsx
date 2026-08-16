import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { formatearMoneda } from "../lib/moneda";
import { useMoneda } from "../hooks/useMoneda";

interface Proyecto {
  id: string;
  nombre: string;
  cliente_nombre: string;
  deadline: string;
  tareas: number;
  tareas_completadas: number;
  estado: string;
}

interface TareaUrgente {
  id: string;
  titulo: string;
  proyecto_nombre: string;
  deadline: string;
}

function formatHoras(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h === 0) return m + "m";
  return h + "h " + String(m).padStart(2, "0") + "m";
}

function getDiasRestantes(deadline: string) {
  if (!deadline) return 999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(deadline);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

const IconoIngresos = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconoPorCobrar = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconoHoras = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M12 3v3m-4.5 5h9M6.75 8.25a7.5 7.5 0 1110.5 0L21 21H3l3.75-12.75z" />
  </svg>
);

const IconoProyectos = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

function TarjetaKPI({ label, valor, caption, icono, iconoClase }: {
  label: string;
  valor: string;
  caption: string;
  icono: React.ReactNode;
  iconoClase: string;
}) {
  return (
    <div className="bg-canvas border border-edge rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted2">{label}</p>
          <p className="text-xl xl:text-2xl font-semibold tracking-tight text-primary mt-2 truncate">{valor}</p>
        </div>
        <div className={"w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 " + iconoClase}>
          {icono}
        </div>
      </div>
      <p className="text-xs font-medium text-muted mt-3">{caption}</p>
    </div>
  );
}

function Dashboard() {
  const moneda = useMoneda();
  const { t, i18n } = useTranslation();

  function getSaludo(nombre: string) {
    const hora = new Date().getHours();
    if (hora >= 6 && hora < 12) return t("dashboard.saludo.dias", { nombre });
    if (hora >= 12 && hora < 18) return t("dashboard.saludo.tardes", { nombre });
    return t("dashboard.saludo.noches", { nombre });
  }

  function formatearFechaHoy() {
    const locale = i18n.language === "en" ? "en-US" : "es-ES";
    const fecha = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    return fecha.charAt(0).toUpperCase() + fecha.slice(1);
  }

  function ultimos7Dias() {
    const nombres = t("dashboard.dias", { returnObjects: true }) as string[];
    const hoy = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() - (6 - i));
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      return { key, label: nombres[d.getDay()], esHoy: i === 6 };
    });
  }

  function etiquetaVencimiento(dias: number) {
    if (dias < 0) return { color: "#F05C5C", texto: t("dashboard.vencimiento.atrasada") };
    if (dias === 0) return { color: "#F05C5C", texto: t("dashboard.vencimiento.hoy") };
    if (dias <= 2) return { color: "#F47C5C", texto: t("dashboard.vencimiento.enDias", { count: dias }) };
    return { color: "#8B93A8", texto: t("dashboard.vencimiento.enDias", { count: dias }) };
  }

  const [filtro, setFiltro] = useState("mes");
  const [vista, setVista] = useState<"lista" | "tarjetas">("lista");
  const [cargando, setCargando] = useState(true);
  const primeraCarga = useRef(true);
  const [nombre, setNombre] = useState("Freelancer");
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [tareasUrgentes, setTareasUrgentes] = useState<TareaUrgente[]>([]);
  const [ingresosCobrados, setIngresosCobrados] = useState(0);
  const [porCobrar, setPorCobrar] = useState(0);
  const [facturasPendientes, setFacturasPendientes] = useState(0);
  const [facturasCobradas, setFacturasCobradas] = useState(0);
  const [horasMes, setHorasMes] = useState(0);
  const [horasPorDia, setHorasPorDia] = useState<number[]>([]);

  useEffect(() => {
    cargarDatos();
  }, [filtro]);

  async function cargarDatos() {
    if (primeraCarga.current) setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const ahora = new Date();
    let fechaDesde = new Date();
    if (filtro === "dia") fechaDesde.setDate(ahora.getDate() - 1);
    else if (filtro === "semana") fechaDesde.setDate(ahora.getDate() - 7);
    else if (filtro === "mes") fechaDesde.setMonth(ahora.getMonth() - 1);
    else if (filtro === "año") fechaDesde.setFullYear(ahora.getFullYear() - 1);
    const fechaDesdeStr = fechaDesde.toISOString().split("T")[0];

    const [
      { data: perfilData },
      { data: proyectosData },
      { data: tareasData },
      { data: facturasData },
      { data: registrosData },
    ] = await Promise.all([
      supabase.from("clientes").select("nombre").eq("user_id", user.id).limit(1),
      supabase.from("proyectos").select("id, nombre, cliente_id, deadline, tareas_total, tareas_completadas, estado").eq("user_id", user.id),
      supabase.from("tareas").select("id, nombre, proyecto_id, deadline").eq("user_id", user.id).eq("completada", false),
      supabase.from("facturas").select("estado, conceptos, abonado").eq("user_id", user.id).gte("fecha_emision", fechaDesdeStr),
      supabase.from("registros_tiempo").select("duracion, fecha").eq("user_id", user.id),
    ]);

    if (user.user_metadata?.nombre) setNombre(user.user_metadata.nombre);

    const clientesMap: Record<string, string> = {};
    if (proyectosData) {
      const clienteIds = [...new Set(proyectosData.map((p: any) => p.cliente_id))];
      if (clienteIds.length > 0) {
        const { data: clientesData } = await supabase
          .from("clientes")
          .select("id, nombre")
          .in("id", clienteIds);
        (clientesData || []).forEach((c: any) => { clientesMap[c.id] = c.nombre; });
      }
    }

    const proyectosMap: Record<string, string> = {};
    const proyectosMapeados = (proyectosData || []).map((p: any) => {
      proyectosMap[p.id] = p.nombre;
      return {
        id: p.id,
        nombre: p.nombre,
        cliente_nombre: clientesMap[p.cliente_id] || t("dashboard.sinCliente"),
        deadline: p.deadline || "",
        tareas: p.tareas_total || 0,
        tareas_completadas: p.tareas_completadas || 0,
        estado: p.estado,
      };
    });
    setProyectos(proyectosMapeados);

    const tareasUrgentesMapeadas = (tareasData || [])
      .filter((ta: any) => ta.deadline && getDiasRestantes(ta.deadline) <= 3)
      .map((ta: any) => ({
        id: ta.id,
        titulo: ta.nombre,
        proyecto_nombre: proyectosMap[ta.proyecto_id] || t("dashboard.sinProyecto"),
        deadline: ta.deadline,
      }));
    setTareasUrgentes(tareasUrgentesMapeadas);

    const pagadas = (facturasData || []).filter((f: any) => f.estado === "pagada");
    const pendientes = (facturasData || []).filter((f: any) => f.estado !== "pagada");
    const totalCobrado = pagadas.reduce((acc: number, f: any) => {
      const total = Array.isArray(f.conceptos) ? f.conceptos.reduce((s: number, c: any) => s + c.monto, 0) : 0;
      return acc + total;
    }, 0);
    const totalPorCobrar = pendientes.reduce((acc: number, f: any) => {
      const total = Array.isArray(f.conceptos) ? f.conceptos.reduce((s: number, c: any) => s + c.monto, 0) : 0;
      return acc + (total - (f.abonado || 0));
    }, 0);
    setIngresosCobrados(totalCobrado);
    setPorCobrar(totalPorCobrar);
    setFacturasCobradas(pagadas.length);
    setFacturasPendientes(pendientes.length);

    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split("T")[0];
    const horasEsteMes = (registrosData || [])
      .filter((r: any) => r.fecha >= inicioMes)
      .reduce((acc: number, r: any) => acc + r.duracion, 0);
    setHorasMes(horasEsteMes);

    const horasPorKey: Record<string, number> = {};
    (registrosData || []).forEach((r: any) => {
      const key = (r.fecha || "").slice(0, 10);
      if (key) horasPorKey[key] = (horasPorKey[key] || 0) + (r.duracion || 0);
    });
    const horas7 = ultimos7Dias().map((d) => horasPorKey[d.key] || 0);
    setHorasPorDia(horas7);

    primeraCarga.current = false;
    setCargando(false);
  }

  const porIniciar = proyectos.filter((p) => p.tareas_completadas === 0 && p.estado !== "completado");
  const enProceso = proyectos.filter((p) => p.tareas_completadas > 0 && p.tareas_completadas < p.tareas && p.estado !== "completado");
  const finalizados = proyectos.filter((p) => p.estado === "completado");
  const proyectosActivos = proyectos.filter((p) => p.estado !== "completado").length;

  const vencimientos = [
    ...proyectos
      .filter((p) => p.estado !== "completado" && p.deadline)
      .map((p) => ({ id: "p" + p.id, titulo: p.nombre, sub: p.cliente_nombre, tipo: t("dashboard.tipoProyecto"), dias: getDiasRestantes(p.deadline) })),
    ...tareasUrgentes
      .filter((ta) => ta.deadline)
      .map((ta) => ({ id: "t" + ta.id, titulo: ta.titulo, sub: ta.proyecto_nombre, tipo: t("dashboard.tipoTarea"), dias: getDiasRestantes(ta.deadline) })),
  ].sort((a, b) => a.dias - b.dias).slice(0, 6);

  const maxHoras = Math.max(1, ...horasPorDia);
  const hayHoras = horasPorDia.some((h) => h > 0);
  const diasSemana = ultimos7Dias();

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">{t("dashboard.cargando")}</p></div>;
  }

  return (
    <div className="p-6 xl:p-8">
      <div className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-primary">{getSaludo(nombre)}</h1>
        <p className="text-sm font-medium text-muted mt-1">{formatearFechaHoy()}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">{t("dashboard.resumenPeriodo")}</h2>
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          {["dia", "semana", "mes", "año"].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={"text-xs px-2.5 py-1 rounded-md transition-colors font-medium " +
                (filtro === f ? "bg-accent text-onaccent" : "text-muted hover:text-primary")}
            >
              {f === "dia" ? "1D" : f === "semana" ? "7D" : f === "mes" ? "1M" : "1A"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <TarjetaKPI
          label={t("dashboard.ingresosCobrados")}
          valor={formatearMoneda(ingresosCobrados, moneda)}
          caption={t("dashboard.comprobantesCobrados", { count: facturasCobradas })}
          icono={IconoIngresos}
          iconoClase="bg-accent/10 border-accent/20 text-accent"
        />
        <TarjetaKPI
          label={t("dashboard.porCobrar")}
          valor={formatearMoneda(porCobrar, moneda)}
          caption={t("dashboard.comprobantesPendientes", { count: facturasPendientes })}
          icono={IconoPorCobrar}
          iconoClase="bg-coral/10 border-coral/20 text-coral"
        />
        <TarjetaKPI
          label={t("dashboard.horasRegistradas")}
          valor={formatHoras(horasMes)}
          caption={t("dashboard.enLoQueVaDelMes")}
          icono={IconoHoras}
          iconoClase="bg-violet/10 border-violet/20 text-violet"
        />
        <TarjetaKPI
          label={t("dashboard.proyectosActivos")}
          valor={String(proyectosActivos)}
          caption={t("dashboard.enProcesoCaption", { count: enProceso.length }) + " · " + t("dashboard.porIniciarCaption", { count: porIniciar.length })}
          icono={IconoProyectos}
          iconoClase="bg-[#5B8DEF]/10 border-[#5B8DEF]/20 text-[#5B8DEF]"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-8">
        <div className="xl:col-span-2 bg-canvas border border-edge rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-primary">{t("dashboard.proximosVencimientos")}</h3>
          <p className="text-xs font-medium text-muted mt-0.5 mb-4">{t("dashboard.proyectosYTareas")}</p>
          {vencimientos.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">{t("dashboard.nadaUrgente")}</p>
          ) : (
            <div className="space-y-1">
              {vencimientos.map((v) => {
                const etiqueta = etiquetaVencimiento(v.dias);
                return (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-surface transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: etiqueta.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary truncate">{v.titulo}</p>
                        <p className="text-xs text-muted truncate">{v.sub} · {v.tipo}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: etiqueta.color }}>{etiqueta.texto}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-canvas border border-edge rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-primary">{t("dashboard.horasPorDia")}</h3>
          <p className="text-xs font-medium text-muted mt-0.5 mb-4">{t("dashboard.ultimos7Dias")}</p>
          {!hayHoras ? (
            <p className="text-sm text-muted py-6 text-center">{t("dashboard.sinRegistrosSemana")}</p>
          ) : (
            <div className="h-32 flex items-end gap-2">
              {diasSemana.map((d, i) => {
                const horas = horasPorDia[i];
                const alto = Math.max(6, Math.round((horas / maxHoras) * 84));
                return (
                  <div key={d.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    {horas > 0 && <span className="text-[10px] font-medium text-muted2">{Math.round(horas / 60)}h</span>}
                    <div
                      className={"w-full rounded-md " + (d.esHoy ? "bg-accent" : "bg-accent/25")}
                      style={{ height: horas > 0 ? alto : 6 }}
                    />
                    <span className={"text-[10px] " + (d.esHoy ? "text-accent font-semibold" : "text-muted2")}>{d.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">{t("dashboard.proyectos")}</h2>
        <div className="flex gap-1 bg-canvas border border-edge rounded-lg p-0.5">
          <button
            onClick={() => setVista("lista")}
            className={"text-xs px-3 py-1 rounded-md transition-colors font-medium " +
              (vista === "lista" ? "bg-surface text-primary" : "text-muted hover:text-primary")}
          >
            {t("dashboard.lista")}
          </button>
          <button
            onClick={() => setVista("tarjetas")}
            className={"text-xs px-3 py-1 rounded-md transition-colors font-medium " +
              (vista === "tarjetas" ? "bg-surface text-primary" : "text-muted hover:text-primary")}
          >
            {t("dashboard.tarjetas")}
          </button>
        </div>
      </div>

      <div className={vista === "tarjetas" ? "grid grid-cols-1 xl:grid-cols-2 gap-4" : "space-y-4"}>

        {porIniciar.length > 0 && (
          <div className="bg-canvas rounded-2xl border border-edge overflow-hidden">
            <div className="px-5 py-3 border-b border-edge flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray"></div>
              <h3 className="text-primary font-medium text-sm">{t("dashboard.porIniciar")}</h3>
              <span className="text-muted text-xs ml-1">{porIniciar.length}</span>
            </div>
            {porIniciar.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-edge last:border-0 hover:bg-surface transition-colors">
                <div>
                  <p className="text-primary text-sm font-medium">{p.nombre}</p>
                  <p className="text-muted text-xs mt-0.5">{p.cliente_nombre}</p>
                </div>
              <p className="text-muted text-xs">{t("dashboard.entrega", { fecha: p.deadline })}</p>
              </div>
            ))}
          </div>
        )}

        {enProceso.length > 0 && (
          <div className="bg-canvas rounded-2xl border border-edge overflow-hidden">
            <div className="px-5 py-3 border-b border-edge flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent"></div>
              <h3 className="text-primary font-medium text-sm">{t("dashboard.enProceso")}</h3>
              <span className="text-muted text-xs ml-1">{enProceso.length}</span>
            </div>
            {enProceso.map((p) => {
              const pct = p.tareas > 0 ? Math.round((p.tareas_completadas / p.tareas) * 100) : 0;
              return (
                <div key={p.id} className="px-5 py-3 border-b border-edge last:border-0 hover:bg-surface transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary text-sm font-medium">{p.nombre}</p>
                      <p className="text-muted text-xs mt-0.5">{p.cliente_nombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted text-xs">{t("dashboard.entrega", { fecha: p.deadline })}</p>
                      <p className="text-accent text-xs mt-0.5">{t("dashboard.tareasConteo", { completadas: p.tareas_completadas, total: p.tareas, pct })}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 h-1 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: pct + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {finalizados.length > 0 && (
          <div className="bg-canvas rounded-2xl border border-edge overflow-hidden">
            <div className="px-5 py-3 border-b border-edge flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet"></div>
              <h3 className="text-primary font-medium text-sm">{t("dashboard.finalizados")}</h3>
              <span className="text-muted text-xs ml-1">{finalizados.length}</span>
            </div>
            {finalizados.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-edge last:border-0 hover:bg-surface transition-colors">
                <div>
                  <p className="text-primary text-sm font-medium">{p.nombre}</p>
                  <p className="text-muted text-xs mt-0.5">{p.cliente_nombre}</p>
                </div>
                <p className="text-violet text-xs font-medium">{t("dashboard.completado")}</p>
              </div>
            ))}
          </div>
        )}

        {proyectos.length === 0 && (
          <div className="text-center py-14 bg-canvas rounded-2xl border border-edge">
            <p className="text-muted text-sm">{t("dashboard.sinProyectos")}</p>
            <p className="text-muted text-xs mt-1">{t("dashboard.creaPrimerProyecto")}</p>
          </div>
        )}

      </div>
    </div>
  );
}

export default Dashboard;
