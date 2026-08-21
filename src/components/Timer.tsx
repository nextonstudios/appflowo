import { useState, useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase } from "../lib/supabase";
import Select from "./Select";
import { sendNotification } from "@tauri-apps/plugin-notification";

interface Registro {
  id: string;
  descripcion: string;
  proyecto: string;
  proyecto_id: string;
  tarea_id: string;
  duracion: number;
  fecha: string;
  manual: boolean;
}

interface GrupoRegistro extends Registro {
  fechas: { fecha: string; duracion: number }[];
}

interface ProyectoOpcion {
  id: string;
  nombre: string;
}

interface TareaOpcion {
  id: string;
  nombre: string;
}

const tiemposPreset = [
  { label: "25 / 5", trabajo: 25, descanso: 5, descansoLargo: 15 },
  { label: "50 / 10", trabajo: 50, descanso: 10, descansoLargo: 30 },
  { label: "90 / 20", trabajo: 90, descanso: 20, descansoLargo: 45 },
];

const frasesPomodoro = {
  esperando: [
    "Listo cuando tú lo seas.",
    "El flow no se fuerza, se activa.",
    "Un ciclo a la vez.",
    "Tu próximo comprobante empieza aquí.",
  ],
  trabajo: [
    "El cliente no sabe lo que se viene.",
    "Modo beast activado.",
    "Cada minuto cuenta. Tú también.",
    "Los mejores freelancers no esperan inspiración.",
    "Comprobante en construcción.",
    "Sin distracciones. Solo tú y el trabajo.",
    "Este ciclo te acerca al cierre.",
  ],
  descanso: [
    "Mereces este break.",
    "El cerebro también necesita aire.",
    "Pausa táctica. Vuelves mejor.",
    "Respira. Ya ganaste este descanso.",
    "Levanta la vista. Tómate el break.",
  ],
  "descanso-largo": [
    "Eso fue épico. Recarga bien.",
    "4 ciclos completados. Eres una máquina.",
    "Levántate, camina, respira.",
    "Monstruo. Ahora descansa de verdad.",
    "El trabajo puede esperar 15 minutos. Tú no.",
  ],
};

