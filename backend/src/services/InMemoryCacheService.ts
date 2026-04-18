import { ICacheService } from './interfaces/ICacheService';

interface CacheEntry {
  value: object;
  expiresAt: number;
}

/**
 * Map-based in-memory cache with TTL. Replaces Redis for P4 (10-user) scale.
 * MIT 6.005 ADT with checkRep().
 */
export class InMemoryCacheService implements ICacheService {
  private store: Map<string, CacheEntry>;
  private readonly maxEntries: number;
  private readonly sweepIntervalMs: number;
  private sweepIntervalId: NodeJS.Timeout | null;

  constructor(maxEntries = 10_000, sweepIntervalMs = 60_000) {
    this.store = new Map();
    this.maxEntries = maxEntries;
    this.sweepIntervalMs = sweepIntervalMs;
    this.sweepIntervalId = setInterval(() => this.sweepExpired(), this.sweepIntervalMs);
    this.checkRep();
  }

  async get<T = object>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return structuredClone(entry.value) as T;
  }

  async set(key: string, value: object, ttlSeconds = 3600): Promise<void> {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.sweepExpired();
      if (this.store.size >= this.maxEntries) {
        // Evict oldest entry
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) {
          this.store.delete(oldestKey);
        }
      }
    }
    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    this.checkRep();
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.sweepIntervalId) {
      clearInterval(this.sweepIntervalId);
      this.sweepIntervalId = null;
    }
    this.store.clear();
  }

  private checkRep(): void {
    if (process.env.NODE_ENV === 'production') return;
    console.assert(this.maxEntries > 0, 'maxEntries must be positive');
    console.assert(this.sweepIntervalMs > 0, 'sweepIntervalMs must be positive');
    console.assert(this.store.size <= this.maxEntries,
      `store size ${this.store.size} exceeds cap ${this.maxEntries}`);
    for (const [key, entry] of this.store) {
      console.assert(key.length > 0, 'cache key must be non-empty');
      console.assert(entry.value !== null && entry.value !== undefined,
        `null/undefined value for key "${key}"`);
      console.assert(entry.expiresAt > 0,
        `expiresAt must be positive for key "${key}"`);
    }
  }
}
