# 📋 REPORTE TÉCNICO Y ESTADO MAESTRO DE KIVANELI COSMETICS
**Fecha y Hora de Emisión:** 28 de Agosto de 2026 — 14:01:12 CEST (UTC+2)  
**Dominio Oficial en Producción:** [https://kivaneli.es](https://kivaneli.es)  
**Entorno de Despliegue:** Vercel Production Global CDN  
**Repositorio GitHub:** [https://github.com/Klarx94/kivaneli](https://github.com/Klarx94/kivaneli)  

---

## 1. 🌐 RESUMEN EJECUTIVO Y ESTADO ACTUAL

La plataforma de comercio electrónico de **KIVANELI Maison Botanique** se encuentra **100% operativa, optimizada y en producción** bajo el dominio oficial `kivaneli.es`. 

Se ha completado la transición estructural de la tienda hacia una marca de **cuidado personal, bienestar, tacto aterciopelado y cosmética de autor unisex**, eliminando por completo referencias médicas/clínicas anteriores y formatos digitales (PDFs), para centrarse exclusivamente en los productos físicos reales despachados desde el almacén logístico central en Madrid (Dropea España) con entrega urgente en 24/48h y pago contra-reembolso.

---

## 2. 🏗️ ARQUITECTURA DE CÓDIGO Y STACK TECNOLÓGICO

La web ha sido diseñada con un enfoque de **rendimiento extremo (Zero-Lag Architecture)**, prescindiendo de frameworks pesados que ralentizan la carga en dispositivos móviles:

* **Frontend / Estructura:** HTML5 Semántico + Tailwind CSS (vía CDN JIT con paleta personalizada de autor: Marfil `#FAF7F2`, Obsidiana `#181514`, Seda Rosa `#D48B80` y Rose Deep `#B86B60`).
* **Iconografía:** Lucide Icons (Renderizado SVG ultraligero).
* **Interactividad y Carrito:** Vanilla JavaScript ES6+ modular (`assets/js/kivaneli-cart.js`), con persistencia en `localStorage`, drawer deslizante (*slide-over*) y motor de upsells por impulso de 1 clic.
* **Ficha Universal de Producto (PDP):** `producto.html` con renderizador instantáneo basado en parámetros de URL (`?slug=...`) que carga imágenes, títulos, precios, variantes y recomendaciones sin saltos de página ni parpadeos.
* **Efectos Visuales & Multimedia:** Lazy-loading dinámico en vídeos e imágenes (`decoding="async"`, `loading="lazy"`), canvas-confetti y animaciones CSS por hardware.
* **Backend & Serverless Functions:** 
  * Vercel Serverless Functions Node.js (`/api/dropea-order.js`).
  * Integración con la API Oficial de Dropea España para creación directa de órdenes de despacho.
  * Base de datos y registro en Supabase (leads de newsletter, links de embajadoras Club Amigas y respaldo de órdenes).

---

## 3. 🗺️ MAPEO COMPLETO DE URLs PÚBLICAS Y FLUJOS

### 🛍️ Tienda y Catálogo
| Página / Sección | URL Pública en Producción | Función Principal |
| :--- | :--- | :--- |
| **Portada Principal** | [`https://kivaneli.es/`](https://kivaneli.es/) | Hero, 4 productos destacados, comparativa Antes/Después, Los 3 Secretos, vídeos paso a paso, opiniones y Club Amigas. |
| **Catálogo General** | [`https://kivaneli.es/catalogo`](https://kivaneli.es/catalogo) | Muestrario de toda la colección con filtros de categoría (Corporal, Ojos, Limpieza, Packs). |
| **Pasarela de Compra** | [`https://kivaneli.es/checkout`](https://kivaneli.es/checkout) | Formulario de pedido contra-reembolso / tarjeta, cupones, selector COD y transmisión a Dropea. |

### 🧴 Fichas de Producto Dinámicas (PDP)
| Producto | URL Directa | Tarifa Oficial |
| :--- | :--- | :---: |
| **ADEUS™ Crema Masaje (300 g)** | [`https://kivaneli.es/producto?slug=adeus-crema-corporal`](https://kivaneli.es/producto?slug=adeus-crema-corporal) | **29,90 €** (PVP habitual: 39,90 €) |
| **Parches Körmesic™ (60 uds)** | [`https://kivaneli.es/producto?slug=kormesic-parches-colageno`](https://kivaneli.es/producto?slug=kormesic-parches-colageno) | **19,95 €** (PVP habitual: 29,90 €) |
| **Jabón Ácido Kójico (100 g)** | [`https://kivaneli.es/producto?slug=jabon-acido-kojico`](https://kivaneli.es/producto?slug=jabon-acido-kojico) | **16,95 €** (PVP habitual: 24,90 €) |
| **Pack Ritual 3-en-1 Completo** | [`https://kivaneli.es/producto?slug=pack-ritual-completo`](https://kivaneli.es/producto?slug=pack-ritual-completo) | **59,95 €** (Ahorras 35 € vs suma) |

### 📖 Biblioteca Boticaria / Artículos
| Artículo / Guía | URL Pública | Enfoque Editorial |
| :--- | :--- | :--- |
| **Índice de la Biblioteca** | [`https://kivaneli.es/blog`](https://kivaneli.es/blog) | Directorio de artículos y captación VIP con cupón `SEDA10`. |
| **Guía Piel de Seda** | [`https://kivaneli.es/articulo-piel-de-fresa.html`](https://kivaneli.es/articulo-piel-de-fresa.html) | Consejos para eliminar asperezas y nutrir el cuerpo. |
| **Guía Ácido Kójico** | [`https://kivaneli.es/articulo-acido-kojico.html`](https://kivaneli.es/articulo-acido-kojico.html) | Limpieza clarificante y unificación del tono cutáneo. |
| **Guía Botánica** | [`https://kivaneli.es/articulo-centella-espino.html`](https://kivaneli.es/articulo-centella-espino.html) | Beneficios del masaje dérmico y nutrición vegetal. |
| **Guía Mirada Fresca** | [`https://kivaneli.es/articulo-parches-ojeras.html`](https://kivaneli.es/articulo-parches-ojeras.html) | Crioterapia e hidrogel para descongestionar ojos. |

---

## 4. 🔑 URLs Y PANELES DE GESTIÓN / ADMINISTRACIÓN

Para el control logístico, control de código, dominio y pasarelas:

* **Panel de Despliegue Vercel:** [https://vercel.com/architect-project/kivaneli](https://vercel.com/architect-project/kivaneli)
  * *Team:* `architect-project` (ID: `team_fkazdMji5JvizaMrJNotYGnO`)
  * *CLI Token de Despliegue:* Almacenado de forma segura en `vercel_token.txt`.
* **Repositorio GitHub Oficial:** [https://github.com/Klarx94/kivaneli](https://github.com/Klarx94/kivaneli)
* **Panel Logístico Dropea España:** [https://app.dropea.com](https://app.dropea.com)
  * *Store ID:* `18516` (Estado: `ACTIVE`)
  * *API Endpoint:* `https://es.public-api.dropea.com`
* **WhatsApp de Atención al Cliente:** [https://wa.me/34623550119](https://wa.me/34623550119) (`+34 623 55 01 19`)
* **Correo de Soporte Oficial:** `beauty@kivaneli.es`

---

## 5. 📦 MAPEO DE PRODUCTOS FÍSICOS Y MÁRGENES DE BENEFICIO

### Datos de Proveedor Logístico Dropea (Madrid):
| Producto Físico | Dropea ID | SKU Dropea | Stock Disponible | Coste Dropea Est. | PVP Tienda | Precio Upsell Carrito |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **ADEUS™ Crema Corporal (300 g)** | `32674` | `ADEUS_16181` | 291 uds | ~6,90 € | **29,90 €** | **24,95 €** |
| **Parches Körmesic™ (60 uds)** | `32055` | `EYEMASK-BOTOX` | Activo | ~3,90 € | **19,95 €** | **14,95 €** |
| **Jabón Ácido Kójico (100 g)** | `32591` | `JABONHYALUKISS` | 300 uds | ~2,90 € | **16,95 €** | **12,95 €** |
| **Pack Ritual 3-en-1 Completo** | Combo | Múltiple | 291 packs | ~13,70 € | **59,95 €** | N/A |

### Proyección de Rentabilidad (Margen Neto tras Coste de Producto y Envío GLS 4,95€):
* **Venta individual Crema ADEUS™ (29,90 €):** Margen bruto ≈ **18,05 €** por pedido.
* **Venta Pack Ritual 3-en-1 (59,95 €):** Margen bruto ≈ **41,30 €** por pedido.
* **Proyección a 25 Ventas:** Margen neto estimado entre **450 €** y **1.030 €**.
* **Proyección a 50 Ventas:** Margen neto estimado entre **900 €** y **2.065 €**.
* **Proyección a 100 Ventas:** Margen neto estimado entre **1.800 €** y **4.130 €**.

---

## 6. 🛠️ MEJORAS REALIZADAS Y PULIDO VISUAL FINAL

1. **Estructura del Menú Flotante (`max-w-4xl`):**
   * Cabecera compacta tipo isla de cristal con enlaces universales: *Catálogo*, *El Ritual*, *Opiniones*, *Club Amigas*, *Biblioteca* y *Cesta*.
   * Eliminada la pestaña redundante que causaba saltos y desalineación.
   * Totalmente sincronizado e idéntico en Portada, Catálogo, PDP, Blog y Artículos.
2. **Reordenación de Secciones en Portada:**
   * La sección **"La Transformación en tu Piel"** (Antes/Después) se colocó inmediatamente después de las primeras 4 tarjetas de producto, sirviendo de separador editorial y evitando la acumulación seguida de fichas.
   * La sección de **Opiniones Reales (`#testimonios`)** con avatares reales, valoraciones 4.92/5 y filtros por producto quedó restituida inmediatamente encima de **Club Amigas (`#amigas`)**.
3. **Galería de Ficha de Parches Reparada:**
   * Sustituidas las imágenes rotas por las 4 fotografías en alta resolución (`kormesic_jar_purple.jpg`, `kormesic_patch_face.jpg`, `ugc_patches_eyes.jpg`, `ugc_patches_box.jpg`).
4. **Navegación Rápida entre Fichas (*Quick Switch*):**
   * En la parte inferior de cada ficha de producto se implementó el bloque **"Descubre los Otros Rituales de la Maison"**, permitiendo al usuario saltar entre productos o añadirlos a la cesta sin tener que volver al catálogo.
5. **Responsividad Absoluta y Fijación de Precios:**
   * Eliminación de barras negras estáticas superiores que colisionaban con el menú flotante en móviles.
   * Ajuste de `padding-top` en Hero y cabeceras para que ningún texto quede cortado tras el menú.
   * Inclusión de `whitespace-nowrap` y espacios no separables (`&nbsp;€`) en todos los precios de la tienda para impedir que el símbolo de euro baje de línea.

---

## 7. 🚀 PASOS SIGUIENTES PARA FINALIZAR EL PROYECTO

1. **Simulación y Prueba Manual de Compra:**
   * Entrar a [https://kivaneli.es/checkout](https://kivaneli.es/checkout), rellenar un pedido de prueba con la opción de *Pago Contra-Reembolso* y validar la confirmación en pantalla y recepción en Dropea.
2. **Integración de Pasarela de Tarjeta (Revolut Pay / Redsys / Stripe):**
   * Añadir el botón oficial de Revolut Pay o Stripe Elements en `checkout.html` para los clientes que elijan pagar con tarjeta de crédito/débito, Apple Pay o Google Pay.
3. **Guía Rápida para Añadir Nuevos Productos o Modificar Precios:**
   * Para cambiar un precio o añadir un producto nuevo, solo se modifica el objeto maestro en [`assets/js/kivaneli-cart.js`](file:///C:/Users/karc0/OneDrive/Desktop/kivaneli/assets/js/kivaneli-cart.js) y se añade la tarjeta correspondiente en [`catalogo.html`](file:///C:/Users/karc0/OneDrive/Desktop/kivaneli/catalogo.html). El sistema actualizará automáticamente el carrito, los upsells y las fichas.
4. **Conexión de Analítica y Píxeles:**
   * Insertar el ID de píxel de Meta (Facebook/Instagram Ads) o TikTok Ads en las etiquetas `<head>` cuando se inicie la pauta publicitaria.

---
*Reporte generado automáticamente para el equipo directivo de Kivaneli Cosmetics.*
