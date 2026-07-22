import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Envuelve el SQL v1.2.3 aprobado (Baseline Candidate, CHANGELOG_v1.2.3.md,
 * 31/31 tests) tal cual — no se re-deriva el schema con TypeORM synchronize.
 * Lo que corre acá es byte-idéntico al baseline revisado y aprobado.
 *
 * 008_seeds y 009_tests quedan fuera del arranque normal: seeds se corren
 * aparte si se piden explícitamente, y 009_tests es un suite de test.assert_*
 * pensado para correr contra una base descartable, no en cada deploy.
 */
const BASELINE_FILES = [
  '000_extensions.sql',
  '001_audit.sql',
  '002_params.sql',
  '003_core_identity.sql',
  '004_coverage.sql',
  '005_clinical.sql',
  '006_professionals.sql',
  '007_operations.sql',
] as const;

const SQL_DIR = join(__dirname, '..', 'sql');

export class InitialSchemaV123_1753000000000 implements MigrationInterface {
  name = 'InitialSchemaV123_1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const file of BASELINE_FILES) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf-8');
      await queryRunner.query(sql);
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'InitialSchemaV123 no es reversible automáticamente: el baseline aprobado ' +
        'no incluye un script de rollback. Restaurar desde backup si es necesario.',
    );
  }
}
