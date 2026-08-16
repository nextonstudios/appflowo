import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sendNotification } from "@tauri-apps/plugin-notification";
import type { ContratoClienteInfo } from "../lib/clientesContrato";
import { crearClienteDesdeContrato } from "../lib/clientesContrato";

interface Props {
  contrato: ContratoClienteInfo;
  onConfirmado: () => void;
  onCancelar: () => void;
}

export default function ModalCrearCliente({ contrato, onConfirmado, onCancelar }: Props) {
  const { t } = useTranslation();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setCreando(true);
    setError(null);
    const id = await crearClienteDesdeContrato(contrato);
    setCreando(false);
    if (id) {
      sendNotification({
        title: t("modalCliente.notificacionTitulo"),
        body: t("modalCliente.notificacionCuerpo", { nombre: contrato.cliente_nombre }),
      });
      onConfirmado();
    } else {
      setError(t("modalCliente.error"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-surface border border-edge flex items-center justify-center text-accent flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 4v.01M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-primary font-medium mb-1">{t("modalCliente.titulo")}</h3>
            <p className="text-muted text-sm">
              {t("modalCliente.descPre")} <span className="text-primary font-medium">{contrato.numero}</span>{" "}
              {t("modalCliente.descMid")} <span className="text-primary font-medium">{contrato.cliente_nombre}</span>
              {t("modalCliente.descPost")}
            </p>
          </div>
        </div>

        {error && <p className="text-coral text-xs mt-2">{error}</p>}

        <div className="flex flex-col gap-2.5 mt-5">
          <button onClick={crear} disabled={creando}
            className="w-full bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
            {creando ? t("modalCliente.creando") : t("modalCliente.crearClientePortal")}
          </button>
          <button onClick={onCancelar} disabled={creando}
            className="w-full text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors">
            {t("modalCliente.noGracias")}
          </button>
        </div>
      </div>
    </div>
  );
}
