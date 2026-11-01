import "server-only";
import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

const SCHEMA = [
  // Datos de la pareja (una sola fila). No se borra con la limpieza mensual.
  `CREATE TABLE IF NOT EXISTS pareja (
     id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     nombre_1        TEXT NOT NULL,
     nombre_2        TEXT NOT NULL,
     sueldo_1        NUMERIC(10, 2) CHECK (sueldo_1 >= 0),
     sueldo_2        NUMERIC(10, 2) CHECK (sueldo_2 >= 0),
     actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS gastos (
     id            BIGSERIAL PRIMARY KEY,
     fecha         DATE NOT NULL,
     seccion       TEXT NOT NULL CHECK (seccion IN ('fijos', 'comida', 'ocio')),
     concepto      TEXT NOT NULL CHECK (char_length(concepto) BETWEEN 1 AND 120),
     importe       NUMERIC(10, 2) NOT NULL CHECK (importe > 0),
     pagado_por    SMALLINT NOT NULL CHECK (pagado_por IN (1, 2)),
     porcentaje_1  NUMERIC(5, 2) NOT NULL DEFAULT 50 CHECK (porcentaje_1 BETWEEN 0 AND 100),
     creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha)`,
];

/** Devuelve el cliente SQL y garantiza que las tablas existen (una vez por instancia). */
export async function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable de entorno DATABASE_URL.");
    // Solo para desarrollo local con un proxy HTTP de Neon (no definir en producción).
    if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
    client = neon(url);
  }
  if (!schemaReady) {
    const sql = client;
    schemaReady = (async () => {
      for (const statement of SCHEMA) await sql.query(statement);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return client;
}
