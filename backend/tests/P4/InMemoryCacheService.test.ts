import { InMemoryCacheService } from '../src/services/InMemoryCacheService';

describe('InMemoryCacheService', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService(100, 60_000);
  });

  afterEach(() => {
    cache.destroy();
  });

  // ── get / set round-trip ──

  it('should store and retrieve a value', async () => {
    await cache.set('key1', { name: 'Alice' });
    const result = await cache.get<{ name: string }>('key1');
    expect(result).toEqual({ name: 'Alice' });
  });

  it('should return null for a missing key', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  // ── Deep clone (rep-exposure safety) ──

  it('should return a clone, not the original reference', async () => {
    const original = { count: 1 };
    await cache.set('key2', original);
    const retrieved = await cache.get<{ count: number }>('key2');
    retrieved!.count = 999;
    const again = await cache.get<{ count: number }>('key2');
    expect(again!.count).toBe(1); // still the original value
  });

  it('should clone on set so external mutation is safe', async () => {
    const obj = { value: 'original' };
    await cache.set('key3', obj);
    obj.value = 'mutated';
    const result = await cache.get<{ value: string }>('key3');
    expect(result!.value).toBe('original');
  });

  // ── TTL expiration ──

  it('should return null for an expired entry', async () => {
    await cache.set('expire_me', { x: 1 }, 0); // 0-second TTL → already expired
    // Wait a small tick
    await new Promise(r => setTimeout(r, 5));
    const result = await cache.get('expire_me');
    expect(result).toBeNull();
  });

  // ── exists ──

  it('should return true for an existing key', async () => {
    await cache.set('exists_key', { ok: true });
    expect(await cache.exists('exists_key')).toBe(true);
  });

  it('should return false for a missing key', async () => {
    expect(await cache.exists('no_key')).toBe(false);
  });

  it('should return false for an expired key', async () => {
    await cache.set('ttl_key', { ok: true }, 0);
    await new Promise(r => setTimeout(r, 5));
    expect(await cache.exists('ttl_key')).toBe(false);
  });

  // ── delete ──

  it('should delete a key', async () => {
    await cache.set('del_key', { x: 1 });
    await cache.delete('del_key');
    expect(await cache.get('del_key')).toBeNull();
  });

  // ── sweepExpired ──

  it('should remove all expired entries', async () => {
    await cache.set('a', { v: 1 }, 0);
    await cache.set('b', { v: 2 }, 0);
    await cache.set('fresh', { v: 3 }, 3600);
    await new Promise(r => setTimeout(r, 5));
    cache.sweepExpired();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('fresh')).toEqual({ v: 3 });
  });

  // ── Capacity eviction ──

  it('should evict the oldest entry when at max capacity', async () => {
    const small = new InMemoryCacheService(3, 60_000);
    await small.set('first', { n: 1 });
    await small.set('second', { n: 2 });
    await small.set('third', { n: 3 });
    // This should evict "first"
    await small.set('fourth', { n: 4 });
    expect(await small.get('first')).toBeNull();
    expect(await small.get('fourth')).toEqual({ n: 4 });
    small.destroy();
  });

  // ── destroy ──

  it('should clear all entries on destroy', async () => {
    await cache.set('a', { v: 1 });
    await cache.set('b', { v: 2 });
    cache.destroy();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });
});
