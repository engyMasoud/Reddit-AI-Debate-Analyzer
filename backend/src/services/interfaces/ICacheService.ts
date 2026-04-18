export interface ICacheService {
  get<T = object>(key: string): Promise<T | null>;
  set(key: string, value: object, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
