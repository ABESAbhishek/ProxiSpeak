import type { Server } from 'socket.io';

export type RedisMode = 'disabled' | 'connected' | 'unavailable';
let closeRedis: (() => Promise<void>) | undefined;

/** Enables Socket.IO's Redis adapter only when REDIS_URL and its dependencies are installed. */
export async function configureRedisAdapter(io: Server): Promise<RedisMode> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return 'disabled';
  try {
    // Deliberate runtime loading allows local single-instance development without Redis packages.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('redis') as { createClient: (options: { url: string }) => any };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAdapter } = require('@socket.io/redis-adapter') as { createAdapter: (pub: any, sub: any) => any };
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (error: Error) => console.error(`[Redis] publisher error: ${error.message}`));
    subClient.on('error', (error: Error) => console.error(`[Redis] subscriber error: ${error.message}`));
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    closeRedis = async () => { await Promise.allSettled([pubClient.quit(), subClient.quit()]); };
    console.log('[Redis] Socket.IO adapter connected; cross-instance events are enabled.');
    return 'connected';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`[Redis] Adapter unavailable; running single-instance only: ${message}`);
    return 'unavailable';
  }
}

export async function closeRedisAdapter() { await closeRedis?.(); }
