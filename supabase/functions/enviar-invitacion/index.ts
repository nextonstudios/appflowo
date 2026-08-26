import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeEmail(email: string): string | null {
  const trimmed = String(email || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed;
  return null;
}

const ROLES: Record<string, string> = {
  admin: "Administrador",
  miembro: "Miembro",
  viewer: "Solo lectura",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apiapikey, content-type",
      },
    });
  }

  try {
    const { email, equipoNombre, invitadoPor, rol, enlace } = await req.json();

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY no configurada" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const toEmail = sanitizeEmail(email);
    if (!toEmail) {
      return new Response(JSON.stringify({ ok: false, error: "email_invalido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (!enlace || typeof enlace !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "enlace_requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const equipo = escapeHtml(equipoNombre || "un equipo");
    const por = escapeHtml(invitadoPor || "Alguien");
    const rolTexto = escapeHtml(ROLES[rol] || "Miembro");

    const html = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background-color: #1A1F2E; border-radius: 16px; overflow: hidden;">

        <div style="background-color: #141824; padding: 28px 32px; border-bottom: 1px solid #252B3B;">
          <h1 style="color: #1DB8A0; font-size: 24px; margin: 0 0 4px 0;">Flowo Teams</h1>
          <p style="color: #6B7280; font-size: 12px; margin: 0;">Tu negocio, en equipo</p>
        </div>

        <div style="padding: 32px;">
          <p style="color: #FFFFFF; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">${por} te invitó a un equipo</p>

          <div style="background-color: #141824; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Equipo</p>
            <p style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 14px 0;">${equipo}</p>
            <p style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Tu rol será</p>
            <p style="color: #1DB8A0; font-size: 14px; font-weight: 600; margin: 0;">${rolTexto}</p>
          </div>

          <a href="${escapeHtml(enlace)}"
            style="display: block; background-color: #1DB8A0; color: #0E1A16; text-align: center; padding: 13px; border-radius: 10px; font-weight: 600; font-size: 14px; text-decoration: none; margin-bottom: 14px;">
            Unirme al equipo
          </a>

          <p style="color: #6B7280; font-size: 12px; margin: 0 0 6px 0;">¿El botón no funciona? Copia este enlace en tu navegador:</p>
          <p style="color: #6B7280; font-size: 11px; word-break: break-all; margin: 0 0 18px 0;">${escapeHtml(enlace)}</p>

          <p style="color: #6B7280; font-size: 11px; margin: 0;">Esta invitación expira en 7 días. Si no esperabas este correo, puedes ignorarlo.</p>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Flowo <onboarding@resend.dev>",
        to: [toEmail],
        subject: `${por} te invitó a "${equipoNombre}" en Flowo Teams`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: "error_resend", detalle: errText }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, error: "error_interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
