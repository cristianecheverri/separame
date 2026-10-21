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
  proposals/         Propuestas por aprobar (página «Propuestas» del lienzo): antes/después, landing y referidos
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
| `client-booking-steps.dc.html` | Reserva por pasos. **Es la implementada.** Paso 1 con la banda verde del perfil; chips de la selección arriba; día con horas preseleccionado, día lleno con borde punteado y leyenda; «Tus datos» con «Recordar mis datos» y botón que dice qué falta; «Precio a convenir» / sin precio. Tweaks `step`, `returning`, `captchaHint` | `Pasos` |
| `client-booking-steps-captcha-hint.dc.html` | Paso 4 con la verificación y el aviso «Confirma que eres una persona ↑» (importa `client-booking-steps`) | `client-booking-steps-captcha-hint` |
| `client-booking-returning.dc.html` | «Tus datos» de un cliente que vuelve: datos guardados y aviso «Usamos los datos que guardaste en este celular.» | `client-booking-returning` |
| `client-booking-landscape.dc.html` | Reserva en horizontal (844×390): encabezado compacto, chips en una fila, nombre y celular lado a lado | `client-booking-landscape` |
| `client-booking-steps-at-step-{2,3,4}.dc.html` | El mismo flujo abierto en el paso 2, 3 y 4 (importa `client-booking-steps`) | `Pasos-2/3/4` |
| `client-booking-single-page.dc.html` | Reserva en una sola página (referencia del encabezado del perfil) | `Main` |
| `client-booking-confirmed.dc.html` | Cita confirmada: calendario del celular primero (tweak `platform`: iPhone / iPad / Android o computador) y «Cancelar o reprogramar» como botón; tweak `noEmail` | `A-Confirmada` |
| `client-booking-confirmed-android.dc.html` | Cita confirmada en Android o computador: «Agregar a Google Calendar», Outlook y «Archivo .ics» (importa `client-booking-confirmed`) | `client-booking-confirmed-android` |
| `client-booking-confirmed-no-email.dc.html` | Cita confirmada sin correo: aviso «No te enviaremos correos» con el enlace para gestionar la cita y «Copiar» | `client-booking-confirmed-no-email` |
| `client-manage-appointment.dc.html` | Cancelar o reprogramar (enlace del correo); mover con «Tu cita actual», Mañana/Tarde y pie fijo; tweak `step` | `A-Gestionar` |
| `client-manage-move.dc.html` | Mover la cita: «Elige el nuevo espacio» (importa `client-manage-appointment`) | `client-manage-move` |
| `client-agenda-unavailable.dc.html` | Agenda no disponible (suscripción vencida) | `A-NoDisponible` |
| `email-booking-confirmed.dc.html` | Correo de confirmación (botones de calendario en píldora blanca con logos de Google Calendar y Outlook) | `A-Correo` |
| `pro-agenda-day.dc.html` | Agenda del día en escritorio: un solo estado por cita («✓ Confirmó asistencia» / «◷ Sin respuesta»), «Copiar mi enlace», tarjetas laterales (instalar, compartir, «Invita y gana un mes», próximos días, lista de espera, calendario) | `A-Profesional` |
| `pro-services.dc.html` | Servicios: selector de duración y «Precio en tu página» (Valor fijo / Sin costo / Precio a convenir / No mostrar) con vista previa | `A-Servicios` |
| `pro-availability.dc.html` | Disponibilidad (quitar bloqueo con aviso «Deshacer») | `A-Disponibilidad` |
| `pro-billing-plans.dc.html` | Suscripción: paquetes, «Cómo pagar» con «Ya pagué · avisar», sección «Referidos» e historial; tweaks `state` (aviso en revisión) y `referrals` | `A-Plan` |
| `pro-billing-pending.dc.html` | Suscripción con aviso de pago en revisión (importa `pro-billing-plans`) | `pro-billing-pending` |
| `pro-expired-read-only.dc.html` | Panel en solo lectura (plan vencido) | `A-Vencida` |
| `admin-subscriptions.dc.html` | Admin: suscripciones | `A-Admin` |
| `admin-pro-detail-manual-payment.dc.html` | Admin: detalle del profesional, «Referido por…», «Sus referidos», aviso de pago (Aprobar / Rechazar) y pago manual | `A-Admin-Profesional` |
| `admin-prices.dc.html` | Admin: precios y migraciones | `A-Admin-Precios` |
| `admin-overview.dc.html` | Admin: resumen (indicadores, avisos por revisar, por atender, últimos pagos) | `admin-overview` |
| `client-booking-single-service.dc.html` | Reserva cuando hay un solo servicio: 3 pasos con banda verde, chips y los mismos cambios de la reserva por pasos (tweak `step`) | `client-booking-single-service` |
| `client-booking-single-service-at-step-{2,3}.dc.html` | El mismo flujo abierto en "Tus datos" y "Confirmar" (importa `client-booking-single-service`) | `client-booking-single-service-at-step-2/3` |
| `client-waitlist-full-day.dc.html` | Día lleno: tarjeta "¿No encuentras hora?" | `client-waitlist-full-day` |
| `client-waitlist-join.dc.html` | Lista de espera: solo días llenos en filas de 7 días (semanas sin días llenos se omiten); Nombre, Celular y Correo (aquí sí obligatorio) | `client-waitlist-join` |
| `client-waitlist-joined.dc.html` | Lista de espera: listo, te avisaremos | `client-waitlist-joined` |
| `client-manage-confirm-attendance.dc.html` | Gestionar cita con el botón "Confirmar asistencia" (abierto desde el correo: resaltado en amarillo, no confirma solo) | `client-manage-confirm-attendance` |
| `client-manage-attendance-confirmed.dc.html` | "¡Gracias! Confirmaste tu asistencia" (y el menú después de confirmar) | `client-manage-attendance-confirmed` |
| `client-waitlist-leave.dc.html` | Salir de la lista de espera (`/w/`): pregunta «¿Quieres salir de la lista de espera?» con «Sí, sácame de la lista» | `client-waitlist-leave` |
| `client-waitlist-left.dc.html` | Lista de espera: ya saliste | `client-waitlist-left` |
| `email-reminder-confirm-attendance.dc.html` | Correo de recordatorio "¿Confirmas tu asistencia?" con "Sí, voy" (tweak: ya confirmó) | `email-reminder-confirm-attendance` |
| `email-waitlist-joined.dc.html` | Correo de lista de espera: "Te avisaremos…" | `email-waitlist-joined` |
| `email-waitlist-offer.dc.html` | Correo de lista de espera: "Se liberó un cupo" | `email-waitlist-offer` |
| `email-pro-calendar-invite.dc.html` | Correo corto al profesional con la invitación de calendario (tweak: agregada / actualizada / quitada) | `email-pro-calendar-invite` |
| `email-referral-month-earned.dc.html` | Correo «¡Ganaste un mes gratis!» al profesional que refirió (tweak: plan vencido → mes guardado) | `email-referral-month-earned` |
| `pro-appointments-waitlist.dc.html` | Citas: Próximas, Pasadas (con «Ver más citas» / «Ver citas anteriores») y la pestaña "Lista de espera" | `pro-appointments-waitlist` |
| `pro-clients.dc.html` | Clientes: lista | `pro-clients` |
| `pro-client-detail.dc.html` | Detalle del cliente: contacto, totales, notas (aviso Ley 1581) e historial | `pro-client-detail` |
| `pro-stats.dc.html` | Estadísticas por periodo | `pro-stats` |
| `pro-calendar-sync.dc.html` | Tu calendario: invitaciones por correo con Avisos (push) debajo, calendario suscrito y la nota a lo ancho | `pro-calendar-sync` |
| `pro-public-profile.dc.html` | Perfil público | `pro-public-profile` |
| `pro-agenda-phone.dc.html` | Agenda en el celular: barra inferior Agenda · Citas · Clientes · Más, saludo compacto con «Compartir», botón flotante «+», tarjetas con un solo estado y tarjeta de referidos | `pro-agenda-phone` |
| `pro-agenda-phone-grace.dc.html` | Agenda en el celular en periodo de gracia, con la franja «Renueva antes del 21 oct. · Renovar ›» | `pro-agenda-phone-grace` |
| `pro-clients-phone.dc.html` | Clientes en el celular | `pro-clients-phone` |
| `pro-stats-phone.dc.html` | Estadísticas en el celular: 2 columnas, chips de periodo deslizables y barra inferior | `pro-stats-phone` |
| `pro-calendar-sync-phone.dc.html` | Tu calendario y avisos en el celular (invitaciones → avisos → calendario suscrito → nota) | `pro-calendar-sync-phone` |
| `pro-ios-install-sheet-phone.dc.html` | Hoja "Instalar en iPhone" sobre la agenda | `pro-ios-install-sheet-phone` |
| `pro-more-sheet-phone.dc.html` | Menú «Más» del celular (hoja verde con el resto de secciones, plan y «Cerrar sesión») | `pro-more-sheet-phone` |
| `pro-new-appointment-phone.dc.html` | Nueva cita en el celular: buscar cliente con sugerencias, servicio preseleccionado y resumen de la hora (tweak `picked`) | `pro-new-appointment-phone` |
| `pro-waitlist-phone.dc.html` | Citas · Lista de espera en el celular, con «Agendar» y menú ⋯ | `pro-waitlist-phone` |
| `account-login.dc.html` | Entrar | `account-login` |
| `account-signup.dc.html` | Crear cuenta | `account-signup` |
| `account-signup-invited.dc.html` | Crear cuenta desde un enlace de referido: «Te invitó Dra. Laura Pérez» | `account-signup-invited` |
| `account-signup-confirm-code.dc.html` | Crear cuenta: confirmar el código del correo | `account-signup-confirm-code` |
| `account-forgot-password.dc.html` | Recuperar contraseña (pedir código y crear la nueva; tweak `step`) | `account-forgot-password` |
| `account-new-password.dc.html` | Crear contraseña en el primer ingreso (cuenta creada por el admin) | `account-new-password` |
| `onboarding-step-1.dc.html` | Onboarding: paso 1 de 5 (tu perfil) | `onboarding-step-1` |
| `onboarding-done.dc.html` | Onboarding: "¡Listo!" | `onboarding-done` |
| `landing-desktop.dc.html` | Landing de separame.app en escritorio (la implementada; en el lienzo, `site-landing-desktop`) | `site-landing-desktop` |
| `landing-phone.dc.html` | Landing de separame.app en el celular (en el lienzo, `site-landing-phone`) | `site-landing-phone` |

