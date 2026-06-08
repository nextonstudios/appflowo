import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

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

function getSaludo(nombre: string) {
  const hora = new Date().getHours();
  if (hora >= 6 && hora < 12) return "Buenos días, " + nombre;
  if (hora >= 12 && hora < 18) return "Buenas tardes, " + nombre;
  return "Buenas noches, " + nombre;
}

function getDiasRestantes(deadline: string) {
  if (!deadline) return 999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(deadline);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function formatHoras(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h === 0) return m + "m";
  return h + "h " + String(m).padStart(2, "0") + "m";
}

function Dashboard() {
  const [filtro, setFiltro] = useState("mes");
  const [vista, setVista] = useState<"lista" | "tarjetas">("lista");
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("Freelancer");
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [tareasUrgentes, setTareasUrgentes] = useState<TareaUrgente[]>([]);
  const [ingresosCobrados, setIngresosCobrados] = useState(0);
  const [porCobrar, setPorCobrar] = useState(0);
  const [facturasPendientes, setFacturasPendientes] = useState(0);
  const [facturasCobradas, setFacturasCobradas] = useState(0);
  const [horasMes, setHorasMes] = useState(0);

  useEffect(() => {
    cargarDatos();
  }, [filtro]);

  async function cargarDatos() {
    setCargando(true);
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
        cliente_nombre: clientesMap[p.cliente_id] || "Sin cliente",
        deadline: p.deadline || "",
        tareas: p.tareas_total || 0,
        tareas_completadas: p.tareas_completadas || 0,
        estado: p.estado,
      };
    });
    setProyectos(proyectosMapeados);

    const tareasUrgentesMapeadas = (tareasData || [])
      .filter((t: any) => t.deadline && getDiasRestantes(t.deadline) <= 3)
      .map((t: any) => ({
        id: t.id,
        titulo: t.nombre,
        proyecto_nombre: proyectosMap[t.proyecto_id] || "Sin proyecto",
        deadline: t.deadline,
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

    setCargando(false);
  }

  const porIniciar = proyectos.filter((p) => p.tareas_completadas === 0 && p.estado !== "completado");
  const enProceso = proyectos.filter((p) => p.tareas_completadas > 0 && p.tareas_completadas < p.tareas && p.estado !== "completado");
  const finalizados = proyectos.filter((p) => p.estado === "completado");
  const urgentes = proyectos.filter((p) => getDiasRestantes(p.deadline) <= 3 && getDiasRestantes(p.deadline) >= 0 && p.estado !== "completado");

  if (cargando) {
    return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando dashboard...</p></div>;
  }

  return (
    <div className="p-8">

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">{getSaludo(nombre)} 👋</h2>
        <p className="text-[#6B7280] mt-1">Aqui esta el resumen de tu negocio</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-2">
        <div className="bg-[#141824] rounded-xl p-5 border border-[#252B3B]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[#6B7280] text-sm">Ingresos cobrados</p>
            <div className="flex gap-1">
              {["dia", "semana", "mes", "año"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={"text-xs px-2 py-0.5 rounded " + (filtro === f ? "bg-[#1DB8A0] text-[#1A1F2E] font-medium" : "text-[#6B7280] hover:text-white")}
                >
                  {f === "dia" ? "1D" : f === "semana" ? "7D" : f === "mes" ? "1M" : "1A"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-3xl font-bold text-white">${ingresosCobrados.toLocaleString()}</p>
          <p className="text-[#1DB8A0] text-xs mt-1">{facturasCobradas} facturas cobradas</p>
        </div>
        <div className="bg-[#141824] rounded-xl p-5 border border-[#252B3B]">
          <p className="text-[#6B7280] text-sm mb-3">Por cobrar</p>
          <p className="text-3xl font-bold text-white">${porCobrar.toLocaleString()}</p>
          <p className="text-[#F47C5C] text-xs mt-1">{facturasPendientes} facturas pendientes</p>
        </div>
        <div className="bg-[#141824] rounded-xl p-5 border border-[#252B3B]">
          <p className="text-[#6B7280] text-sm mb-3">Horas este mes</p>
          <p className="text-3xl font-bold text-white">{formatHoras(horasMes)}</p>
          <p className="text-[#7C5CBF] text-xs mt-1">{proyectos.filter((p) => p.estado !== "completado").length} proyectos activos</p>
        </div>
      </div>

      {(urgentes.length > 0 || tareasUrgentes.length > 0) && (
        <div className="bg-[#F47C5C]/10 border border-[#F47C5C]/30 rounded-xl p-5 mb-6 mt-6">
          <h3 className="text-[#F47C5C] font-medium mb-3">Urgente — vence en 3 dias o menos</h3>
          <div className="space-y-2">
            {urgentes.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm">{p.nombre}</p>
                  <p className="text-[#6B7280] text-xs">{p.cliente_nombre} · Proyecto</p>
                </div>
                <span className="text-[#F47C5C] text-xs font-medium">
                  {getDiasRestantes(p.deadline) === 0 ? "Hoy" : getDiasRestantes(p.deadline) + " dias"}
                </span>
              </div>
            ))}
            {tareasUrgentes.map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm">{t.titulo}</p>
                  <p className="text-[#6B7280] text-xs">{t.proyecto_nombre} · Tarea</p>
                </div>
                <span className="text-[#F47C5C] text-xs font-medium">
                  {getDiasRestantes(t.deadline) === 0 ? "Hoy" : getDiasRestantes(t.deadline) + " dias"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">Proyectos</h3>
          <div className="flex gap-1 bg-[#141824] border border-[#252B3B] rounded-lg p-1">
            <button
              onClick={() => setVista("lista")}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (vista === "lista" ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}
            >
              Lista
            </button>
            <button
              onClick={() => setVista("tarjetas")}
              className={"text-xs px-3 py-1.5 rounded-md transition-colors " + (vista === "tarjetas" ? "bg-[#1A1F2E] text-white" : "text-[#6B7280] hover:text-white")}
            >
              Tarjetas
            </button>
          </div>
        </div>
        <div className={vista === "tarjetas" ? "grid grid-cols-2 gap-4" : "space-y-4"}>

          {porIniciar.length > 0 && (
            <div className="bg-[#141824] rounded-xl border border-[#252B3B]">
              <div className="px-5 py-3 border-b border-[#252B3B] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#6B7280]"></div>
                <h3 className="text-white font-medium text-sm">Por iniciar</h3>
                <span className="text-[#6B7280] text-xs ml-1">{porIniciar.length}</span>
              </div>
              {porIniciar.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-[#252B3B] last:border-0 hover:bg-[#1A1F2E] transition-colors cursor-pointer">
                  <div>
                    <p className="text-white text-sm">{p.nombre}</p>
                    <p className="text-[#6B7280] text-xs mt-0.5">{p.cliente_nombre}</p>
                  </div>
                  <p className="text-[#6B7280] text-xs">Entrega: {p.deadline}</p>
                </div>
              ))}
            </div>
          )}

          {enProceso.length > 0 && (
            <div className="bg-[#141824] rounded-xl border border-[#252B3B]">
              <div className="px-5 py-3 border-b border-[#252B3B] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#1DB8A0]"></div>
                <h3 className="text-white font-medium text-sm">En proceso</h3>
                <span className="text-[#6B7280] text-xs ml-1">{enProceso.length}</span>
              </div>
              {enProceso.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-[#252B3B] last:border-0 hover:bg-[#1A1F2E] transition-colors cursor-pointer">
                  <div>
                    <p className="text-white text-sm">{p.nombre}</p>
                    <p className="text-[#6B7280] text-xs mt-0.5">{p.cliente_nombre}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#6B7280] text-xs">Entrega: {p.deadline}</p>
                    <p className="text-[#1DB8A0] text-xs mt-0.5">{p.tareas_completadas}/{p.tareas} tareas</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {finalizados.length > 0 && (
            <div className="bg-[#141824] rounded-xl border border-[#252B3B]">
              <div className="px-5 py-3 border-b border-[#252B3B] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#7C5CBF]"></div>
                <h3 className="text-white font-medium text-sm">Finalizados</h3>
                <span className="text-[#6B7280] text-xs ml-1">{finalizados.length}</span>
              </div>
              {finalizados.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-[#252B3B] last:border-0 hover:bg-[#1A1F2E] transition-colors cursor-pointer">
                  <div>
                    <p className="text-white text-sm">{p.nombre}</p>
                    <p className="text-[#6B7280] text-xs mt-0.5">{p.cliente_nombre}</p>
                  </div>
                  <p className="text-[#7C5CBF] text-xs">Completado</p>
                </div>
              ))}
            </div>
          )}

          {proyectos.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[#6B7280]">No tienes proyectos todavía.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default Dashboard;