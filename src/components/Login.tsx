import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Logo from "./Logo";
import { contrasenaValida } from "../lib/contrasena";
import ChecklistContrasena from "./ChecklistContrasena";

interface Props {
  onLogin: () => void;
  mensajeExterno?: string | null;
}

interface InputPasswordProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mostrar: boolean;
  onToggle: () => void;
}

function InputPassword({ value, onChange, mostrar, onToggle }: InputPasswordProps) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder="••••••••"
        autoComplete="off"
        style={{ WebkitTextSecurity: mostrar ? "none" : "disc" } as React.CSSProperties}
        className="w-full bg-surface border border-edge rounded-lg px-3 py-2 pr-10 text-primary text-sm focus:outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-accent transition-colors"
      >
        {mostrar ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function Login({ onLogin, mensajeExterno }: Props) {
  const [esRegistro, setEsRegistro] = useState(false);
  const [esRecuperar, setEsRecuperar] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [terminosAceptados, setTerminosAceptados] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);

  useEffect(() => {
    if (mensajeExterno) setMensaje(mensajeExterno);
  }, [mensajeExterno]);

  async function handleSubmit() {
    if (!email || !password) return;
    if (esRegistro && !terminosAceptados) {
      setError("Debes aceptar los términos y condiciones para continuar.");
      return;
    }
    setCargando(true);
    setError("");

    if (esRegistro) {
      if (!contrasenaValida(password)) {
        setError("La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.");
        setCargando(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre } },
      });
      if (error) {
        setError(error.message);
        setCargando(false);
      } else {
        setMensaje("Revisa tu correo para confirmar tu cuenta.");
        setCargando(false);
        setTimeout(() => {
          setEsRegistro(false);
          setMensaje("");
          setError("");
          setPassword("");
          setNombre("");
        }, 3000);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError("Correo o contraseña incorrectos.");
      } else {
        onLogin();
      }
      setCargando(false);
    }
  }

  async function handleRecuperar() {
    if (!email) { setError("Ingresa tu correo primero."); return; }
    setCargando(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "flowo://auth/callback",
    });
    if (error) {
      setError("No se pudo enviar el correo. Verifica que el email sea correcto.");
    } else {
      setMensaje("Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.");
    }
    setCargando(false);
  }

  if (esRecuperar) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Logo className="w-44 mx-auto mb-3" />
            <p className="text-muted mt-2 text-sm">Plataforma para freelancers</p>
          </div>

          <div className="bg-canvas border border-edge rounded-xl p-6">
            <h2 className="text-primary font-medium text-lg mb-2">Recuperar contraseña</h2>
            <p className="text-muted text-xs mb-6">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>

            <div className="mb-6">
              <label className="text-muted text-xs mb-1 block">Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {error && <p className="text-xs mb-4 text-center text-coral">{error}</p>}
            {mensaje && <p className="text-xs mb-4 text-center text-accent">{mensaje}</p>}

            {!mensaje && (
              <button
                onClick={handleRecuperar}
                disabled={cargando}
                className="w-full bg-accent text-onaccent rounded-lg py-2 text-sm font-medium hover:bg-accent2 disabled:opacity-50 mb-4"
              >
                {cargando ? "Enviando..." : "Enviar enlace"}
              </button>
            )}

            <button
              onClick={() => { setEsRecuperar(false); setError(""); setMensaje(""); }}
              className="w-full text-muted text-xs hover:text-primary text-center"
            >
              Volver al inicio de sesión
            </button>
          </div>

          <p className="text-center text-muted text-xs mt-6">Creado por NextOn Studios</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <img src="/logoFlowo.png" alt="Logo Flowo" className="w-44 mx-auto mb-3" />
          <p className="text-muted mt-2 text-sm">Plataforma para freelancers</p>
        </div>

        <div className="bg-canvas border border-edge rounded-xl p-6">
          <h2 className="text-primary font-medium text-lg mb-6">
            {esRegistro ? "Crear cuenta" : "Iniciar sesión"}
          </h2>

          {esRegistro && (
            <div className="mb-4">
              <label className="text-muted text-xs mb-1 block">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="text-muted text-xs mb-1 block">Correo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="mb-2">
            <label className="text-muted text-xs mb-1 block">Contraseña</label>
            <InputPassword
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              mostrar={mostrarPassword}
              onToggle={() => setMostrarPassword(!mostrarPassword)}
            />
            {esRegistro && <ChecklistContrasena password={password} />}
          </div>

          {!esRegistro && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => { setEsRecuperar(true); setError(""); }}
                className="text-muted text-xs hover:text-accent"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {esRegistro && (
            <div className="mt-3 mb-4 flex items-start gap-2">
              <input
                type="checkbox"
                id="terminos"
                checked={terminosAceptados}
                onChange={(e) => setTerminosAceptados(e.target.checked)}
                className="mt-1 accent-accent"
              />
              <label htmlFor="terminos" className="text-muted text-xs cursor-pointer">
                Acepto los{" "}
                <a href="https://appflowo.com/terminos-y-condiciones-de-uso/" target="_blank" rel="noopener noreferrer"
                  className="text-accent hover:underline">
                  términos y condiciones
                </a>
              </label>
            </div>
          )}

          {error && <p className="text-xs mb-4 text-center text-coral">{error}</p>}
          {mensaje && <p className="text-xs mb-4 text-center text-accent">{mensaje}</p>}

          <button
            onClick={handleSubmit}
            disabled={cargando || (esRegistro && !terminosAceptados)}
            className="w-full bg-accent text-onaccent rounded-lg py-2 text-sm font-medium hover:bg-accent2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {cargando ? "Cargando..." : esRegistro ? "Crear cuenta" : "Entrar"}
          </button>

          <p className="text-center text-muted text-xs mt-4">
            {esRegistro ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
            <button
              onClick={() => { setEsRegistro(!esRegistro); setError(""); setMensaje(""); setTerminosAceptados(false); }}
              className="text-accent hover:underline"
            >
              {esRegistro ? "Inicia sesión" : "Regístrate"}
            </button>
          </p>
        </div>

        <p className="text-center text-muted text-xs mt-6">Creado por NextOn Studios</p>
      </div>
    </div>
  );
}

export default Login;