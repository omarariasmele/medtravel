import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

import {
  createTestUser,
  deleteTestUser,
  TestUserFixture,
} from './support/test-user';

/**
 * Prueba persons_self_access (003_core_identity.sql) de punta a punta vía
 * el CRUD genérico de /identity: el titular ve/edita su propio
 * core.persons, pero el de otra persona queda oculto por RLS (404, no
 * 403 — un SELECT restringido por RLS simplemente no devuelve la fila).
 */
describe('Identity RLS enforcement (e2e)', () => {
  let app: INestApplication;
  let self: TestUserFixture;
  let other: TestUserFixture;
  let accessToken: string;

  beforeAll(async () => {
    [self, other] = await Promise.all([createTestUser(), createTestUser()]);

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
    await deleteTestUser(other);
    await deleteTestUser(self);
  });

  it('permite leer el propio core.persons', async () => {
    const res = await request(app.getHttpServer())
      .get(`/identity/persons/${self.personId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(self.personId);
  });

  it('oculta el core.persons de otra persona (404, RLS lo filtra en el SELECT)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/identity/persons/${other.personId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it('rechaza modificar el core.persons de otra persona (404, RLS bloquea el UPDATE)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/identity/persons/${other.personId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Suplantado' });

    expect(res.status).toBe(404);
  });
});
