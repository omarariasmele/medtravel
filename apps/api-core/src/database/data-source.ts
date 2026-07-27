import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource exclusivo para el CLI de migraciones (npm run migration:*).
 * Se conecta como DB_MIGRATION_USERNAME (migration_owner: tiene permisos DDL),
 * nunca como el rol app_runtime que usa la app en runtime — separación de
 * privilegios coherente con el modelo de roles del schema (000_extensions.sql).
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_MIGRATION_USERNAME,
  password: process.env.DB_MIGRATION_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [],
  migrations: ['src/database/migrations/*.ts'],
});
