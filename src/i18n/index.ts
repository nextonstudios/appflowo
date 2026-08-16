import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./es";
import en from "./en";

export const IDIOMAS = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

const idiomaGuardado = localStorage.getItem("flowo_idioma");

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: idiomaGuardado === "en" ? "en" : "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

export function cambiarIdioma(idioma: string) {
  void i18n.changeLanguage(idioma);
  localStorage.setItem("flowo_idioma", idioma);
}

export default i18n;
