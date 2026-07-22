import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

import {
  createTestUser,
  deleteTestUser,
  getAnyCatalogValueId,
  TestUserFixture,
} from './support/test-user';

/**
 * Prueba que clinical.has_clinical_access(person_id) — la función RLS
 * central del schema (000_extensions.sql) — efectivamente se aplica de
 * punta a punta a través de TenantTransactionManager +
 * PgSessionContextInterceptor: el titular puede crear su propio registro
 * clínico, pero no el de otra persona.
 */
describe('Clinical RLS enforcement (e2e)', () => {
  let app: INestApplication;
  let fixture: TestUserFixture;
  let accessToken: string;
  let catalogId: string;

  beforeAll(async () => {
    [fixture, catalogId] = await Promise.all([
      createTestUser(),
      getAnyCatalogValueId(),
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: fixture.password });
    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await deleteTestUser(fixture);
  });

  function allergyPayload(personId: string) {
    return {
      personId,
      allergenName: 'Alérgeno de prueba (e2e)',
      allergenTypeId: catalogId,
      severityId: catalogId,
      canonicalStatusId: catalogId,
      provenanceId: catalogId,
    };
  }

  it('permite crear un registro clínico para la propia persona', async () => {
    const res = await request(app.getHttpServer())
      .post('/clinical/allergies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(allergyPayload(fixture.personId));

    expect(res.status).toBe(201);
    expect(res.body.personId).toBe(fixture.personId);
  });

  it('rechaza crear un registro clínico para otra persona', async () => {
    const res = await request(app.getHttpServer())
      .post('/clinical/allergies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(allergyPayload(randomUUID()));

    expect(res.status).toBe(403);
  });

  it('rechaza el acceso sin token', async () => {
    const res = await request(app.getHttpServer())
      .post('/clinical/allergies')
      .send(allergyPayload(fixture.personId));

    expect(res.status).toBe(401);
  });

  it('un recurso no registrado en el módulo da 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/identity/no-existe')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});
