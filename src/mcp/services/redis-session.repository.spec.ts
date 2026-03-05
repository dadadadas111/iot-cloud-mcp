import { Test, TestingModule } from '@nestjs/testing';
import { RedisSessionRepository } from './redis-session.repository';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisSessionData } from '../dto/mcp-session.dto';

describe('RedisSessionRepository', () => {
  let repository: RedisSessionRepository;
  let mockRedis: Record<string, jest.Mock>;

  const mockSessionData: RedisSessionData = {
    sessionId: 'test-session-id',
    projectApiKey: 'test-project-key',
    userId: 'test-user-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActivity: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      scard: jest.fn(),
      scan: jest.fn(),
      pipeline: jest.fn(),
    };

    // Pipeline mock — exec resolves with array of [error, result] tuples
    const mockPipeline = {
      set: jest.fn().mockReturnThis(),
      sadd: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      srem: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1],
      ]),
      exists: jest.fn().mockReturnThis(),
    };
    mockRedis.pipeline.mockReturnValue(mockPipeline);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisSessionRepository,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    repository = module.get<RedisSessionRepository>(RedisSessionRepository);
  });

  describe('save', () => {
    it('should save session data to Redis with TTL and add to project set', async () => {
      await repository.save(mockSessionData, 3600);

      const pipeline = mockRedis.pipeline();
      expect(pipeline.set).toHaveBeenCalledWith(
        'mcp:session:test-project-key:test-session-id',
        JSON.stringify(mockSessionData),
        'EX',
        3600,
      );
      expect(pipeline.sadd).toHaveBeenCalledWith(
        'mcp:project-sessions:test-project-key',
        'test-session-id',
      );
    });
  });

  describe('get', () => {
    it('should return parsed session data when key exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSessionData));

      const result = await repository.get('test-project-key', 'test-session-id');

      expect(mockRedis.get).toHaveBeenCalledWith('mcp:session:test-project-key:test-session-id');
      expect(result).toEqual(mockSessionData);
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await repository.get('test-project-key', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when JSON is corrupted', async () => {
      mockRedis.get.mockResolvedValue('{invalid json');

      const result = await repository.get('test-project-key', 'test-session-id');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when session existed and was deleted', async () => {
      const pipeline = mockRedis.pipeline();
      pipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
      ]);

      const result = await repository.delete('test-project-key', 'test-session-id');

      expect(result).toBe(true);
    });

    it('should return false when session did not exist', async () => {
      const pipeline = mockRedis.pipeline();
      pipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 0],
      ]);

      const result = await repository.delete('test-project-key', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('updateLastActivity', () => {
    it('should update lastActivity and reset TTL', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSessionData));
      mockRedis.set.mockResolvedValue('OK');

      await repository.updateLastActivity('test-project-key', 'test-session-id', 3600);

      expect(mockRedis.get).toHaveBeenCalledWith('mcp:session:test-project-key:test-session-id');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'mcp:session:test-project-key:test-session-id',
        expect.stringContaining('"lastActivity"'),
        'EX',
        3600,
      );
    });

    it('should do nothing when session does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      await repository.updateLastActivity('test-project-key', 'nonexistent', 3600);

      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('getProjectSessionIds', () => {
    it('should return only active session IDs (filtering expired ones)', async () => {
      mockRedis.smembers.mockResolvedValue(['session-1', 'session-2', 'session-expired']);

      // Pipeline exists: session-1 exists, session-2 exists, session-expired does not
      const mockExistsPipeline = {
        exists: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValueOnce([
            [null, 1],
            [null, 1],
            [null, 0],
          ]) // exists results
          .mockResolvedValueOnce([[null, 1]]), // srem for stale cleanup
      };
      mockRedis.pipeline.mockReturnValue(mockExistsPipeline);

      const result = await repository.getProjectSessionIds('test-project-key');

      expect(mockRedis.smembers).toHaveBeenCalledWith('mcp:project-sessions:test-project-key');
      expect(result).toEqual(['session-1', 'session-2']);
    });

    it('should return empty array when no sessions exist', async () => {
      mockRedis.smembers.mockResolvedValue([]);

      const result = await repository.getProjectSessionIds('test-project-key');

      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should aggregate stats across all projects (filtering expired sessions)', async () => {
      mockRedis.scan.mockResolvedValueOnce([
        '0',
        ['mcp:project-sessions:proj-a', 'mcp:project-sessions:proj-b'],
      ]);

      // getProjectSessionIds for proj-a: 3 members, all exist
      mockRedis.smembers
        .mockResolvedValueOnce(['s1', 's2', 's3'])
        // getProjectSessionIds for proj-b: 2 members, all exist
        .mockResolvedValueOnce(['s4', 's5']);

      // Pipeline exists calls return 1 (exists) for all
      const mockExistsPipeline = {
        exists: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValueOnce([
            [null, 1],
            [null, 1],
            [null, 1],
          ]) // proj-a: all 3 exist
          .mockResolvedValueOnce([
            [null, 1],
            [null, 1],
          ]), // proj-b: all 2 exist
      };
      mockRedis.pipeline.mockReturnValue(mockExistsPipeline);

      const stats = await repository.getStats();

      expect(stats).toEqual({
        totalSessions: 5,
        projectCounts: {
          'proj-a': 3,
          'proj-b': 2,
        },
      });
    });

    it('should return empty stats when no projects exist', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);

      const stats = await repository.getStats();

      expect(stats).toEqual({
        totalSessions: 0,
        projectCounts: {},
      });
    });
  });
});
