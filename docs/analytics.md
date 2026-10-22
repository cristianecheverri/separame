# Analítica (Google Analytics 4)

Propiedad **Sepárame**, flujo web `separame.app`, ID `G-48XHR8L6CY` (`shared/analytics.ts`).
Solo mide **prod**: dev, localhost y los tests no envían nada. El área de admin
(`/app/admin`) no se mide.

## Configuración obligatoria del flujo web

En Analytics → Administrar → Flujos de datos → separame.app → **Medición mejorada** (engranaje):

| Opción | Estado | Por qué |
|---|---|---|
| Vistas de página | activada (no se puede quitar) | las enviamos nosotros, ya limpias |
| Desplazamientos | activada | |
| **Clics salientes** | **desactivada** | enviaría enlaces como `wa.me/<celular del cliente>` o el `.ics` con el token de la cita |
| Búsqueda en el sitio | desactivada | no hay buscador |
| **Interacciones con formularios** | **desactivada** | ruido; los pasos importantes ya son eventos |
| Interacción con videos | desactivada | no hay videos |
| **Descargas de archivos** | **desactivada** | el enlace del `.ics` lleva el token de la cita |
| **Cambios de página según el historial del navegador** | **desactivada** | enviaría la URL sin limpiar; el panel envía sus vistas de página |

Recomendado además:
- Administrar → Configuración de datos → **Retención de datos: 14 meses**.
- Administrar → **Dimensiones personalizadas** (de evento): `pro_slug`, `step`, `has_email`,
  `reason`, `method`, `content_type`, `location`, `by`, `referred`. Sin registrarlas, los parámetros
  no aparecen en los informes ni en los embudos.
- Administrar → **Eventos clave**: `booking_confirmed`, `sign_up`, `agenda_created`,
  `payment_notice_sent`.

## Privacidad

- Nunca se envían nombres, correos, celulares ni textos que escribe la gente.
- Las direcciones pasan por `sanitizeLocation`: `/c/<token>` → `/c/[token]`,
  `/w/<token>` → `/w/[token]`, `/app/clients/<id>` → `/app/clients/[client]`; de la URL solo se
  conservan `utm_*`, `gclid`, `fbclid` y `ref`.
- Sin señales de Google ni personalización de anuncios. Contado en la política de privacidad
  (sección 8, «Estadísticas de uso con Google Analytics»).

## Eventos

| Evento | Dónde | Parámetros | Qué significa |
|---|---|---|---|
| `page_view` | todo el sitio | — | vista de página (ruta limpia) |
| `cta_click` | página principal | `location`: hero · teams · final | clic en «Prueba gratis» / plan para equipos |
| `booking_view` | página de un profesional | `pro_slug` | alguien abrió una agenda |
| `booking_step` | reserva | `pro_slug`, `step`: service · when · details · review | avanzó a ese paso |
| `booking_confirmed` | reserva | `pro_slug`, `has_email`: yes · no | **reserva hecha** |
| `booking_error` | reserva | `pro_slug`, `reason` (código: slot_taken, validation…) | la reserva falló |
| `booking_unavailable` | reserva | `pro_slug` | agenda vencida («no disponible») |
| `waitlist_joined` | reserva | `pro_slug` | se anotó en la lista de espera |
| `add_to_calendar` | cita confirmada | `method`: device · google · outlook · ics | agregó la cita a su calendario |
| `appointment_rescheduled` | enlace de la cita / panel | `by`: client · pro | cita movida |
| `appointment_cancelled` | enlace de la cita / panel | `by`: client · pro | cita cancelada |
| `attendance_confirmed` | enlace de la cita | — | el cliente confirmó que va |
| `waitlist_left` | enlace de la lista de espera | — | salió de la lista de espera |
| `sign_up` | registro | `method`: email, `referred`: yes · no | **cuenta creada** (correo confirmado) |
| `login` | entrar | `method`: email | inicio de sesión |
| `agenda_created` | onboarding | `referred`: yes · no | **creó su perfil y su enlace** |
| `share` | panel | `method`: native · copy, `content_type`: booking_link · referral_link | compartió o copió su enlace |
| `appointment_created` | panel | `by`: pro | el profesional agendó una cita |
| `payment_notice_sent` | Suscripción | `months` | tocó «Ya pagué» |
| `push_enabled` | Tu calendario | — | activó los avisos en el celular |
| `app_installed` | panel | — | instaló el panel como app |

## Embudos útiles (Explorar → Exploración de embudo)

- **Reserva:** `booking_view` → `booking_step` (step = when) → `booking_step` (details) →
  `booking_step` (review) → `booking_confirmed`. Desglosar por `pro_slug` o por dispositivo.
- **Registro:** `cta_click` → `page_view` de `/app/signup` → `sign_up` → `agenda_created` →
  `share` (booking_link) → `payment_notice_sent`.

## Agregar un evento

1. Declararlo en `AnalyticsEvents` (`shared/analytics.ts`): solo compilan nombres y parámetros
   declarados.
2. Llamar `track('<evento>', { … })` cuando la acción **ya ocurrió** (después de la respuesta del
   API), nunca al hacer clic.
3. Actualizar la tabla de arriba y, si tiene parámetros nuevos, registrarlos como dimensiones.
