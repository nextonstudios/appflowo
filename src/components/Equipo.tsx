import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Select from "./Select";
import ModalInvitarMiembro from "./ModalInvitarMiembro";
import { supabase } from "../lib/supabase";
import {
  type Equipo,
  type MiembroEquipo,
  type InvitacionCreada,
  type RolEquipo,
  miembrosDeEquipo,
  cambiarRolMiembro,
  eliminarMiembro,
  salirDelEquipo,
  invitacionesPendientes,
  revocarInvitacion,
  enlaceDeInvitacion,
  guardarAjustesEquipo,
  eliminarEquipo,
} from "../lib/equipo";

interface FilaActividad {
  user_id: string;
  nombre: string;
  email: string;
  rol: string;
  horas_registradas: number;
  horas_reales: number | null;
  score_promedio: number;
  alertas_total: number;
  alertas_sin_responder: number;
  pausas_automaticas: number;
}

interface AlertaActividadReciente {
  id: string;
  user_id: string;
  nombre: string;
  enviada_en: string;
  respondida_en: string | null;
  respuesta: string | null;
  pausada_automaticamente: boolean;
}

const ROLES: RolEquipo[] = ["admin", "miembro", "viewer"];

interface Props {
  equipo: Equipo;
  miRol: string | null;
  userId: string | null;
  tabInicial?: "miembros" | "ajustes";
  onVolver: () => void;
  onSalio: () => void;
}

