export interface RedisConfig {
  url: string;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  connectTimeoutMs: number;
}

export interface RedisConnectionStatus {
  connected: boolean;
  lastError: string | null;
  reconnectAttempts: number;
}

export interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
  scope?: string;
}
