# Sepárame — separame.app

Agenda de citas en línea para **cualquier tipo de profesional** (médicos, odontólogos,
psicólogos, abogados, estética, entrenadores, tutores…), hecha para **Colombia**.
El profesional administra su calendario; sus clientes reservan desde un enlace público
(`separame.app/<slug>`) sin crear cuenta.

La especificación completa (decisiones, precios, pasarela, legal, ideas descartadas)
está en **`docs/especificacion.txt`**. Léela antes de proponer cambios de producto.

Estado (20-oct-2026): el dominio `separame.app` está comprado en Route 53 y el repo
está recién creado; aún no hay código. Siguiente paso: montar la estructura base.

## Idioma
- Habla con el usuario **en español**.
- Código, comentarios, nombres de variables y commits **en inglés** (como en Cartazos).
- La interfaz es en español (Colombia) primero; prepárala para i18n (inglés después).

## Producto

**Cliente final (sin cuenta):** abre el enlace, elige servicio, día y hora, escribe
nombre, correo y teléfono, acepta la autorización de datos y listo. Recibe un correo
de confirmación con un archivo `.ics`, botones "Agregar a Google Calendar" y
"Agregar a Outlook" (enlaces de plantilla, **sin OAuth**) y un enlace para cancelar o
reprogramar sin cuenta (token firmado).

**Profesional (con cuenta):** perfil público, servicios con duración y precio de
referencia, disponibilidad (horario semanal, excepciones y festivos colombianos,
margen entre citas, anticipación mínima, ventana máxima de reserva) y un panel para
ver, crear, mover y cancelar citas.

**Funciones de la primera versión:** lo anterior, más el recordatorio por correo 24 h
antes, cero citas dobles (reserva atómica del horario) y anti-spam en la página
pública (límite de reservas + captcha invisible).

**Fuera por ahora:** WhatsApp y SMS (cada mensaje cuesta), sincronización con Google
Calendar (requiere revisión de Google), anticipos, lista de espera, planes para
equipos y **notas clínicas** (datos de salud = datos sensibles por ley).

## Reglas de suscripción (se aplican SIEMPRE en el servidor, nunca solo en la UI)
- **Prueba gratis de 7 días** por profesional. Una sola prueba por correo verificado
  (sin verificación por SMS; se bloquean dominios de correo desechables).
- **Vigente** = `now < max(trialEndsAt, paidUntil) + gracia`. Gracia de 2–3 días.
- **Vencida:**
  - El panel queda en **solo lectura**: puede entrar y ver sus citas, no administrar.
  - **Nadie puede reservar citas nuevas.** La página pública dice "Agenda no
    disponible temporalmente" (nunca "no ha pagado").
  - Las citas **ya agendadas** siguen enviando recordatorios y se pueden cancelar
    (el cliente del profesional no tiene la culpa).
- **Pago manual (admin):** el admin puede registrar un pago hecho por fuera de Wompi
  (transferencia, Nequi directo, efectivo o cortesía) y fijar la vigencia
  (+3 / +6 / +12 meses o una fecha exacta) → actualiza `paidUntil` y activa la agenda
  al instante. Si el plan ya venció, los meses se cuentan desde hoy. Conserva la
  versión de precio y queda **auditado** (quién, cuándo, método, monto, referencia).
  Correo opcional al profesional con el comprobante.

## Precios (configurables, con precio congelado)
- Meta inicial: desde **$5.000 COP/mes** (valor dinámico, se configura desde el panel de admin). "Precio fundador" para los primeros.
- Los precios son **versiones inmutables** (`amount`, `currency`, `period`, `active`).
  Cambiar el precio = crear una versión nueva.
- Cada suscripción guarda su **versión de precio** y renueva a ese precio. Solo cambia
  si un admin migra a ese profesional (o a su grupo) con fecha efectiva y aviso por
  correo **30 días antes**.
- La comisión de Wompi tiene un cargo fijo ($700) que se come los cobros pequeños:
  se cobra en **paquetes de 3, 6 o 12 meses** (el anual con descuento). Si hay plan
  mensual, que sea de unos $5.900.

