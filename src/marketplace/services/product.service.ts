import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entity/product.entity';
import { CreateProductDto, ProductFiltersDto } from '../dto/marketplace.dto';
import { SkuGeneratorService } from './sku-generator.service';
import { ApiResponse } from 'src/business/types/client.types';
import { InventoryService } from './inventory.service';
import { BusinessCloudinaryService } from 'src/business/services/business-cloudinary.service';
import { Business } from 'src/business/entities/business.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    private skuGeneratorService: SkuGeneratorService,
    private inventoryService: InventoryService,
    private readonly businessCloudinaryService: BusinessCloudinaryService,
  ) {}

  async createProduct(
    createProductDto: CreateProductDto,
    ownerId: string,
    productImageBase64: string,
  ): Promise<Product> {
    const business = await this.businessRepo.findOne({
      where: { ownerId },
    });
    if (!business) {
      throw new BadRequestException(`No business found for this user`);
    }

    const existingProduct = await this.productRepository.findOne({
      where: { sku: createProductDto.sku },
    });
    if (existingProduct) {
      throw new BadRequestException(
        `Product with SKU ${existingProduct.sku} already exists`,
      );
    }

    const platformInventory =
      await this.inventoryService.ensureInventoryExists();

    if (!platformInventory.categoriesList.includes(createProductDto.category)) {
      throw new BadRequestException(
        `Invalid category "${createProductDto.category}". Please use a valid category from the platform inventory.`,
      );
    }

    const sku = await this.skuGeneratorService.generateSku(
      createProductDto.category,
      business.businessName,
      business.id,
    );

    if (!this.skuGeneratorService.validateSku(sku)) {
      throw new BadRequestException(
        'SKU must be 8-30 characters, alphanumeric with hyphens only',
      );
    }

    const folderPath = `KHS/business/${business.businessName}/products/${createProductDto.productName}`;

    let productImage: string;
    try {
      const { imageUrl } = await this.businessCloudinaryService.uploadImageFromBase64(
        productImageBase64,
        folderPath,
      );
      productImage = imageUrl;
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to create product image',
      );
    }

    const product = this.productRepository.create({
      ...createProductDto,
      businessId: business.id,
      sku,
      productImage,
      lowStockThreshold: createProductDto.lowStockThreshold || 10,
    });

    const savedProduct = await this.productRepository.save(product);

    const productWithBusiness = await this.productRepository.findOne({
      where: { id: savedProduct.id },
      relations: ['business'],
    });

    if (!productWithBusiness) {
      throw new BadRequestException('Failed to fetch product');
    }

    return productWithBusiness;
  }

  async getProduct(productId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return product;
  }

  async getProductList(filters: ProductFiltersDto) {
    const {
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 6,
      category,
      sellingPrice,
      status,
    } = filters;

    const queryBuilder = this.productRepository.createQueryBuilder('product');

    queryBuilder.leftJoinAndSelect('product.business', 'business');

    if (category && category !== 'all') {
      queryBuilder.andWhere('product.category = :category', { category });
    }

    if (status) {
      queryBuilder.andWhere('product.shippingStatus = :status', { status });
    }

    if (typeof sellingPrice === 'number') {
      queryBuilder.andWhere('product.sellingPrice = :sellingPrice', {
        sellingPrice,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(product.productName ILIKE :searchTerm
        OR product.sku ILIKE :searchTerm
        OR product.description ILIKE :searchTerm
        OR CAST(product.sellingPrice AS TEXT) ILIKE :searchTerm
      )`,
        { searchTerm: `%${search}%` },
      );
    }

    if (typeof sellingPrice === 'number') {
      queryBuilder.orderBy('product.sellingPrice', 'DESC');
    } else {
      queryBuilder.orderBy(
        `product.${sortBy}`,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [products, total] = await queryBuilder.getManyAndCount();

    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit + 1;
    const endIndex = Math.min(page * limit, total);

    return {
      products,
      meta: {
        total,
        page,
        limit,
        totalPages,
        startIndex,
        endIndex,
      },
    };
  }

  async getLowStockProducts(filters: {
    businessId?: string;
    page?: number;
    limit?: number;
  }) {
    const { businessId, page = 1, limit = 50 } = filters;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .where('product.stockQuantity <= product.lowStockThreshold')
      .andWhere('product.isActive = :isActive', { isActive: true });

    if (businessId) {
      queryBuilder.andWhere('product.businessId = :businessId', { businessId });
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    queryBuilder.orderBy('product.stockQuantity', 'ASC');

    const [products, total] = await queryBuilder.getManyAndCount();

    return {
      success: true,
      data: {
        products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      message: 'Low stocks product fetched ',
    };
  }

  async validateProductData(
    productData: CreateProductDto,
    files: any,
  ): Promise<ApiResponse<boolean>> {
    try {
      const requiredFields = [
        'productName',
        'sellingPrice',
        'stockQuantity',
        'costPrice',
        'category',
        'currency',
        'description',
      ];
      const missingFields = requiredFields.filter((field) => {
        const value = productData[field];
        if (value === undefined || value === null) return true;
        if (typeof value === 'string' && value.trim() === '') return true;
        return false;
      });

      if (missingFields.length > 0) {
        return {
          success: false,
          error: 'Product validation failed',
          message: `Missing required fields: ${missingFields.join(', ')}`,
        };
      }

      const uploadedImage = files?.productImage;

      if (!uploadedImage) {
        return {
          success: false,
          error: 'Product validation failed',
          message: `Product must have an image`,
        };
      }

      const productImageExist =
        productData.productImage?.includes('cloudinary');

      if (!productImageExist) {
        if (Array.isArray(uploadedImage)) {
          return {
            success: false,
            error: 'Product validation failed',
            data: false,
            message: `Multiple images not allowed`,
          };
        }

        const mimetype = uploadedImage.mimetype || uploadedImage.type;

        if (
          mimetype?.startsWith('image/svg') ||
          !mimetype?.startsWith('image')
        ) {
          return {
            success: false,
            error: 'Product validation failed',
            data: false,
            message: `Invalid image format. Only .jpg, .png, .jpeg allowed`,
          };
        }

        const MAX_SIZE_BYTES = 10 * 1024 * 1024;
        if (uploadedImage.size > MAX_SIZE_BYTES) {
          return {
            success: false,
            error: 'Product validation failed',
            data: false,
            message: `Image is too large. Maximum allowed size is 10 MB`,
          };
        }
      }

      return {
        success: true,
        data: true,
        message: 'Product validation successful',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: 'Product validation failed',
      };
    }
  }
}
