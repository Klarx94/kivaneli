// Ad-tracking scaffolding: Meta Pixel, TikTok Pixel, Google Ads/GA4 (gtag).
// Nothing here loads or fires until kivaneli-consent.js reports marketing consent granted.
//
// IDs are NOT hardcoded here — they're fetched live from /api/customer-actions
// (action=get_pixel_config), which reads whatever the admin panel saved. Paste an ID and
// hit save in Admin > Configuración Técnica > Píxeles de Publicidad, no code deploy needed.
(function () {
  const cfg = { META_PIXEL_ID: '', TIKTOK_PIXEL_ID: '', GOOGLE_ADS_ID: '', GA4_MEASUREMENT_ID: '' };
  const isConfigured = (v) => !!v;
  let loaded = false;
  let configFetched = false;

  async function fetchPixelConfig() {
    if (configFetched) return;
    configFetched = true;
    try {
      const res = await fetch('/api/customer-actions?action=get_pixel_config');
      const data = await res.json();
      if (data.success && data.config) Object.assign(cfg, data.config);
    } catch (e) { console.warn('Pixel config fetch error (non-fatal):', e); }
  }

  function loadMeta() {
    if (!isConfigured(cfg.META_PIXEL_ID) || window.fbq) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', cfg.META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function loadTikTok() {
    if (!isConfigured(cfg.TIKTOK_PIXEL_ID) || window.ttq) return;
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) { var e = ttq._i[t] || []; return e };
      ttq.load = function (e, n) {
        var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        var o = d.createElement("script"); o.type = "text/javascript"; o.async = !0; o.src = i + "?sdkid=" + e + "&lib=" + t;
        var a = d.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a)
      };
      ttq.load(cfg.TIKTOK_PIXEL_ID); ttq.page();
    }(window, document, 'ttq');
  }

  function loadGoogle() {
    const hasAds = isConfigured(cfg.GOOGLE_ADS_ID);
    const hasGA4 = isConfigured(cfg.GA4_MEASUREMENT_ID);
    if ((!hasAds && !hasGA4) || window.gtag) return;
    const primaryId = hasGA4 ? cfg.GA4_MEASUREMENT_ID : cfg.GOOGLE_ADS_ID;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${primaryId}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    if (hasGA4) window.gtag('config', cfg.GA4_MEASUREMENT_ID);
    if (hasAds) window.gtag('config', cfg.GOOGLE_ADS_ID);
  }

  async function loadAllIfConsented() {
    if (loaded) return;
    if (!window.kivaneliConsent || !window.kivaneliConsent.hasMarketingConsent()) return;
    await fetchPixelConfig();
    if (loaded) return;
    loaded = true;
    loadMeta();
    loadTikTok();
    loadGoogle();
  }

  document.addEventListener('kivaneli:consent-updated', loadAllIfConsented);
  document.addEventListener('DOMContentLoaded', loadAllIfConsented);
  loadAllIfConsented();

  function fire(eventName, params) {
    if (!loaded) return;
    try {
      if (window.fbq && isConfigured(cfg.META_PIXEL_ID)) window.fbq('track', eventName.meta, params.meta || {});
      if (window.ttq && isConfigured(cfg.TIKTOK_PIXEL_ID)) window.ttq.track(eventName.tiktok, params.tiktok || {});
      if (window.gtag && isConfigured(cfg.GA4_MEASUREMENT_ID)) window.gtag('event', eventName.ga4, params.ga4 || {});
      if (window.gtag && isConfigured(cfg.GOOGLE_ADS_ID) && eventName.googleAdsConversionLabel) {
        window.gtag('event', 'conversion', { send_to: `${cfg.GOOGLE_ADS_ID}/${eventName.googleAdsConversionLabel}`, ...(params.ga4 || {}) });
      }
    } catch (e) { console.warn('Pixel tracking error (non-fatal):', e); }
  }

  window.kivaneliTrack = {
    viewContent: (product) => fire(
      { meta: 'ViewContent', tiktok: 'ViewContent', ga4: 'view_item' },
      {
        meta: { content_name: product.name, content_ids: [product.id], value: product.price, currency: 'EUR' },
        tiktok: { content_id: product.id, content_name: product.name, value: product.price, currency: 'EUR' },
        ga4: { items: [{ item_id: product.id, item_name: product.name, price: product.price }] }
      }
    ),
    addToCart: (item) => fire(
      { meta: 'AddToCart', tiktok: 'AddToCart', ga4: 'add_to_cart' },
      {
        meta: { content_name: item.name, content_ids: [item.id], value: item.price, currency: 'EUR' },
        tiktok: { content_id: item.id, content_name: item.name, value: item.price, currency: 'EUR' },
        ga4: { items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: item.quantity }] }
      }
    ),
    initiateCheckout: (cart) => fire(
      { meta: 'InitiateCheckout', tiktok: 'InitiateCheckout', ga4: 'begin_checkout' },
      {
        meta: { value: cart.total, currency: 'EUR', num_items: cart.itemsCount },
        tiktok: { value: cart.total, currency: 'EUR' },
        ga4: { value: cart.total, currency: 'EUR' }
      }
    ),
    purchase: (order) => fire(
      { meta: 'Purchase', tiktok: 'CompletePayment', ga4: 'purchase' },
      {
        meta: { value: order.total, currency: 'EUR', content_ids: order.itemIds || [] },
        tiktok: { value: order.total, currency: 'EUR' },
        ga4: { value: order.total, currency: 'EUR', transaction_id: order.orderNumber }
      }
    )
  };
})();
