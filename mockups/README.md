# Mockups

Todos los mockups del lienzo de diseño de Sepárame, exportados del artifact
(https://claude.ai/artifact/NzP2yy3ZJkNRZamXN4zTyD, privado).

**La línea A "Cercano" es la elegida y la fuente de verdad visual**: la implementación debe
reproducirla exactamente (colores, tipografía, espaciados, radios y textos) y funcionar perfecto
en celular y escritorio. Las líneas B y C quedan como registro de la exploración.

```
mockups/
  line-a/            Línea A · Cercano (elegida): verde y amarillo, tuteo, formas redondas
  line-b/            Exploración B · Confiable: azul institucional, trato de usted
  line-c/            Exploración C · Moderno: negro, violeta y lima, tipografía grande
  canvas-index.json  Índice original del lienzo (posiciones, títulos, páginas) con los nombres originales
```

## Formato

Los `.dc.html` son componentes del lienzo: el marcado va dentro de `<x-dc>` con estilos inline, y los
datos y estilos dinámicos (seleccionado, deshabilitado…) están en `renderVals()` del `<script>` final.
Para reproducir un mockup, lee las dos partes. Se ven tal cual en el lienzo; fuera de él no hay runtime.

## Línea A (elegida)

| Archivo | Pantalla | Nombre original |
|---|---|---|
| `client-booking-steps.dc.html` | Reserva por pasos (servicio → día y hora → datos → confirmar). **Es la implementada.** | `Pasos` |
| `client-booking-steps-at-step-{2,3,4}.dc.html` | El mismo flujo abierto en el paso 2, 3 y 4 (importa `client-booking-steps`) | `Pasos-2/3/4` |
| `client-booking-single-page.dc.html` | Reserva en una sola página (referencia del encabezado del perfil) | `Main` |
| `client-booking-confirmed.dc.html` | Cita confirmada | `A-Confirmada` |
| `client-manage-appointment.dc.html` | Cancelar o reprogramar (enlace del correo) | `A-Gestionar` |
| `client-agenda-unavailable.dc.html` | Agenda no disponible (suscripción vencida) | `A-NoDisponible` |
| `email-booking-confirmed.dc.html` | Correo de confirmación | `A-Correo` |
| `pro-agenda-day.dc.html` | Panel del profesional: agenda del día | `A-Profesional` |
| `pro-services.dc.html` | Servicios | `A-Servicios` |
| `pro-availability.dc.html` | Disponibilidad | `A-Disponibilidad` |
| `pro-billing-plans.dc.html` | Elegir plan (el mockup muestra Wompi; se implementó con "Ya pagué") | `A-Plan` |
| `pro-expired-read-only.dc.html` | Panel en solo lectura (plan vencido) | `A-Vencida` |
| `admin-subscriptions.dc.html` | Admin: suscripciones | `A-Admin` |
| `admin-pro-detail-manual-payment.dc.html` | Admin: detalle del profesional y pago manual | `A-Admin-Profesional` |
| `admin-prices.dc.html` | Admin: precios y migraciones | `A-Admin-Precios` |

## Exploración (líneas B y C)

| Archivo | Pantalla | Nombre original |
|---|---|---|
| `line-b/client-booking.dc.html` | Reserva en una página, calendario mensual | `B-Reserva` |
| `line-b/client-booking-confirmed.dc.html` | Cita confirmada | `B-Confirmada` |
| `line-b/pro-agenda-week.dc.html` | Panel: vista semanal | `B-Profesional` |
| `line-b/admin-subscriptions.dc.html` | Admin: suscripciones y precios | `B-Admin` |
| `line-c/client-booking.dc.html` | Reserva en una página, 14 días deslizables | `C-Reserva` |
| `line-c/client-booking-confirmed.dc.html` | Cita confirmada | `C-Confirmada` |
| `line-c/pro-agenda-day.dc.html` | Panel: agenda del día | `C-Profesional` |
| `line-c/admin-subscriptions.dc.html` | Admin: suscripciones y precios | `C-Admin` |

## Tokens de la línea A

En `shared/brand.json` (correos) y `frontend/theme.css` (Tailwind); un test los mantiene sincronizados.
Verde `#0B6E4F` (oscuro `#084C37`), amarillo `#FFC93C`, tinta `#15241D`. Tipografías: Bricolage
Grotesque 800 (títulos) + Figtree 400–700 (texto). Botones en píldora, radios de 14–24 px, tuteo.
