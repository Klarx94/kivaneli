// Shared, server-authoritative pricing logic. Nothing about a cart's total is ever trusted
// from the client — every order-creating endpoint (COD, Stripe session) recomputes the real
// total here from the products table before persisting or charging anything. Previously
// api/dropea-order.js and api/create-checkout-session.js both took body.total_amount as-is,
// which meant anyone could POST any price they wanted for a real product.

const { sql } = require('./_db');

async function validateCoupon(code, subtotal) {
  if (!code) return { valid: false, discount: 0, appliedCode: null };

  const [coupon] = await sql`
    SELECT code, discount_type, discount_value, min_order_amount, is_active, max_uses, uses_count, expires_at
    FROM discount_coupons WHERE code = ${String(code).trim().toUpperCase()}
  `;

  if (!coupon || !coupon.is_active) return { valid: false, discount: 0, appliedCode: null };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return { valid: false, discount: 0, appliedCode: null };
  if (coupon.uses_count >= coupon.max_uses) return { valid: false, discount: 0, appliedCode: null };
  if (subtotal < parseFloat(coupon.min_order_amount || 0)) return { valid: false, discount: 0, appliedCode: null };

  const discount = coupon.discount_type === 'PERCENTAGE'
    ? subtotal * (parseFloat(coupon.discount_value) / 100)
    : parseFloat(coupon.discount_value);

  return { valid: true, discount: parseFloat(discount.toFixed(2)), appliedCode: coupon.code };
}

// cartItems: [{ id: slug, quantity, isImpulse }] — price is intentionally NOT read from the
// client. Returns the real subtotal/discount/total plus a normalized items array (with the
// real unit price attached) for resolveDropeaLineItems to use downstream.
async function computeAuthoritativeOrder(cartItems, couponCode) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('El carrito está vacío o es inválido');
  }
  if (cartItems.length > 20) {
    throw new Error('Carrito con demasiadas líneas');
  }

  let subtotal = 0;
  const resolvedItems = [];

  for (const item of cartItems) {
    const quantity = Math.min(50, Math.max(1, parseInt(item.quantity) || 1));
    const [product] = await sql`
      SELECT slug, price, impulse_price FROM products WHERE slug = ${item.id} AND is_active = true
    `;
    if (!product) throw new Error(`Producto no disponible: ${item.id}`);

    const unitPrice = item.isImpulse && product.impulse_price != null
      ? parseFloat(product.impulse_price)
      : parseFloat(product.price);

    const lineTotal = parseFloat((unitPrice * quantity).toFixed(2));
    subtotal += lineTotal;
    resolvedItems.push({ id: product.slug, quantity, price: lineTotal, isImpulse: !!item.isImpulse });
  }

  subtotal = parseFloat(subtotal.toFixed(2));
  const { discount, appliedCode } = await validateCoupon(couponCode, subtotal);
  const total = Math.max(0, parseFloat((subtotal - discount).toFixed(2)));

  return { subtotal, discount, total, appliedCoupon: appliedCode, items: resolvedItems };
}

module.exports = { validateCoupon, computeAuthoritativeOrder };
