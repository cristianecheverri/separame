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
Los archivos nuevos conservan en el repo el mismo nombre que tienen en el lienzo; los originales (`A-*`, `Pasos*`, `Main`)
se renombraron al exportar y sus enlaces internos apuntan a los nombres exportados.

## Línea A (elegida)

| Archivo | Pantalla | Nombre original |
|---|---|---|
| `client-booking-steps.dc.html` | Reserva por pasos (servicio → día y hora → datos → confirmar). **Es la implementada.** | `Pasos` |
| `client-booking-steps-at-step-{2,3,4}.dc.html` | El mismo flujo abierto en el paso 2, 3 y 4 (importa `client-booking-steps`) | `Pasos-2/3/4` |
| `client-booking-single-page.dc.html` | Reserva en una sola página (referencia del encabezado del perfil) | `Main` |
| `client-booking-confirmed.dc.html` | Cita confirmada | `A-Confirmada` |
| `client-manage-appointment.dc.html` | Cancelar o reprogramar (enlace del correo) | `A-Gestionar` |
| `client-agenda-unavailable.dc.html` | Agenda no disponible (suscripción vencida) | `A-NoDisponible` |
| `email-booking-confirmed.dc.html` | Correo de confirmación (botones de calendario en píldora blanca con logos de Google Calendar y Outlook) | `A-Correo` |
| `pro-agenda-day.dc.html` | Panel del profesional: agenda del día (instalar app, Confirmó/Sin confirmar, Asistió/No asistió, lista de espera, tarjeta de calendario y avisos) | `A-Profesional` |
| `pro-services.dc.html` | Servicios | `A-Servicios` |
| `pro-availability.dc.html` | Disponibilidad | `A-Disponibilidad` |
| `pro-billing-plans.dc.html` | Suscripción: paquetes, "Cómo pagar" (copiar datos, Nequi/Transferencia, referencia, "Ya pagué · avisar") e historial; tweak `state` para el aviso en revisión | `A-Plan` |
| `pro-billing-pending.dc.html` | Suscripción con aviso de pago en revisión (importa `pro-billing-plans`) | `pro-billing-pending` |
| `pro-expired-read-only.dc.html` | Panel en solo lectura (plan vencido) | `A-Vencida` |
| `admin-subscriptions.dc.html` | Admin: suscripciones | `A-Admin` |
| `admin-pro-detail-manual-payment.dc.html` | Admin: detalle del profesional, aviso de pago (Aprobar / Rechazar) y pago manual | `A-Admin-Profesional` |
| `admin-prices.dc.html` | Admin: precios y migraciones | `A-Admin-Precios` |
| `admin-overview.dc.html` | Admin: resumen (indicadores, avisos por revisar, por atender, últimos pagos) | `admin-overview` |
| `client-booking-single-service.dc.html` | Reserva cuando hay un solo servicio: 3 pasos con la fila de chips de la selección (interactivo, tweak `step`) | `client-booking-single-service` |
| `client-booking-single-service-at-step-{2,3}.dc.html` | El mismo flujo abierto en "Tus datos" y "Confirmar" (importa `client-booking-single-service`) | `client-booking-single-service-at-step-2/3` |
| `client-waitlist-full-day.dc.html` | Día lleno: tarjeta "¿No encuentras hora?" | `client-waitlist-full-day` |
| `client-waitlist-join.dc.html` | Lista de espera: elegir días y datos | `client-waitlist-join` |
| `client-waitlist-joined.dc.html` | Lista de espera: listo, te avisaremos | `client-waitlist-joined` |
| `client-manage-confirm-attendance.dc.html` | Gestionar cita con el botón "Confirmar asistencia" | `client-manage-confirm-attendance` |
| `client-manage-attendance-confirmed.dc.html` | "¡Gracias! Confirmaste tu asistencia" (y el menú después de confirmar) | `client-manage-attendance-confirmed` |
| `client-waitlist-leave.dc.html` | Salir de la lista de espera (`/w/`) | `client-waitlist-leave` |
| `email-reminder-confirm-attendance.dc.html` | Correo de recordatorio "¿Confirmas tu asistencia?" con "Sí, voy" (tweak: ya confirmó) | `email-reminder-confirm-attendance` |
| `email-waitlist-joined.dc.html` | Correo de lista de espera: "Te avisaremos…" | `email-waitlist-joined` |
| `email-waitlist-offer.dc.html` | Correo de lista de espera: "Se liberó un cupo" | `email-waitlist-offer` |
| `email-pro-calendar-invite.dc.html` | Correo corto al profesional con la invitación de calendario (tweak: agregada / actualizada / quitada) | `email-pro-calendar-invite` |
| `pro-appointments-waitlist.dc.html` | Citas: Próximas, Pasadas y la pestaña "Lista de espera" | `pro-appointments-waitlist` |
| `pro-clients.dc.html` | Clientes: lista | `pro-clients` |
| `pro-client-detail.dc.html` | Detalle del cliente: contacto, totales, notas (aviso Ley 1581) e historial | `pro-client-detail` |
| `pro-stats.dc.html` | Estadísticas por periodo | `pro-stats` |
| `pro-calendar-sync.dc.html` | Tu calendario (suscripción al calendario, invitaciones) y Avisos (push) | `pro-calendar-sync` |
| `pro-public-profile.dc.html` | Perfil público | `pro-public-profile` |
| `pro-agenda-phone.dc.html` | Agenda del día en el celular | `pro-agenda-phone` |
| `pro-clients-phone.dc.html` | Clientes en el celular | `pro-clients-phone` |
| `pro-stats-phone.dc.html` | Estadísticas en el celular | `pro-stats-phone` |
| `pro-calendar-sync-phone.dc.html` | Tu calendario y avisos en el celular | `pro-calendar-sync-phone` |
| `pro-ios-install-sheet-phone.dc.html` | Hoja "Instalar en iPhone" sobre la agenda | `pro-ios-install-sheet-phone` |
| `account-login.dc.html` | Entrar | `account-login` |
| `account-signup.dc.html` | Crear cuenta | `account-signup` |
| `account-signup-confirm-code.dc.html` | Crear cuenta: confirmar el código del correo | `account-signup-confirm-code` |
| `account-forgot-password.dc.html` | Recuperar contraseña (pedir código y crear la nueva; tweak `step`) | `account-forgot-password` |
| `account-new-password.dc.html` | Crear contraseña en el primer ingreso (cuenta creada por el admin) | `account-new-password` |
| `onboarding-step-1.dc.html` | Onboarding: paso 1 de 5 (tu perfil) | `onboarding-step-1` |
| `onboarding-done.dc.html` | Onboarding: "¡Listo!" | `onboarding-done` |

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
