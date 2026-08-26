import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { EstadoEquipo } from "../hooks/useEquipo";
import ModalCrearEquipo from "./ModalCrearEquipo";
import ModalUnirseEquipo from "./ModalUnirseEquipo";

interface Props {
  estadoEquipo: EstadoEquipo;
  onAbrirEquipo: (id: string) => void;
}

function extraerToken(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  if (limpio.includes("token=")) {
    const params = new URLSearchParams(limpio.split("?")[1] || "");
    return params.get("token");
  }
  // Token crudo (hex de 64 chars)
  if (/^[a-f0-9]{32,128}$/i.test(limpio)) return limpio;
  return null;
}

function avatarColor(id: string): string {
  const colores = ["#7C5CBF", "#3B82F6", "#F59E0B", "#EC4899", "#1DB8A0"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return colores[hash % colores.length];
}

function FlowoTeams({ estadoEquipo, onAbrirEquipo }: Props) {
  const { t } = useTranslation();
  const { equipos, invitaciones, cargando, recargar, userId } = estadoEquipo;
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [tokenModal, setTokenModal] = useState<string | null>(null);

  function abrirConCodigo() {
    const token = extraerToken(codigo);
    if (!token) {
      setErrorCodigo(t("equipos.codigoInvalido"));
      return;
    }
    setErrorCodigo(null);
    setTokenModal(token);
  }

  async function alAceptarInvitacion(equipoId: string) {
    setTokenModal(null);
    await recargar();
    onAbrirEquipo(equipoId);
  }

  if (cargando) {
    return <div className="p-8"><p className="text-muted text-sm">{t("equipos.cargando")}</p></div>;
  }

  return (
    <div className="p-8">
      {/* Invitaciones pendientes recibidas */}
      {invitaciones.length > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mb-8">
          <h3 className="text-accent font-medium text-sm mb-3">{t("equipos.invitacionesRecibidas")}</h3>
          <div className="space-y-2">
            {invitaciones.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-canvas rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold"
                    style={{ background: avatarColor(inv.equipo_id) }}>
                    {(inv.equipo_nombre || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-primary text-sm font-medium truncate">{inv.equipo_nombre}</p>
                    <p className="text-muted text-xs truncate">
                      {t("equipos.teInvito", { nombre: inv.invited_by_nombre || "" })} · {t("equipos.roles." + inv.rol, { defaultValue: inv.rol })}
                    </p>
                  </div>
                </div>
                <button onClick={() => setTokenModal(inv.token)}
                  className="bg-accent text-onaccent text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                  {t("equipos.unirse.botonUnirse")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-primary">Flowo Teams</h1>
          <p className="text-sm font-medium text-muted mt-1">{t("equipos.descripcion")}</p>
        </div>
        <button onClick={() => setMostrarCrear(true)}
          className="bg-accent text-onaccent font-medium px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
          + {t("equipos.crear.titulo")}
        </button>
      </div>

      {/* Unirse con código */}
      {equipos.length > 0 && (
        <div className="mt-4 mb-8">
          <div className="flex gap-2 max-w-md">
            <input value={codigo} onChange={(e) => { setCodigo(e.target.value); setErrorCodigo(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") abrirConCodigo(); }}
              placeholder={t("equipos.placeholderCodigo")}
              className="flex-1 bg-canvas border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
            <button onClick={abrirConCodigo} disabled={!codigo.trim()}
              className="bg-surface border border-edge text-primary text-sm font-medium px-4 py-2 rounded-lg hover:border-accent/40 transition-colors disabled:opacity-50">
              {t("equipos.unirse.botonUnirse")}
            </button>
          </div>
          {errorCodigo && <p className="text-coral text-xs mt-2">{errorCodigo}</p>}
        </div>
      )}

      {/* Lista de equipos */}
      {equipos.length === 0 ? (
        <div className="text-center py-16 bg-canvas rounded-2xl border border-edge">
          <div className="w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 text-accent">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.75m-.75 3h.75m-.75 3h.75M3 21h18" />
            </svg>
          </div>
          <p className="text-primary font-medium">{t("equipos.vacio.titulo")}</p>
          <p className="text-muted text-sm mt-1 mb-6 max-w-sm mx-auto">{t("equipos.vacio.desc")}</p>
          <button onClick={() => setMostrarCrear(true)}
            className="bg-accent text-onaccent font-medium px-5 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity">
            + {t("equipos.crear.titulo")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {equipos.map((eq) => (
            <div key={eq.id} onClick={() => onAbrirEquipo(eq.id)}
              className="bg-canvas border border-edge rounded-xl p-5 hover:border-accent/50 transition-colors cursor-pointer group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-violet/15 text-violet flex items-center justify-center text-base font-semibold flex-shrink-0">
                    {(eq.nombre || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-primary font-medium truncate group-hover:text-accent transition-colors">{eq.nombre}</h3>
                    <p className="text-muted text-xs mt-0.5 capitalize">{t("equipos.plan." + eq.plan)}</p>
                  </div>
                </div>
                <span className={"text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 " +
                  (eq.owner_id === userId ? "bg-violet/10 text-violet" : "bg-surface text-muted")}>
                  {eq.owner_id === userId ? t("equipos.owner") : t("equipos.roles.miembro")}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t("equipos.monedaLabel", { moneda: eq.moneda })}</span>
                <span className="text-accent font-medium">{t("equipos.abrir")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarCrear && (
        <ModalCrearEquipo
          onCreado={async (id) => { setMostrarCrear(false); await recargar(); onAbrirEquipo(id); }}
          onCancelar={() => setMostrarCrear(false)}
        />
      )}

      {tokenModal && (
        <ModalUnirseEquipo
          token={tokenModal}
          onAceptado={alAceptarInvitacion}
          onCerrar={() => setTokenModal(null)}
        />
      )}
    </div>
  );
}

export default FlowoTeams;
