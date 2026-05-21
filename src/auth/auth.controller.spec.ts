import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { OAuthService } from './services/oauth.service';
import { DiscoveryService } from './services/discovery.service';
import { PartnerMetaService } from '../alias/partner-meta.service';
import { AliasService } from '../alias/alias.service';

describe('AuthController', () => {
  let controller: AuthController;
  let app: INestApplication;

  const providerMocks = [
    { provide: OAuthService, useValue: {} },
    { provide: DiscoveryService, useValue: {} },
    { provide: PartnerMetaService, useValue: {} },
    { provide: AliasService, useValue: {} },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: providerMocks,
    }).compile();

    controller = module.get<AuthController>(AuthController);

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('register', () => {
    it('should echo redirect_uris for strict OAuth clients', async () => {
      const response = await controller.register('demo', {
        redirect_uris: ['http://localhost:4318/callback'],
        client_name: 'Claude Code',
      });

      expect(response).toMatchObject({
        client_id: 'web-client-static',
        redirect_uris: ['http://localhost:4318/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(typeof response.client_id_issued_at).toBe('number');
    });

    it('should preserve legacy behavior when redirect_uris is absent', async () => {
      const response = await controller.register('demo');

      expect(response).toMatchObject({
        client_id: 'web-client-static',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(response).not.toHaveProperty('redirect_uris');
    });

    it('should omit malformed redirect_uris values', async () => {
      const response = await controller.register('demo', {
        redirect_uris: ['http://localhost:4318/callback', 42],
      });

      expect(response).not.toHaveProperty('redirect_uris');
    });
  });

  describe('register over HTTP', () => {
    it('should accept extra client metadata and echo redirect_uris through the validation pipe', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/demo/register')
        .send({
          redirect_uris: ['http://localhost:4318/callback'],
          client_name: 'Claude Code',
          grant_types: ['authorization_code'],
        })
        .expect(201);

      expect(response.body).toMatchObject({
        client_id: 'web-client-static',
        redirect_uris: ['http://localhost:4318/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(typeof response.body.client_id_issued_at).toBe('number');
    });

    it('should preserve legacy empty-body behavior through the validation pipe', async () => {
      const response = await request(app.getHttpServer()).post('/auth/demo/register').send({}).expect(201);

      expect(response.body).toMatchObject({
        client_id: 'web-client-static',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(response.body).not.toHaveProperty('redirect_uris');
    });

    it('should ignore malformed redirect_uris payloads without rejecting the request', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/demo/register')
        .send({
          redirect_uris: 'http://localhost:4318/callback',
          client_name: 'Claude Code',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        client_id: 'web-client-static',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(response.body).not.toHaveProperty('redirect_uris');
    });
  });
});
