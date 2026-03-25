/**
 * TDD Tests for Issue 1: Hardcoded Default JWT Secret
 *
 * These tests verify that JWT_SECRET is properly validated:
 * - In development: Falls back to default (OK for local testing)
 * - In production: Must be explicitly set (crash otherwise)
 *
 * TDD Workflow:
 * 1. RED: These tests will fail initially (current code has no validation)
 * 2. GREEN: Fix env.ts to make tests pass
 * 3. REFACTOR: Clean up as needed
 */

describe('Environment Configuration - JWT_SECRET Validation (Issue 1)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment before each test
    originalEnv = { ...process.env };

    // Clear relevant env vars to test clean state
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;

    // Clear require cache so env.ts is re-evaluated with new env
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;

    // Clear require cache again
    jest.resetModules();
  });

  describe('Development Mode (NODE_ENV=development)', () => {
    it('should use default JWT_SECRET when not set', () => {
      // Arrange: Set development mode, no JWT_SECRET
      process.env.NODE_ENV = 'development';

      // Act: Import env module (uses current process.env)
      const { env } = require('../src/config/env');

      // Assert: Should fall back to default
      expect(env.JWT_SECRET).toBe('dev-secret-change-in-production');
    });

    it('should use provided JWT_SECRET when set', () => {
      // Arrange: Set development mode with custom JWT_SECRET
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'my-dev-secret';

      // Act: Import env module
      const { env } = require('../src/config/env');

      // Assert: Should use the provided secret
      expect(env.JWT_SECRET).toBe('my-dev-secret');
    });

    it('should not throw error in development mode', () => {
      // Arrange: Set development mode, no JWT_SECRET
      process.env.NODE_ENV = 'development';

      // Act & Assert: Should not throw when importing
      expect(() => {
        require('../src/config/env');
      }).not.toThrow();
    });
  });

  describe('Production Mode (NODE_ENV=production)', () => {
    it('should THROW when JWT_SECRET is not set', () => {
      // Arrange: Set production mode, no JWT_SECRET
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      // Act & Assert: Should throw with descriptive error message
      expect(() => {
        require('../src/config/env');
      }).toThrow(/JWT_SECRET must be set in production/);
    });

    it('should accept valid JWT_SECRET when set', () => {
      // Arrange: Set production mode with JWT_SECRET
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'secure-production-secret-12345';

      // Act: Import env module
      const { env } = require('../src/config/env');

      // Assert: Should use the secret
      expect(env.JWT_SECRET).toBe('secure-production-secret-12345');
    });

    it('should reject empty string JWT_SECRET', () => {
      // Arrange: Set production mode with empty JWT_SECRET
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = '';

      // Act & Assert: Empty string should be treated as not set
      expect(() => {
        require('../src/config/env');
      }).toThrow(/JWT_SECRET must be set in production/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle NODE_ENV=test like development', () => {
      // Arrange: Test mode should behave like development
      process.env.NODE_ENV = 'test';
      delete process.env.JWT_SECRET;

      // Act: Import env module
      const { env } = require('../src/config/env');

      // Assert: Should use default, not throw
      expect(env.JWT_SECRET).toBe('dev-secret-change-in-production');
    });

    it('should accept JWT_SECRET in test mode', () => {
      // Arrange: Test mode with JWT_SECRET set
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'test-secret';

      // Act: Import env module
      const { env } = require('../src/config/env');

      // Assert: Should use provided secret
      expect(env.JWT_SECRET).toBe('test-secret');
    });

    it('should accept NODE_ENV=production-like as production', () => {
      // Arrange: Various production-like values
      const productionVariants = ['production', 'Production', 'PRODUCTION'];

      productionVariants.forEach((variant) => {
        // Reset env for each variant
        delete process.env.JWT_SECRET;
        process.env.NODE_ENV = variant;
        jest.resetModules();

        // Act & Assert: All should throw without JWT_SECRET
        expect(() => {
          require('../src/config/env');
        }).toThrow(/JWT_SECRET must be set in production/);
      });
    });
  });

  describe('Security Validation', () => {
    it('should reject JWT_SECRET shorter than 16 characters', () => {
      // Arrange: Set production with short secret
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'tooshort';

      // Act & Assert: Should throw with security warning
      expect(() => {
        require('../src/config/env');
      }).toThrow(/JWT_SECRET must be at least 16 characters/);
    });

    it('should reject default value in production', () => {
      // Arrange: Set production with default value (common mistake)
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'dev-secret-change-in-production';

      // Act & Assert: Should throw because default is insecure
      expect(() => {
        require('../src/config/env');
      }).toThrow(/JWT_SECRET cannot be the default value in production/);
    });

    it('should accept strong JWT_SECRET in production', () => {
      // Arrange: Set production with strong secret
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32); // 32 characters

      // Act: Import env module
      const { env } = require('../src/config/env');

      // Assert: Should not throw and should use the secret
      expect(env.JWT_SECRET).toBe('a'.repeat(32));
    });
  });
});
