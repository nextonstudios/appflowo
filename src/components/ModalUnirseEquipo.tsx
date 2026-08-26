import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { validarInvitacion, aceptarInvitacion } from "../lib/equipo";

interface Props {
  token: string;
  onAceptado: (equipoId: string) => void;
  onCerrar: () => void;
}

interface InfoInvitacion {
  email: string;
  rol: string;
  equipo_nombre: string;
  equipo_logo: string | null;
  invitado_por: string | null;
}

const ROLES_LABEL: Record<string, string> = {
  admin: "equipos.roles.admin",
  miembro: "equipos.roles.miembro",
  viewer: "equipos.roles.viewer",
};

function ModalUnirseEquipo({ token, onAceptado, onCerrar }: Props) {
  const { t } = useTranslation();
  const [cargando, setCargando] = useState(true);
  const [info, setInfo] = useState<InfoInvitacion | null>(null);
  const [errorTipo, setErrorTipo] = useState<string | null>(null);
  const [aceptando, setAceptando] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await validarInvitacion(token);
      if (!res.ok) {
        setErrorTipo(res.error || "invalid_token");
      } else {
        setInfo(res.data as InfoInvitacion);
      }
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unirse() {
    setAceptando(true);
    const res = await aceptarInvitacion(token);
    setAceptando(false);
    if (res.ok && res.equipoId) {
      onAceptado(res.equipoId);
    } else {
      setErrorTipo(res.error || "invalid_token");
      setInfo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
        {cargando ? (
          <p className="text-muted text-sm text-center py-6">{t("equipos.unirse.validando")}</p>
        ) : errorTipo ? (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-coral/10 border border-coral/20 flex items-center justify-center text-coral flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-primary font-medium mb-1">{t("equipos.unirse.errorTitulo")}</h3>
                <p className="text-muted text-sm">{t("equipos.unirse.errores." + errorTipo, { defaultValue: t("equipos.unirse.errores.invalid_token") })}</p>
              </div>
            </div>
            <button onClick={onCerrar}
              className="w-full text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
              {t("comunes.cerrar")}
            </button>
          </>
        ) : info ? (
          <>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                {info.equipo_logo ? (
                  <img src={info.equipo_logo} className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <span className="text-accent font-semibold">{(info.equipo_nombre || "?").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <h3 className="text-primary font-medium mb-1">{t("equipos.unirse.titulo")}</h3>
                <p className="text-muted text-sm">
                  <span className="text-primary font-medium">{info.invitado_por}</span>{" "}
                  {t("equipos.unirse.teInvito")}{" "}
                  <span className="text-accent font-medium">{info.equipo_nombre}</span>
                </p>
              </div>
            </div>

            <div className="bg-surface border border-edge rounded-lg px-3 py-2.5 mb-2 flex items-center justify-between">
              <span className="text-muted text-xs">{t("equipos.unirse.tuRol")}</span>
              <span className="text-primary text-sm font-medium">{t(ROLES_LABEL[info.rol] || ROLES_LABEL.miembro)}</span>
            </div>

            <p className="text-muted2 text-xs mb-5">{t("equipos.unirse.nota")}</p>

            <div className="flex gap-3">
              <button onClick={unirse} disabled={aceptando}
                className="flex-1 bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                {aceptando ? t("equipos.unirse.uniendose") : t("equipos.unirse.botonUnirse")}
              </button>
              <button onClick={onCerrar} disabled={aceptando}
                className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors disabled:opacity-50">
                {t("comunes.cancelar")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ModalUnirseEquipo;
