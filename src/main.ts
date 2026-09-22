// npm audit fix: brace-expansion, fast-uri, fast-xml-parser, typeorm vulnerabilities resolved
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

  // Visible confirmation in every deploy's boot logs of which environment
  // this instance thinks it's running as — Slack alert routing (and other
  // NODE_ENV-gated behavior) silently degrades to non-prod if this isn't
  // exactly "production" in a real prod deploy.
  logger.log(`NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}`);

  // Configure Express to use the 'extended' query parser (qs library)
  // to support bracket-notation array params like services[]=x
  app.getHttpAdapter().getInstance().set('query parser', 'extended');

  // Stripe webhook signature verification needs the exact raw request bytes,
  // which the global JSON parser below would otherwise consume — capture
  // the raw body only for this one path before JSON parsing runs.
  app.use('/api/webhook/stripe', express.raw({ type: 'application/json' }));
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
  // origin: true (reflect any request's Origin back as allowed) combined
  // with credentials: true let ANY website send authenticated, cookie-
  // bearing cross-origin requests here -- flagged as a real security gap
  // (Temidayo, 2026-09-11). Restrict to known KHS frontends instead.
  //
  // Per-environment URLs come from env vars (matching the RAT_/IAT_/UAT_/
  // PROD_FRONTEND_URL pattern already used on the C2C backends) so each
  // deploy only needs to allow its own origin -- falls back to the current
  // known-good domains if a given env var isn't set yet on that server.
  const allowedOrigins = [
    process.env.LOCAL_FRONTEND_URL || 'http://localhost:3000', // dev
    process.env.IAT_FRONTEND_URL || 'https://iat.kinkyhairstylists.com', // integration
    process.env.SIT_FRONTEND_URL || 'https://sit.kinkyhairstylists.com', // staging
    process.env.UAT_FRONTEND_URL || 'https://uat.kinkyhairstylists.com', // staging
    process.env.PROD_FRONTEND_URL || 'https://kinkyhairstylists.com', // production
    'https://www.kinkyhairstylists.com', // production (www variant)
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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

  // Input sanitization setup — skipped for the Stripe webhook path, whose
  // body must stay an untouched raw Buffer for signature verification
  // (see the express.raw() registration above). Webhook payloads are
  // trusted via that cryptographic signature, not sanitized like
  // user-typed input.
  const sanitizer = new InputSanitizationMiddleware();
  app.use((req, res, next) => {
    if (req.path === '/api/webhook/stripe') return next();
    sanitizer.use(req, res, next);
  });

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
