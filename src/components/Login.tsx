import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  onLogin: () => void;
}

function Login({ onLogin }: Props) {
  const [esRegistro, setEsRegistro] = useState(false);
  const [esRecuperar, setEsRecuperar] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function handleSubmit() {
    if (!email || !password) return;
    setCargando(true);
    setError("");

    if (esRegistro) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre } },
      });
      if (error) {
        setError(error.message);
      } else {
        setError("Revisa tu correo para confirmar tu cuenta.");
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
    }

    setCargando(false);
  }

  async function handleRecuperar() {
    if (!email) { setError("Ingresa tu correo primero."); return; }
    setCargando(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setError("No se pudo enviar el correo. Verifica que el email sea correcto.");
    } else {
      setMensaje("Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.");
    }
    setCargando(false);
  }

  if (esRecuperar) {
    return (
      <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src="/logoFlowo.png" alt="Logo Flowo" className="w-55 mx-auto mb-3" />
            <p className="text-[#6B7280] mt-2 text-sm">Plataforma para freelancers</p>
          </div>

          <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6">
            <h2 className="text-white font-medium text-lg mb-2">Recuperar contraseña</h2>
            <p className="text-[#6B7280] text-xs mb-6">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>

            <div className="mb-6">
              <label className="text-[#6B7280] text-xs mb-1 block">Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]"
              />
            </div>

            {error && <p className="text-xs mb-4 text-center text-[#F47C5C]">{error}</p>}
            {mensaje && <p className="text-xs mb-4 text-center text-[#1DB8A0]">{mensaje}</p>}

            {!mensaje && (
              <button
                onClick={handleRecuperar}
                disabled={cargando}
                className="w-full bg-[#1DB8A0] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#17a08b] disabled:opacity-50 mb-4"
              >
                {cargando ? "Enviando..." : "Enviar enlace"}
              </button>
            )}

            <button
              onClick={() => { setEsRecuperar(false); setError(""); setMensaje(""); }}
              className="w-full text-[#6B7280] text-xs hover:text-white text-center"
            >
              Volver al inicio de sesión
            </button>
          </div>

          <p className="text-center text-[#6B7280] text-xs mt-6">Creado por NextOn Studios</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1F2E] flex items-center justify-center">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <img src="/logoFlowo.png" alt="Logo Flowo" className="w-55 mx-auto mb-3" />
          <p className="text-[#6B7280] mt-2 text-sm">Plataforma para freelancers</p>
        </div>

        <div className="bg-[#141824] border border-[#252B3B] rounded-xl p-6">
          <h2 className="text-white font-medium text-lg mb-6">
            {esRegistro ? "Crear cuenta" : "Iniciar sesión"}
          </h2>

          {esRegistro && (
            <div className="mb-4">
              <label className="text-[#6B7280] text-xs mb-1 block">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="text-[#6B7280] text-xs mb-1 block">Correo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]"
            />
          </div>

          <div className="mb-2">
            <label className="text-[#6B7280] text-xs mb-1 block">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1A1F2E] border border-[#252B3B] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#1DB8A0]"
            />
          </div>

          {!esRegistro && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => { setEsRecuperar(true); setError(""); }}
                className="text-[#6B7280] text-xs hover:text-[#1DB8A0]"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {esRegistro && (
            <div className="mb-4 flex items-start gap-2">
              <input type="checkbox" id="terminos" className="mt-1" />
              <label htmlFor="terminos" className="text-[#6B7280] text-xs">
                Acepto los{" "}
                <a href="/terminos" target="_blank" rel="noopener noreferrer"
                  className="text-[#1DB8A0] hover:underline">
                  términos y condiciones
                </a>
              </label>
            </div>
          )}

          {error && <p className="text-xs mb-4 text-center text-[#F47C5C]">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={cargando}
            className="w-full bg-[#1DB8A0] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#17a08b] disabled:opacity-50"
          >
            {cargando ? "Cargando..." : esRegistro ? "Crear cuenta" : "Entrar"}
          </button>

          <p className="text-center text-[#6B7280] text-xs mt-4">
            {esRegistro ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
            <button
              onClick={() => { setEsRegistro(!esRegistro); setError(""); }}
              className="text-[#1DB8A0] hover:underline"
            >
              {esRegistro ? "Inicia sesión" : "Regístrate"}
            </button>
          </p>
        </div>

        <p className="text-center text-[#6B7280] text-xs mt-6">Creado por NextOn Studios</p>
      </div>
    </div>
  );
}

export default Login;