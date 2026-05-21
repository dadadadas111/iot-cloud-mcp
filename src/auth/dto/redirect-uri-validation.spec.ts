import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuthorizeQueryDto } from './authorize.dto';
import { TokenRequestDto } from './token-request.dto';

describe('OAuth redirect_uri validation', () => {
  describe('AuthorizeQueryDto', () => {
    const basePayload = {
      client_id: 'web-client-static',
      state: 'state-123',
      response_type: 'code',
    };

    it('accepts localhost loopback callbacks', () => {
      const dto = plainToInstance(AuthorizeQueryDto, {
        ...basePayload,
        redirect_uri: 'http://localhost:41468/callback',
      });

      const errors = validateSync(dto);

      expect(errors).toHaveLength(0);
    });

    it('accepts regular https redirect URIs', () => {
      const dto = plainToInstance(AuthorizeQueryDto, {
        ...basePayload,
        redirect_uri: 'https://example.com/callback',
      });

      const errors = validateSync(dto);

      expect(errors).toHaveLength(0);
    });

    it('still rejects malformed redirect URIs', () => {
      const dto = plainToInstance(AuthorizeQueryDto, {
        ...basePayload,
        redirect_uri: 'not-a-url',
      });

      const errors = validateSync(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'redirect_uri',
          }),
        ]),
      );
    });
  });

  describe('TokenRequestDto', () => {
    const basePayload = {
      grant_type: 'authorization_code',
      code: 'code-123',
    };

    it('accepts localhost loopback callbacks', () => {
      const dto = plainToInstance(TokenRequestDto, {
        ...basePayload,
        redirect_uri: 'http://localhost:41468/callback',
      });

      const errors = validateSync(dto);

      expect(errors).toHaveLength(0);
    });

    it('accepts regular https redirect URIs', () => {
      const dto = plainToInstance(TokenRequestDto, {
        ...basePayload,
        redirect_uri: 'https://example.com/callback',
      });

      const errors = validateSync(dto);

      expect(errors).toHaveLength(0);
    });

    it('still rejects malformed redirect URIs', () => {
      const dto = plainToInstance(TokenRequestDto, {
        ...basePayload,
        redirect_uri: 'not-a-url',
      });

      const errors = validateSync(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'redirect_uri',
          }),
        ]),
      );
    });
  });
});
