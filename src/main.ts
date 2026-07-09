import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { InputSanitizationMiddleware } from './middleware/input-sanitization.middleware';
import { requireEnv } from './config/env.validation';
import { logger } from './config/logger';

async function bootstrap() {
  // bufferLogs holds startup logs until our central logger is attached, so the
  // very first bootstrap messages are also formatted/structured consistently.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(logger);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Global Prefix
  app.setGlobalPrefix('api');

  // Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS Configuration
  // const allowedOrigins = [
  //   'http://localhost:3000', // dev
  //   'https://sit.kinkyhairstylists.com', // staging
  //   'https://uat.kinkyhairstylists.com', // staging
  //   'https://www.kinkyhairstylists.com', // production
  // ];

  app.enableCors({
    // origin: (origin, callback) => {
    //   if (!origin || allowedOrigins.includes(origin)) {
    //     callback(null, true);
    //   } else {
    //     callback(new Error('Not allowed by CORS'));
    //   }
    // },
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Input sanitization setup
  const sanitizer = new InputSanitizationMiddleware();
  app.use((req, res, next) => sanitizer.use(req, res, next));

  // Session Configuration
  app.use(
    session({
      secret: requireEnv('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 3600000 * 24 * 7, // 1 week
        httpOnly: true,
        sameSite: 'lax',
      },
    }),
  );

  // Swagger Setup
  const config = new DocumentBuilder()
    .setTitle('KHS API')
    .setDescription('API documentation for KHS backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token', // key for Swagger UI
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'KHS API Docs',
  });

  const port = process.env.PORT || 8080;

  await app.listen(port, '0.0.0.0');
  logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
  logger.log(
    `Swagger Docs available at http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}

// Global safety nets: never let an unhandled async error kill the process
// silently — log it with full context first.
process.on('unhandledRejection', (reason) => {
  logger.logError(reason, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.logError(err, 'uncaughtException');
});

bootstrap().catch((err) => {
  logger.logError(err, 'Bootstrap');
  process.exit(1);
});
