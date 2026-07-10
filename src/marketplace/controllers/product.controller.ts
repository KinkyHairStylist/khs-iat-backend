import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
  HttpException,
  HttpStatus,
  UseGuards,
  Body,
} from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { CreateProductDto, ProductFiltersDto } from '../dto/marketplace.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Marketplace (Product)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant, Role.Staff)
@Controller('marketplace')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * Create a new product — JSON body with base64 image
   * POST /marketplace/products/create
   */
  @Post('products/create')
  async createProduct(
    @Request() req,
    @Body() body: Record<string, any>,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const { productImageBase64, ...fields } = body;

      if (!productImageBase64) {
        throw new HttpException('Product image is required', HttpStatus.BAD_REQUEST);
      }

      const dto: CreateProductDto = {
        productName: fields.productName,
        category: fields.category,
        lowStockThreshold: Number(fields.lowStockThreshold || 10),
        costPrice: Number(fields.costPrice) as any,
        currency: fields.currency as any,
        description: fields.description,
        ownerId,
        sellingPrice: Number(fields.sellingPrice) as any,
        stockQuantity: Number(fields.stockQuantity) as any,
        sku: fields.sku,
      };

      const result = await this.productService.createProduct(dto, ownerId, productImageBase64);

      return {
        success: true,
        data: result,
        message: 'Product added to inventory',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to add product to inventory',
      };
    }
  }

  /**
   * GET /marketplace/products/product/:id
   */
  @Get('products/product/:id')
  async getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return await this.productService.getProduct(id);
  }

  /**
   * GET /marketplace/products/list
   */
  @Get('products/list')
  async getProductList(@Request() req, @Query() filters: ProductFiltersDto) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.productService.getProductList(filters);

      return {
        success: true,
        data: result,
        message: 'Products List fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to get products list',
      };
    }
  }

  /**
   * GET /marketplace/products/low-stock/list
   */
  @Get('products/low-stock/list')
  async getLowStockProducts(
    @Query('businessId') businessId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return await this.productService.getLowStockProducts({ businessId, page, limit });
  }
}
