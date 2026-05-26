import { expect } from 'chai';
import request from 'supertest';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { PasswordManager, TokenManager } from '../../src/auth/auth.utils';
import { AppConfigService } from '../../src/config/app-config.service';
import { createTestApp, type TestAppContext } from '../support/test-app';
import { createUser, issueToken } from '../support/fixtures';

describe('Auth API', () => {
  let context: TestAppContext;

  beforeEach(async () => {
    context = await createTestApp();
  });

  afterEach(async () => {
    await context.app.close();
  });

  it('registers a user, normalizes email, and returns a bearer token', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'NewUser@Example.COM',
        name: '  New User  ',
        password: 'secret-pass',
      })
      .expect(201);

    expect(response.body.tokenType).to.equal('Bearer');
    expect(response.body.accessToken).to.be.a('string').and.not.empty;
    expect(response.body.user).to.deep.equal({
      id: response.body.user.id,
      email: 'newuser@example.com',
      name: 'New User',
    });

    const storedUser = await context.prisma.user.findUniqueOrThrow({
      where: { email: 'newuser@example.com' },
    });

    expect(storedUser.name).to.equal('New User');
    expect(storedUser.passwordHash).to.not.equal('secret-pass');
  });

  it('rejects registration when the normalized email already exists', async () => {
    await createUser(
      context.prisma,
      context.app.get(PasswordManager),
      {
        email: 'existing@example.com',
      },
    );

    const response = await request(context.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'Existing@Example.com',
        name: 'Duplicate',
        password: 'secret-pass',
      })
      .expect(409);

    expect(response.body.message).to.equal(
      'Registration could not be completed. Try signing in or use a different email.',
    );
  });

  it('rejects login with an invalid password', async () => {
    const passwordManager = context.app.get(PasswordManager);
    await createUser(context.prisma, passwordManager, {
      email: 'person@example.com',
      password: 'valid-password',
      name: 'Person',
    });

    const response = await request(context.app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'person@example.com',
        password: 'wrong-password',
      })
      .expect(401);

    expect(response.body.message).to.equal('Invalid email or password.');
  });

  it('revokes the active session on logout', async () => {
    const passwordManager = context.app.get(PasswordManager);
    const user = await createUser(context.prisma, passwordManager, {
      email: 'logout@example.com',
      password: 'valid-password',
      name: 'Logout User',
    });

    const loginResponse = await request(context.app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'logout@example.com',
        password: 'valid-password',
      })
      .expect(200);

    await request(context.app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(204);

    await request(context.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(401);
  });

  it('rejects an invalid bearer token with the exact auth error contract', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer definitely-not-a-jwt')
      .expect(401);

    expect(response.body.message).to.equal('Invalid or expired access token.');
    expect(response.body.statusCode).to.equal(401);
    expect(response.body.error).to.equal('Unauthorized');
  });

  it('returns 401 for a stale token whose user no longer exists', async () => {
    const passwordManager = context.app.get(PasswordManager);
    const tokenManager = context.app.get(TokenManager);
    const authSessionService = context.app.get(AuthSessionService);
    const appConfigService = context.app.get(AppConfigService);
    const user = await createUser(context.prisma, passwordManager, {
      email: 'stale@example.com',
      password: 'valid-password',
      name: 'Stale User',
    });
    const accessToken = await issueToken(
      tokenManager,
      authSessionService,
      appConfigService,
      user,
    );

    await context.prisma.user.delete({
      where: { id: user.id },
    });

    const response = await request(context.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(response.body.message).to.equal('Invalid or expired access token.');
  });
});
