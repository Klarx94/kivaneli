// Shared transactional email sender. Two interchangeable transports:
//   1. SMTP (nodemailer) — use the corporate mailbox directly (e.g. Arsys-hosted
//      beauty@kivaneli.es), no third-party account or domain verification needed.
//   2. Resend REST API — fallback if SMTP isn't configured.
// Whichever is configured first (SMTP takes priority) is used. With neither configured,
// this silently no-ops (logs a warning) instead of throwing, so order creation always works.

const https = require('https');
let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// SMTP settings for a regular mailbox (Arsys or any other host). Get the exact host/port
// from the hosting panel's "Configuración de correo" — Arsys typically uses the domain's
// own mail server (e.g. mail.kivaneli.es or smtp.arsys.es) on port 587 (STARTTLS) or 465 (SSL).
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;

const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER || 'KIVANELI <beauty@kivaneli.es>';
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'beauty@kivaneli.es';

let smtpTransportCache = null;
function getSmtpTransport() {
  if (!nodemailer || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!smtpTransportCache) {
    smtpTransportCache = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE, // true = SSL (465), false = STARTTLS (587)
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return smtpTransportCache;
}

function sendViaSmtp({ to, subject, html }) {
  const transport = getSmtpTransport();
  return transport.sendMail({ from: EMAIL_FROM, to, subject, html });
}

function sendViaResend({ to, subject, html }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ from: EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html });
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body || '{}'));
          } else {
            reject(new Error(`Resend ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Single entry point every caller uses — picks whichever transport is configured.
async function sendEmail(opts) {
  if (getSmtpTransport()) return sendViaSmtp(opts);
  if (RESEND_API_KEY) return sendViaResend(opts);
  console.warn('Sin transporte de email configurado (SMTP_* o RESEND_API_KEY) — email omitido:', opts.subject);
  return { skipped: true };
}

function money(n) {
  return parseFloat(n || 0).toFixed(2).replace('.', ',') + ' €';
}

// Shared brand shell — mirrors the visual language already used across the site
// (index.html/checkout.html): ivory background, obsidian text, rose-gradient accents,
// Cinzel-style serif wordmark treatment (web-safe fallback since email clients don't
// reliably load Google Fonts), a rounded white card, and a consistent footer.
function brandShell(innerHtml, { preheader = '' } = {}) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FAF7F2;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
  <div style="background-color:#FAF7F2;padding:32px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="text-align:center;padding-bottom:22px;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:5px;color:#181514;">KIVANELI<span style="color:#D48B80;">.</span></span>
      </div>
      <div style="background:#ffffff;border-radius:28px;padding:36px 32px;border:1px solid #F0DAD5;box-shadow:0 12px 30px rgba(24,21,20,0.06);">
        ${innerHtml}
      </div>
      <div style="text-align:center;padding-top:26px;font-size:11px;color:#A89E97;line-height:1.7;">
        <p style="margin:0 0 6px;">KIVANELI · Maison Botanique de Cuidado Personal</p>
        <p style="margin:0;">beauty@kivaneli.es</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function badge(text, { bg = '#FDF2F4', color = '#B86B60' } = {}) {
  return `<span style="display:inline-block;background:${bg};color:${color};font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:6px 14px;border-radius:999px;">${text}</span>`;
}

function ctaButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#D48B80,#B86B60);color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:14px;font-weight:700;font-size:13px;letter-spacing:0.3px;">${label}</a>`;
}

function customerEmailHtml(order) {
  const isCod = order.payment_method === 'COD';
  const paymentLine = isCod
    ? 'Pago contra reembolso — abonas en efectivo o con tarjeta al repartidor cuando recibas tu pedido en la puerta de casa.'
    : 'Pago con tarjeta confirmado — no necesitas hacer nada más, tu pedido ya está en preparación.';

  const referralBlock = order.referralCredit ? `
    <div style="margin-top:22px;background:#F3E8FF;border:1px solid #E9D5FF;border-radius:18px;padding:20px;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:#6B21A8;">🎁 Tu código de amiga ha sido premiado</div>
      <p style="font-size:12.5px;color:#581C87;margin:6px 0 0;line-height:1.6;">Hemos añadido un cupón de 15€ para tu próxima compra — gracias por recomendar KIVANELI.</p>
    </div>` : '';

  const trackingUrl = `https://kivaneli.es/seguimiento.html?order=${encodeURIComponent(order.order_number)}&email=${encodeURIComponent(order.customer_email)}`;

  const inner = `
    <div style="text-align:center;margin-bottom:22px;">
      ${badge('Pedido Confirmado', { bg: '#E8F5E9', color: '#2E7D32' })}
    </div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#181514;margin:0 0 10px;text-align:center;">
      Gracias por tu pedido, ${order.customer_name.split(' ')[0]}
    </h1>
    <p style="font-size:13.5px;color:#6B6560;line-height:1.7;text-align:center;margin:0 0 26px;">
      Tu pedido <strong style="color:#181514;">${order.order_number}</strong> ya está en preparación en nuestro centro logístico.
    </p>

    <div style="background:#FAF7F2;border:1px solid #F0DAD5;border-radius:20px;padding:22px 24px;margin-bottom:22px;">
      <div style="font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#B86B60;margin-bottom:10px;">Resumen del pedido</div>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px;color:#181514;">
        <tr><td style="padding:5px 0;color:#6B6560;">Producto</td><td style="padding:5px 0;text-align:right;font-weight:600;">${order.pack_selected}</td></tr>
        <tr><td style="padding:5px 0;color:#6B6560;">Total</td><td style="padding:5px 0;text-align:right;font-weight:800;font-size:16px;">${money(order.total_amount)}</td></tr>
        <tr><td style="padding:5px 0;color:#6B6560;vertical-align:top;">Envío a</td><td style="padding:5px 0;text-align:right;">${order.customer_address}<br>${order.customer_zip} ${order.customer_city}</td></tr>
      </table>
    </div>

    <p style="font-size:13px;color:#6B6560;line-height:1.7;text-align:center;margin:0 0 26px;">${paymentLine}</p>

    <div style="text-align:center;">
      ${ctaButton(trackingUrl, 'SEGUIR MI PEDIDO')}
    </div>

    ${referralBlock}
  `;

  return brandShell(inner, { preheader: `Tu pedido ${order.order_number} está confirmado y en preparación.` });
}

function adminAlertHtml(order) {
  const inner = `
    <div style="text-align:center;margin-bottom:20px;">
      ${badge('Nuevo Pedido', { bg: '#FDF2F4', color: '#C9184A' })}
    </div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#181514;margin:0 0 18px;text-align:center;">
      ${order.order_number} · ${money(order.total_amount)}
    </h1>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#181514;">
      <tr><td style="padding:6px 0;color:#6B6560;width:38%;">Clienta</td><td style="padding:6px 0;font-weight:600;">${order.customer_name}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6560;">Email</td><td style="padding:6px 0;">${order.customer_email}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6560;">Teléfono</td><td style="padding:6px 0;">${order.customer_phone || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6560;vertical-align:top;">Dirección</td><td style="padding:6px 0;">${order.customer_address}, ${order.customer_zip} ${order.customer_city}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6560;">Método de pago</td><td style="padding:6px 0;font-weight:600;">${order.payment_method === 'COD' ? 'Contrareembolso' : 'Tarjeta'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6560;">Cupón</td><td style="padding:6px 0;">${order.coupon_applied || '—'}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px;">
      ${ctaButton('https://kivaneli.es/admin', 'ABRIR PANEL DE PEDIDOS')}
    </div>
  `;
  return brandShell(inner);
}

async function sendOrderConfirmationEmails(order) {
  await Promise.all([
    sendEmail({ to: order.customer_email, subject: `Tu pedido KIVANELI ${order.order_number} está confirmado`, html: customerEmailHtml(order) }),
    sendEmail({ to: ADMIN_ALERT_EMAIL, subject: `🛒 Nuevo pedido ${order.order_number} — ${money(order.total_amount)}`, html: adminAlertHtml(order) })
  ]);
  return { sent: true };
}

module.exports = { sendOrderConfirmationEmails, sendEmail, customerEmailHtml, adminAlertHtml };
