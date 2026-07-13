import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { BusinessOwnerSettingsService } from '../services/business-owner-settings.service';

@Injectable()
export class UserProfileValidationMiddleware implements NestMiddleware {
  constructor(
    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const profileData = req.body?.profile || req.body;

    // No profile in request body
    if (!profileData) {
      throw new HttpException(
        'Profile data is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const validation =
      await this.businessOwnerSettingsService.validateUserProfile(
        profileData,
        req.files,
      );

    if (!validation.success) {
      throw new HttpException(
        validation.message ?? validation.error ?? 'Profile validation failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ✅ Validation passed
    next();
  }
}
