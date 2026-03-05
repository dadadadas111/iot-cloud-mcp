import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionManagerService } from './session-manager.service';
import { RedisSessionRepository } from './redis-session.repository';
import { McpServerFactory } from './mcp-server.factory';
import { RedisSessionData } from '../dto/mcp-session.dto';

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

describe('SessionManagerService', () => {
  let service: SessionManagerService;
  let mockRedisRepo: Record<string, jest.Mock>;
  let mockServerFactory: Record<string, jest.Mock>;
  let mockConfigService: Record<string, jest.Mock>;
  let mockServer: any;

  beforeEach(async () => {
    mockServer = { name: 'test-server' };

    mockRedisRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delete: jest.fn(),
      updateLastActivity: jest.fn().mockResolvedValue(undefined),
      getProjectSessionIds: jest.fn(),
      getStats: jest.fn(),
    };

    mockServerFactory = {
      createServer: jest.fn().mockReturnValue(mockServer),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'MCP_SESSION_TTL') return 3600;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionManagerService,
        { provide: RedisSessionRepository, useValue: mockRedisRepo },
        { provide: McpServerFactory, useValue: mockServerFactory },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SessionManagerService>(SessionManagerService);
  });

  describe('createSession', () => {
    it('should save session metadata to Redis and cache server locally', async () => {
      const sessionId = await service.createSession('proj-key', 'user-1', mockServer);

      expect(sessionId).toBe('mock-uuid-1234');
      expect(mockRedisRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'mock-uuid-1234',
          projectApiKey: 'proj-key',
          userId: 'user-1',
        }),
        3600,
      );
    });

    it('should store ISO 8601 timestamps in Redis', async () => {
      await service.createSession('proj-key', 'user-1', mockServer);

      const savedData = mockRedisRepo.save.mock.calls[0][0] as RedisSessionData;
      // Verify timestamps are valid ISO strings
      expect(() => new Date(savedData.createdAt)).not.toThrow();
      expect(() => new Date(savedData.lastActivity)).not.toThrow();
      expect(savedData.createdAt).toBe(savedData.lastActivity);
    });
  });

  describe('getSession', () => {
    const storedSession: RedisSessionData = {
      sessionId: 'session-1',
      projectApiKey: 'proj-key',
      userId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastActivity: '2026-01-01T00:00:00.000Z',
    };

    it('should return full McpSession when session exists in Redis', async () => {
      mockRedisRepo.get.mockResolvedValue(storedSession);

      // First create the session so the server is cached
      await service.createSession('proj-key', 'user-1', mockServer);
      // Reset mocks after create
      mockRedisRepo.get.mockResolvedValue({ ...storedSession, sessionId: 'mock-uuid-1234' });

      const session = await service.getSession('proj-key', 'mock-uuid-1234');

      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('mock-uuid-1234');
      expect(session!.server).toBe(mockServer);
      expect(session!.userId).toBe('user-1');
      expect(session!.createdAt).toBeInstanceOf(Date);
      expect(session!.lastActivity).toBeInstanceOf(Date);
    });

    it('should return null when session does not exist in Redis', async () => {
      mockRedisRepo.get.mockResolvedValue(null);

      const session = await service.getSession('proj-key', 'nonexistent');

      expect(session).toBeNull();
    });

    it('should update lastActivity in Redis', async () => {
      mockRedisRepo.get.mockResolvedValue(storedSession);

      await service.getSession('proj-key', 'session-1');

      expect(mockRedisRepo.updateLastActivity).toHaveBeenCalledWith('proj-key', 'session-1', 3600);
    });

    it('should recreate McpServer via factory when not in local cache', async () => {
      mockRedisRepo.get.mockResolvedValue(storedSession);

      const session = await service.getSession('proj-key', 'session-1');

      expect(mockServerFactory.createServer).toHaveBeenCalledWith('proj-key');
      expect(session!.server).toBe(mockServer);
    });
  });

  describe('deleteSession', () => {
    it('should delete from Redis and return true when session existed', async () => {
      mockRedisRepo.delete.mockResolvedValue(true);

      const result = await service.deleteSession('proj-key', 'session-1');

      expect(result).toBe(true);
      expect(mockRedisRepo.delete).toHaveBeenCalledWith('proj-key', 'session-1');
    });

    it('should return false when session did not exist', async () => {
      mockRedisRepo.delete.mockResolvedValue(false);

      const result = await service.deleteSession('proj-key', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('cleanupStale', () => {
    it('should return 0 (Redis TTL handles expiration)', async () => {
      const result = await service.cleanupStale();

      expect(result).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should delegate to RedisSessionRepository', async () => {
      const expectedStats = {
        totalSessions: 5,
        projectCounts: { 'proj-a': 3, 'proj-b': 2 },
      };
      mockRedisRepo.getStats.mockResolvedValue(expectedStats);

      const stats = await service.getStats();

      expect(stats).toEqual(expectedStats);
      expect(mockRedisRepo.getStats).toHaveBeenCalled();
    });
  });
});
