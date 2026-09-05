// Vercel Serverless Function: Dropea Catalog Sync & Product Management Bridge
// Interfaces with https://es.public-api.dropea.com/dropshipper to manage shop products

const https = require('https');

const DROPEA_API_TOKEN = process.env.DROPEA_API_TOKEN;
const DROPEA_STORE_ID = process.env.DROPEA_STORE_ID || 18516;

if (!DROPEA_API_TOKEN) {
  throw new Error('Missing required env var DROPEA_API_TOKEN');
}

function requestDropea(method, path, body = null) {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'es.public-api.dropea.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${DROPEA_API_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 8000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'TIMEOUT' }); });
    if (postData) req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || 'list_shop_products';

  try {
    // 1. List Products linked to Shop 18516
    if (action === 'list_shop_products') {
      const resp = await requestDropea('GET', `/dropshipper/shops/${DROPEA_STORE_ID}/products`);
      return res.status(200).json(resp.data || { success: false, error: resp.error });
    }

    // 2. Search Dropea Global Catalog
    if (action === 'search_catalog') {
      const q = req.query.q || '';
      const resp = await requestDropea('GET', `/dropshipper/products?search=${encodeURIComponent(q)}&limit=20`);
      return res.status(200).json(resp.data || { success: false, error: resp.error });
    }

    // 3. Link a Dropea Product to Shop
    // Dropea's real API requires a variant_mapping array (product_id alone 400s) —
    // action:'LINK' plus an external_variant_id (our own catalog's reference for the variant).
    if (action === 'link_product' && req.method === 'POST') {
      const { product_id, variant_id, sku } = req.body || {};
      const resp = await requestDropea('POST', `/dropshipper/shops/${DROPEA_STORE_ID}/products/link`, {
        product_id,
        variant_mapping: [{
          variant_id,
          sku,
          action: 'LINK',
          external_variant_id: String(variant_id)
        }]
      });
      return res.status(200).json(resp.data || { success: false, error: resp.error });
    }

    // 4. Unlink a Dropea Product from Shop
    if (action === 'unlink_product' && req.method === 'POST') {
      const { product_id } = req.body || {};
      const resp = await requestDropea('POST', `/dropshipper/shops/${DROPEA_STORE_ID}/products/unlink`, { product_id });
      return res.status(200).json(resp.data || { success: false, error: resp.error });
    }

    // 5. Get Shop Status
    if (action === 'shop_status') {
      const resp = await requestDropea('GET', `/dropshipper/shops/${DROPEA_STORE_ID}`);
      return res.status(200).json(resp.data || { success: false, error: resp.error });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
