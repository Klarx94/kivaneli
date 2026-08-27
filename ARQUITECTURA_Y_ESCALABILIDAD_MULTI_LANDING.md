# 🏛️ ARQUITECTURA TÉCNICA, AUTOMATIZACIÓN DE EMAILS Y GUÍA DE ESCALABILIDAD MULTI-LANDING — KIVANELI COSMETICS
*Documento Maestro de Arquitectura, Continuidad Operativa y Guía de Implementación para Futuros Agentes / Desarrolladores.*
*Fecha de Emisión: 27 de Agosto de 2026.*

---

## 1. 📋 Resumen del Ecosistema en Producción

* **Dominio Corporativo Principal:** `https://kivaneli.es/` (Canónicos y sitemaps vinculados).
* **Alojamiento Edge:** Vercel Global Edge CDN (Proyecto `kivaneli`, Equipo `Architect Project`).
* **Base de Datos & Auth:** Supabase PostgreSQL (Proyecto `sntsizmdhttpilbauxuv`, Región Londres `eu-west-2`).
* **Correo Corporativo Transaccional:** Arsys Correo Pro (`beauty@kivaneli.es`, Servidor `smtp.serviciodecorreo.es:465` SSL/TLS).
* **Logística & Despacho:** Dropea Logistics (Madrid, 24/48h).

---

## 2. ✉️ Checklist de Correos Transaccionales y Campañas de Retargeting

Se han creado, diseñado y cargado en la tabla `email_templates` de Supabase las siguientes **6 plantillas transaccionales**:

| # | Slug de Plantilla | Tipo / Categoría | Asunto del Correo | Enlace / Regalo Incluido |
|---|---|---|---|---|
| **1** | `order_confirmation` | Transaccional (Inmediato) | `✨ Pedido Confirmado #{{order_number}} — Tu Ritual Piel de Seda` | Factura Digital + Acceso a la **Guía Maestra & Diario 30 Días (PDF)** |
| **2** | `abandoned_checkout_recovery` | Retargeting (2h / 24h) | `🌸 {{customer_name}}, hemos reservado tu Lote (+ Regalo Exclusivo)` | Cupón de rescate **SEDA10** (10% DTO) + Envío Prioritario |
| **3** | `amiga_welcome_referral` | Comunidad / Viral | `💜 ¡Bienvenida al Club Kivaneli & Amigas! Tu pase está activo` | Enlace de Embajadora único (`kivaneli.es/?ref=...`) |
| **4** | `amiga_reward_earned` | Notificación Recompensa | `🎉 ¡Enhorabuena {{referrer_name}}! Tu amiga ha completado su pedido` | Código de **Vale de 15,00 €** para su próxima compra |
| **5** | `post_purchase_checkin_day7` | Nurture / Fidelización | `🌿 Día 7 con ADEUS™: Tu piel empieza a renovarse por completo` | Consejos de drenaje linfático + Recordatorio de registro en el Diario |
| **6** | `winback_promo_30days` | Retargeting / Reposición | `✨ {{customer_name}}, ¿se termina tu primer tarro? Tu 20% VIP` | Cupón de reposición **VIP20** (20% DTO + Envío Gratis) |

> **Cumplimiento RGPD:** Cada plantilla incluye en el pie de página el enlace directo de baja (`https://kivaneli.es/baja?email=...`) conectado a la tabla `unsubscribes` en Supabase.

---

## 3. 🏷️ Motor de Cupones & Descuentos Activos en Base de Datos

Tabla Supabase: `discount_coupons`

| Código | Tipo | Valor | Pedido Mínimo | Estado | Propósito |
|---|---|---|---|---|---|
| **`SEDA10`** | Porcentaje | **10%** | 0 € | 🟢 Activo | Cupón general de bienvenida y newsletter |
| **`BIENVENIDA5`** | Importe Fijo | **5,00 €** | 25 € | 🟢 Activo | Rescate de carrito y referidos iniciales |
| **`VIP15`** | Porcentaje | **15%** | 0 € | 🟢 Activo | Socias VIP recurrentes del Club Kivaneli |
| **`TIKTOK10`** | Porcentaje | **10%** | 0 € | 🟢 Activo | Campañas de creadores de contenido y UGC |

---

## 4. 📚 Guías Editoriales y Lead Magnets Desarrollados (Formato PDF / Imprimible)

Ubicación en el repositorio: [`assets/docs/`](file:///C:/Users/karc0/OneDrive/Desktop/kivaneli/assets/docs/)

1. **`Guia_Diario_Ritual_30_Dias_Kivaneli.html` (Diario Clínico de 30 Días):**
   * 30 páginas interactivas imprimibles con casillas para marcar ritual de mañana, ritual de noche, vasos de agua, escala de suavidad del 1 al 10, notas de sensaciones diarias y evaluaciones semanales.
2. **`Guia_Secretos_Fitocosmetica_Kivaneli.html` (Tratado Boticario):**
   * Más de 15 secciones de dermatología aplicada: Mecanismo del Madecassoside, regeneración de la barrera de lípidos con Omega-7 (Espino Amarillo), e inhibición de tirosinasa con Ácido Kójico.
3. **`Guia_Protocolo_Mirada_Radiante_15Min.html` (Guía Periocular):**
   * Protocolo de 15 minutos con 5 puntos de acupresión linfática (*Zanzhu, Yuyao, Sizhukong, Tongziliao, Chengqi*) y terapia de frío con colágeno hidrolizado.

---

## 5. 🚀 Procedimiento para Clonar y Crear Futuras Micro-Landings

Para añadir una nueva micro-landing (ejemplo: *Micro-Landing de Parches Körmesic* o *Micro-Landing de Jabón Kójico*):

### Paso 1: Registrar la Landing en Supabase
Ejecutar en la tabla `landings`:
```sql
INSERT INTO landings (id, name, domain, slug, is_active)
VALUES ('kivaneli-mirada-kormesic', 'Landing Mirada Radiante — Körmesic™', 'kivaneli.es', '/landing-mirada', true);
```

### Paso 2: Crear el Archivo HTML de la Micro-Landing
* Crear `landing-mirada.html` en la raíz del proyecto.
* Configurar el selector del formulario para asignar `landing_id: 'kivaneli-mirada-kormesic'` en los pedidos insertados en la tabla `orders`.

### Paso 3: Gestión desde el Panel Admin (`admin.html`)
* En el desplegable superior de `admin.html`, seleccionar la landing deseada para filtrar pedidos, cupones y audiencias de retargeting de forma independiente.

---

## 6. 🔐 Credenciales y Canales de Conexión

* **Servidor Saliente SMTP Arsys:**
  * Host: `smtp.serviciodecorreo.es`
  * Puerto: `465` (SSL/TLS)
  * Usuario: `beauty@kivaneli.es`
  * Webmail: `https://correo.arsys.es`
* **Supabase Pooler:**
  * Host: `aws-0-eu-west-2.pooler.supabase.com:6543/postgres`
  * Contraseña Postgres: `Alex_019403.`
