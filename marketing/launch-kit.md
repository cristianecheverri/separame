# Kit de lanzamiento — LinkedIn, Facebook e Instagram

Imágenes en `marketing/social/out/` (se regeneran con `node marketing/social/render.mjs`):

| Archivo | Tamaño | Dónde va |
|---|---|---|
| `profile.png` | 1080 × 1080 | Foto de perfil de Facebook e Instagram (se recorta en círculo) |
| `facebook-cover.png` | 1640 × 624 | Portada de la página de Facebook (en celular se ve solo el centro) |
| `linkedin-featured.png` | 1200 × 627 | Imagen del post de LinkedIn o del proyecto |
| `ad-feed.png` | 1080 × 1350 | Anuncio y publicaciones en el feed de Facebook e Instagram |
| `ad-story.png` | 1080 × 1920 | Anuncio en historias y reels |

---

## 1. LinkedIn — post

> Enfocado en negocio: para profesionales y para quien conozca a uno. Adjunta `ad-feed.png`
> (en el feed del celular ocupa más pantalla que la horizontal). El detalle técnico se queda en
> el proyecto de LinkedIn.

```
¿Cuántas veces a la semana respondes "¿qué horario tienes?" por WhatsApp?

Si eres odontólogo, psicólogo, abogado, barbero, entrenador o tienes un consultorio, seguramente agendas así: preguntar, proponer horas, confirmar, recordar… y aun así alguien no llega.

Por eso lancé Sepárame: una agenda de citas en línea hecha para Colombia.

Así funciona:
1️⃣ Creas tu cuenta y pones tus servicios, precios y horario.
2️⃣ Compartes tu enlace (separame.app/tu-nombre) por WhatsApp, Instagram o con un QR en la puerta.
3️⃣ Tus clientes eligen servicio, día y hora. Sin llamarte, sin descargar nada y sin crear cuenta.

Lo que pasa después lo hace Sepárame solo:
✅ Tu cliente recibe la confirmación, con botones para agregar la cita a su calendario.
✅ Un día antes le llega un recordatorio con un botón "Sí, voy", y tú ves quién confirmó.
✅ Si alguien cancela, la lista de espera le avisa a quien quería ese día.
✅ Nunca quedan dos personas a la misma hora.
✅ Los festivos de Colombia ya vienen cargados.
✅ Tienes tu agenda en el celular, con un aviso por cada cita nueva.

¿Trabajan varios en el mismo consultorio? Hay un plan para equipos: una sola cuenta y la agenda de cada profesional.

💰 Prueba gratis 10 días, sin tarjeta. Después, desde $5.000 al mes, pagando por Nequi o transferencia, sin cobros automáticos. Los primeros tienen precio fundador: lo conservan mientras sigan renovando.

🙏 Un favor: si conoces a alguien que todavía agenda por WhatsApp, compártele este post o etiquétalo en los comentarios.

separame.app
```

## 2. LinkedIn — proyecto

> Cuenta qué es y qué hiciste tú, sin contar cómo funciona por dentro.

**Nombre:**
```
Sepárame — agenda de citas en línea para profesionales
```

**Descripción:**
```
Agenda de citas en línea para profesionales en Colombia, en producción en separame.app. Cada profesional comparte su enlace y sus clientes reservan servicio, día y hora sin crear cuenta; la confirmación, los recordatorios y la lista de espera funcionan solos. Incluye panel instalable en el celular, estadísticas, plan para equipos y suscripciones.

Es un proyecto personal que diseñé y programé con Claude Code como par de programación. Es 100% serverless en AWS, con la infraestructura definida como código (CDK y TypeScript), React en el panel y despliegue automático con GitHub Actions en cada cambio.
```

**Skills:** Product Development · TypeScript · Amazon Web Services (AWS) · Infrastructure as code (IaC) · React.js

**Enlace del proyecto / Destacados:** `https://separame.app` (LinkedIn toma sola la imagen `og.png` del sitio y el título "Sepárame · Tu agenda de citas en línea").

## 3. Página de Facebook (y cuenta de Instagram)

Se crea desde facebook.com/pages/create con tu perfil personal (Meta lo exige; tu nombre no aparece en la página).

| Campo | Valor |
|---|---|
| Nombre | `Sepárame` |
| Categoría | `Software` (y si deja una segunda: `Servicio de internet`) |
| Presentación (máx. 101) | `Agenda de citas en línea para profesionales en Colombia. Tus clientes reservan desde un enlace.` |
| Nombre de usuario | `separame.app` (si no está libre: `separameapp`) |
| Sitio web | `https://separame.app/?utm_source=facebook&utm_medium=social&utm_campaign=page` |
| Correo | el de contacto que definas (pendiente en el backlog) |
| Ubicación | Solo "Colombia", sin dirección (no hay local) |
| Botón de acción | **Registrarte** → `https://separame.app/app/signup?utm_source=facebook&utm_medium=social&utm_campaign=page_button` |
| Foto de perfil | `profile.png` |
| Portada | `facebook-cover.png` |

