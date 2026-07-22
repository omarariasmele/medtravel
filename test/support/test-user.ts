import { createHmac, randomUUID } from 'crypto';
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';

/**
 * Estos tests corren contra la base configurada en .env (hoy, el
 * servidor real de desarrollo) — no hay una base de test aislada. Por
 * eso cada fixture se crea con datos únicos (email con uuid) y se borra
 * explícitamente en el teardown, en vez de depender de un usuario fijo
 * o de un rollback automático.
 *
 * Conecta como DB_MIGRATION_USERNAME (superuser) para poder crear/borrar
 * filas en tablas con RLS forzada (core.persons, core.users) sin pasar
 * por la app — igual que los scripts de setup usados durante el
 * desarrollo de este proyecto.
 */

export interface TestUserFixture {
  personId: string;
  userId: string;
  email: string;
  password: string;
}

function computeBlindIndex(value: string, key: string): string {
  return createHmac('sha256', key)
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function superuserClient(): Client {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_MIGRATION_USERNAME,
    password: process.env.DB_MIGRATION_PASSWORD,
    database: process.env.DB_DATABASE,
  });
}

export async function createTestUser(): Promise<TestUserFixture> {
  const client = superuserClient();
  await client.connect();

  try {
    const email = `e2e-${randomUUID()}@medtravelapp.test`;
    const password = 'TestPassword123!';
    const passwordHash = bcrypt.hashSync(password, 10);
    const blindIndex = computeBlindIndex(
      email,
      process.env.DB_BLIND_INDEX_KEY!,
    );

    await client.query(`SELECT set_config('app.encryption_key', $1, false)`, [
      process.env.DB_ENCRYPTION_KEY,
    ]);

    const person = await client.query(
      `INSERT INTO core.persons (first_name, last_name) VALUES ('E2E', 'Test') RETURNING id`,
    );
    const personId = person.rows[0].id;

    const user = await client.query(
      `INSERT INTO core.users (person_id, email, email_blind_index)
       VALUES ($1, core.encrypt_pii($2), $3) RETURNING id`,
      [personId, email, blindIndex],
    );
    const userId = user.rows[0].id;

    await client.query(
      `INSERT INTO core.authentication_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [userId, passwordHash],
    );

    return { personId, userId, email, password };
  } finally {
    await client.end();
  }
}

export async function deleteTestUser(fixture: TestUserFixture): Promise<void> {
  const client = superuserClient();
  await client.connect();
  try {
    await client.query(`DELETE FROM clinical.allergies WHERE person_id = $1`, [
      fixture.personId,
    ]);
    await client.query(
      `DELETE FROM core.security_sessions WHERE user_id = $1`,
      [fixture.userId],
    );
    await client.query(
      `DELETE FROM core.authentication_credentials WHERE user_id = $1`,
      [fixture.userId],
    );
    await client.query(`DELETE FROM core.users WHERE id = $1`, [
      fixture.userId,
    ]);
    await client.query(`DELETE FROM core.persons WHERE id = $1`, [
      fixture.personId,
    ]);
  } finally {
    await client.end();
  }
}

/** Cualquier catalog_value real — para satisfacer FKs NOT NULL en tests que no evalúan reglas de negocio. */
export async function getAnyCatalogValueId(): Promise<string> {
  const client = superuserClient();
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id FROM params.catalog_values LIMIT 1`,
    );
    if (!result.rows[0]) {
      throw new Error(
        'No hay ningún params.catalog_values sembrado — correr 008_seeds.sql primero',
      );
    }
    return result.rows[0].id;
  } finally {
    await client.end();
  }
}
