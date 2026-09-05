/**
 * KIVANELI Maison Botanique — Global E-Commerce & Cart Engine
 * Handles: Cart State (localStorage), Slide-Over Drawer, Impulse Cross-Sells,
 * Dynamic Price Updates, and Global Floating WhatsApp Concierge.
 */

// Product Master Catalog for Cart & Upsells — loaded live from /api/products (Neon) so
// products the admin adds/edits show up everywhere without touching this file. This
// object is kept as a fallback in case that fetch fails (offline, cold start, etc.).
const KIVANELI_PRODUCTS_FALLBACK = {
  'adeus-crema-corporal': {
    id: 'adeus-crema-corporal',
    name: 'ADEUS™ Crema Corporal Masaje & Seda (300 g)',
    shortName: 'ADEUS™ Crema 300g',
    price: 29.90,
    regularPrice: 39.90,
    impulsePrice: 24.95,
    image: 'assets/images/adeus_jar_botanicals.jpg',
    category: 'Cuidado Corporal',
    badge: 'MÁS VENDIDO · 300 G',
    dropeaVariantId: 32674,
    dropeaVariantSku: 'ADEUS_16181',
    slug: 'adeus-crema-corporal'
  },
  'kormesic-parches-colageno': {
    id: 'kormesic-parches-colageno',
    name: 'Parches de Colágeno & Hidrogel Körmesic™ (60 uds / 30 pares)',
    shortName: 'Parches Körmesic™ 60u',
    price: 19.95,
    regularPrice: 29.90,
    impulsePrice: 14.95,
    image: 'assets/images/kormesic_jar_purple.jpg',
    category: 'Mirada & Rostro',
    badge: '60 UDS · HIDROGEL',
    dropeaVariantId: 32055,
    dropeaVariantSku: 'EYEMASK-BOTOX',
    slug: 'kormesic-parches-colageno'
  },
  'jabon-acido-kojico': {
    id: 'jabon-acido-kojico',
    name: 'Jabón Clarificante Ácido Kójico + Hialurónico (100 g)',
    shortName: 'Jabón Kójico 100g',
    price: 16.95,
    regularPrice: 24.90,
    impulsePrice: 12.95,
    image: 'assets/images/kojic_soap_box.jpg',
    category: 'Limpieza & Tono',
    badge: '100 G · CLARIFICANTE',
    dropeaVariantId: 32591,
    dropeaVariantSku: 'JABONHYALUKISS',
    slug: 'jabon-acido-kojico'
  },
  'pack-ritual-completo': {
    id: 'pack-ritual-completo',
    name: 'Pack Ritual Boticario 3-en-1 (ADEUS + Parches + Jabón)',
    shortName: 'Pack Ritual 3-en-1',
    price: 59.95,
    regularPrice: 94.70,
    impulsePrice: 59.95,
    image: 'assets/images/pack_ritual_3in1_collage.svg',
    category: 'Ritual Completo',
    badge: 'AHORRA 35€ · RITUAL COMPLETO',
    dropeaVariantId: 32674,
    dropeaVariantSku: 'PACK_RITUAL_3IN1',
    slug: 'pack-ritual-completo'
  }
};

let KIVANELI_PRODUCTS = { ...KIVANELI_PRODUCTS_FALLBACK };

async function loadKivaneliProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && Array.isArray(data.products) && data.products.length) {
      const fresh = {};
      data.products.forEach(p => {
        fresh[p.slug] = {
          id: p.slug,
          name: p.name,
          shortName: p.short_name || p.name,
          price: parseFloat(p.price),
          regularPrice: p.regular_price != null ? parseFloat(p.regular_price) : null,
          impulsePrice: p.impulse_price != null ? parseFloat(p.impulse_price) : parseFloat(p.price),
          image: p.image_url,
          category: p.category,
          badge: p.badge,
          dropeaVariantId: p.dropea_variant_id,
          dropeaVariantSku: p.dropea_sku,
          slug: p.slug,
          descriptionHtml: p.description_html || '',
          extraImages: p.extra_images || [],
          videoUrl: p.video_url || null,
          bundleItems: p.bundle_items || null,
          showInHome: p.show_in_home !== false,
          showInUpsell: p.show_in_upsell !== false,
          showInRecommended: p.show_in_recommended !== false,
          inStock: p.in_stock !== false
        };
      });
      KIVANELI_PRODUCTS = fresh;
    }
  } catch (e) {
    console.log('Using fallback product catalog:', e.message);
  }
}

