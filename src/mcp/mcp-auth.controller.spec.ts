import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { McpAuthController } from './mcp-auth.controller';
import { OAuthService } from '../auth/services/oauth.service';
import { DiscoveryService } from '../auth/services/discovery.service';
import { PartnerMetaService } from '../alias/partner-meta.service';
import { AliasService } from '../alias/alias.service';

describe('McpAuthController', () => {
  let controller: McpAuthController;
  let mockAliasService: { resolveAlias: jest.Mock };

  beforeEach(async () => {
    mockAliasService = {
      resolveAlias: jest.fn().mockResolvedValue('project-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpAuthController],
      providers: [
        { provide: OAuthService, useValue: {} },
        { provide: DiscoveryService, useValue: {} },
        { provide: PartnerMetaService, useValue: {} },
        { provide: AliasService, useValue: mockAliasService },
      ],
    }).compile();

    controller = module.get<McpAuthController>(McpAuthController);
  });

  describe('register', () => {
    it('should echo redirect_uris while keeping subdomain registration static', async () => {
      const response = await controller.register('demo', {
        redirect_uris: ['http://localhost:4318/callback'],
        client_name: 'Claude Code',
      });

      expect(mockAliasService.resolveAlias).toHaveBeenCalledWith('demo');
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

    it('should still reject unknown aliases', async () => {
      mockAliasService.resolveAlias.mockResolvedValueOnce(null);

      await expect(controller.register('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
