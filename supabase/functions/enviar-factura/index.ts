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
    const { factura, emailCliente } = await req.json();

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY no configurada" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const toEmail = sanitizeEmail(emailCliente);
    if (!toEmail) {
      return new Response(JSON.stringify({ ok: false, error: "email_invalido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const conceptos = Array.isArray(factura.conceptos) ? factura.conceptos : [];
    const tareasRealizadas = Array.isArray(factura.tareas_realizadas) ? factura.tareas_realizadas : [];
    const total = conceptos.reduce((acc: number, c: any) => acc + (Number(c.monto) || 0), 0);
    const abonado = Number(factura.abonado) || 0;
    const restante = total - abonado;
    const numero = escapeHtml(factura.numero);
    const fechaEmision = escapeHtml(factura.fecha_emision);
    const fechaVencimiento = escapeHtml(factura.fecha_vencimiento);
    const clienteNombre = escapeHtml(factura.cliente_nombre);
    const proyectoNombre = escapeHtml(factura.proyecto_nombre);
    const notas = escapeHtml(factura.notas);

    const conceptosHTML = conceptos.map((c: any) => `
      <tr>
        <td style="padding: 10px 16px; color: #FFFFFF; font-size: 13px; border-bottom: 1px solid #252B3B;">${escapeHtml(c.descripcion)}</td>
        <td style="padding: 10px 16px; color: #1DB8A0; font-size: 13px; font-weight: 600; text-align: right; border-bottom: 1px solid #252B3B;">$${(Number(c.monto) || 0).toLocaleString()}</td>
      </tr>
    `).join("");

    const tareasHTML = tareasRealizadas.length > 0
      ? `
        <div style="margin-top: 24px;">
          <p style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0;">Tareas realizadas</p>
          ${tareasRealizadas.map((t: string) => `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="color: #1DB8A0; font-size: 12px;">✓</span>
              <span style="color: #6B7280; font-size: 13px;">${escapeHtml(t)}</span>
            </div>
          `).join("")}
        </div>
      ` : "";

    const abonoHTML = abonado > 0 && factura.estado !== "pagada"
      ? `
        <div style="margin-top: 8px; padding: 12px 16px; background-color: #1A1F2E; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #6B7280; font-size: 12px;">Abonado</span>
            <span style="color: #6B7280; font-size: 12px;">$${abonado.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #F47C5C; font-size: 12px; font-weight: 600;">Pendiente por cobrar</span>
            <span style="color: #F47C5C; font-size: 12px; font-weight: 600;">$${restante.toLocaleString()}</span>
          </div>
        </div>
      ` : "";

    const pagadaHTML = factura.estado === "pagada"
      ? `<div style="background-color: #1DB8A0; color: #1A1F2E; text-align: center; padding: 10px; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 12px;">✓ FACTURA PAGADA COMPLETAMENTE</div>`
      : "";

    const html = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background-color: #1A1F2E; border-radius: 16px; overflow: hidden;">
        
        <div style="background-color: #141824; padding: 28px 32px; border-bottom: 1px solid #252B3B;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h1 style="color: #1DB8A0; font-size: 24px; margin: 0 0 4px 0;">Flowo</h1>
              <p style="color: #6B7280; font-size: 12px; margin: 0;">Plataforma para freelancers</p>
            </div>
            <div style="text-align: right;">
              <p style="color: #FFFFFF; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">${numero}</p>
              <p style="color: #6B7280; font-size: 11px; margin: 0;">Emisión: ${fechaEmision}</p>
              <p style="color: #6B7280; font-size: 11px; margin: 0;">Vencimiento: ${fechaVencimiento}</p>
            </div>
          </div>
        </div>

        <div style="padding: 28px 32px;">
          <div style="display: flex; gap: 32px; margin-bottom: 24px;">
            <div>
              <p style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Cliente</p>
              <p style="color: #FFFFFF; font-size: 14px; margin: 0;">${clienteNombre}</p>
            </div>
            <div>
              <p style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0;">Proyecto</p>
              <p style="color: #FFFFFF; font-size: 14px; margin: 0;">${proyectoNombre}</p>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
            <thead>
              <tr style="background-color: #141824;">
                <th style="padding: 10px 16px; color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; text-align: left; font-weight: 500;">Concepto</th>
                <th style="padding: 10px 16px; color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; text-align: right; font-weight: 500;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${conceptosHTML}
            </tbody>
            <tfoot>
              <tr>
                <td style="padding: 12px 16px; color: #FFFFFF; font-size: 14px; font-weight: 700;">Total</td>
                <td style="padding: 12px 16px; color: #1DB8A0; font-size: 16px; font-weight: 700; text-align: right;">$${total.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>

          ${abonoHTML}
          ${pagadaHTML}
          ${tareasHTML}

          ${notas ? `
            <div style="margin-top: 24px; padding: 14px 16px; background-color: #141824; border-radius: 8px; border-left: 3px solid #1DB8A0;">
              <p style="color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px 0;">Notas</p>
              <p style="color: #FFFFFF; font-size: 13px; margin: 0; line-height: 1.5;">${notas}</p>
            </div>
          ` : ""}
        </div>

        <div style="background-color: #141824; padding: 20px 32px; border-top: 1px solid #252B3B; text-align: center;">
          <p style="color: #6B7280; font-size: 11px; margin: 0;">Flowo — NextOn Studios · Generado automáticamente</p>
        </div>

      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Flowo <info@appflowo.com>",
        to: [toEmail],
        subject: "Factura " + numero + " — " + proyectoNombre,
        html,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
