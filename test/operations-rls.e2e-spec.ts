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
 * Prueba trips_access/trip_destinations_access
 * (proposed-trips-rls.sql, gap #7 — ver SCHEMA_GAPS.md) vía el CRUD
 * genérico de /operations: el titular puede crear y leer los viajes de su
 * propio member, pero no los de un member ajeno. También confirma que
 * los recursos sacados del registro por el gap #8 (case-participants,
 * chat-channels, etc.) ya no responden por acá.
 */
describe('Operations RLS enforcement (e2e)', () => {
  let app: INestApplication;
  let self: TestUserFixture;
  let other: TestUserFixture;
  let selfMember: TestMemberFixture;
  let otherMember: TestMemberFixture;
  let accessToken: string;
  let catalogId: string;

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

  function tripPayload(memberId: string) {
    return {
      memberId,
      tripName: 'Viaje de prueba (e2e)',
      tripStart: '2026-08-01',
      tripEnd: '2026-08-10',
      statusId: catalogId,
    };
  }

  it('permite crear un viaje para el propio member', async () => {
    const res = await request(app.getHttpServer())
      .post('/operations/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload(selfMember.memberId));

    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe(selfMember.memberId);
  });

  it('rechaza crear un viaje para un member ajeno', async () => {
    const res = await request(app.getHttpServer())
      .post('/operations/trips')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(tripPayload(otherMember.memberId));

    expect(res.status).toBe(403);
  });

  it('recursos sacados del CRUD genérico por falta de RLS (gap #8) dan 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/operations/case-participants')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});
