import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { BusinessSettingsService } from '../services/business-settings.service';

@Injectable()
export class BusinessImageValidationMiddleware implements NestMiddleware {
  constructor(
    private readonly businessSettingsService: BusinessSettingsService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const businessData = req.body?.profile || req.body;

    // No profile in request body
    if (!businessData) {
      throw new HttpException(
        'Business data is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const validation =
      await this.businessSettingsService.validateBusinesImageUpload(
        businessData,
        req.files,
      );

    if (!validation.success) {
      throw new HttpException(
        validation.message ??
          validation.error ??
          'Business Image validation failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ✅ Validation passed
    next();
  }
}
