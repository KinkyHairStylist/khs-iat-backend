import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import express from 'express';
import { AuthMiddleware } from './middleware/anth.middleware';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { InputSanitizationMiddleware } from './middleware/input-sanitization.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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
      secret: process.env.SESSION_SECRET || 'a-very-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 3600000 * 24 * 7, // 1 week
        httpOnly: true,
        sameSite: 'lax',
      },
    }),
  );

  // Global Authentication Middleware
  // Define public routes that should bypass authentication
  const publicRoutes = [
    '/api/docs',
    '/api/salons',
    '/api/get-started',
    '/api/auth/get-started',
    '/api/auth/verify-code',
    '/api/auth/resend-code',
    '/api/auth/signup',
    '/api/auth/login',
    '/api/admin/auth/login',
    '/api/auth/reset-password/start',
    '/api/auth/reset-password/verify',
    '/api/auth/reset-password/finish',
    '/api/auth/business/login',
    '/api/auth/business/register',
    '/api/auth/business/otp/refresh',
    '/api/auth/business/otp/request',
    '/api/auth/business/otp/verify',
    '/api/auth/business/forgot-password',
    '/api/auth/business/verify-password-otp',
    '/api/auth/business/reset-password',
    '/api/webhook/paystack',
    '/api/webhook/paypal',
    '/api/payments/verify',
    '/api/business/create',
    // Add other public routes here
  ];

  // Ensure AuthMiddleware protects routes globally, except for public ones
  app.use((req, res, next) => {
    // Check if the request path starts with any of the public routes
    const isPublic = publicRoutes.some((route) => req.path.startsWith(route));

    if (isPublic) {
      // Skip authentication for public routes
      return next();
    }

    // For all other routes, apply the AuthMiddleware
    try {
      const authMiddleware = app.get(AuthMiddleware);
      authMiddleware.use(req, res, next);
    } catch (error) {
      // Handle cases where middleware fails (e.g., token issues)
      next(error);
    }
  });

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
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger Docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
