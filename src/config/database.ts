import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  ssl: false,
  synchronize: true,
  autoLoadEntities: true,
  extra: {
    max: 5,
  },

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
