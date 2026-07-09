import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  ValidationPipe,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
  Request,
  HttpException,
  HttpStatus,
  UseGuards,
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
@Roles(Role.Business, Role.SuperAdmin)
@Controller('marketplace')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * Create a new product
   * POST /products
   */
  @Post('products/create')
  async createProduct(@Request() req) {
    const { body, files } = req;
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const bodyproductImage = files.productImage;

      const dto: CreateProductDto = {
        productName: body.productName,
        category: body.category,
        lowStockThreshold: Number(body.lowStockThreshold || 10),
        costPrice: body.costPrice,
        currency: body.currency,
        description: body.description,
        ownerId,
        sellingPrice: body.sellingPrice,
        stockQuantity: body.stockQuantity,
        sku: body.sku,
      };

      const result = await this.productService.createProduct(
        dto,
        ownerId,
        bodyproductImage,
      );

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
   * Get a single product
   * GET /products/:id
   */
  @Get('products/product/:id')
  async getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return await this.productService.getProduct(id);
  }

  /**
   * Get product list with filters
   * GET /products?businessId=xxx&category=brow&page=1&limit=20&search=xxx
   */
  @Get('products/list')
  async getProductList(@Request() req, @Query() filters: ProductFiltersDto) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
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
   * Get low stock products
   * GET /products/low-stock/list?businessId=xxx&page=1&limit=50
   */
  @Get('products/low-stock/list')
  async getLowStockProducts(
    @Query('businessId') businessId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return await this.productService.getLowStockProducts({
      businessId,
      page,
      limit,
    });
  }
}
