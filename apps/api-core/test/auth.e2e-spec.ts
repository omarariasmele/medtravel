import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

import {
  createTestUser,
  deleteTestUser,
  TestUserFixture,
} from './support/test-user';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let fixture: TestUserFixture;

  beforeAll(async () => {
    fixture = await createTestUser();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await deleteTestUser(fixture);
  });

  it('rechaza un email que no existe', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-existe-e2e@medtravelapp.test', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('rechaza una password incorrecta', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: 'incorrecta' });
    expect(res.status).toBe(401);
  });

  it('acepta credenciales correctas y devuelve un par de tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: fixture.password });
    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('emite un nuevo access token a partir de un refresh token válido', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: fixture.password });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rechaza un refresh token inválido', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'no-es-un-jwt' });
    expect(res.status).toBe(401);
  });

  it('logout revoca la sesión — el refresh token deja de servir', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: fixture.password });

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(logoutRes.status).toBe(201);
    expect(logoutRes.body.ok).toBe(true);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('logout sin token da 401', async () => {
    const res = await request(app.getHttpServer()).post('/auth/logout');
    expect(res.status).toBe(401);
  });
});