## Pagos: Wompi (Bancolombia)
- Un solo checkout con Nequi, tarjetas, PSE, botón Bancolombia y Daviplata.
  2,65% + $700 + IVA por transacción, sin mensualidad.
- **Primera versión = prepago, sin renovación automática:** el profesional paga un
  paquete → Wompi llama a nuestro webhook → **verificar la firma del evento** →
  extender `paidUntil` (idempotente por id de transacción). Correo 3 días antes de
  vencer con el enlace para renovar.
- Después: renovación automática con tarjeta o Nequi tokenizados (cada cobro lo
  dispara nuestro sistema; Wompi no gestiona planes ni reintentos).
- Solo COP y Colombia por ahora. Para USD más adelante: un merchant of record
  (Paddle / Lemon Squeezy).

## Arquitectura (todo serverless, casi gratis en reposo)
Mismo enfoque y estructura que Cartazos (`../cartas`), que sirve de referencia, **salvo el
API: aquí no hay AppSync**:

```
cdk/        AWS CDK (TypeScript): stacks data / auth / api / mail / frontend / monitoring / cicd
backend/    Lambdas pequeñas por función (rutas, webhook, jobs, triggers) + services + helpers
shared/     tipos, esquemas zod y lógica pura compartida (disponibilidad, festivos) backend ↔ frontend
frontend/
  booking/  página pública de reserva: Preact + Tailwind, liviana (meta: < 50 KB de JS gzip)
  app/      panel del profesional y admin: React + Vite + Tailwind (PWA)
docs/       especificación y diagramas
```

### Cuenta y ambientes
- **Cuenta actual** (créditos y dominio están aquí), aislando a Sepárame dentro de ella:
  cuota de Lambdas simultáneas subida a 1.000 (Service Quotas), etiqueta
  `project=separame` en todo (activada para costos, con presupuesto propio filtrado por
  etiqueta), prefijo `separame-<stage>-` en los recursos y permisos mínimos por Lambda.
- **Dos ambientes idénticos, `dev` y `prod`:** el mismo código CDK desplegado con
  `-c stage=dev|prod`. Solo cambian los valores de configuración, nunca la estructura:
  | | dev | prod |
  |---|---|---|
  | Web / API | `dev.separame.app` / `api.dev.separame.app` | `separame.app` / `api.separame.app` |
  | Correo | `noreply@dev.separame.app` (identidad SES propia) | `noreply@separame.app` |
  | Wompi | llaves y eventos de **sandbox** | llaves de producción |
  | Turnstile | llaves de prueba | llaves reales |
  | Secretos SSM | `/separame/dev/...` | `/separame/prod/...` |
  | Borrado | se puede destruir | protección contra borrado + `RETAIN` |
  Tablas, Cognito, buckets y Lambdas son **independientes** por ambiente.
  Compartido por cuenta: la zona de Route 53 (importada) y la regla de `soporte@` (solo prod).
- **Despliegue:** `push` a `main` → GitHub Actions (rol OIDC propio, stack `cicd`) corre
  typecheck, lint y tests y despliega **prod**. **dev** se despliega desde local
  (`npm run deploy:dev`), y para cambios solo de código de Lambdas se puede usar
  `cdk deploy --hotswap` (**nunca en prod**).

- **Todo con CDK** (como Cartazos y blobhive): nada se crea a mano en la consola, salvo lo
  que AWS no expone a CloudFormation (salida del sandbox de SES, aumento de cuotas).
