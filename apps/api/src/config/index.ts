import { config as loadEnv } from 'dotenv';
import path from 'path';

// Load environment variables from root
loadEnv({ path: path.resolve(__dirname, '../../../../.env'), override: true });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Database
  databaseUrl: process.env.DATABASE_URL!,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '5h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // VAPID (Web Push)
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },

  // Cache TTL (in seconds)
  cache: {
    fgStock: 120, // 2 minutes
    wip: 120, // 2 minutes
    tracking: 120, // 2 minutes
    items: 1800, // 30 minutes
  },

  // NPOF External API
  npofApi: {
    url: process.env.NPOF_API_URL || 'http://127.0.0.1:8008',
    key: process.env.NPOF_API_KEY || '',
  },
};

export default config;
