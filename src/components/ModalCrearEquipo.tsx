import { useState } from "react";
import { useTranslation } from "react-i18next";
import Select from "./Select";
import { crearEquipo } from "../lib/equipo";

interface Props {
  onCreado: (equipoId: string) => void;
  onCancelar: () => void;
}

function ModalCrearEquipo({ onCreado, onCancelar }: Props) {
  const { t } = useTranslation();
  const [nombre, setNombre] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [region, setRegion] = useState("latam");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const res = await crearEquipo(nombre.trim(), moneda, region);
    setGuardando(false);
    if ("error" in res) {
      setError(t("equipos.errores." + (res.error === "nombre_invalido" ? "nombreInvalido" : "generico")));
      return;
    }
    onCreado(res.id);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-canvas border border-edge rounded-xl p-6 w-full max-w-md">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.75m-.75 3h.75m-.75 3h.75M3 21h18" />
            </svg>
          </div>
          <div>
            <h3 className="text-primary font-medium mb-1">{t("equipos.crear.titulo")}</h3>
            <p className="text-muted text-sm">{t("equipos.crear.desc")}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-muted text-xs mb-1 block">{t("equipos.crear.nombre")} *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nombre.trim()) void crear(); }}
              placeholder={t("equipos.crear.placeholderNombre")}
              maxLength={60}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-muted text-xs mb-1 block">{t("equipos.crear.moneda")}</label>
              <Select value={moneda} onChange={setMoneda}
                options={[
                  { value: "USD", label: "USD ($)" },
                  { value: "MXN", label: "MXN ($)" },
                  { value: "COP", label: "COP ($)" },
                  { value: "EUR", label: "EUR (€)" },
                ]} />
            </div>
            <div>
              <label className="text-muted text-xs mb-1 block">{t("equipos.crear.region")}</label>
              <Select value={region} onChange={setRegion}
                options={[
                  { value: "latam", label: t("equipos.regiones.latam") },
                  { value: "eu-na", label: t("equipos.regiones.euNa") },
                  { value: "global", label: t("equipos.regiones.global") },
                ]} />
              <p className="text-muted2 text-[11px] mt-1">{t("equipos.crear.regionNota")}</p>
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-lg px-3 py-2.5">
            <p className="text-muted text-xs">{t("equipos.crear.planFree")}</p>
          </div>
        </div>

        {error && <p className="text-coral text-xs mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={crear} disabled={guardando || !nombre.trim()}
            className="flex-1 bg-accent text-onaccent font-medium px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
            {guardando ? t("equipos.crear.creando") : t("equipos.crear.botonCrear")}
          </button>
          <button onClick={onCancelar} disabled={guardando}
            className="flex-1 text-sm text-primary border border-edge px-4 py-2.5 rounded-lg hover:bg-surface transition-colors disabled:opacity-50">
            {t("comunes.cancelar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModalCrearEquipo;
