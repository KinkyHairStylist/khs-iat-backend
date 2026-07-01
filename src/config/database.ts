import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { requireEnv } from './env.validation';

dotenv.config();

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: requireEnv('DB_HOST'),
  port: parseInt(requireEnv('DB_PORT'), 10),
  username: requireEnv('DB_USERNAME'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_DATABASE'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false, // Use SSL in production, but not in development

  synchronize: process.env.NODE_ENV === 'development',
  autoLoadEntities: true,
  extra: {
    max: 5,
  },

  //FIXME: add migrarion scripts to package.json and run them in production

  // 🔥 CRITICAL: Connection pool settings
  // poolSize: 10, // Maximum number of connections in the pool

  // // Additional pool configuration
  // extra: {
  //   max: 10, // Maximum pool size (same as poolSize for consistency)
  //   min: 2, // Minimum pool size (keep 2 connections always ready)
  //   idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  //   connectionTimeoutMillis: 2000, // Max wait time for connection (2s)
  //   statement_timeout: 30000, // Timeout for SQL statements (30s)
  //   query_timeout: 30000, // Query timeout (30s)
  // },

  // // Log slow queries (helpful for debugging)
  // logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
  // maxQueryExecutionTime: 5000, // Log queries taking longer than 5s
};