function colorAvatar(id: string): string {
  const colores = ["#7C5CBF", "#3B82F6", "#F59E0B", "#EC4899", "#1DB8A0"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return colores[hash % colores.length];
}

function iniciales(nombre: string): string {
  const partes = (nombre || "?").trim().split(/\s+/);
  const primera = partes[0]?.charAt(0) || "?";
  const segunda = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (primera + segunda).toUpperCase();
}

function Equipo({ equipo, miRol, userId, tabInicial = "miembros", onVolver, onSalio }: Props) {
  const { t } = useTranslation();
  const esAdmin = miRol === "admin";

  const [tab, setTab] = useState<"miembros" | "ajustes" | "actividad">(tabInicial);
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [pendientes, setPendientes] = useState<InvitacionCreada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarInvitar, setMostrarInvitar] = useState(false);

  // Actividad (anti-fraude, solo admins)
  const [diasActividad, setDiasActividad] = useState(7);
  const [actividad, setActividad] = useState<FilaActividad[]>([]);
  const [alertasRecientes, setAlertasRecientes] = useState<AlertaActividadReciente[]>([]);

  // Ajustes
  const [nombre, setNombre] = useState(equipo.nombre);
  const [moneda, setMoneda] = useState(equipo.moneda);
  const [region, setRegion] = useState(equipo.plan_region || "latam");
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setMiembros(await miembrosDeEquipo(equipo.id));
    setPendientes(esAdmin ? await invitacionesPendientes(equipo.id) : []);
    setCargando(false);
  }, [equipo.id, esAdmin]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const cargarActividad = useCallback(async (dias: number) => {
    const [{ data: filas }, { data: alertas }] = await Promise.all([
      supabase.rpc("_actividad_equipo", { p_equipo_id: equipo.id, p_dias: dias }),
      supabase.rpc("_alertas_recientes_equipo", { p_equipo_id: equipo.id, p_limite: 15 }),
    ]);
    setActividad(filas || []);
    setAlertasRecientes(alertas || []);
  }, [equipo.id]);

  useEffect(() => {
    if (tab === "actividad") void cargarActividad(diasActividad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function alInvitar() {
    setMostrarInvitar(false);
    await cargarDatos();
  }

  async function cambiarRol(m: MiembroEquipo, rol: RolEquipo) {
    await cambiarRolMiembro(m.user_id, rol, equipo.id);
    await cargarDatos();
  }

  async function quitar(m: MiembroEquipo) {
    await eliminarMiembro(m.user_id, equipo.id);
    await cargarDatos();
  }

  async function revocar(inv: InvitacionCreada) {
    await revocarInvitacion(inv.id);
    await cargarDatos();
  }

  async function copiarEnlace(inv: InvitacionCreada) {
    try { await navigator.clipboard.writeText(enlaceDeInvitacion(inv.token)); } catch { /* noop */ }
  }

  async function guardarAjustes() {
    setGuardando(true);
    await guardarAjustesEquipo(equipo.id, {
      nombre: nombre.trim() || equipo.nombre,
      moneda,
      plan_region: region,
    });
    setGuardando(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
    onVolver(); // recarga el estado global y regresa
  }

  async function salir() {
    await salirDelEquipo(equipo.id);
    onSalio();
  }

  async function borrarEquipo() {
    await eliminarEquipo(equipo.id);
    onSalio();
  }

  return (
    <div className="p-8">
      {/* Volver */}
      <button onClick={onVolver}
        className="flex items-center gap-2 text-muted hover:text-primary transition-colors text-sm mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Flowo Teams
      </button>

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-violet/15 text-violet flex items-center justify-center text-xl font-semibold flex-shrink-0">
            {(equipo.nombre || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-primary">{equipo.nombre}</h1>
            <p className="text-sm font-medium text-muted mt-0.5">
              <span className="capitalize">{t("equipos.plan." + equipo.plan)}</span>
              {" · "}
              {t("equipos.miembrosConteo", { count: miembros.length, max: equipo.max_miembros })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {esAdmin && (
            <button onClick={() => setMostrarInvitar(true)}
              className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
              + {t("equipos.invitar.titulo")}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-edge rounded-lg p-1 w-fit mb-6">
        {(["miembros", ...(esAdmin ? ["actividad" as const] : []), "ajustes"] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={"px-4 py-1.5 rounded-md text-sm font-medium transition-colors " +
              (tab === tb ? "bg-canvas text-primary shadow-sm" : "text-muted hover:text-primary")}>
            {t("equipos.tab." + tb)}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-muted text-sm">{t("equipos.cargando")}</p>
      ) : tab === "miembros" ? (
        <>
          {/* Lista de miembros */}
          <div className="space-y-2">
            {miembros.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between bg-canvas border border-edge rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold"
                    style={{ background: colorAvatar(m.user_id) }}>
                    {iniciales(m.nombre)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-primary text-sm font-medium truncate">
                      {m.nombre}
                      {m.user_id === userId && <span className="text-muted font-normal"> ({t("equipos.tu")})</span>}
                      {m.user_id === equipo.owner_id && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-violet bg-violet/10 px-1.5 py-0.5 rounded-full font-medium">
                          {t("equipos.owner")}
                        </span>
                      )}
                    </p>
                    <p className="text-muted text-xs truncate">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {esAdmin && m.user_id !== equipo.owner_id ? (
                    <>
                      <div className="w-36">
                        <Select value={m.rol} onChange={(v) => void cambiarRol(m, v as RolEquipo)}
                          options={ROLES.map((r) => ({ value: r, label: t("equipos.roles." + r) }))} />
                      </div>
                      <button onClick={() => void quitar(m)} title={t("equipos.quitar")}
                        className="p-2 text-muted hover:text-coral transition-colors rounded-lg hover:bg-coral/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <span className={"text-xs px-2 py-1 rounded-full font-medium " +
                      (m.user_id === equipo.owner_id ? "bg-violet/10 text-violet" : "bg-surface text-muted")}>
                      {t("equipos.roles." + m.rol)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Invitaciones pendientes (solo admin) */}
          {esAdmin && pendientes.length > 0 && (
            <div className="mt-8">
              <h3 className="text-muted text-xs uppercase tracking-wide font-medium mb-3">{t("equipos.invitacionesEnviadas")}</h3>
              <div className="space-y-2">
                {pendientes.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between bg-surface border border-edge border-dashed rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-primary text-sm truncate">{inv.email}</p>
                      <p className="text-muted2 text-xs">
                        {t("equipos.roles." + inv.rol)} ·{" "}
                        {t("equipos.expira")} {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      <button onClick={() => void copiarEnlace(inv)} title={t("equipos.invitar.copiarEnlace")}
                        className="p-2 text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                      </button>
                      <button onClick={() => void revocar(inv)} title={t("equipos.revocar")}
                        className="p-2 text-muted hover:text-coral transition-colors rounded-lg hover:bg-coral/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Salir del equipo (no owner) */}
          {!esAdmin && (
            <div className="mt-8 pt-6 border-t border-edge">
              {confirmandoSalir ? (
                <div className="flex items-center gap-3">
                  <p className="text-muted text-sm">{t("equipos.confirmarSalir")}</p>
                  <button onClick={() => void salir()}
                    className="bg-coral text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
                    {t("comunes.confirmar")}
                  </button>
                  <button onClick={() => setConfirmandoSalir(false)}
                    className="text-muted text-sm border border-edge px-4 py-2 rounded-lg hover:bg-surface">
                    {t("comunes.cancelar")}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmandoSalir(true)}
                  className="text-coral text-sm border border-edge px-4 py-2 rounded-lg hover:border-coral/40 transition-colors">
                  {t("equipos.salir")}
                </button>
              )}
            </div>
          )}
        </>
      ) : tab === "actividad" && esAdmin ? (
        /* Tab Actividad (solo admins) */
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-muted text-sm">{t("equipos.actividad.desc")}</p>
            <div className="flex gap-1 bg-surface border border-edge rounded-lg p-1">
              {[7, 30].map((d) => (
                <button key={d} onClick={() => { setDiasActividad(d); void cargarActividad(d); }}
                  className={"px-3 py-1 rounded-md text-xs font-medium transition-colors " +
                    (diasActividad === d ? "bg-canvas text-primary shadow-sm" : "text-muted hover:text-primary")}>
                  {t("equipos.actividad.ultimos", { count: d })}
                </button>
              ))}
            </div>
          </div>

          {/* Resumen por miembro */}
          <div className="bg-canvas border border-edge rounded-xl overflow-hidden mb-6">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-3 border-b border-edge bg-surface/50">
              <span className="text-muted text-xs uppercase tracking-wide font-medium">{t("equipos.actividad.miembro")}</span>
              <span className="text-muted text-xs uppercase tracking-wide font-medium text-right">{t("equipos.actividad.registradas")}</span>
              <span className="text-muted text-xs uppercase tracking-wide font-medium text-right">{t("equipos.actividad.reales")}</span>
              <span className="text-muted text-xs uppercase tracking-wide font-medium text-center">{t("equipos.actividad.score")}</span>
              <span className="text-muted text-xs uppercase tracking-wide font-medium text-right">{t("equipos.actividad.alertasCol")}</span>
            </div>
            {actividad.map((f) => {
              const score = f.score_promedio ?? 0;
              const reales = f.horas_reales;
              const discrepancia = reales !== null && reales > 0 && reales < f.horas_registradas * 0.7;
              return (
                <div key={f.user_id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 items-center px-5 py-3 border-b border-edge last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold"
                      style={{ background: colorAvatar(f.user_id) }}>
                      {iniciales(f.nombre)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-primary text-sm truncate">{f.nombre}</p>
                      <p className="text-muted text-xs truncate">{t("equipos.roles." + f.rol)}</p>
                    </div>
                  </div>
                  <span className="text-primary text-sm text-right font-mono">{f.horas_registradas.toFixed(1)}h</span>
                  <span className={"text-sm text-right font-mono " + (discrepancia ? "text-coral" : "text-primary")}>
                    {reales !== null ? reales.toFixed(1) + "h" : "—"}
                  </span>
                  <div className="flex justify-center">
                    <span className={"text-xs font-medium px-2 py-0.5 rounded-full " +
                      (score >= 70 ? "text-accent bg-accent/10" : score >= 40 ? "text-violet bg-violet/10" : score > 0 ? "text-coral bg-coral/10" : "text-muted bg-gray/10")}>
                      {score}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-primary text-sm">{f.alertas_total}</span>
                    {(f.alertas_sin_responder > 0 || f.pausas_automaticas > 0) && (
                      <p className="text-xs mt-0.5">
                        {f.alertas_sin_responder > 0 && (
                          <span className="text-coral">{t("equipos.actividad.sinResponder", { count: f.alertas_sin_responder })}{" "}</span>
                        )}
                        {f.pausas_automaticas > 0 && (
                          <span className="text-violet">{t("equipos.actividad.pausas", { count: f.pausas_automaticas })}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {actividad.length === 0 && (
              <p className="text-muted text-sm px-5 py-8 text-center">{t("equipos.actividad.vacio")}</p>
            )}
          </div>

          {/* Últimas alertas */}
          <h3 className="text-muted text-xs uppercase tracking-wide font-medium mb-3">{t("equipos.actividad.alertasRecientes")}</h3>
          <div className="space-y-2">
            {alertasRecientes.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-canvas border border-edge rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold"
                    style={{ background: colorAvatar(a.user_id) }}>
                    {iniciales(a.nombre)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-primary text-sm truncate">{a.nombre}</p>
                    <p className="text-muted text-xs">
                      {new Date(a.enviada_en).toLocaleString()} · {t("timer.alertaTitulo")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {a.pausada_automaticamente ? (
                    <span className="text-xs px-2 py-1 rounded-full font-medium text-coral bg-coral/10">
                      {t("equipos.actividad.autoPausada")}
                    </span>
                  ) : a.respuesta === "si" ? (
                    <span className="text-xs px-2 py-1 rounded-full font-medium text-accent bg-accent/10">
                      {t("equipos.actividad.respondioSi")}
                    </span>
                  ) : a.respuesta === "no" ? (
                    <span className="text-xs px-2 py-1 rounded-full font-medium text-violet bg-violet/10">
                      {t("equipos.actividad.respondioNo")}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full font-medium text-muted bg-gray/10">
                      {t("equipos.actividad.sinRespuesta")}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {alertasRecientes.length === 0 && (
              <p className="text-muted text-sm py-6 text-center">{t("equipos.actividad.sinAlertas")}</p>
            )}
          </div>
        </div>
      ) : (
        /* Tab Ajustes */
        <div className="max-w-lg space-y-6">
          <div>
            <label className="text-muted text-xs mb-1 block">{t("equipos.crear.nombre")}</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} disabled={!esAdmin}
              className="w-full bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-60" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-muted text-xs mb-1 block">{t("equipos.crear.moneda")}</label>
              <Select value={moneda} onChange={setMoneda} disabled={!esAdmin}
                options={[
                  { value: "USD", label: "USD ($)" },
                  { value: "MXN", label: "MXN ($)" },
                  { value: "COP", label: "COP ($)" },
                  { value: "EUR", label: "EUR (€)" },
                ]} />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">{t("equipos.crear.region")}</label>
              <Select value={region} onChange={setRegion} disabled={!esAdmin}
                options={[
                  { value: "latam", label: t("equipos.regiones.latam") },
                  { value: "eu-na", label: t("equipos.regiones.euNa") },
                  { value: "global", label: t("equipos.regiones.global") },
                ]} />
            </div>
          </div>

          {esAdmin && (
            <div className="flex items-center gap-3">
              <button onClick={() => void guardarAjustes()} disabled={guardando}
                className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                {guardando ? t("equipos.guardando") : t("comunes.guardar")}
              </button>
              {guardadoOk && <span className="text-accent text-xs font-medium">{t("equipos.guardado")}</span>}
            </div>
          )}

          {/* Zona de peligro */}
          {userId === equipo.owner_id ? (
            <div className="pt-6 border-t border-edge">
              <h3 className="text-coral text-xs uppercase tracking-wide font-medium mb-3">{t("equipos.zonaPeligro")}</h3>
              {confirmandoEliminar ? (
                <div className="flex items-center gap-3">
                  <p className="text-muted text-sm">{t("equipos.confirmarEliminar")}</p>
                  <button onClick={() => void borrarEquipo()}
                    className="bg-coral text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
                    {t("comunes.confirmar")}
                  </button>
                  <button onClick={() => setConfirmandoEliminar(false)}
                    className="text-muted text-sm border border-edge px-4 py-2 rounded-lg hover:bg-surface">
                    {t("comunes.cancelar")}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmandoEliminar(true)}
                  className="text-coral text-sm border border-edge px-4 py-2 rounded-lg hover:border-coral/40 transition-colors">
                  {t("equipos.eliminar")}
                </button>
              )}
            </div>
          ) : (
            <div className="pt-6 border-t border-edge">
              {confirmandoSalir ? (
                <div className="flex items-center gap-3">
                  <p className="text-muted text-sm">{t("equipos.confirmarSalir")}</p>
                  <button onClick={() => void salir()}
                    className="bg-coral text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
                    {t("comunes.confirmar")}
                  </button>
                  <button onClick={() => setConfirmandoSalir(false)}
                    className="text-muted text-sm border border-edge px-4 py-2 rounded-lg hover:bg-surface">
                    {t("comunes.cancelar")}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmandoSalir(true)}
                  className="text-coral text-sm border border-edge px-4 py-2 rounded-lg hover:border-coral/40 transition-colors">
                  {t("equipos.salir")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mostrarInvitar && (
        <ModalInvitarMiembro
          equipoId={equipo.id}
          equipoNombre={equipo.nombre}
          invitadoPor={miembros.find((m) => m.user_id === userId)?.nombre || ""}
          onInvitado={alInvitar}
          onCancelar={() => setMostrarInvitar(false)}
        />
      )}
    </div>
  );
}

export default Equipo;