**Instagram:** crea `@separame.app` (o `@separameapp`) como cuenta profesional, con la misma foto y presentación, el enlace a `https://separame.app/?utm_source=instagram&utm_medium=social&utm_campaign=bio`, y conéctala a la página desde Meta Business Suite. Para los profesionales que buscas (estética, barberías, psicólogos, entrenadores), Instagram pesa más que Facebook; los anuncios salen en los dos desde el mismo lugar.

### Primeras publicaciones (para que la página no se vea vacía)

1. **Presentación** — imagen `ad-feed.png`
   ```
   Hola 👋 Somos Sepárame, la agenda de citas en línea hecha en Colombia.

   Creas tu enlace (separame.app/tu-nombre), lo compartes por WhatsApp o Instagram, y tus clientes eligen servicio, día y hora sin escribirte. Tú recibes la cita; ellos, la confirmación y un recordatorio un día antes.

   Prueba gratis 10 días, sin tarjeta 👉 separame.app
   ```
2. **Cómo funciona** — imagen `facebook-cover.png` o una captura del panel
   ```
   Tu enlace de citas, listo en tres pasos:
   1️⃣ Crea tu cuenta con tu correo.
   2️⃣ Pon tus servicios, duraciones y horario (los festivos ya están).
   3️⃣ Comparte tu enlace o tu QR. Las citas empiezan a llegar.

   separame.app
   ```
3. **Menos inasistencias** — imagen `ad-story.png` (o como historia)
   ```
   Un día antes de la cita, tu cliente recibe un recordatorio con un botón: "Sí, voy". Tú ves en tu agenda quién confirmó.
   Si no puede ir, cancela o cambia desde el mismo correo, y el cupo le llega a quien estaba en lista de espera.
   ```

## 4. Anuncios en Meta (Facebook + Instagram)

**Antes de encenderlos:** el backlog dice que privacidad y términos incompletos (responsable, cédula o NIT, correo) y el registro del negocio **bloquean el anuncio público**. Pagar anuncios es anunciarlo. La página y las primeras publicaciones sí se pueden dejar listas.

**Montaje** (Administrador de anuncios → Crear):

| | |
|---|---|
| Objetivo | **Tráfico** → optimizar por *visitas a la página de destino* (sin Meta Pixel no hay cómo optimizar por registros) |
| Presupuesto de prueba | $20.000 COP/día durante 7 días ≈ $140.000 + IVA del 19 % que cobra Meta |
| Ubicación | Colombia |
| Edad | 24–55 |
| Público | Advantage+ con sugerencias de intereses: odontología, psicología, fisioterapia, nutrición, estética, barbería, peluquería, entrenamiento personal, abogados |
| Ubicaciones | Advantage+ (feed, historias y reels de Facebook e Instagram) |
| Imágenes | `ad-feed.png` (feed) y `ad-story.png` (historias y reels) |
| Botón | **Registrarte** |
| URL | `https://separame.app/` |
| Parámetros de URL | `utm_source=meta&utm_medium=paid_social&utm_campaign=launch_oct26&utm_content={{ad.name}}` |

Google Analytics ya conserva los `utm_*` y el `fbclid` y tiene `sign_up` como evento clave, así que en GA4 (Adquisición → Adquisición de tráfico, por campaña) se ve cuántos registros trajo cada anuncio.

**Texto A — el problema**
- Texto principal:
  ```
  ¿Se te va la mañana respondiendo "¿qué horario tienes?" por WhatsApp? 📲

  Con Sepárame tus clientes separan cita desde tu enlace: eligen servicio, día y hora, y les llega la confirmación y un recordatorio un día antes. Sin llamadas y sin instalar nada.

  ✅ Cero citas dobles
  ✅ Festivos de Colombia incluidos
  ✅ Lista de espera que llena los huecos

  Prueba gratis 10 días, sin tarjeta. Después, desde $5.000 al mes.
  ```
- Título: `Tu agenda de citas en un enlace`
- Descripción: `Prueba gratis 10 días, sin tarjeta`

**Texto B — las inasistencias**
- Texto principal:
  ```
  Cada cita a la que no llegan es un hueco en tu día.

  Sepárame le manda a tu cliente un recordatorio un día antes con un botón "Sí, voy". Si no puede ir, cancela desde el correo y el cupo le llega a quien estaba en lista de espera. Tú solo atiendes.

  Para consultorios, estudios, barberías y profesionales independientes en Colombia. Prueba gratis 10 días.
  ```
- Título: `Menos inasistencias, más citas`
- Descripción: `Desde $5.000 al mes`

Arranca con A y B en el mismo conjunto de anuncios y deja que Meta reparta; al cuarto o quinto día apaga el que tenga peor costo por visita.

**La cuenta que hay que mirar:** con un plan de $5.000 al mes, un registro que cueste $20.000 en anuncios tarda meses en pagarse (y no todos los registros pagan). Toma esta primera campaña como aprendizaje: qué profesión responde y a qué mensaje. Lo que más rinde a este precio es lo orgánico: los referidos (ya construidos), los grupos de profesionales y el contacto directo con los primeros clientes.
