// GDPR/ePrivacy cookie consent banner. Nothing non-essential (analytics/marketing pixels)
// fires until the visitor explicitly accepts — kivaneli-pixels.js reads this state before
// loading Meta/TikTok/Google. Consent choice persists 180 days in localStorage.

(function () {
  const STORAGE_KEY = 'kivaneli_consent_v1';
  const MAX_AGE_DAYS = 180;

  function readConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ageDays = (Date.now() - parsed.ts) / 86400000;
      if (ageDays > MAX_AGE_DAYS) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeConsent(value) {
    const record = { ...value, ts: Date.now() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('kivaneli:consent-updated', { detail: record }));
    return record;
  }

  function injectBanner() {
    if (document.getElementById('kvConsentBanner')) return;
    const el = document.createElement('div');
    el.id = 'kvConsentBanner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Preferencias de cookies');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#181514;color:#fff;padding:18px 20px;font-family:Arial,sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.25);';
    el.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;">
        <p style="margin:0;font-size:12.5px;line-height:1.5;flex:1 1 320px;color:#e8e4e1;">
          Usamos cookies propias y de terceros para analizar tu navegación y mostrarte publicidad relacionada con tus preferencias.
          Puedes aceptarlas, rechazar las no esenciales o ver más información en nuestra
          <a href="politica-privacidad.html" style="color:#f2b8b5;text-decoration:underline;">Política de Privacidad</a>.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="kvConsentReject" style="background:transparent;color:#fff;border:1px solid #6b6764;padding:10px 16px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;">Rechazar no esenciales</button>
          <button id="kvConsentAccept" style="background:#c9184a;color:#fff;border:none;padding:10px 18px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;">Aceptar todo</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('kvConsentAccept').addEventListener('click', () => {
      writeConsent({ analytics: true, marketing: true });
      el.remove();
    });
    document.getElementById('kvConsentReject').addEventListener('click', () => {
      writeConsent({ analytics: false, marketing: false });
      el.remove();
    });
  }

  const existing = readConsent();
  if (!existing) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectBanner);
    } else {
      injectBanner();
    }
  }

  window.kivaneliConsent = {
    get: () => readConsent() || { analytics: false, marketing: false },
    hasMarketingConsent: () => !!(readConsent() || {}).marketing,
    hasAnalyticsConsent: () => !!(readConsent() || {}).analytics,
    reset: () => { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }
  };
})();
