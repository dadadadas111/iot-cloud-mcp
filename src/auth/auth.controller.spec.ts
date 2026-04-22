import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { OAuthService } from './services/oauth.service';
import { DiscoveryService } from './services/discovery.service';
import { PartnerMetaService } from '../alias/partner-meta.service';
import { AliasService } from '../alias/alias.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: OAuthService, useValue: {} },
        { provide: DiscoveryService, useValue: {} },
        { provide: PartnerMetaService, useValue: {} },
        { provide: AliasService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
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
  });
});
