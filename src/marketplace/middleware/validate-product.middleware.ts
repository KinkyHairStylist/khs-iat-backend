import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/product.service';

@Injectable()
export class ProductValidationMiddleware implements NestMiddleware {
  constructor(private readonly productService: ProductService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const productData = req.body?.profile || req.body;
    // No profile in request body
    if (!productData) {
      throw new HttpException(
        'Product data is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const validation = await this.productService.validateProductData(
      productData,
      req.files,
    );

    if (!validation.success) {
      throw new HttpException(
        validation.message ?? validation.error ?? 'Product validation failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ✅ Validation passed
    next();
  }
}
