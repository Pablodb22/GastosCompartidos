# Cuentas en pareja

Aplicación para que una pareja lleve sus gastos compartidos. Construida con Next.js 16, Postgres en Neon y desplegada en Vercel.

## Funcionalidad

- **Datos de la pareja**: nombres y sueldo neto mensual de cada persona (se piden la primera vez y se pueden editar).
- **Tres apartados de gastos**, cada uno con su formulario y su lista:
  - **Gastos fijos**: alquiler, internet, agua, luz y gimnasio (el gimnasio puede ser de la pareja o de una sola persona).
  - **Compras de comida**.
  - **Ocio**: en pareja o individual (de una sola persona).
- **Reparto**:
  - El **alquiler** se reparte en proporción a los sueldos. Ejemplo: 2.400 € y 1.600 € → 60 % / 40 %.
    El porcentaje se guarda en cada alquiler registrado, así que cambiar un sueldo no altera los meses anteriores.
  - El **ocio individual** y el **gimnasio de una sola persona** corren enteros a cargo de quien los disfruta; si los
    paga la otra persona, queda como deuda.
  - Todos los demás gastos se reparten **a partes iguales**.
- **¿Quién debe a quién?**: saldo del mes, lo que ha pagado cada persona frente a lo que le corresponde y el desglose por apartado.
- **Escanear ticket** 📸: haces una foto al ticket desde el móvil y la app lee el total, la fecha y el comercio.
  Revisas el importe (o eliges otro de los que aparecen en el ticket), indicas si es comida u ocio, la descripción,
  quién lo pagó y para quién era, y se guarda. La lectura (OCR con Tesseract.js) se hace en el propio navegador:
  la foto no se sube a ningún sitio y no hace falta ninguna clave. La primera vez descarga unos 6 MB.
  Antes de leerla se «aplana» la luz de la foto (quita sombras y zonas oscuras) y, si los productos no suman el
  total, se vuelve a leer con otros tratamientos y se queda la lectura que mejor cuadre.
  También saca **los productos del ticket** (nombre y precio, con cantidades, productos a peso y **descuentos ya
  restados del producto**: «Descuento -0,50», «DTO 2ª unidad», «Promo -20%»…): puedes editarlos,
  eliminarlos o añadir los que falten, y te avisa si la suma no coincide con el total. Se guardan con el gasto
  (tabla `gasto_productos`) y se ven desplegando «🧾 N productos» en la lista.
- **📊 Gráficos** (pestaña arriba a la derecha): tres quesitos por mes, uno por persona (su parte de los gastos)
  y otro de la pareja (solo gastos comunes). Cada uno muestra el total y se reparte en gastos fijos, comida y
  **ocio dividido por concepto** (cine, cena…; los más pequeños se agrupan en «Otro ocio»). Al tocar una porción
  se ve su importe, su % y cuántos gastos tiene.
- **Editar gastos ya guardados** ✏️: apartado, fecha, concepto, importe, quién pagó, para quién (ocio) y los
  productos del ticket. Se aplican las mismas reglas que al crear el gasto; si estaba pagado sigue pagado, y un
  alquiler conserva el % de sueldos con el que se registró.
- **Navegar por dos años**: el selector de la parte superior tiene el año y los doce meses; los meses sin gastos se ven
  apagados y los futuros no se pueden elegir. Sirve igual en Cuentas, Gráficos y la exportación a Excel.
- **🎁 Wrapped**: un resumen del año al estilo Spotify, con humor y en formato **historias** (toque a la derecha:
  siguiente · a la izquierda: anterior · mantener pulsado: pausa; también con flechas y espacio en el ordenador). Cuenta
  cuánto gastasteis, el mes y el día más caros, vuestro día de la semana, el sitio favorito, el plan y el producto
  estrella, quién ha sacado más la tarjeta, la parte de cada uno, la mayor racha sin gastar, las cuentas pendientes y
  vuestro «perfil financiero».
  - **Ciclo** (ejemplo con 2026): cuenta los gastos del 1 de diciembre de 2025 al 30 de noviembre de 2026. Se crea el
    **1 de diciembre de 2026** y está disponible hasta el 31 de octubre de 2027; el **1 de noviembre de 2027 se borra**.
    Los gastos que apuntéis desde el 1 de diciembre de 2026 entran en el Wrapped del año siguiente.
  - La pestaña «Wrapped» **solo aparece del 1 de diciembre al 31 de octubre**. En noviembre no hay Wrapped.
  - Una vez creado se guarda (tabla `wrapped_anual`) y no cambia aunque luego se editen o borren gastos. Si añadís
    gastos que faltaban, «Volver a generar» lo recalcula, pero solo hasta el 31 de diciembre: el 1 de enero se borra el
    diciembre anterior y ya no saldría completo.
  - El primer año solo cuenta los gastos que haya en la app: si empezasteis a apuntar en noviembre, será corto.
- **Pendiente / pagado**: cada gasto que genera deuda aparece como «⏳ Pendiente». Cuando la otra persona devuelve su parte,
  se pulsa y pasa a «✅ Pagado» (se puede deshacer). Los gastos pagados **no se borran**: siguen en la lista y en los totales,
  pero dejan de contar en «¿Quién debe a quién?». También hay un botón para marcar todo el mes como pagado.
- **Exportar e importar Excel (.xlsx)**:
  - «Exportar Excel» descarga los gastos del mes (o una plantilla vacía si no hay), con desplegables y una hoja de instrucciones.
  - «Importar Excel» lee el archivo, rellena automáticamente fecha, apartado, concepto, importe, quién pagó, para quién y estado (pendiente/pagado), y lo guarda en la base de datos.
    Las filas con errores se indican y no se importan; los gastos que ya existen se omiten, así que se puede reimportar sin duplicar.

La aplicación no tiene inicio de sesión: cualquiera que conozca la URL puede verla y modificarla.

## Conservación de datos

Se conservan **dos años naturales**: el actual y el anterior. **El 1 de enero se elimina el año más antiguo.**

| Fecha | Años disponibles |
| --- | --- |
| durante 2026 | 2025 y 2026 |
| a partir del 1 de enero de 2027 | 2026 y 2027 (se elimina 2025) |

El borrado lo hace una tarea programada diaria de Vercel (`vercel.json`, a las 04:00 UTC) que llama a `/api/cron/purge`. Como respaldo, la limpieza también se aplica al abrir la aplicación. Las fechas se calculan en la zona horaria `Europe/Madrid`.

Si necesitas conservar los gastos en sí, exporta el Excel de cada mes antes del 1 de enero. El Wrapped tiene su propio ciclo (se borra el 1 de noviembre; ver arriba).

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión de Neon. Vercel la añade al conectar la base de datos. |
| `CRON_SECRET` | Secreto aleatorio de la tarea programada. Vercel lo envía automáticamente. |

## Despliegue en Vercel

1. Sube este proyecto a un repositorio de GitHub.
2. En Vercel: **Add New → Project** e importa el repositorio.
3. En el proyecto: **Storage → Create Database → Neon (Postgres)** y conéctala. Esto crea `DATABASE_URL`.
4. En **Settings → Environment Variables** añade `CRON_SECRET` (un texto aleatorio, por ejemplo con `openssl rand -hex 32`).
5. Vuelve a desplegar (**Deployments → Redeploy**).

Las tablas se crean automáticamente la primera vez que se usa la aplicación. Al abrirla por primera vez os pedirá vuestros nombres y sueldos.

## Desarrollo local

```bash
cp .env.example .env.local   # y rellena los valores
npm install
npm run dev
```