function getFrase(fase: string, corriendo: boolean, ciclos: number): string {
  const pool = (!corriendo && ciclos === 0)
    ? frasesPomodoro.esperando
    : frasesPomodoro[fase as keyof typeof frasesPomodoro] || frasesPomodoro.trabajo;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatTiempo(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function formatTiempoCorto(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
  return m + "m";
}

function formatFecha(fecha: string) {
  const hoy = new Date().toISOString().split("T")[0];
  const ayer = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (fecha === hoy) return "Hoy";
  if (fecha === ayer) return "Ayer";
  const [y, m, d] = fecha.split("-");
  return d + "/" + m + "/" + y;
}

function Timer({ activo }: { activo: boolean }) {
  const [corriendo, setCorriendo] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [corriendoPomodoro, setCorriendoPomodoro] = useState(false);
  const [proyectoId, setProyectoId] = useState("");
  const [tareaId, setTareaId] = useState("");
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [tareasProyecto, setTareasProyecto] = useState<TareaOpcion[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<"libre" | "pomodoro">("libre");
  const [fasePomodoro, setFasePomodoro] = useState<"trabajo" | "descanso" | "descanso-largo">("trabajo");
  const [ciclosPomodoro, setCiclosPomodoro] = useState(0);
  const [presetSeleccionado, setPresetSeleccionado] = useState(0);
  const [trabajoCustom, setTrabajoCustom] = useState("");
  const [descansoCustom, setDescansoCustom] = useState("");
  const [usarCustom, setUsarCustom] = useState(false);
  const [tiempoPomodoro, setTiempoPomodoro] = useState(25 * 60);
  const [filtroProyecto, setFiltroProyecto] = useState("todos");
  const [registroAbierto, setRegistroAbierto] = useState<string | null>(null);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [manualProyectoId, setManualProyectoId] = useState("");
  const [manualHoras, setManualHoras] = useState("");
  const [manualMinutos, setManualMinutos] = useState("");
  const [manualFecha, setManualFecha] = useState(new Date().toISOString().split("T")[0]);
  const [frase, setFrase] = useState(getFrase("trabajo", false, 0));
  const [fadeIn, setFadeIn] = useState(true);

  const faseRef = useRef(fasePomodoro);
  const corriendoRef = useRef(corriendo);
  const ciclosRef = useRef(ciclosPomodoro);
  const inicioLibreRef = useRef<number | null>(null);
  const segundosAcumuladosRef = useRef(0);
  const restanteRef = useRef(25 * 60);
  const inicioPomodoroRef = useRef<number | null>(null);
  const avanzarFaseRef = useRef<() => void>(() => {});
  const fraseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { faseRef.current = fasePomodoro; }, [fasePomodoro]);
  useEffect(() => { corriendoRef.current = corriendo; }, [corriendo]);
  useEffect(() => { ciclosRef.current = ciclosPomodoro; }, [ciclosPomodoro]);
  useEffect(() => { avanzarFaseRef.current = avanzarFase; });

  useEffect(() => { cargarDatos(); }, []);

  useEffect(() => {
    if (!activo) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("proyectos").select("id, nombre").eq("user_id", user.id)
        .then(({ data }) => { if (data) setProyectos(data); });
    });
  }, [activo]);

  useEffect(() => {
    if (modo !== "pomodoro") return;
    const intervalo = setInterval(() => {
      setFadeIn(false);
      const tid = setTimeout(() => {
        setFrase(getFrase(faseRef.current, corriendoRef.current, ciclosRef.current));
        setFadeIn(true);
      }, 400);
      fraseTimeoutRef.current = tid;
    }, 8000);
    return () => { clearInterval(intervalo); if (fraseTimeoutRef.current) clearTimeout(fraseTimeoutRef.current); };
  }, [modo]);

  useEffect(() => {
    if (modo !== "pomodoro") return;
    setFadeIn(false);
    const tid = setTimeout(() => {
      setFrase(getFrase(fasePomodoro, corriendoRef.current, ciclosRef.current));
      setFadeIn(true);
    }, 400);
    return () => clearTimeout(tid);
  }, [modo, fasePomodoro]);

  async function cargarDatos() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: proyectosData }, { data: registrosData }] = await Promise.all([
      supabase.from("proyectos").select("id, nombre").eq("user_id", user?.id),
      supabase.from("registros_tiempo").select("*").eq("user_id", user?.id).order("created_at", { ascending: false }),
    ]);
    const proyectosLista = proyectosData || [];
    setProyectos(proyectosLista);
    const proyectosMap = Object.fromEntries(proyectosLista.map((p: ProyectoOpcion) => [p.id, p.nombre]));
    setRegistros((registrosData || []).map((r: any) => ({
      id: r.id,
      descripcion: r.descripcion,
      proyecto: proyectosMap[r.proyecto_id] || "Sin proyecto",
      proyecto_id: r.proyecto_id,
      tarea_id: r.tarea_id || "",
      duracion: r.duracion,
      fecha: r.fecha,
      manual: r.manual || false,
    })));
    setCargando(false);
  }

  async function cargarTareasProyecto(pid: string) {
    if (!pid) { setTareasProyecto([]); setTareaId(""); return; }
    const { data } = await supabase.from("tareas").select("id, nombre").eq("proyecto_id", pid);
    setTareasProyecto(data || []);
    setTareaId("");
  }

  const getTiempoTrabajo = () => {
    if (usarCustom && trabajoCustom) return Number(trabajoCustom) * 60;
    return tiemposPreset[presetSeleccionado].trabajo * 60;
  };
  const getTiempoDescanso = () => {
    if (usarCustom && descansoCustom) return Number(descansoCustom) * 60;
    return tiemposPreset[presetSeleccionado].descanso * 60;
  };
  const getTiempoDescansoLargo = () => {
    if (usarCustom) return getTiempoDescanso() * 3;
    return tiemposPreset[presetSeleccionado].descansoLargo * 60;
  };

  useEffect(() => {
    if (!corriendo) return;
    const intervalo = setInterval(() => {
      if (inicioLibreRef.current !== null) {
        const elapsed = Math.floor((Date.now() - inicioLibreRef.current) / 1000);
        setSegundos(segundosAcumuladosRef.current + elapsed);
      }
    }, 500);
    return () => clearInterval(intervalo);
  }, [corriendo]);

  function avanzarFase() {
    inicioPomodoroRef.current = Date.now();
    if (faseRef.current === "trabajo") {
      const nuevosCiclos = ciclosRef.current + 1;
      ciclosRef.current = nuevosCiclos;
      setCiclosPomodoro(nuevosCiclos);
      if (nuevosCiclos % 4 === 0) {
        const t = getTiempoDescansoLargo();
        restanteRef.current = t;
        setTiempoPomodoro(t);
        setFasePomodoro("descanso-largo");
        sendNotification({ title: "¡Ciclo completado!", body: "4 ciclos seguidos. Tómate un descanso largo, lo mereces." });
      } else {
        const t = getTiempoDescanso();
        restanteRef.current = t;
        setTiempoPomodoro(t);
        setFasePomodoro("descanso");
        sendNotification({ title: "Tiempo de descanso", body: "Buen trabajo. Descansa un momento antes del siguiente ciclo." });
      }
    } else {
      const t = getTiempoTrabajo();
      restanteRef.current = t;
      setTiempoPomodoro(t);
      setFasePomodoro("trabajo");
      sendNotification({ title: "¡A trabajar!", body: "Descanso terminado. Siguiente ciclo, vamos." });
    }
  }

  useEffect(() => {
    if (!corriendoPomodoro) return;
    const intervalo = setInterval(() => {
      if (inicioPomodoroRef.current === null) return;
      const elapsed = Math.floor((Date.now() - inicioPomodoroRef.current) / 1000);
      const restante = restanteRef.current - elapsed;
      if (restante <= 0) {
        avanzarFaseRef.current();
      } else {
        setTiempoPomodoro(restante);
      }
    }, 500);
    return () => clearInterval(intervalo);
  }, [corriendoPomodoro]);

  function toggleTimerLibre() {
    if (!corriendo) {
      inicioLibreRef.current = Date.now();
      segundosAcumuladosRef.current = segundos;
    } else {
      segundosAcumuladosRef.current = segundos;
      inicioLibreRef.current = null;
    }
    setCorriendo(!corriendo);
  }

  function duracionFaseActual() {
    if (fasePomodoro === "descanso-largo") return getTiempoDescansoLargo();
    if (fasePomodoro === "descanso") return getTiempoDescanso();
    return getTiempoTrabajo();
  }

  function togglePomodoro() {
    if (corriendoPomodoro) {
      restanteRef.current = tiempoPomodoro;
      inicioPomodoroRef.current = null;
    } else {
      if (restanteRef.current <= 0) {
        const t = duracionFaseActual();
        restanteRef.current = t;
        setTiempoPomodoro(t);
      }
      inicioPomodoroRef.current = Date.now();
    }
    setCorriendoPomodoro(!corriendoPomodoro);
  }

  function saltarFase() {
    avanzarFaseRef.current();
  }

  function resetPomodoro() {
    setCorriendoPomodoro(false);
    inicioPomodoroRef.current = null;
    setFasePomodoro("trabajo");
    faseRef.current = "trabajo";
    const t = getTiempoTrabajo();
    setTiempoPomodoro(t);
    restanteRef.current = t;
    setCiclosPomodoro(0);
    ciclosRef.current = 0;
  }

  function cambiarPreset(index: number) {
    setPresetSeleccionado(index);
    setUsarCustom(false);
    setCorriendoPomodoro(false);
    inicioPomodoroRef.current = null;
    setFasePomodoro("trabajo");
    faseRef.current = "trabajo";
    const t = tiemposPreset[index].trabajo * 60;
    setTiempoPomodoro(t);
    restanteRef.current = t;
    setCiclosPomodoro(0);
    ciclosRef.current = 0;
  }

  function aplicarCustom() {
    if (!trabajoCustom || !descansoCustom) return;
    setUsarCustom(true);
    setCorriendoPomodoro(false);
    inicioPomodoroRef.current = null;
    setFasePomodoro("trabajo");
    faseRef.current = "trabajo";
    const t = Number(trabajoCustom) * 60;
    setTiempoPomodoro(t);
    restanteRef.current = t;
    setCiclosPomodoro(0);
    ciclosRef.current = 0;
  }

  async function guardarRegistro() {
    if (!proyectoId || !tareaId || segundos === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const tareaNombre = tareasProyecto.find((t) => t.id === tareaId)?.nombre || "";

    // Buscar por tarea_id — único e inmutable, no falla por fecha ni descripción
    const { data: existente } = await supabase
      .from("registros_tiempo")
      .select("id, duracion")
      .eq("user_id", user?.id)
      .eq("tarea_id", tareaId)
      .maybeSingle();

    if (existente) {
      const nuevaDuracion = existente.duracion + segundos;
      await supabase
        .from("registros_tiempo")
        .update({ duracion: nuevaDuracion })
        .eq("id", existente.id);

      setRegistros(prev => prev.map((r) =>
        r.id === existente.id ? { ...r, duracion: nuevaDuracion } : r
      ));
    } else {
      const hoyStr = new Date().toISOString().split("T")[0];
      const { data: inserted } = await supabase
        .from("registros_tiempo")
        .insert({
          user_id: user?.id,
          proyecto_id: proyectoId,
          tarea_id: tareaId,
          descripcion: tareaNombre,
          duracion: segundos,
          fecha: hoyStr,
          manual: false,
        })
        .select()
        .single();

      if (inserted) {
        const proyectoNombre = proyectos.find((p) => p.id === proyectoId)?.nombre || "Sin proyecto";
        setRegistros(prev => [{
          id: inserted.id,
          descripcion: tareaNombre,
          proyecto: proyectoNombre,
          proyecto_id: proyectoId,
          tarea_id: tareaId,
          duracion: segundos,
          fecha: inserted.fecha,
          manual: false,
        }, ...prev]);
      }
    }

    setSegundos(0);
    segundosAcumuladosRef.current = 0;
    inicioLibreRef.current = null;
    setProyectoId("");
    setTareaId("");
    setTareasProyecto([]);
    setCorriendo(false);
  }

  async function guardarManual() {
    if (!manualDesc || !manualProyectoId || (!manualHoras && !manualMinutos)) return;
    const duracion = (Number(manualHoras) * 3600) + (Number(manualMinutos) * 60);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from("registros_tiempo").insert({
      user_id: user?.id,
      proyecto_id: manualProyectoId,
      descripcion: manualDesc,
      duracion,
      fecha: manualFecha,
      manual: true,
    }).select().single();
    if (data) {
      const proyectoNombre = proyectos.find((p) => p.id === manualProyectoId)?.nombre || "Sin proyecto";
      setRegistros(prev => [{
        id: data.id,
        descripcion: manualDesc,
        proyecto: proyectoNombre,
        proyecto_id: manualProyectoId,
        tarea_id: "",
        duracion,
        fecha: manualFecha,
        manual: true,
      }, ...prev]);
    }
    setManualDesc("");
    setManualProyectoId("");
    setManualHoras("");
    setManualMinutos("");
    setMostrarManual(false);
  }

  const hoy = new Date().toISOString().split("T")[0];
  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - ((inicioSemana.getDay() + 6) % 7));
  inicioSemana.setHours(0, 0, 0, 0);
  const inicioSemanaStr = inicioSemana.toISOString().split("T")[0];
  const totalHoy = registros.filter((r) => r.fecha === hoy).reduce((acc, r) => acc + r.duracion, 0);
  const totalSemana = registros.filter((r) => r.fecha >= inicioSemanaStr).reduce((acc, r) => acc + r.duracion, 0);
  const totalGeneral = registros.reduce((acc, r) => acc + r.duracion, 0);

  const porProyecto = proyectos.map((p) => ({
    nombre: p.nombre,
    id: p.id,
    total: registros.filter((r) => r.proyecto_id === p.id).reduce((acc, r) => acc + r.duracion, 0),
  })).filter((p) => p.total > 0);

  const registrosFiltrados = registros.filter((r) =>
    filtroProyecto === "todos" || r.proyecto_id === filtroProyecto
  );

  // Agrupar: tareas por tarea_id (acumulado), manuales de forma individual
  const registrosGrupos = registrosFiltrados.reduce((acc, r) => {
    const key = r.tarea_id || r.id;
    if (acc[key]) {
      acc[key].duracion += r.duracion;
      const fecha = acc[key].fechas.find((f) => f.fecha === r.fecha);
      if (fecha) fecha.duracion += r.duracion;
      else acc[key].fechas.push({ fecha: r.fecha, duracion: r.duracion });
    } else {
      acc[key] = { ...r, fechas: [{ fecha: r.fecha, duracion: r.duracion }] };
    }
    return acc;
  }, {} as Record<string, GrupoRegistro>);
  const registrosMostrados = Object.values(registrosGrupos).sort((a, b) => {
    const fa = a.fechas.reduce((max, f) => f.fecha > max ? f.fecha : max, a.fechas[0]?.fecha || "");
    const fb = b.fechas.reduce((max, f) => f.fecha > max ? f.fecha : max, b.fechas[0]?.fecha || "");
    return fb.localeCompare(fa);
  });

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">Cargando timer...</p></div>;
  }

  return (
    <div className="p-8">

      <div className="mb-6">
        <h2 className="text-[26px] font-semibold tracking-tight text-primary">Time Tracker</h2>
        <p className="text-muted mt-1">
          Hoy: {formatTiempoCorto(totalHoy)} · Esta semana: {formatTiempoCorto(totalSemana)}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setModo("libre")}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (modo === "libre" ? "bg-accent text-onaccent" : "bg-canvas text-muted border border-edge hover:text-primary")}
        >
          Timer libre {corriendo && modo !== "libre" && <span className="ml-1 w-2 h-2 rounded-full bg-accent inline-block" />}
        </button>
        <button
          onClick={() => setModo("pomodoro")}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (modo === "pomodoro" ? "bg-violet text-white" : "bg-canvas text-muted border border-edge hover:text-primary")}
        >
          Pomodoro {corriendoPomodoro && modo !== "pomodoro" && <span className="ml-1 w-2 h-2 rounded-full bg-violet inline-block" />}
        </button>
      </div>

      {modo === "libre" && (
        <div className="bg-canvas border border-edge rounded-xl p-6 mb-4">
          <div className="mb-4">
            <h3 className="text-primary font-medium">¿En qué estás trabajando?</h3>
            <p className="text-muted text-xs mt-1">
              Selecciona el proyecto y la tarea antes de iniciar. Al guardar, el tiempo queda registrado y acumulado automáticamente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-muted text-xs mb-1 block">Proyecto</label>
              <Select value={proyectoId} onChange={(v) => { setProyectoId(v); cargarTareasProyecto(v); }}
                options={[
                  { value: "", label: "Selecciona un proyecto" },
                  ...proyectos.map((p) => ({ value: p.id, label: p.nombre })),
                ]} />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">Tarea</label>
              <Select value={tareaId} onChange={setTareaId}
                disabled={!proyectoId}
                placeholder={proyectoId ? "Selecciona una tarea" : "Primero elige un proyecto"}
                options={tareasProyecto.map((t) => ({ value: t.id, label: t.nombre }))} />
            </div>
          </div>
          {proyectoId && tareasProyecto.length === 0 && (
            <p className="text-muted text-xs mt-3">Este proyecto no tiene tareas. Agrégalas desde la sección Tareas.</p>
          )}
        </div>
      )}

      {modo === "pomodoro" && (
        <div className="bg-canvas border border-edge rounded-xl p-6 mb-4">
          <div className="mb-4">
            <h3 className="text-primary font-medium">¿En qué estás trabajando?</h3>
            <p className="text-muted text-xs mt-1">
              Solo es visual. El pomodoro no registra tiempo — usa el Timer libre para eso.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-muted text-xs mb-1 block">Proyecto</label>
              <Select value={proyectoId} onChange={(v) => { setProyectoId(v); cargarTareasProyecto(v); }}
                options={[
                  { value: "", label: "Selecciona un proyecto" },
                  ...proyectos.map((p) => ({ value: p.id, label: p.nombre })),
                ]} />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">Tarea</label>
              <Select value={tareaId} onChange={setTareaId}
                disabled={!proyectoId}
                placeholder={proyectoId ? "Selecciona una tarea" : "Primero elige un proyecto"}
                options={tareasProyecto.map((t) => ({ value: t.id, label: t.nombre }))} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-canvas border border-edge rounded-xl p-8 mb-4">

        {modo === "pomodoro" && (
          <div className="flex flex-col items-center mb-6">
            <p
              className="text-sm text-center mb-5 font-medium transition-opacity duration-400"
              style={{ opacity: fadeIn ? 1 : 0, color: fasePomodoro === "trabajo" ? "#1DB8A0" : "#7C5CBF" }}
            >
              "{frase}"
            </p>
            <div className="flex items-center gap-3 mb-4">
              <span className={"text-sm font-medium px-3 py-1 rounded-full " + (fasePomodoro === "trabajo" ? "text-accent bg-accent/10" : "text-violet bg-violet/10")}>
                {fasePomodoro === "trabajo" ? "Tiempo de trabajo" : fasePomodoro === "descanso" ? "Descanso corto" : "Descanso largo"}
              </span>
            </div>
            <div className="flex gap-1.5 mb-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i}
                  className={"w-2 h-2 rounded-full transition-colors " + (i < ciclosPomodoro % 4 || (ciclosPomodoro % 4 === 0 && ciclosPomodoro > 0 && fasePomodoro === "descanso-largo") ? "bg-violet" : "bg-surface border border-edge")} />
              ))}
            </div>
            <div className="flex gap-2 mb-4">
              {tiemposPreset.map((preset, index) => (
                <button key={index} onClick={() => cambiarPreset(index)}
                  className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (!usarCustom && presetSeleccionado === index ? "border-violet text-violet bg-violet/10" : "border-edge text-muted hover:text-primary")}>
                  {preset.label} min
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input value={trabajoCustom} onChange={(e) => setTrabajoCustom(e.target.value)}
                placeholder="Trabajo (min)" type="number" disabled={corriendoPomodoro}
                className={"w-28 bg-surface border rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none disabled:opacity-50 " + (usarCustom ? "border-violet" : "border-edge focus:border-violet")} />
              <span className="text-muted text-xs">/</span>
              <input value={descansoCustom} onChange={(e) => setDescansoCustom(e.target.value)}
                placeholder="Descanso (min)" type="number" disabled={corriendoPomodoro}
                className={"w-28 bg-surface border rounded-lg px-3 py-1.5 text-primary text-xs focus:outline-none disabled:opacity-50 " + (usarCustom ? "border-violet" : "border-edge focus:border-violet")} />
              <button onClick={aplicarCustom} disabled={corriendoPomodoro}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet/20 text-violet hover:bg-violet/30 disabled:opacity-50 disabled:cursor-not-allowed">
                Aplicar
              </button>
            </div>
          </div>
        )}

        {modo === "libre" ? (
          <div className="flex justify-center mb-8">
            <div className="relative" style={{ width: 200, height: 200 }}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-edge)" strokeWidth="3" />
                <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-accent)" strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 90}`}
                  strokeDashoffset={`${2 * Math.PI * 90 * (1 - (segundos % 60) / 60)}`}
                  className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold text-primary font-mono">{formatTiempo(segundos)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className={"text-center font-bold text-primary font-mono " + (modo === "pomodoro" ? "text-6xl mb-4" : "text-7xl mb-8")}>
            {formatTiempo(tiempoPomodoro)}
          </div>
        )}

        {modo === "pomodoro" && (
          <div className="w-full max-w-xs mx-auto bg-surface rounded-full h-1.5 mb-6 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-violet transition-all duration-500"
              style={{ width: Math.min(100, Math.max(0, ((duracionFaseActual() - tiempoPomodoro) / duracionFaseActual()) * 100)) + "%" }}
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {modo === "libre" ? (
            <>
              <button
                onClick={toggleTimerLibre}
                className={"px-8 py-3 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 " + (corriendo ? "bg-coral text-white" : "bg-accent text-onaccent")}
              >
                {corriendo ? "Pausar" : "Iniciar"}
              </button>
              {segundos > 0 && !corriendo && (
                <button onClick={guardarRegistro}
                  className="px-8 py-3 rounded-lg font-medium text-sm bg-violet text-white hover:opacity-90">
                  Guardar
                </button>
              )}
              {segundos > 0 && (
                <button onClick={() => { setSegundos(0); setCorriendo(false); segundosAcumuladosRef.current = 0; inicioLibreRef.current = null; }}
                  className="px-4 py-3 rounded-lg text-sm text-muted hover:text-primary">
                  Resetear
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={togglePomodoro}
                className={"px-8 py-3 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 " + (corriendoPomodoro ? "bg-coral text-white" : "bg-violet text-white")}
              >
                {corriendoPomodoro ? "Pausar" : "Iniciar"}
              </button>
              <button onClick={resetPomodoro}
                className="px-4 py-3 rounded-lg text-sm text-muted hover:text-primary">
                Reiniciar
              </button>
              <button onClick={saltarFase}
                className="px-4 py-3 rounded-lg text-sm text-muted hover:text-primary">
                Saltar fase
              </button>
            </>
          )}
        </div>

        {modo === "pomodoro" && (
          <div className="mt-6 border-t border-edge pt-4">
            <p className="text-muted text-xs text-center">
              <span className="text-primary font-medium">¿Cómo funciona?</span> — Bloques de trabajo concentrado con pausas programadas. Para registrar tiempo en un proyecto usa el <span className="text-accent">Timer libre</span>.
            </p>
          </div>
        )}

        <div className="mt-6 border-t border-edge pt-5">
          <p className="text-muted text-xs text-center mb-3">
            La música potencia el flow. Pon tu playlist favorita y deja que Flowo haga el resto
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={() => openUrl("https://open.spotify.com")}
              className="bg-surface border border-edge text-muted text-xs px-4 py-2 rounded-lg hover:text-primary hover:border-accent transition-colors">
              Abrir Spotify
            </button>
            <button onClick={() => openUrl("https://music.youtube.com")}
              className="bg-surface border border-edge text-muted text-xs px-4 py-2 rounded-lg hover:text-primary hover:border-coral transition-colors">
              Abrir YouTube Music
            </button>
          </div>
        </div>
      </div>

      {porProyecto.length > 0 && (
        <div className="bg-canvas border border-edge rounded-xl p-5 mb-4">
          <h3 className="text-primary font-medium mb-3">Horas por proyecto</h3>
          <div className="space-y-2">
            {porProyecto.map((p) => {
              const porcentaje = Math.round((p.total / totalGeneral) * 100);
              return (
                <div key={p.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">{p.nombre}</span>
                    <span className="text-primary">{formatTiempoCorto(p.total)}</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-1.5">
                    <div className="bg-accent h-1.5 rounded-full" style={{ width: porcentaje + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-canvas rounded-xl border border-edge">
        <div className="flex items-center justify-between px-5 py-3 border-b border-edge">
          <div className="flex items-center gap-2">
            <h3 className="text-primary font-medium">Registros</h3>
            <span className="text-muted text-xs bg-gray/10 px-2 py-0.5 rounded-full">{registrosMostrados.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <Select value={filtroProyecto} onChange={setFiltroProyecto} align="end"
              triggerClassName="bg-surface border border-edge rounded-lg px-2 py-1 text-primary text-xs focus:outline-none focus:border-accent flex items-center gap-2"
              options={[
                { value: "todos", label: "Todos los proyectos" },
                ...proyectos.map((p) => ({ value: p.id, label: p.nombre })),
              ]} />
            <button onClick={() => setMostrarManual(!mostrarManual)}
              className="text-accent text-xs border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10">
              + Registrar manual
            </button>
          </div>
        </div>

        {mostrarManual && (
          <div className="px-5 py-4 border-b border-edge bg-surface">
            <p className="text-primary text-sm font-medium mb-3">Registro manual</p>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Descripcion</label>
                <input value={manualDesc} onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="Que hiciste"
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Proyecto</label>
                <Select value={manualProyectoId} onChange={setManualProyectoId}
                  options={[
                    { value: "", label: "Selecciona" },
                    ...proyectos.map((p) => ({ value: p.id, label: p.nombre })),
                  ]} />
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Duracion</label>
                <div className="flex gap-2">
                  <input value={manualHoras} onChange={(e) => setManualHoras(e.target.value)}
                    placeholder="0h" type="number"
                    className="w-full bg-canvas border border-edge rounded-lg px-2 py-2 text-primary text-xs focus:outline-none focus:border-accent" />
                  <input value={manualMinutos} onChange={(e) => setManualMinutos(e.target.value)}
                    placeholder="0m" type="number"
                    className="w-full bg-canvas border border-edge rounded-lg px-2 py-2 text-primary text-xs focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Fecha</label>
                <input value={manualFecha} onChange={(e) => setManualFecha(e.target.value)}
                  type="date"
                  className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-xs focus:outline-none focus:border-accent" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={guardarManual}
                className="bg-accent text-onaccent font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
                Guardar registro
              </button>
              <button onClick={() => setMostrarManual(false)}
                className="text-muted px-4 py-1.5 rounded-lg text-xs hover:text-primary">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {registrosMostrados.map((registro) => {
          const key = registro.tarea_id || registro.id;
          const abierto = registroAbierto === key;
          return (
            <div key={key} className="border-b border-edge last:border-0">
              <button onClick={() => setRegistroAbierto(abierto ? null : key)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface/40 transition-colors">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-primary text-sm truncate">{registro.descripcion}</p>
                    {registro.manual && (
                      <span className="text-muted text-xs bg-gray/10 px-2 py-0.5 rounded-full">Manual</span>
                    )}
                    {registro.fechas.length > 1 && (
                      <span className="text-muted text-xs bg-accent/10 px-2 py-0.5 rounded-full">{registro.fechas.length} fechas</span>
                    )}
                  </div>
                  <p className="text-muted text-xs mt-1">{registro.proyecto}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-accent font-mono text-sm font-medium">{formatTiempoCorto(registro.duracion)}</span>
                  <svg className={"w-4 h-4 text-muted transition-transform " + (abierto ? "rotate-180" : "")}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {abierto && (
                <div className="px-5 pb-4">
                  <div className="bg-surface border border-edge rounded-lg divide-y divide-edge">
                    {registro.fechas.map((f) => (
                      <div key={f.fecha} className="flex items-center justify-between px-3 py-2">
                        <span className="text-muted text-xs">{formatFecha(f.fecha)}</span>
                        <span className="text-primary font-mono text-xs">{formatTiempoCorto(f.duracion)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {registrosMostrados.length === 0 && !cargando && (
          <div className="text-center py-12">
            <p className="text-muted text-sm">
              {registros.length === 0
                ? "No hay registros aún. Inicia el timer para comenzar."
                : "No hay registros para este proyecto. Cambia el filtro o registra tiempo."}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

export default Timer;