- **API:** API Gateway **HTTP API** en **`api.separame.app`** (dominio propio + certificado
  ACM + alias en Route 53) + DynamoDB (tabla única, on-demand).
  - **Varias Lambdas pequeñas y específicas**, una por grupo de rutas (disponibilidad
    pública, reservar, gestionar cita con token, citas del panel, configuración del
    profesional, cobro, admin), más el **webhook de Wompi**, los **jobs programados** y los
    triggers de Cognito. Nada de una Lambda "que lo hace todo".
  - **Rápidas:** cada Lambda empaqueta solo lo que usa (esbuild, clientes modulares del
    SDK v3, sin librerías pesadas), crea sus clientes fuera del handler y corre en
    ARM64 con Node.js 22 y 512 MB (más memoria = más CPU = arranque en frío más corto, y
    casi el mismo costo porque termina antes). Sin provisioned concurrency.
  - **CORS** solo para `https://separame.app`, con `maxAge` alto para que el navegador
    guarde la verificación previa (preflight) y no la repita en cada llamada.
  - El contrato son tipos TypeScript + esquemas `zod` en `shared/`; toda entrada se valida
    en el servidor.
  - Rutas públicas (página de reserva, cancelar/reprogramar con token firmado) **sin auth**.
    Rutas del panel y del admin con el **autorizador JWT de Cognito** del HTTP API; el rol
    admin se verifica en la Lambda con el grupo `admin` (`cognito:groups`).
  - **Throttling** en el stage, más bajo en `POST` de reservas: además frena el abuso que
    podría agotar la concurrencia de Lambda compartida con Cartazos.
  - Lambdas en **ARM64 (Graviton)**, Node.js 22, 256 MB.
- **Por qué no AppSync:** cuesta ~4× más por llamada (≈ USD 4 vs. USD 1 por millón), el
  webhook de Wompi necesita un endpoint HTTP normal de todas formas y la página pública sin
  cuenta es más simple sin API key ni identity pool. No hace falta tiempo real: el panel
  se refresca al abrirlo o consulta cada 1–2 minutos.
- **Profesionales y admin:** Cognito User Pool (plan Essentials, gratis hasta 10.000 MAU).
  Entran **sin contraseña, con un código de 6 dígitos al correo** (EMAIL_OTP, nativo de
  Essentials; nada de enlace mágico con triggers propios). Passkeys quizá después. El
  admin es un usuario del grupo `admin`, creado por CDK. Cognito manda sus correos
  por **SES** (el envío por defecto de Cognito tiene un tope diario muy bajo). Solo se
  verifica el **correo**: **no se verifica teléfono ni se envían SMS** por ahora.
  **Clientes:** sin cuenta.
- **Correo saliente (SES, `us-east-1`):** identidad del dominio `separame.app` (DKIM, SPF
  con MAIL FROM propio, DMARC) y remitente **`noreply@separame.app`**, con su propio
  **configuration set**. Rebotes y quejas → SNS → Lambda que marca el correo como
  suprimido para no volver a escribirle (además de la lista de supresión de la cuenta) y
  alarma si la tasa de rebote sube. La cuenta comparte SES con Cartazos y blobhive: una
  mala reputación de Sepárame los afectaría, así que la higiene de correos es obligatoria.
- **Sin citas dobles:** cada horario reservado es un ítem con clave única
  (p. ej. `SLOT#<proId>#<startISO>`) escrito con `ConditionExpression` dentro de
  una transacción junto a la cita.
- **Correos por eventos:** la Lambda que reserva, mueve o cancela solo escribe en
  DynamoDB y responde. Un **DynamoDB Stream** (con filtro de eventos para que solo
  despierte con ítems de citas) dispara la Lambda que envía confirmación, cambio o
  cancelación y avisa al profesional. Reintentos + cola de errores SQS con alarma.
  Envío idempotente: marcador condicional `EMAIL#<citaId>#<tipo>` antes de mandar.
- **Recordatorios y vencimientos:** EventBridge Scheduler con **una sola tarea recurrente
  cada 10 minutos**, no una por cita. El momento del recordatorio vive **en la misma cita**
  (atributo indexado en un GSI disperso, por buckets de día) y se actualiza en la misma
  transacción al mover o cancelar, así que nunca queda un recordatorio huérfano o con la
  hora vieja. Al enviarlo se quita el atributo (condicional = idempotente). La misma tarea
  manda el aviso de vencimiento 3 días antes.
- **Respaldo:** DynamoDB con **PITR** en ambos ambientes (centavos con datos de pocos MB);
  protección contra borrado solo en prod.
- **Zona horaria:** guardar en UTC y mostrar en `America/Bogota`. Festivos de Colombia en código/config.
- **Anti-spam:** Cloudflare Turnstile (gratis) verificado en la Lambda + límite de
  reservas con contadores en DynamoDB (TTL) + throttling del HTTP API. **Nada de AWS WAF**
  (cobra mensualidad por reglas).
