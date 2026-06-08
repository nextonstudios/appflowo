import { useState, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase } from "../lib/supabase";

interface Tarea {
  nombre: string;
  duracion: number;
}

interface Registro {
  id: string;
  descripcion: string;
  proyecto: string;
  proyecto_id: string;
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

function GatoEsperando() {
  return (
    <svg viewBox="0 0 120 120" width="100" height="100">
      <ellipse cx="60" cy="68" rx="28" ry="25" fill="#6B7280"/>
      <polygon points="38,48 44,32 50,48" fill="#6B7280"/>
      <polygon points="70,48 76,32 82,48" fill="#6B7280"/>
      <polygon points="40,48 44,36 48,48" fill="#F4C5D0"/>
      <polygon points="72,48 76,36 80,48" fill="#F4C5D0"/>
      <ellipse cx="52" cy="63" rx="5" ry="5" fill="#1A1F2E"/>
      <ellipse cx="68" cy="63" rx="5" ry="5" fill="#1A1F2E"/>
      <ellipse cx="53" cy="62" rx="2" ry="2" fill="white"/>
      <ellipse cx="69" cy="62" rx="2" ry="2" fill="white"/>
      <ellipse cx="60" cy="71" rx="4" ry="3" fill="#F4A0B0"/>
      <path d="M55 76 Q60 74 65 76" stroke="#1A1F2E" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <line x1="45" y1="70" x2="30" y2="67" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="45" y1="72" x2="30" y2="72" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="75" y1="70" x2="90" y2="67" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="75" y1="72" x2="90" y2="72" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function GatoTrabajando() {
  return (
    <svg viewBox="0 0 120 120" width="100" height="100">
      <ellipse cx="60" cy="68" rx="28" ry="25" fill="#7C5CBF"/>
      <polygon points="38,48 44,32 50,48" fill="#7C5CBF"/>
      <polygon points="70,48 76,32 82,48" fill="#7C5CBF"/>
      <polygon points="40,48 44,36 48,48" fill="#F4C5D0"/>
      <polygon points="72,48 76,36 80,48" fill="#F4C5D0"/>
      <ellipse cx="52" cy="62" rx="5" ry="6" fill="#1A1F2E"/>
      <ellipse cx="68" cy="62" rx="5" ry="6" fill="#1A1F2E"/>
      <ellipse cx="53" cy="61" rx="2" ry="2" fill="white"/>
      <ellipse cx="69" cy="61" rx="2" ry="2" fill="white"/>
      <ellipse cx="60" cy="70" rx="4" ry="3" fill="#F4A0B0"/>
      <line x1="45" y1="70" x2="30" y2="67" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="45" y1="72" x2="30" y2="72" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="75" y1="70" x2="90" y2="67" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="75" y1="72" x2="90" y2="72" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="30" y="85" width="60" height="8" rx="3" fill="#1DB8A0" opacity="0.3"/>
      <rect x="33" y="87" width="20" height="4" rx="2" fill="#1DB8A0"/>
      <rect x="33" y="87" width="8" height="4" rx="2" fill="white" opacity="0.5"/>
    </svg>
  );
}

function GatoDescansando() {
  return (
    <svg viewBox="0 0 120 120" width="100" height="100">
      <ellipse cx="60" cy="70" rx="28" ry="22" fill="#7C5CBF"/>
      <polygon points="38,52 44,36 50,52" fill="#7C5CBF"/>
      <polygon points="70,52 76,36 82,52" fill="#7C5CBF"/>
      <polygon points="40,52 44,40 48,52" fill="#F4C5D0"/>
      <polygon points="72,52 76,40 80,52" fill="#F4C5D0"/>
      <path d="M48 63 Q52 60 56 63" stroke="#1A1F2E" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M64 63 Q68 60 72 63" stroke="#1A1F2E" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <ellipse cx="60" cy="71" rx="4" ry="3" fill="#F4A0B0"/>
      <path d="M50 78 Q60 85 70 78" stroke="#1A1F2E" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <line x1="45" y1="70" x2="30" y2="67" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="45" y1="73" x2="30" y2="73" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="75" y1="70" x2="90" y2="67" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="75" y1="73" x2="90" y2="73" stroke="#1A1F2E" strokeWidth="1.2" strokeLinecap="round"/>
      <text x="50" y="45" fontSize="14" fill="#1DB8A0">z</text>
      <text x="62" y="38" fontSize="10" fill="#1DB8A0" opacity="0.7">z</text>
    </svg>
  );
}

function GatoDurmiendo() {
  return (
    <svg viewBox="0 0 140 100" width="130" height="100">
      <ellipse cx="70" cy="62" rx="42" ry="18" fill="#7C5CBF"/>
      <ellipse cx="35" cy="55" rx="18" ry="16" fill="#7C5CBF"/>
      <polygon points="25,44 29,32 33,44" fill="#7C5CBF"/>
      <polygon points="37,44 41,32 45,44" fill="#7C5CBF"/>
      <polygon points="26,44 29,35 32,44" fill="#F4C5D0"/>
      <polygon points="38,44 41,35 44,44" fill="#F4C5D0"/>
      <path d="M27 56 Q35 53 43 56" stroke="#1A1F2E" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="35" cy="61" rx="3" ry="2" fill="#F4A0B0"/>
      <line x1="22" y1="59" x2="12" y2="57" stroke="#1A1F2E" strokeWidth="1" strokeLinecap="round"/>
      <line x1="22" y1="62" x2="12" y2="62" stroke="#1A1F2E" strokeWidth="1" strokeLinecap="round"/>
      <path d="M55 65 Q90 55 115 65" stroke="#7C5CBF" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <circle cx="115" cy="65" r="6" fill="#7C5CBF"/>
      <text x="90" y="48" fontSize="16" fill="#1DB8A0">z</text>
      <text x="105" y="40" fontSize="12" fill="#1DB8A0" opacity="0.7">z</text>
      <text x="116" y="33" fontSize="9" fill="#1DB8A0" opacity="0.4">z</text>
    </svg>
  );
}

function Timer() {
  const [corriendo, setCorriendo] = useState(false);
  const [segundos, setSegundos] = useState(0);
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

  useEffect(() => {
    cargarDatos();
  }, []);

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
    const { data } = await supabase
      .from("tareas")
      .select("id, nombre")
      .eq("proyecto_id", pid)
      .eq("completada", false);
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
    let intervalo: number;
    if (corriendo) {
      intervalo = setInterval(() => {
        if (modo === "libre") {
          setSegundos((s) => s + 1);
        } else {
          setTiempoPomodoro((t) => {
            if (t <= 1) {
              setCorriendo(true);
              if (fasePomodoro === "trabajo") {
                const nuevosCiclos = ciclosPomodoro + 1;
                setCiclosPomodoro(nuevosCiclos);
                if (nuevosCiclos % 4 === 0) {
                  setFasePomodoro("descanso-largo");
                  return getTiempoDescansoLargo();
                } else {
                  setFasePomodoro("descanso");
                  return getTiempoDescanso();
                }
              } else {
                setFasePomodoro("trabajo");
                return getTiempoTrabajo();
              }
            }
            return t - 1;
          });
        }
      }, 1000);
    }
    return () => clearInterval(intervalo);
  }, [corriendo, modo, fasePomodoro, ciclosPomodoro, presetSeleccionado, usarCustom, trabajoCustom, descansoCustom]);

  function iniciarPomodoro() {
    if (!corriendo) {
      setTiempoPomodoro(getTiempoTrabajo());
      setFasePomodoro("trabajo");
    }
    setCorriendo(!corriendo);
  }

  function resetPomodoro() {
    setCorriendo(false);
    setFasePomodoro("trabajo");
    setTiempoPomodoro(getTiempoTrabajo());
    setCiclosPomodoro(0);
  }

  function cambiarPreset(index: number) {
    setPresetSeleccionado(index);
    setUsarCustom(false);
    setCorriendo(false);
    setFasePomodoro("trabajo");
    setTiempoPomodoro(tiemposPreset[index].trabajo * 60);
    setCiclosPomodoro(0);
  }

  function aplicarCustom() {
    if (!trabajoCustom || !descansoCustom) return;
    setUsarCustom(true);
    setCorriendo(false);
    setFasePomodoro("trabajo");
    setTiempoPomodoro(Number(trabajoCustom) * 60);
    setCiclosPomodoro(0);
  }

  async function guardarRegistro() {
    if (!proyectoId || !tareaId || segundos === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const tareaNombre = tareasProyecto.find((t) => t.id === tareaId)?.nombre || "";

    const { data, error } = await supabase.from("registros_tiempo").insert({
      user_id: user?.id,
      proyecto_id: proyectoId,
      descripcion: tareaNombre,
      duracion: segundos,
      fecha: new Date().toISOString().split("T")[0],
      manual: false,
    }).select().single();

    console.log("Guardado:", data, "Error:", error);

    if (data) {
      const proyectoNombre = proyectos.find((p) => p.id === proyectoId)?.nombre || "Sin proyecto";
      setRegistros([{
        id: data.id,
        descripcion: tareaNombre,
        proyecto: proyectoNombre,
        proyecto_id: proyectoId,
        duracion: segundos,
        fecha: data.fecha,
        manual: false,
        tareas: [],
        abierto: false,
      }, ...registros]);
    }

    setSegundos(0);
    setProyectoId("");
    setTareaId("");
    setTareasProyecto([]);
    setCorriendo(false);
  }

  async function guardarManual() {
    if (!manualDesc || !manualProyectoId || (!manualHoras && !manualMinutos)) return;
    const duracion = (Number(manualHoras) * 3600) + (Number(manualMinutos) * 60);
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.from("registros_tiempo").insert({
      user_id: user?.id,
      proyecto_id: manualProyectoId,
      descripcion: manualDesc,
      duracion,
      fecha: manualFecha,
      manual: true,
    }).select().single();

    console.log("Manual guardado:", data, "Error:", error);

    if (data) {
      const proyectoNombre = proyectos.find((p) => p.id === manualProyectoId)?.nombre || "Sin proyecto";
      setRegistros([{
        id: data.id,
        descripcion: manualDesc,
        proyecto: proyectoNombre,
        proyecto_id: manualProyectoId,
        duracion,
        fecha: manualFecha,
        manual: true,
        tareas: [],
        abierto: false,
      }, ...registros]);
    }

    setManualDesc("");
    setManualProyectoId("");
    setManualHoras("");
    setManualMinutos("");
    setMostrarManual(false);
  }

  function toggleRegistro(id: string) {
    setRegistros(registros.map((r) =>
      r.id === id ? { ...r, abierto: !r.abierto } : r
    ));
  }

  const hoy = new Date().toISOString().split("T")[0];
  const registrosFiltrados = registros.filter((r) =>
    filtroProyecto === "todos" || r.proyecto_id === filtroProyecto
  );
  const totalHoy = registros.filter((r) => r.fecha === hoy).reduce((acc, r) => acc + r.duracion, 0);
  const totalSemana = registros.reduce((acc, r) => acc + r.duracion, 0);

  const porProyecto = proyectos.map((p) => ({
    nombre: p.nombre,
    id: p.id,
    total: registros.filter((r) => r.proyecto_id === p.id).reduce((acc, r) => acc + r.duracion, 0),
  })).filter((p) => p.total > 0);

  const getGato = () => {
    if (modo === "libre") return null;
    if (!corriendo && ciclosPomodoro === 0) return <GatoEsperando />;
    if (fasePomodoro === "trabajo" && corriendo) return <GatoTrabajando />;
    if (fasePomodoro === "descanso") return <GatoDescansando />;
    if (fasePomodoro === "descanso-largo") return <GatoDurmiendo />;
    return <GatoEsperando />;
  };

  if (cargando) {
    return <div className="p-8"><p className="text-[#6B7280] text-sm">Cargando timer...</p></div>;
  }

  return (
    <div className="p-8">

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Time Tracker</h2>
        <p className="text-[#6B7280] mt-1">
          Hoy: {formatTiempoCorto(totalHoy)} · Esta semana: {formatTiempoCorto(totalSemana)}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setModo("libre"); setCorriendo(false); setSegundos(0); }}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (modo === "libre" ? "bg-[#1DB8A0] text-[#1A1F2E]" : "bg-[#141824] text-[#6B7280] border border-[#252B3B] hover:text-white")}
        >
          Timer libre
        </button>
        <button
          onClick={() => { setModo("pomodoro"); setCorriendo(false); resetPomodoro(); }}
          className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (modo === "pomodoro" ? "bg-[#7C5CBF] text-white" : "bg-[#141824] text-[#6B7280] border border-[#252B3B] hover:text-white")}
        >
          Pomodoro
        </button>
      </div>

      <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-8 mb-6">

        {modo === "pomodoro" && (
          <div className="flex flex-col items-center mb-4">
            <div className="mb-2">{getGato()}</div>
            <div className="flex items-center gap-3 mb-3">
              <span className={"text-sm font-medium px-3 py-1 rounded-full " + (fasePomodoro === "trabajo" ? "text-[#1DB8A0] bg-[#1DB8A0]/10" : "text-[#7C5CBF] bg-[#7C5CBF]/10")}>
                {fasePomodoro === "trabajo" ? "Tiempo de trabajo" : fasePomodoro === "descanso" ? "Descanso corto" : "Descanso largo"}
              </span>
              <span className="text-[#6B7280] text-xs">Ciclo {ciclosPomodoro + 1}</span>
            </div>
            <div className="flex gap-2 mb-3">
              {tiemposPreset.map((preset, index) => (
                <button key={index} onClick={() => cambiarPreset(index)}
                  className={"text-xs px-3 py-1.5 rounded-lg border transition-colors " + (!usarCustom && presetSeleccionado === index ? "border-[#7C5CBF] text-[#7C5CBF] bg-[#7C5CBF]/10" : "border-[#252B3B] text-[#6B7280] hover:text-white")}>
                  {preset.label} min
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-2">
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
            <p className="text-[#6B7280] text-xs text-center max-w-xs">
              El pomodoro te ayuda a llevar el control de tus pausas. El tiempo trabajado se registra con el Timer libre.
            </p>
          </div>
        )}

        <div className={"text-center font-bold text-white mb-6 font-mono " + (modo === "pomodoro" ? "text-5xl" : "text-6xl")}>
          {modo === "libre" ? formatTiempo(segundos) : formatTiempo(tiempoPomodoro)}
        </div>

        {modo === "libre" && (
          <div className="grid grid-cols-2 gap-4 mb-6 text-left">
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
                <option value="">Selecciona una tarea</option>
                {tareasProyecto.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={modo === "pomodoro" ? iniciarPomodoro : () => setCorriendo(!corriendo)}
            className={"px-8 py-3 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 " + (corriendo ? "bg-[#F47C5C] text-white" : modo === "pomodoro" ? "bg-[#7C5CBF] text-white" : "bg-[#1DB8A0] text-[#1A1F2E]")}
          >
            {corriendo ? "Pausar" : "Iniciar"}
          </button>
          {modo === "libre" && segundos > 0 && !corriendo && (
            <button onClick={guardarRegistro}
              className="px-8 py-3 rounded-lg font-medium text-sm bg-[#7C5CBF] text-white hover:opacity-90">
              Guardar
            </button>
          )}
          {modo === "libre" && segundos > 0 && (
            <button onClick={() => { setSegundos(0); setCorriendo(false); }}
              className="px-4 py-3 rounded-lg text-sm text-[#6B7280] hover:text-white">
              Resetear
            </button>
          )}
          {modo === "pomodoro" && (
            <button onClick={resetPomodoro}
              className="px-4 py-3 rounded-lg text-sm text-[#6B7280] hover:text-white">
              Reiniciar
            </button>
          )}
        </div>

        <div className="mt-6 border-t border-[#252B3B] pt-5">
          <p className="text-[#6B7280] text-xs text-center mb-3">
            La musica potencia el flow. Pon tu playlist favorita y deja que Flowo haga el resto
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
        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-5 mb-6">
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

        {registrosFiltrados.map((registro) => (
          <div key={registro.id} className="border-b border-[#252B3B] last:border-0">
            <div
              onClick={() => registro.tareas.length > 0 && toggleRegistro(registro.id)}
              className={"flex items-center justify-between px-5 py-4 " + (registro.tareas.length > 0 ? "cursor-pointer hover:bg-[#1A1F2E] transition-colors" : "")}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm">{registro.descripcion}</p>
                  {registro.manual && (
                    <span className="text-[#6B7280] text-xs bg-[#6B7280]/10 px-2 py-0.5 rounded-full">Manual</span>
                  )}
                </div>
                <p className="text-[#6B7280] text-xs mt-1">{registro.proyecto} · {registro.fecha}</p>
              </div>
              <span className="text-[#1DB8A0] font-mono text-sm">{formatTiempoCorto(registro.duracion)}</span>
            </div>
          </div>
        ))}

        {registrosFiltrados.length === 0 && !cargando && (
          <div className="text-center py-12">
            <p className="text-[#6B7280] text-sm">No hay registros aún. Inicia el timer para comenzar.</p>
          </div>
        )}
      </div>

    </div>
  );
}

export default Timer;