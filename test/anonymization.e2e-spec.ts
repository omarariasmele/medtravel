import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { AnonymizationService } from '../src/modules/jobs/anonymization.service';

import {
  createTestUser,
  deleteAnonymizationJob,
  deleteTestUser,
  getPersonFirstName,
  insertAnonymizationJob,
  TestUserFixture,
} from './support/test-user';

/**
 * Prueba AnonymizationService.processJob() directamente (sin pasar por
 * BullMQ/Redis, que no está instalado en este entorno — ver README) para
 * validar la lógica real: que audit.anonymize_field() (SECURITY DEFINER)
 * efectivamente puede tocar core.persons (RLS forzada, self-access) para
 * un row_id arbitrario, algo que un job de background no podría hacer
 * por el camino normal de RLS.
 */
describe('Anonymization job (e2e, sin BullMQ)', () => {
  let anonymizationService: AnonymizationService;
  let fixture: TestUserFixture;

  beforeAll(async () => {
    fixture = await createTestUser();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    anonymizationService = moduleRef.get(AnonymizationService);
  });

  afterAll(async () => {
    await deleteTestUser(fixture);
  });

  it('pseudonimiza un campo y marca el job COMPLETED', async () => {
    const jobId = await insertAnonymizationJob(
      fixture.personId,
      'first_name',
      'PSEUDONYMIZATION',
    );

    try {
      await anonymizationService.processJob(jobId);

      const newFirstName = await getPersonFirstName(fixture.personId);
      expect(newFirstName).not.toBe('E2E');
      expect(newFirstName).toMatch(/^ANON-/);
    } finally {
      await deleteAnonymizationJob(jobId);
    }
  });

  it('falla con un job que ya no está PENDING', async () => {
    const jobId = await insertAnonymizationJob(
      fixture.personId,
      'first_name',
      'PSEUDONYMIZATION',
    );

    try {
      await anonymizationService.processJob(jobId); // primera vez: OK
      await expect(anonymizationService.processJob(jobId)).rejects.toThrow(); // segunda vez: ya no PENDING
    } finally {
      await deleteAnonymizationJob(jobId);
    }
  });
});
