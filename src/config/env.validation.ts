import dotenv from 'dotenv';

// LOAD ENVIRONMENT VARIABLES
dotenv.config();

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const NODE_ENV = process.env.NODE_ENV;
 

// SLACK
export const SLACK_USERS_TOKEN = process.env.SLACK_USERS_TOKEN;
export const SLACK_TOKEN_KEY = process.env.SLACK_TOKEN_KEY;
export const SLACK_TEST_NOTIFICATION = process.env.SLACK_TEST_NOTIFICATION;


// PROXY DATABASE
export const REDIS_PORT = parseInt(process.env.CLIENT_SAMPLE_REDIS_PORT!, 10);
export const REDIS_HOST = process.env.CLIENT_SAMPLE_REDIS_HOST;
export const REDIS_PASSWORD = process.env.CLIENT_SAMPLE_REDIS_PASSWORD;
// Configurable toggle
export const USE_REDIS = process.env.USE_REDIS;