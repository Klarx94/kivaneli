// Shared transactional email sender (Resend REST API, no SDK dependency — same raw-https
// pattern used for Dropea). Until RESEND_API_KEY is configured in Vercel this silently no-ops
// (logs a warning) instead of throwing, so order creation keeps working with or without it.

const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'KIVANELI <pedidos@kivaneli.es>';
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'beauty@kivaneli.es';

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
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY no configurada — email de confirmación omitido para', order.order_number);
    return { skipped: true };
  }
  await Promise.all([
    sendViaResend({ to: order.customer_email, subject: `Tu pedido KIVANELI ${order.order_number} está confirmado`, html: customerEmailHtml(order) }),
    sendViaResend({ to: ADMIN_ALERT_EMAIL, subject: `🛒 Nuevo pedido ${order.order_number} — ${money(order.total_amount)}`, html: adminAlertHtml(order) })
  ]);
  return { sent: true };
}

module.exports = { sendOrderConfirmationEmails, sendViaResend };
