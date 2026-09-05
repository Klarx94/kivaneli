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

function customerEmailHtml(order) {
  const paymentLine = order.payment_method === 'COD'
    ? 'Pago contra reembolso — pagas en efectivo o tarjeta cuando recibas tu pedido.'
    : 'Pago con tarjeta confirmado.';
  const referralBlock = order.referralCredit
    ? `<p style="margin-top:16px;padding:12px;background:#fdf2f4;border-radius:8px;">Tu código de amiga ha sido premiado con un cupón de 15€ 🎉</p>`
    : '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222;">
      <h2 style="color:#c9184a;">¡Gracias por tu pedido, ${order.customer_name}!</h2>
      <p>Hemos recibido tu pedido <strong>${order.order_number}</strong> y ya está en preparación.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;">Pedido</td><td style="text-align:right;">${order.pack_selected}</td></tr>
        <tr><td style="padding:6px 0;">Total</td><td style="text-align:right;font-weight:bold;">${money(order.total_amount)}</td></tr>
      </table>
      <p>${paymentLine}</p>
      <p>Puedes seguir tu pedido en cualquier momento aquí: <a href="https://kivaneli.es/seguimiento.html?order=${encodeURIComponent(order.order_number)}&email=${encodeURIComponent(order.customer_email)}">Seguimiento de pedido</a></p>
      ${referralBlock}
      <p style="margin-top:24px;font-size:13px;color:#888;">KIVANELI — beauty@kivaneli.es</p>
    </div>
  `;
}

function adminAlertHtml(order) {
  return `
    <div style="font-family:Arial,sans-serif;">
      <h3>Nuevo pedido: ${order.order_number}</h3>
      <p>${order.customer_name} — ${order.customer_email} — ${order.customer_phone}</p>
      <p>${order.customer_address}, ${order.customer_zip} ${order.customer_city}</p>
      <p>Total: ${money(order.total_amount)} — Pago: ${order.payment_method}</p>
      <p>Cupón: ${order.coupon_applied || '—'}</p>
    </div>
  `;
}

async function sendOrderConfirmationEmails(order) {
  await Promise.all([
    sendEmail({ to: order.customer_email, subject: `Tu pedido KIVANELI ${order.order_number} está confirmado`, html: customerEmailHtml(order) }),
    sendEmail({ to: ADMIN_ALERT_EMAIL, subject: `🛒 Nuevo pedido ${order.order_number} — ${money(order.total_amount)}`, html: adminAlertHtml(order) })
  ]);
  return { sent: true };
}

module.exports = { sendOrderConfirmationEmails, sendEmail };
