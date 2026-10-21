# Mockups — línea visual A "Cercano"

Fuente de verdad visual de Sepárame. La implementación debe reproducirlos **exactamente**
(colores, tipografía, espaciados, radios, textos) y funcionar perfecto en celular y escritorio.

Lienzo interactivo (privado): https://claude.ai/artifact/NzP2yy3ZJkNRZamXN4zTyD

Los archivos `.dc.html` son componentes del lienzo: el marcado va dentro de `<x-dc>` con
estilos inline, y los datos y estilos dinámicos están en `renderVals()` del `<script>`.

| Archivo | Pantalla |
|---|---|
| `client-booking-steps.dc.html` | Reserva por pasos (servicio → día y hora → datos → confirmar). **Es la que se implementa.** |
| `client-booking-single-page.dc.html` | Reserva en una sola página (referencia del encabezado del perfil y estilos) |
| `client-booking-confirmed.dc.html` | Cita confirmada |
| `client-manage-appointment.dc.html` | Cancelar o reprogramar (enlace del correo) |
| `client-agenda-unavailable.dc.html` | Agenda no disponible (suscripción vencida) |
| `email-booking-confirmed.dc.html` | Correo de confirmación |
| `pro-agenda-day.dc.html` | Panel del profesional: agenda del día |
| `pro-services.dc.html` | Servicios |
| `pro-availability.dc.html` | Disponibilidad |
| `pro-billing-plans.dc.html` | Elegir plan y pagar con Wompi |
| `pro-expired-read-only.dc.html` | Panel en solo lectura (plan vencido) |
| `admin-subscriptions.dc.html` | Admin: suscripciones |
| `admin-pro-detail-manual-payment.dc.html` | Admin: detalle del profesional y pago manual |
| `admin-prices.dc.html` | Admin: precios y migraciones |

## Tokens (también en `shared/brand.json`)
- Verde `#0B6E4F` (oscuro `#084C37`), amarillo `#FFC93C`, tinta `#15241D`.
- Tipografías: Bricolage Grotesque 800 (títulos) + Figtree 400–700 (texto).
- Botones en píldora, radios de 14–24 px, tuteo.