class KivaneliCart {
  constructor() {
    this.cartKey = 'kivaneli_cart_v2';
    this.items = this.loadCart();
    this.init();
  }

  loadCart() {
    try {
      const saved = localStorage.getItem(this.cartKey);
      return saved ? JSON.parse(saved) : [];
    } catch(e) {
      return [];
    }
  }

  saveCart() {
    try {
      localStorage.setItem(this.cartKey, JSON.stringify(this.items));
      this.updateBadges();
      this.renderDrawerItems();
    } catch(e) {
      console.error('Error saving cart:', e);
    }
  }

  addItem(productId, quantity = 1, isImpulse = false) {
    const product = KIVANELI_PRODUCTS[productId];
    if (!product) return;
    if (product.inStock === false) {
      alert(`Lo sentimos, "${product.shortName || product.name}" está agotado temporalmente.`);
      return;
    }

    const unitPrice = isImpulse ? product.impulsePrice : product.price;
    const existing = this.items.find(item => item.id === productId);

    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({
        id: product.id,
        name: product.name,
        shortName: product.shortName,
        price: unitPrice,
        regularPrice: product.regularPrice,
        image: product.image,
        quantity: quantity,
        dropeaVariantId: product.dropeaVariantId,
        dropeaVariantSku: product.dropeaVariantSku,
        isImpulse: isImpulse
      });
    }

