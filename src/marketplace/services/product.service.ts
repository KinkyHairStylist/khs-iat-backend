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

  /**
   * Create a new product
   */
  async createProduct(
    createProductDto: CreateProductDto,
    ownerId: string,
    productImageBase64: string,
  ): Promise<Product> {
    console.log('[createProduct] START ownerId=%s', ownerId);

    console.log('[createProduct] 1. looking up business...');
    const business = await this.businessRepo.findOne({
      where: { ownerId },
    });
    if (!business) {
      console.warn('[createProduct] no business found for ownerId=%s', ownerId);
      throw new BadRequestException(`No business found for this user`);
    }
    console.log('[createProduct] 2. business found id=%s name=%s', business.id, business.businessName);

    console.log('[createProduct] 3. checking for duplicate SKU...');
    const existingProduct = await this.productRepository.findOne({
      where: { sku: createProductDto.sku },
    });

    if (existingProduct) {
      console.warn('[createProduct] duplicate SKU=%s', existingProduct.sku);
      throw new BadRequestException(
        `Product with SKU ${existingProduct.sku} already exists`,
      );
    }

    console.log('[createProduct] 4. ensuring inventory exists...');
    const platformInventory =
      await this.inventoryService.ensureInventoryExists();
    console.log('[createProduct] 5. inventory ok, categories=%j', platformInventory.categoriesList);

    if (!platformInventory.categoriesList.includes(createProductDto.category)) {
      console.warn('[createProduct] invalid category=%s', createProductDto.category);
      throw new BadRequestException(
        `Invalid category "${createProductDto.category}". Please use a valid category from the platform inventory.`,
      );
    }

    console.log('[createProduct] 6. generating SKU...');
    const sku = await this.skuGeneratorService.generateSku(
      createProductDto.category,
      business.businessName,
      business.id,
    );
    console.log('[createProduct] 7. generated SKU=%s', sku);

    if (!this.skuGeneratorService.validateSku(sku)) {
      throw new BadRequestException(
        'SKU must be 8-30 characters, alphanumeric with hyphens only',
      );
    }

    const folderPath = `KHS/business/${business.businessName}/products/${createProductDto.productName}`;
    const base64SizeKB = Math.round((productImageBase64?.length ?? 0) / 1024);
    console.log('[createProduct] 8. uploading image to Cloudinary... base64Size=%dKB folder=%s', base64SizeKB, folderPath);

    let productImage: string;
    const uploadStart = Date.now();
    try {
      const { imageUrl } = await this.businessCloudinaryService.uploadImageFromBase64(
        productImageBase64,
        folderPath,
      );
      productImage = imageUrl;
      console.log('[createProduct] 9. Cloudinary upload done in %dms url=%s', Date.now() - uploadStart, imageUrl);
    } catch (error) {
      console.error('[createProduct] Cloudinary upload FAILED after %dms: %s', Date.now() - uploadStart, error.message);
      throw new BadRequestException(
        error.message || 'Failed to create product image',
      );
    }

    console.log('[createProduct] 10. saving product to DB...');
    const product = this.productRepository.create({
      ...createProductDto,
      businessId: business.id,
      sku,
      productImage,
      lowStockThreshold: createProductDto.lowStockThreshold || 10,
    });

    const savedProduct = await this.productRepository.save(product);
    console.log('[createProduct] 11. product saved id=%s', savedProduct.id);

    const productWithBusiness = await this.productRepository.findOne({
      where: { id: savedProduct.id },
      relations: ['business'],
    });

    if (!productWithBusiness) {
      throw new BadRequestException('Failed to fetch product');
    }

    console.log('[createProduct] DONE id=%s', productWithBusiness.id);
    return productWithBusiness;
  }

  /**
   * Get a single product by ID
   */
  async getProduct(productId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return product;
  }

  /**
   * Get product list with filtering and pagination
   */
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

    /* --------- RELATIONS ---------- */
    queryBuilder.leftJoinAndSelect('product.business', 'business');

    /* --------- FILTERS ---------- */
    // if (category) {
    //   queryBuilder.andWhere('product.category = :category', { category });
    // }
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

    /* --------- SORTING (APPLIED ONCE!) ---------- */

    if (typeof sellingPrice === 'number') {
      // If filtering by price → always highest to lowest
      queryBuilder.orderBy('product.sellingPrice', 'DESC');
    } else {
      // Otherwise follow user-defined sortBy and sortOrder
      queryBuilder.orderBy(
        `product.${sortBy}`,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );
    }

    /* --------- PAGINATION ---------- */
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    /* --------- EXECUTE ---------- */
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

  /**
   * Get low stock products
   */
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

    // Filter by business if provided
    if (businessId) {
      queryBuilder.andWhere('product.businessId = :businessId', { businessId });
    }

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Order by stock quantity (lowest first)
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

        // Missing entirely, null, undefined
        if (value === undefined || value === null) return true;

        // If value is a string, check after trimming
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

      // Validate uploaded image
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

        const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 2 MB
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
