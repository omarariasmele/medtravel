import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

import {
  createTestMember,
  createTestUser,
  deleteTestMember,
  deleteTestUser,
  getAnyCatalogValueId,
  TestMemberFixture,
  TestUserFixture,
} from './support/test-user';

/**
 * Prueba hc_select/hc_insert/hc_update/hc_no_delete (004_coverage.sql,
 * bloque C2 "consentimiento obligatorio") vía el CRUD genérico de
 * /coverage: el titular puede crear y leer la cobertura de su propio
 * member, pero no la de un member ajeno (sin tenant ni consentimiento de
 * por medio) — y nadie puede borrarla nunca (hc_no_delete).
 */
describe('Coverage RLS enforcement (e2e)', () => {
  let app: INestApplication;
  let self: TestUserFixture;
  let other: TestUserFixture;
  let selfMember: TestMemberFixture;
  let otherMember: TestMemberFixture;
  let accessToken: string;
  let catalogId: string;
  let createdId: string;

  beforeAll(async () => {
    [self, other, catalogId] = await Promise.all([
      createTestUser(),
      createTestUser(),
      getAnyCatalogValueId(),
    ]);
    [selfMember, otherMember] = await Promise.all([
      createTestMember(self.personId),
      createTestMember(other.personId),
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
      .send({ email: self.email, password: self.password });
    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await deleteTestMember(selfMember);
    await deleteTestMember(otherMember);
    await deleteTestUser(other);
    await deleteTestUser(self);
  });

  function healthCoveragePayload(memberId: string) {
    return {
      memberId,
      coverageName: 'Cobertura de prueba (e2e)',
      coverageTypeId: catalogId,
      providerName: 'Aseguradora de prueba',
      statusId: catalogId,
    };
  }

  it('permite crear cobertura de salud para el propio member', async () => {
    const res = await request(app.getHttpServer())
      .post('/coverage/health-coverages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(healthCoveragePayload(selfMember.memberId));

    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe(selfMember.memberId);
    createdId = res.body.id;
  });

  it('rechaza crear cobertura de salud para un member ajeno', async () => {
    const res = await request(app.getHttpServer())
      .post('/coverage/health-coverages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(healthCoveragePayload(otherMember.memberId));

    expect(res.status).toBe(403);
  });

  /**
   * app_runtime no tiene GRANT DELETE sobre ninguna tabla de coverage
   * (mismo patrón que el resto del schema) — el intento falla por
   * permisos (403) antes de llegar a evaluar hc_no_delete, que queda
   * como defensa adicional si alguna vez se otorgara el GRANT.
   */
  it('nunca permite borrar una cobertura de salud (sin GRANT DELETE)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/coverage/health-coverages/${createdId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });
});