    this.saveCart();
    this.openDrawer();
    if (window.confetti) confetti({ particleCount: 35, spread: 50, origin: { y: 0.8 } });
    if (window.kivaneliTrack) {
      window.kivaneliTrack.addToCart({ id: product.id, name: product.name, price: unitPrice, quantity });
    }
  }

  removeItem(productId) {
    this.items = this.items.filter(item => item.id !== productId);
    this.saveCart();
  }

  updateQuantity(productId, delta) {
    const item = this.items.find(i => i.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      this.removeItem(productId);
    } else {
      this.saveCart();
    }
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getItemCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  updateBadges() {
    const count = this.getItemCount();
    document.querySelectorAll('.cart-badge-count').forEach(el => {
      el.innerText = count;
      if (count > 0) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  renderDrawerItems() {
    const container = document.getElementById('cartDrawerItems');
    const emptyState = document.getElementById('cartDrawerEmpty');
    const subtotalEl = document.getElementById('cartDrawerSubtotal');
    const checkoutBtn = document.getElementById('cartDrawerCheckoutBtn');
    const crossSellsContainer = document.getElementById('cartDrawerCrossSells');

    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (subtotalEl) subtotalEl.innerHTML = '0,00&nbsp;€';
      if (checkoutBtn) {
        checkoutBtn.classList.add('opacity-50', 'pointer-events-none');
      }
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (checkoutBtn) {
        checkoutBtn.classList.remove('opacity-50', 'pointer-events-none');
      }

      container.innerHTML = this.items.map(item => `
        <div class="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white border border-stone-200/80 shadow-xs">
          <img src="${item.image}" alt="${item.name}" class="w-16 h-16 rounded-xl object-cover border border-stone-100 flex-shrink-0">
          <div class="flex-1 min-w-0">
            <h4 class="font-serif-luxury font-bold text-xs text-[#181514] truncate">${item.shortName || item.name}</h4>
            <div class="flex items-baseline gap-2 mt-0.5">
              <span class="whitespace-nowrap font-black text-sm text-[#D48B80]">${(item.price * item.quantity).toFixed(2).replace('.', ',')}&nbsp;€</span>
              ${item.regularPrice ? `<span class="whitespace-nowrap text-[10px] text-stone-400 line-through">${(item.regularPrice * item.quantity).toFixed(2).replace('.', ',')}&nbsp;€</span>` : ''}
            </div>
            <div class="flex items-center gap-2 mt-2">
              <button onclick="window.kivaneliCart.updateQuantity('${item.id}', -1)" class="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 font-bold flex items-center justify-center hover:bg-stone-200 transition text-xs">-</button>
              <span class="text-xs font-bold text-[#181514] px-1">${item.quantity}</span>
              <button onclick="window.kivaneliCart.updateQuantity('${item.id}', 1)" class="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 font-bold flex items-center justify-center hover:bg-stone-200 transition text-xs">+</button>
            </div>
          </div>
          <button onclick="window.kivaneliCart.removeItem('${item.id}')" title="Eliminar producto" class="w-7 h-7 rounded-full text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `).join('');

      const total = this.getTotal();
      if (subtotalEl) subtotalEl.innerHTML = total.toFixed(2).replace('.', ',') + '&nbsp;€';
    }

    // Render Impulse Cross-sells (Only individual items not in cart)
    if (crossSellsContainer) {
      const cartItemIds = this.items.map(i => i.id);
      const availableUpsells = Object.values(KIVANELI_PRODUCTS).filter(p => p.id !== 'pack-ritual-completo' && p.inStock !== false && !cartItemIds.includes(p.id));

      if (availableUpsells.length === 0 || this.items.length === 0) {
        crossSellsContainer.innerHTML = '';
      } else {
        crossSellsContainer.innerHTML = `
          <div class="pt-4 border-t border-stone-200/80 space-y-2.5">
            <div class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#B86B60]">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-[#D48B80]"></i>
              <span>Añadir con Descuento Especial Inmediato:</span>
            </div>
            <div class="space-y-2">
              ${availableUpsells.map(up => `
                <div class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#FAF7F2] border border-[#D48B80]/30 shadow-2xs">
                  <img src="${up.image}" alt="${up.name}" class="w-11 h-11 rounded-lg object-cover flex-shrink-0">
                  <div class="flex-1 min-w-0">
                    <div class="font-serif-luxury font-bold text-xs text-[#181514] truncate">${up.shortName}</div>
                    <div class="flex items-baseline gap-1.5 text-[11px]">
                      <span class="whitespace-nowrap font-bold text-[#B86B60]">+${up.impulsePrice.toFixed(2).replace('.', ',')}&nbsp;€</span>
                      <span class="whitespace-nowrap text-[10px] text-stone-400 line-through">${up.price.toFixed(2).replace('.', ',')}&nbsp;€</span>
                    </div>
                  </div>
                  <button onclick="window.kivaneliCart.addItem('${up.id}', 1, true)" class="bg-[#181514] text-white px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase hover:bg-[#D48B80] transition whitespace-nowrap flex items-center gap-1 shadow-xs">
                    <i data-lucide="plus" class="w-3 h-3"></i>
                    <span>Añadir</span>
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  openDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (drawer && backdrop) {
      backdrop.classList.remove('hidden');
      backdrop.classList.add('opacity-100');
      drawer.classList.remove('translate-x-full');
      this.renderDrawerItems();
    }
  }

  closeDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (drawer && backdrop) {
      drawer.classList.add('translate-x-full');
      backdrop.classList.add('hidden');
      backdrop.classList.remove('opacity-100');
    }
  }

  goToCheckout() {
    if (this.items.length === 0) return;
    window.location.href = 'checkout.html';
  }

  init() {
    this.injectDrawerMarkup();
    this.injectWhatsAppWidget();
    this.updateBadges();
  }

  injectDrawerMarkup() {
    if (document.getElementById('cartDrawer')) return;

    const drawerHTML = `
      <!-- 🛒 GLOBAL CART DRAWER BACKDROP -->
      <div id="cartDrawerBackdrop" onclick="window.kivaneliCart.closeDrawer()" class="fixed inset-0 z-50 bg-[#181514]/60 backdrop-blur-xs transition-opacity duration-300 hidden"></div>

      <!-- 🛒 GLOBAL CART SLIDE-OVER DRAWER -->
      <div id="cartDrawer" class="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-[#FAF7F2] shadow-2xl border-l border-[#D48B80]/20 flex flex-col justify-between transform translate-x-full transition-transform duration-300 ease-in-out">
        
        <!-- Drawer Header -->
        <div class="p-5 sm:p-6 border-b border-stone-200/80 flex items-center justify-between bg-white">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-rose-gradient text-white flex items-center justify-center font-serif-luxury font-bold text-xs shadow-xs">K</div>
            <div>
              <h3 class="font-serif-luxury font-black text-base text-[#181514]">Tu Cesta de Belleza</h3>
              <p class="text-[10px] text-stone-500 font-semibold uppercase tracking-wider">Despacho Logístico Urgente España</p>
            </div>
          </div>
          <button onclick="window.kivaneliCart.closeDrawer()" aria-label="Cerrar Cesta" class="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Drawer Content Area -->
        <div class="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          <!-- Empty State -->
          <div id="cartDrawerEmpty" class="text-center py-12 space-y-4 hidden">
            <div class="w-16 h-16 rounded-full bg-[#F6EAE7] text-[#B86B60] flex items-center justify-center mx-auto shadow-inner">
              <i data-lucide="shopping-bag" class="w-8 h-8"></i>
            </div>
            <div class="space-y-1">
              <h4 class="font-serif-luxury font-bold text-base text-[#181514]">Tu cesta está vacía</h4>
              <p class="text-xs text-stone-500">Selecciona un producto para comenzar tu ritual de cuidado personal.</p>
            </div>
            <a href="catalogo.html" onclick="window.kivaneliCart.closeDrawer()" class="inline-block bg-[#181514] text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#D48B80] transition shadow-md">
              Explorar Catálogo
            </a>
          </div>

          <!-- Items List -->
          <div id="cartDrawerItems" class="space-y-3"></div>

          <!-- Impulse Cross-sells -->
          <div id="cartDrawerCrossSells"></div>

          <!-- Delivery Guarantee Pill -->
          <div class="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-2.5">
            <i data-lucide="truck" class="w-4 h-4 text-emerald-600 flex-shrink-0"></i>
            <span><strong>Envío Urgente 24/48h GLS Express</strong> directo a tu puerta con opción de pago contra-reembolso.</span>
          </div>

        </div>

        <!-- Drawer Footer -->
        <div class="p-5 sm:p-6 border-t border-stone-200/80 bg-white space-y-3 shadow-lg">
          <div class="flex items-baseline justify-between text-xs text-stone-600">
            <span>Subtotal estimado:</span>
            <span id="cartDrawerSubtotal" class="font-serif-luxury font-black text-xl text-[#181514]">0,00 €</span>
          </div>
          <div class="text-[10px] text-stone-400 flex items-center justify-between">
            <span>Envío a península:</span>
            <span class="text-emerald-700 font-bold uppercase">GRATIS</span>
          </div>

          <button id="cartDrawerCheckoutBtn" onclick="window.kivaneliCart.goToCheckout()" class="btn-shimmer w-full bg-rose-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-[#D48B80]/40 hover:scale-[1.01] transition flex items-center justify-center gap-2">
            <span>TRAMITAR PEDIDO CON PAGO SEGURO</span>
            <i data-lucide="arrow-right" class="w-4 h-4"></i>
          </button>

          <p class="text-center text-[10px] text-stone-400">
            🔒 Pago en efectivo al recibir en puerta o con tarjeta 100% encriptado SSL.
          </p>
        </div>

      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHTML);
  }

  injectWhatsAppWidget() {
    if (document.getElementById('whatsappFloatingBtn')) return;

    const whatsappHTML = `
      <!-- 💬 GLOBAL FLOATING WHATSAPP BUTTON (623550119) -->
      <div id="whatsappFloatingBtn" class="fixed bottom-6 right-6 z-40">
        <a href="https://wa.me/34623550119?text=Hola%20Kivaneli,%20tengo%20una%20consulta%20sobre%20los%20productos%20de%20cuidado%20personal%20y%20el%20envio%20contra-reembolso" target="_blank" rel="noopener noreferrer" class="bg-[#25D366] text-white p-3.5 md:px-5 md:py-3.5 rounded-full shadow-2xl flex items-center gap-2.5 font-bold text-xs hover:scale-105 hover:shadow-emerald-500/40 transition duration-300 group border-2 border-white">
          <i data-lucide="message-circle" class="w-5 h-5 fill-current"></i>
          <span class="hidden sm:inline font-sans">¿Dudas? Escríbenos por WhatsApp</span>
        </a>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', whatsappHTML);
  }
}

// Captures a "Club Amigas" referral code from ?ref=CODE on any page and remembers it
// for 30 days so it's still there whenever the visitor eventually checks out.
function captureReferralCode() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      localStorage.setItem('kivaneli_referral_code', ref.toUpperCase());
      localStorage.setItem('kivaneli_referral_captured_at', Date.now().toString());
    }
  } catch (e) { /* localStorage unavailable — not critical */ }
}

function getActiveReferralCode() {
  try {
    const capturedAt = parseInt(localStorage.getItem('kivaneli_referral_captured_at') || '0');
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    if (capturedAt && Date.now() - capturedAt < THIRTY_DAYS_MS) {
      return localStorage.getItem('kivaneli_referral_code') || null;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// Initialize Global Cart — waits for the live product catalog so the cart, drawer and
// upsells always reflect whatever is actually configured in the admin panel.
window.addEventListener('DOMContentLoaded', async () => {
  captureReferralCode();
  await loadKivaneliProducts();
  window.kivaneliCart = new KivaneliCart();
  if (window.lucide) lucide.createIcons();
  document.dispatchEvent(new CustomEvent('kivaneli:cart-ready'));
});
