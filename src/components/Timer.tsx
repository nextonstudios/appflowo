import { useState, useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase } from "../lib/supabase";
import { sendNotification } from "@tauri-apps/plugin-notification";

interface Tarea {
  nombre: string;
  duracion: number;
}

interface Registro {
  id: string;
  descripcion: string;
  proyecto: string;
  proyecto_id: string;
  tarea_id: string;
  duracion: number;
  fecha: string;
  manual: boolean;
  tareas: Tarea[];
  abierto: boolean;
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
    "Tu próxima factura empieza aquí.",
  ],
  trabajo: [
    "El cliente no sabe lo que se viene.",
    "Modo beast activado.",
    "Cada minuto cuenta. Tú también.",
    "Los mejores freelancers no esperan inspiración.",
    "Factura en construcción.",
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
  const inicioPomodoroRef = useRef<number | null>(null);
  const tiempoPomodoroAcumuladoRef = useRef(25 * 60);

  useEffect(() => { faseRef.current = fasePomodoro; }, [fasePomodoro]);
  useEffect(() => { corriendoRef.current = corriendo; }, [corriendo]);
  useEffect(() => { ciclosRef.current = ciclosPomodoro; }, [ciclosPomodoro]);

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
      setTimeout(() => {
        setFrase(getFrase(faseRef.current, corriendoRef.current, ciclosRef.current));
        setFadeIn(true);
      }, 400);
    }, 8000);
    return () => clearInterval(intervalo);
  }, [modo]);

  useEffect(() => {
    setFadeIn(false);
    setTimeout(() => {
      setFrase(getFrase(fasePomodoro, corriendoPomodoro, ciclosPomodoro));
      setFadeIn(true);
    }, 400);
  }, [fasePomodoro, corriendoPomodoro]);

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
      tareas: [],
      abierto: false,
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

  useEffect(() => {
    if (!corriendoPomodoro) return;
    const intervalo = setInterval(() => {
      if (inicioPomodoroRef.current === null) return;
      const elapsed = Math.floor((Date.now() - inicioPomodoroRef.current) / 1000);
      const restante = tiempoPomodoroAcumuladoRef.current - elapsed;
      if (restante <= 0) {
        inicioPomodoroRef.current = Date.now();
        const fase = faseRef.current;
        if (fase === "trabajo") {
          const nuevosCiclos = ciclosRef.current + 1;
          setCiclosPomodoro(nuevosCiclos);
          if (nuevosCiclos % 4 === 0) {
            const t = getTiempoDescansoLargo();
            tiempoPomodoroAcumuladoRef.current = t;
            setTiempoPomodoro(t);
            setFasePomodoro("descanso-largo");
            sendNotification({ title: "¡Ciclo completado!", body: "4 ciclos seguidos. Tómate un descanso largo, lo mereces." });
          } else {
            const t = getTiempoDescanso();
            tiempoPomodoroAcumuladoRef.current = t;
            setTiempoPomodoro(t);
            setFasePomodoro("descanso");
            sendNotification({ title: "Tiempo de descanso", body: "Buen trabajo. Descansa un momento antes del siguiente ciclo." });
          }
        } else {
          const t = getTiempoTrabajo();
          tiempoPomodoroAcumuladoRef.current = t;
          setTiempoPomodoro(t);
          setFasePomodoro("trabajo");
          sendNotification({ title: "¡A trabajar!", body: "Descanso terminado. Siguiente ciclo, vamos." });
        }
      } else {
        setTiempoPomodoro(restante);
      }
    }, 500);
    return () => clearInterval(intervalo);
  }, [corriendoPomodoro, presetSeleccionado, usarCustom, trabajoCustom, descansoCustom]);

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

  function togglePomodoro() {
    if (!corriendoPomodoro) {
      if (ciclosPomodoro === 0) {
        const t = getTiempoTrabajo();
        setTiempoPomodoro(t);
        tiempoPomodoroAcumuladoRef.current = t;
        setFasePomodoro("trabajo");
      } else {
        tiempoPomodoroAcumuladoRef.current = tiempoPomodoro;
      }
      inicioPomodoroRef.current = Date.now();
    } else {
      tiempoPomodoroAcumuladoRef.current = tiempoPomodoro;
      inicioPomodoroRef.current = null;
    }
    setCorriendoPomodoro(!corriendoPomodoro);
  }

  function resetPomodoro() {
    setCorriendoPomodoro(false);
    setFasePomodoro("trabajo");
    const t = getTiempoTrabajo();
    setTiempoPomodoro(t);
    tiempoPomodoroAcumuladoRef.current = t;
    inicioPomodoroRef.current = null;
    setCiclosPomodoro(0);
  }

  function cambiarPreset(index: number) {
    setPresetSeleccionado(index);
    setUsarCustom(false);
    setCorriendoPomodoro(false);
    setFasePomodoro("trabajo");
    const t = tiemposPreset[index].trabajo * 60;
    setTiempoPomodoro(t);
    tiempoPomodoroAcumuladoRef.current = t;
    inicioPomodoroRef.current = null;
    setCiclosPomodoro(0);
  }

  function aplicarCustom() {
    if (!trabajoCustom || !descansoCustom) return;
    setUsarCustom(true);
    setCorriendoPomodoro(false);
    setFasePomodoro("trabajo");
    const t = Number(trabajoCustom) * 60;
    setTiempoPomodoro(t);
    tiempoPomodoroAcumuladoRef.current = t;
    inicioPomodoroRef.current = null;
    setCiclosPomodoro(0);
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
          tareas: [],
          abierto: false,
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
        tareas: [],
        abierto: false,
      }, ...prev]);
    }
    setManualDesc("");
    setManualProyectoId("");
    setManualHoras("");
    setManualMinutos("");
    setMostrarManual(false);
  }

  const hoy = new Date().toISOString().split("T")[0];
  const totalHoy = registros.filter((r) => r.fecha === hoy).reduce((acc, r) => acc + r.duracion, 0);
  const totalSemana = registros.reduce((acc, r) => acc + r.duracion, 0);

  const porProyecto = proyectos.map((p) => ({
    nombre: p.nombre,
    id: p.id,
    total: registros.filter((r) => r.proyecto_id === p.id).reduce((acc, r) => acc + r.duracion, 0),
  })).filter((p) => p.total > 0);

  const registrosFiltrados = registros.filter((r) =>
    filtroProyecto === "todos" || r.proyecto_id === filtroProyecto
  );

  // Agrupar por tarea_id (o descripcion para manuales)
  const registrosAgrupados = registrosFiltrados.reduce((acc, r) => {
    const key = r.tarea_id || (r.proyecto_id + "_" + r.descripcion);
    if (acc[key]) {
      acc[key] = { ...acc[key], duracion: acc[key].duracion + r.duracion };
    } else {
      acc[key] = { ...r };
    }
    return acc;
  }, {} as Record<string, Registro>);
  const registrosMostrados = Object.values(registrosAgrupados);

  if (cargando) {
    return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando timer...</p></div>;
  }

  return (
    <div className="p-8">

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Time Tracker</h2>
        <p className="text-[#6B7280] mt-1">
          Hoy: {formatTiempoCorto(totalHoy)} · Esta semana: {formatTiempoCorto(totalSemana)}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setModo("libre")}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (modo === "libre" ? "bg-[#1DB8A0] text-[#1A1F2E]" : "bg-[#141824] text-[#6B7280] border border-[#252B3B] hover:text-white")}
        >
          Timer libre {corriendo && modo !== "libre" && <span className="ml-1 w-2 h-2 rounded-full bg-[#1DB8A0] inline-block" />}
        </button>
        <button
          onClick={() => setModo("pomodoro")}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (modo === "pomodoro" ? "bg-[#7C5CBF] text-white" : "bg-[#141824] text-[#6B7280] border border-[#252B3B] hover:text-white")}
        >
          Pomodoro {corriendoPomodoro && modo !== "pomodoro" && <span className="ml-1 w-2 h-2 rounded-full bg-[#7C5CBF] inline-block" />}
        </button>
      </div>

      {modo === "libre" && (
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6 mb-4">
          <div className="mb-4">
            <h3 className="text-white font-medium">¿En qué estás trabajando?</h3>
            <p className="text-[#6B7280] text-xs mt-1">
              Selecciona el proyecto y la tarea antes de iniciar. Al guardar, el tiempo queda registrado y acumulado automáticamente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Proyecto</label>
              <select value={proyectoId} onChange={(e) => { setProyectoId(e.target.value); cargarTareasProyecto(e.target.value); }}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]">
                <option value="">Selecciona un proyecto</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[#6B7280] text-xs mb-1 block">Tarea</label>
              <select value={tareaId} onChange={(e) => setTareaId(e.target.value)}
                disabled={!proyectoId}
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0] disabled:opacity-50">
                <option value="">{proyectoId ? "Selecciona una tarea" : "Primero elige un proyecto"}</option>
                {tareasProyecto.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          {proyectoId && tareasProyecto.length === 0 && (
            <p className="text-[#6B7280] text-xs mt-3">Este proyecto no tiene tareas. Agrégalas desde la sección Tareas.</p>
          )}
        </div>
      )}

      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-8 mb-4">

        {modo === "pomodoro" && (
          <div className="flex flex-col items-center mb-6">
            <p
              className="text-sm text-center mb-5 font-medium transition-opacity duration-400"
              style={{ opacity: fadeIn ? 1 : 0, color: fasePomodoro === "trabajo" ? "#1DB8A0" : "#7C5CBF" }}
            >
              "{frase}"
            </p>
            <div className="flex items-center gap-3 mb-4">
              <span className={"text-sm font-medium px-3 py-1 rounded-full " + (fasePomodoro === "trabajo" ? "text-[#1DB8A0] bg-[#1DB8A0]/10" : "text-[#7C5CBF] bg-[#7C5CBF]/10")}>
                {fasePomodoro === "trabajo" ? "Tiempo de trabajo" : fasePomodoro === "descanso" ? "Descanso corto" : "Descanso largo"}
              </span>
              <span className="text-[#6B7280] text-xs">Ciclo {ciclosPomodoro + 1}</span>
            </div>
            <div className="flex gap-2 mb-4">
              {tiemposPreset.map((preset, index) => (
                <button key={index} onClick={() => cambiarPreset(index)}
                  className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (!usarCustom && presetSeleccionado === index ? "border-[#7C5CBF] text-[#7C5CBF] bg-[#7C5CBF]/10" : "border-[#252B3B] text-[#6B7280] hover:text-white")}>
                  {preset.label} min
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input value={trabajoCustom} onChange={(e) => setTrabajoCustom(e.target.value)}
                placeholder="Trabajo (min)" type="number"
                className={"w-28 bg-[#1A1F2E] border rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none " + (usarCustom ? "border-[#7C5CBF]" : "border-[#252B3B] focus:border-[#7C5CBF]")} />
              <span className="text-[#6B7280] text-xs">/</span>
              <input value={descansoCustom} onChange={(e) => setDescansoCustom(e.target.value)}
                placeholder="Descanso (min)" type="number"
                className={"w-28 bg-[#1A1F2E] border rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none " + (usarCustom ? "border-[#7C5CBF]" : "border-[#252B3B] focus:border-[#7C5CBF]")} />
              <button onClick={aplicarCustom}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#7C5CBF]/20 text-[#7C5CBF] hover:bg-[#7C5CBF]/30">
                Aplicar
              </button>
            </div>
          </div>
        )}

        <div className={"text-center font-bold text-white font-mono " + (modo === "pomodoro" ? "text-6xl mb-6" : "text-7xl mb-8")}>
          {modo === "libre" ? formatTiempo(segundos) : formatTiempo(tiempoPomodoro)}
        </div>

        <div className="flex items-center justify-center gap-3">
          {modo === "libre" ? (
            <>
              <button
                onClick={toggleTimerLibre}
                className={"px-8 py-3 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 " + (corriendo ? "bg-[#F47C5C] text-white" : "bg-[#1DB8A0] text-[#1A1F2E]")}
              >
                {corriendo ? "Pausar" : "Iniciar"}
              </button>
              {segundos > 0 && !corriendo && (
                <button onClick={guardarRegistro}
                  className="px-8 py-3 rounded-lg font-medium text-sm bg-[#7C5CBF] text-white hover:opacity-90">
                  Guardar
                </button>
              )}
              {segundos > 0 && (
                <button onClick={() => { setSegundos(0); setCorriendo(false); segundosAcumuladosRef.current = 0; inicioLibreRef.current = null; }}
                  className="px-4 py-3 rounded-lg text-sm text-[#6B7280] hover:text-white">
                  Resetear
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={togglePomodoro}
                className={"px-8 py-3 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 " + (corriendoPomodoro ? "bg-[#F47C5C] text-white" : "bg-[#7C5CBF] text-white")}
              >
                {corriendoPomodoro ? "Pausar" : "Iniciar"}
              </button>
              <button onClick={resetPomodoro}
                className="px-4 py-3 rounded-lg text-sm text-[#6B7280] hover:text-white">
                Reiniciar
              </button>
            </>
          )}
        </div>

        {modo === "pomodoro" && (
          <div className="mt-6 border-t border-[#252B3B] pt-4">
            <p className="text-[#6B7280] text-xs text-center">
              <span className="text-white font-medium">¿Cómo funciona?</span> — Bloques de trabajo concentrado con pausas programadas. Para registrar tiempo en un proyecto usa el <span className="text-[#1DB8A0]">Timer libre</span>.
            </p>
          </div>
        )}

        <div className="mt-6 border-t border-[#252B3B] pt-5">
          <p className="text-[#6B7280] text-xs text-center mb-3">
            La música potencia el flow. Pon tu playlist favorita y deja que Flowo haga el resto
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={() => openUrl("https://open.spotify.com")}
              className="bg-[#1A1F2E] border border-[#252B3B] text-[#6B7280] text-xs px-4 py-2 rounded-lg hover:text-white hover:border-[#1DB8A0] transition-colors">
              Abrir Spotify
            </button>
            <button onClick={() => openUrl("https://music.youtube.com")}
              className="bg-[#1A1F2E] border border-[#252B3B] text-[#6B7280] text-xs px-4 py-2 rounded-lg hover:text-white hover:border-[#F47C5C] transition-colors">
              Abrir YouTube Music
            </button>
          </div>
        </div>
      </div>

      {porProyecto.length > 0 && (
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-4">
          <h3 className="text-white font-medium mb-3">Horas por proyecto</h3>
          <div className="space-y-2">
            {porProyecto.map((p) => {
              const porcentaje = Math.round((p.total / totalSemana) * 100);
              return (
                <div key={p.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#6B7280]">{p.nombre}</span>
                    <span className="text-white">{formatTiempoCorto(p.total)}</span>
                  </div>
                  <div className="w-full bg-[#1A1F2E] rounded-full h-1.5">
                    <div className="bg-[#1DB8A0] h-1.5 rounded-full" style={{ width: porcentaje + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-[#141824] rounded-xl border border-[#252B3B]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#252B3B]">
          <h3 className="text-white font-medium">Registros</h3>
          <div className="flex items-center gap-3">
            <select value={filtroProyecto} onChange={(e) => setFiltroProyecto(e.target.value)}
              className="bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#1DB8A0]">
              <option value="todos">Todos los proyectos</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button onClick={() => setMostrarManual(!mostrarManual)}
              className="text-[#1DB8A0] text-xs border border-[#1DB8A0]/30 px-3 py-1.5 rounded-lg hover:bg-[#1DB8A0]/10">
              + Registrar manual
            </button>
          </div>
        </div>

        {mostrarManual && (
          <div className="px-5 py-4 border-b border-[#252B3B] bg-[#1A1F2E]">
            <p className="text-white text-sm font-medium mb-3">Registro manual</p>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Descripcion</label>
                <input value={manualDesc} onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="Que hiciste"
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
              </div>
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Proyecto</label>
                <select value={manualProyectoId} onChange={(e) => setManualProyectoId(e.target.value)}
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0]">
                  <option value="">Selecciona</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Duracion</label>
                <div className="flex gap-2">
                  <input value={manualHoras} onChange={(e) => setManualHoras(e.target.value)}
                    placeholder="0h" type="number"
                    className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                  <input value={manualMinutos} onChange={(e) => setManualMinutos(e.target.value)}
                    placeholder="0m" type="number"
                    className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
                </div>
              </div>
              <div>
                <label className="text-[#6B7280] text-xs mb-1 block">Fecha</label>
                <input value={manualFecha} onChange={(e) => setManualFecha(e.target.value)}
                  type="date"
                  className="w-full bg-[#141824] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#1DB8A0]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={guardarManual}
                className="bg-[#1DB8A0] text-[#1A1F2E] font-medium px-4 py-1.5 rounded-lg text-xs hover:opacity-90">
                Guardar registro
              </button>
              <button onClick={() => setMostrarManual(false)}
                className="text-[#6B7280] px-4 py-1.5 rounded-lg text-xs hover:text-white">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {registrosMostrados.map((registro) => (
          <div key={registro.tarea_id || (registro.proyecto_id + "_" + registro.descripcion)} className="border-b border-[#252B3B] last:border-0">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm">{registro.descripcion}</p>
                  {registro.manual && (
                    <span className="text-[#6B7280] text-xs bg-[#6B7280]/10 px-2 py-0.5 rounded-full">Manual</span>
                  )}
                </div>
                <p className="text-[#6B7280] text-xs mt-1">{registro.proyecto}</p>
              </div>
              <span className="text-[#1DB8A0] font-mono text-sm font-medium">{formatTiempoCorto(registro.duracion)}</span>
            </div>
          </div>
        ))}

        {registrosMostrados.length === 0 && !cargando && (
          <div className="text-center py-12">
            <p className="text-[#6B7280] text-sm">No hay registros aún. Inicia el timer para comenzar.</p>
          </div>
        )}
      </div>

    </div>
  );
}

export default Timer;