## Propuestas (por aprobar)

Página «Propuestas (por aprobar)» del lienzo. Cada fila del lienzo lleva su estado (**APROBADA** / **RECHAZADA**). Las aprobadas
ya están implementadas y pasaron a la línea A (esa es la fuente de verdad); esta página queda como registro histórico:
cada propuesta trae su «Antes» (estado actual implementado) y su «Después». Mismo nombre en el lienzo y en el repo.
Los enlaces a pantallas de la línea A apuntan a `../line-a/`.

**Regla de placeholders (en todos los tableros):** los campos vacíos muestran qué va ahí («Tu nombre y apellido»,
«Tu número de celular», «Tu correo electrónico», «Nombre del servicio»…), nunca datos de ejemplo que parezcan reales.

| Archivo | Propuesta |
|---|---|
| `proposals/landing-desktop.dc.html` | **Aprobada.** Landing (separame.app) en escritorio: hero, profesiones, «Así se ve funcionando», por qué, 3 pasos, precios, preguntas y pie |
| `proposals/landing-phone.dc.html` | **Aprobada.** La misma landing en el celular (375) |
| `proposals/proposal-m1-footer-status-{before,after,after-error,after-verifying}.dc.html` | **Rechazada**: se quedan los chips arriba, con aire encima. M-1 · Resumen en el pie en vez de chips arriba (320×568): resumen, error y «Verificando que eres una persona…» |
| `proposals/proposal-m2-m3-day-slots-{before,after}.dc.html` | **Aprobada.** M-2/M-3 · Primer día con horas ya elegido; día lleno distinto de cerrado, con leyenda |
| `proposals/proposal-m4-profile-header-{before,after,before-step-2-320,after-step-2-320}.dc.html` | **Aprobada.** M-4 · Encabezado de perfil completo en el paso 1; fila compacta sin logo a 320 px |
| `proposals/proposal-m5-details-{before,after,after-returning}.dc.html` | **Aprobada.** M-5 · «Tus datos»: el botón dice qué falta, «Recordar mis datos» y cliente que vuelve (sin «Olvidar mis datos» por ahora) |
| `proposals/proposal-field-contrast-{before,after}.dc.html` | **Rechazada**: se queda el borde actual. Contraste · Borde de campos #8A968F (WCAG 3:1) |
| `proposals/proposal-m6-landscape-{before,after}.dc.html` | **Aprobada.** M-6 · Horizontal / pantallas bajas (667×375) (aprobado el «Después») |
| `proposals/proposal-m7-confirmation-calendar-{before,after}.dc.html` | **Aprobada.** M-7 · Confirmación con el calendario del celular primero (tweak iPhone/Android) |
| `proposals/proposal-m8-move-appointment-{before,after}.dc.html` | **Aprobada.** M-8 · Mover la cita con días, Mañana/Tarde y pie fijo |
| `proposals/proposal-price-option-editor-{before,after}.dc.html` | **Aprobada.** Precio · Editor del servicio: valor fijo, sin costo, «Precio a convenir» o no mostrar |
| `proposals/proposal-price-option-booking-{before,after}.dc.html` | **Aprobada.** Precio · Cómo se ve en el paso 1 de la reserva |
| `proposals/proposal-mp01-tab-bar-{before,after,after-more-sheet}.dc.html` | **Aprobada.** MP-01 · Barra inferior Agenda · Citas · Clientes · Más |
| `proposals/proposal-mp02-mp03-compact-header-{before,after}.dc.html` | **Aprobada.** MP-02/MP-03 · Encabezado compacto, instalar debajo y botón flotante «Nueva cita» |
| `proposals/proposal-mp04-appointment-status-{before,after}.dc.html` | **Aprobada.** MP-04 · Un solo estado por cita y acciones siempre en la misma esquina |
| `proposals/proposal-mp05-new-appointment-{before,after}.dc.html` | **Aprobada.** MP-05 · Nueva cita con autocompletar cliente y hora/servicio preseleccionados (celular y correo opcionales) |
| `proposals/proposal-mp06-waitlist-{before,after,after-menu}.dc.html` | **Aprobada.** MP-06 · Lista de espera con «Agendar» y menú ⋯ |
| `proposals/proposal-mp07-native-share-{before,after,after-fallback}.dc.html` | **Aprobada.** MP-07 · Compartir con la hoja del celular; copiar como respaldo (aprobado «Después · hoja de compartir») |
| `proposals/proposal-mp08-stats-two-columns-{before,after}.dc.html` | **Aprobada.** MP-08 · Estadísticas en 2 columnas a 360 px |
| `proposals/referral-agenda-card-{desktop,phone}.dc.html` | **Aprobada.** Referidos · Tarjeta «Invita y gana un mes» en la agenda |
| `proposals/referral-billing-section-{desktop,phone}.dc.html` | **Aprobada.** Referidos · Sección «Referidos» en Suscripción (estados: en prueba, ganaste 1 mes, mes guardado) |
| `proposals/referral-signup-invited-{desktop,phone}.dc.html` | **Aprobada.** Referidos · Registro con «Te invitó Dra. Laura Pérez» |
| `proposals/referral-email-month-earned.dc.html` | **Aprobada.** Referidos · Correo «¡Ganaste un mes gratis!» (tweak: plan vencido → mes guardado) |
| `proposals/referral-admin-pro-detail.dc.html` | **Aprobada.** Referidos · Admin: «Referido por…», sus referidos y «Mes gratis por referido» en el historial |

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
