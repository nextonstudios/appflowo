import { useState } from "react";
import { useTranslation } from "react-i18next";
import Select from "./Select";
import {
  type RolEquipo,
  invitarMiembro,
  enviarEmailInvitacion,
  enlaceDeInvitacion,
} from "../lib/equipo";

interface Props {
  equipoId: string;
  equipoNombre: string;
  invitadoPor: string;
  onInvitado: () => void;
  onCancelar: () => void;
}

function ModalInvitarMiembro({ equipoId, equipoNombre, invitadoPor, onInvitado, onCancelar }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<RolEquipo>("miembro");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado tras crear la invitación: mostrar enlace y opciones
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);

  async function crearInvitacion() {
    setCreando(true);
    setError(null);
    const res = await invitarMiembro(equipoId, email, rol);
    setCreando(false);
    if ("error" in res) {
      setError(t("equipos.invitar.errores." + res.error));
      return;
    }
    setEnlace(enlaceDeInvitacion(res.token));
  }

  async function copiar() {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError(t("equipos.invitar.errorCopiar"));
    }
  }

  async function mandarEmail() {
    if (!enlace) return;
    setEnviandoEmail(true);
    const ok = await enviarEmailInvitacion({
      email: email.trim().toLowerCase(),
      equipoNombre,
      invitadoPor,
      rol,
      enlace,
    });
    setEnviandoEmail(false);
    if (ok) {
      setEmailEnviado(true);
    } else {
      setError(t("equipos.invitar.errorEmail"));
    }
  }

  function terminar() {
    onInvitado();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
        {!enlace ? (
          <>
            <h3 className="text-primary font-medium mb-1">{t("equipos.invitar.titulo")}</h3>
            <p className="text-muted text-sm mb-5">{t("equipos.invitar.desc")}</p>

            <div className="space-y-4">
              <div>
                <label className="text-muted text-xs mb-1 block">{t("equipos.invitar.email")} *</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void crearInvitacion(); }}
                  placeholder="nombre@correo.com" type="email"
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">{t("equipos.unirse.tuRol")}</label>
                <Select value={rol} onChange={(v) => setRol(v as RolEquipo)}
                  options={[
                    { value: "miembro", label: t("equipos.roles.miembro") },
                    { value: "viewer", label: t("equipos.roles.viewer") },
                    { value: "admin", label: t("equipos.roles.admin") },
                  ]} />
                <p className="text-muted2 text-[11px] mt-1">{t("equipos.invitar.rolNota." + rol)}</p>
              </div>
            </div>

            {error && <p className="text-coral text-xs mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button onClick={crearInvitacion} disabled={creando || !email.trim()}
                className="flex-1 bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                {creando ? t("equipos.invitar.creando") : t("equipos.invitar.crear")}
              </button>
              <button onClick={onCancelar} disabled={creando}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors disabled:opacity-50">
                {t("comunes.cancelar")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <h3 className="text-primary font-medium mb-1">{t("equipos.invitar.listaTitulo")}</h3>
                <p className="text-muted text-sm">{t("equipos.invitar.listaDesc", { email })}</p>
              </div>
            </div>

            <div className="bg-surface border border-edge rounded-lg p-3 mb-3">
              <p className="text-muted2 text-[11px] mb-1">{t("equipos.invitar.enlaceLabel")}</p>
              <p className="text-primary text-xs break-all select-all">{enlace}</p>
            </div>

            {error && <p className="text-coral text-xs mb-3">{error}</p>}

            <div className="flex flex-col gap-2.5">
              {!emailEnviado ? (
                <button onClick={mandarEmail} disabled={enviandoEmail}
                  className="w-full bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {enviandoEmail ? t("equipos.invitar.enviando") : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                      {t("equipos.invitar.enviarPorCorreo")}
                    </>
                  )}
                </button>
              ) : (
                <div className="w-full bg-accent/10 border border-accent/30 text-accent text-sm px-4 py-2.5 rounded-lg text-center font-medium">
                  {t("equipos.invitar.emailEnviado")}
                </div>
              )}
              <button onClick={copiar}
                className="w-full bg-surface border border-edge text-primary text-sm px-4 py-2.5 rounded-lg hover:border-accent/40 transition-colors">
                {copiado ? t("equipos.invitar.copiado") : t("equipos.invitar.copiarEnlace")}
              </button>
              <button onClick={terminar}
                className="w-full text-center text-muted text-xs hover:text-primary transition-colors py-1">
                {t("comunes.listo")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ModalInvitarMiembro;
