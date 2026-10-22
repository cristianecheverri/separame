# Pendientes — semana del 21 al 25 de octubre de 2026

Estado de partida (21-oct): en producción el MVP, la fase 1, referidos, precio a convenir,
la página principal con precios y el panel optimizado para celular. Los avisos al celular ya
tienen sus llaves en prod. Marca cada punto al terminarlo.

## 1. Lo que haces tú (Cristian)

- [x] **Datos de pago en prod** (21-oct: llave Bre-B como `transfer`). Sin esto, la sección "Cómo pagar" de Suscripción no muestra a
      dónde pagarte:
      ```bash
      AWS_PROFILE=personal-admin aws ssm put-parameter --region us-east-1 --type String \
        --name /separame/prod/billing/instructions --value \
        '{"methods":[{"kind":"nequi","label":"Nequi","detail":"<tu número>"}],"holderName":"<titular>","note":"Activamos tu plan el mismo día."}'
      ```
- [ ] **Prueba completa en tu celular (prod):**
  - [ ] Crea tu cuenta y haz el onboarding.
  - [ ] Reserva con correo: debe llegar la confirmación con los botones de calendario, el
        recordatorio y "¿Confirmas tu asistencia?".
  - [ ] Reserva sin correo: la pantalla final muestra el enlace para cancelar o cambiar.
  - [ ] **iPhone:** "Agregar al calendario del iPhone", también abriendo el enlace desde
        WhatsApp e Instagram. Es lo único que no se pudo probar en un dispositivo real.
  - [ ] Instala el panel como app (Android e iPhone) y activa los avisos en "Tu calendario".
  - [ ] Agenda una cita desde el panel solo con el nombre; mueve una y cancela otra.
  - [ ] Comparte tu enlace con la hoja de compartir del celular.
  - [ ] Abre tu enlace de referidos (`/r/<código>`) en otro navegador y mira "Te invitó…".
- [ ] **Nequi.** El correo a negocios@nequi.com rebotó. Envía la solicitud de cotización (pagos
      push + suscripciones) por:
  - el formulario de soporte de Nequi Negocios:
    https://ayuda.negocios.nequi.co/hc/es-419/requests/new?ticket_form_id=8945894074509
  - el portal de desarrolladores: https://developer.nequi.com.co/integrate-con-nequi
  - la vinculación de negocios: https://www.nequi.com.co/negocios/vinculacion

  Si quieres, te dejo el texto en el portapapeles otra vez.
- [ ] **Negocio y legal** (bloquea el anuncio público):
  - [ ] Registrar el negocio (RUT o empresa) con la actividad económica que confirmes con el
        contador.
  - [ ] Verificar la marca "Sepárame" en la SIC.
  - [ ] Hablar con un contador: régimen y facturación electrónica DIAN.
  - [ ] Pasarme responsable, cédula o NIT y correo de contacto para completar
        privacidad y términos (y decidir si creamos `soporte@separame.app`).
- [ ] **Google Search Console** (después del despliegue a prod del SEO, 22-oct):
  - [x] Propiedad de tipo **Dominio** `separame.app` y registro TXT (22-oct; creado a mano y
        pasado a CDK: `GOOGLE_SITE_VERIFICATION` en `cdk/lib/config.ts`).
  - [ ] Tras verificar: enviar `https://separame.app/sitemap.xml` en "Sitemaps" y pedir la
        indexación de `https://separame.app/` en "Inspección de URLs".
  - [ ] Opcional: Bing Webmaster Tools → "Importar desde Google Search Console".

## 2. Lo que hago yo (desarrollo)

### Fase 2 — Plan para equipos (decidido el 21-oct)
Primero el diseño en el lienzo para que lo apruebes, luego la implementación.
- [ ] Mockups (escritorio + celular):
  - tarjeta "¿Trabajas con más profesionales?" y formulario de solicitud;
  - admin: aprobar con número de cupos o rechazar con motivo;
  - panel del dueño: selector de profesional en agenda, servicios y disponibilidad;
  - página del consultorio con el paso "¿Con quién?" (incluye "Cualquiera disponible");
  - precio por profesional adicional en las versiones de precio y en Suscripción.
- [ ] Implementación: solicitud → aprobación, cupos, profesionales sin usuario, agendas por
      profesional, página del consultorio + enlace propio de cada uno, un solo vencimiento,
      precio adicional congelado, tests y despliegue a dev → prod.
- [ ] Quitar en la página principal el enlace temporal "Solicita el plan para equipos" (hoy
      lleva al registro) y apuntarlo a la solicitud real.

### Detalles pendientes de la ronda del 21-oct
- [ ] "Olvidar mis datos" en la reserva. Lo pospusiste; confirmar si va esta semana.
- [ ] `theme-color` verde en la reserva (en Android la barra de estado queda blanca sobre la
      banda verde).
- [ ] Saludo de la agenda en el celular: "Hola, Laura · 6 citas hoy" se parte en 2 líneas a
      375 px (el mockup lo muestra en una).
- [ ] Barra "Cambios sin guardar" también en Servicios y Perfil (hoy solo en Disponibilidad).
- [ ] "Espacio libre" mide el hueco sin el margen entre citas; unificar con la preselección
      del servicio.
- [ ] Áreas táctiles: el enlace "política de privacidad" dentro del texto de autorización, y
      "Cancelar o reprogramar" / "Volver a la agenda" un poco juntos en la confirmación.
- [ ] Página principal: justo después de un despliegue muestra los precios por defecto hasta
      que pasa la tarea de 10 minutos. Regenerarla también al terminar el despliegue.
- [ ] Referidos: hoy alguien podría registrar un correo ajeno con un código (lo peor es un mes
      gratis si esa cuenta paga). Revisar si vale la pena endurecerlo.

### SEO (22-oct)
- [x] `robots.txt` por ambiente y `sitemap.xml` (página principal, privacidad, términos y las
      agendas vigentes; lo regenera la tarea de 10 minutos).
- [x] dev fuera de los buscadores: `X-Robots-Tag: noindex, nofollow` en todas sus respuestas.
- [x] Datos estructurados `Organization` + `WebSite` (nombre y logo en Google) y "agenda de
      citas en línea" en un H2 de la página principal (lienzo y `mockups/line-a/` al día).
- [x] Registro TXT de Search Console en CDK (el manual se borra justo antes del despliegue a prod
      que lo crea; si no, CloudFormation falla con "already exists").

### Mockups que faltan dibujar
- [ ] Página principal a 768 px (la tarjeta de 12 meses sola en la segunda fila).
- [ ] Diálogos y toasts: rechazar aviso de pago ("Motivo del rechazo"), mover/cancelar sin
      correo, Deshacer.
- [ ] Correo de comprobante con "Meses gratis por referidos +N" y correo "Nueva cita" al
      profesional.
- [ ] Onboarding pasos 2 a 4 (incluido el selector de duración).
- [ ] Mover cita: variantes de día lleno y pantalla baja.
- [ ] `Main` (reserva en una sola página, referencia) con el encabezado nuevo.

## 3. Después de la respuesta de Nequi
- [ ] Adaptador `nequi` (pagos push + suscripción) y webhook `/webhooks/nequi`,
      certificación con Nequi.
- [ ] Plan superior con **anticipo al reservar**.
- [ ] Si no hay cargo fijo por transacción, evaluar el plan mensual de $5.000.
