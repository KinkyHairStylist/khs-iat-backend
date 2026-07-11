import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class EmailValidationMiddleware implements NestMiddleware {
  private emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  use(req: Request, _res: Response, next: NextFunction) {
    const body = req.body as { email?: string; emailAddress?: string };
    const query = req.query as { email?: string };
    const params = req.params as { email?: string; emailAddress?: string };
    const email =
      body?.email ||
      body?.emailAddress ||
      query?.email ||
      params?.email ||
      params?.emailAddress;

    if (!email) {
      return next();
    }

    if (typeof email !== 'string' || !this.emailRegex.test(email.trim())) {
      throw new BadRequestException('Invalid email format');
    }

    next();
  }
}