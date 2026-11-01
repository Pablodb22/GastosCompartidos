# Cuentas en pareja

Aplicación para que una pareja lleve sus gastos compartidos. Construida con Next.js 16, Postgres en Neon y desplegada en Vercel.

## Funcionalidad

- **Datos de la pareja**: nombres y sueldo neto mensual de cada persona (se piden la primera vez y se pueden editar).
- **Tres apartados de gastos**, cada uno con su formulario y su lista:
  - **Gastos fijos**: alquiler, internet, agua y luz.
  - **Compras de comida**.
  - **Ocio**.
- **Reparto**:
  - El **alquiler** se reparte en proporción a los sueldos. Ejemplo: 2.400 € y 1.600 € → 60 % / 40 %.
    El porcentaje se guarda en cada alquiler registrado, así que cambiar un sueldo no altera los meses anteriores.
  - Todos los demás gastos se reparten **a partes iguales**.
- **¿Quién debe a quién?**: saldo del mes, lo que ha pagado cada persona frente a lo que le corresponde y el desglose por apartado.
- Exportación del mes a CSV (compatible con Excel).

La aplicación no tiene inicio de sesión: cualquiera que conozca la URL puede verla y modificarla.

## Conservación de datos

Solo se conservan el mes en curso y el anterior. **El día 15 de cada mes se elimina el mes más antiguo.**

| Fecha | Meses disponibles |
| --- | --- |
| 1–14 de diciembre | octubre, noviembre, diciembre |
| desde el 15 de diciembre | noviembre, diciembre |

El borrado lo hace una tarea programada diaria de Vercel (`vercel.json`, a las 04:00 UTC) que llama a `/api/cron/purge`. Como respaldo, la limpieza también se aplica al abrir la aplicación. Las fechas se calculan en la zona horaria `Europe/Madrid`.

Si necesitas conservar el histórico, exporta el CSV de cada mes antes del día 15.

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