- **Secretos** (Wompi, firma de enlaces): SSM Parameter Store `SecureString` (gratis).
  Nada de Secrets Manager ni llaves KMS propias.
- **Logs:** retención de 14 días y sin nivel debug en producción.
- **Frontend:** CloudFront + S3 + certificado ACM. `.app` **obliga a HTTPS**.
- **Página pública `/<slug>`:** HTML estático por perfil en S3, generado al guardar el
  perfil, con etiquetas Open Graph (el enlace se ve bien en WhatsApp/Instagram) y con el
  perfil y los servicios ya incluidos, para que se pinte sin llamar al API. Carga solo el
  paquete liviano de `frontend/booking`. Una llamada trae la disponibilidad de 14 días.
  La disponibilidad y el estado de la suscripción vienen **siempre del API**, nunca del HTML.
  Hay slugs reservados (`api`, `app`, `admin`, `dev`, `c`, …).
- **Dominio:** `separame.app` en Route 53 (renovación automática activada).
  `separame.co` aplazado hasta tener tracción.

## Lecciones aprendidas en Cartazos (misma cuenta AWS: 461529379195, us-east-1)
- **Límite de 50 ejecuciones concurrentes de Lambda en la cuenta:** NUNCA pongas
  `reservedConcurrentExecutions`; hace rollback del deploy. Ese límite ya acota el gasto
  en caso de abuso. La cuenta es **compartida** con Cartazos y blobhive, así que cuenta
  con que la concurrencia también es compartida.
- **Bundling:** si `backend/` y `shared/` viven fuera de `cdk/`, cada `NodejsFunction`
  usa `projectRoot` y `depsLockFilePath` en la raíz del repo. La raíz necesita `esbuild`
  en devDeps y un `package-lock.json` versionado, y CI debe hacer `npm ci` también en la raíz.
- **Orden de deploy:** el stack del frontend debe declarar
  `addDependency(apiStack)`. Si no, `cdk deploy --all --concurrency` puede publicar un
  cliente que llama rutas o campos que el API aún no tiene, y todo falla hasta que el API se pone al día.
- **TTL solo en lo efímero:** nada de TTL fijo en registros que deben vivir tanto como
  su padre (en Cartazos, los asientos expiraban a mitad de partida). Usa TTL solo en
  tokens, throttles y marcadores de idempotencia.
- **Lecturas consistentes** (`ConsistentRead: true`) en cualquier ruta de leer y luego
  escribir o validar (disponibilidad, reservas, estado de la suscripción).
- **Idempotencia:** webhooks y mutaciones que cobran o reservan deben tolerar reintentos
  (marcador condicional por id).
- **Presupuesto y alarmas de la cuenta:** el presupuesto mensual único de la cuenta y las
  alarmas a nivel de cuenta viven en `CardsMonitoringStack` (Cartazos). No dupliques un
  presupuesto de cuenta aquí; pon solo las alarmas propias de Sepárame en su stack.
- **Deploy por GitHub OIDC:** el rol de deploy de Cartazos (`CardsGithubDeployRole`) solo
  puede asumir los roles `cdk-*` del bootstrap. Si Sepárame usa otro repo, necesitará su
  propio rol OIDC (o ampliar la relación de confianza de ese rol).

## Legal y administrativo
- **Ley 1581 de 2012 (datos personales):** casilla de autorización en la reserva, política
  de privacidad y forma de borrar datos. Guardar solo lo necesario (nombre, correo, teléfono).
- **Marca:** verificar "Sepárame" en la SIC.
- **Impuestos:** facturación electrónica DIAN y régimen, por confirmar con un contador.

## Cómo trabajar en este repo
- Commit solo cuando el usuario lo pida; mensajes en inglés.
- Antes de dar algo por terminado: typecheck, lint y tests de lo que se tocó.
- Mantén los costos fijos cerca de cero: on-demand, sin servidores encendidos, sin NAT
  gateways, sin `reservedConcurrentExecutions`.
