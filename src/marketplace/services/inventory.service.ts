import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entity/product.entity';
import { PlatformInventory } from '../entity/inventory.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(PlatformInventory)
    private platformInventoryRepository: Repository<PlatformInventory>,
  ) {}

  /**
   * Get platform-wide inventory summary
   */
  async getPlatformInventorySummary() {
    // Get aggregated data from products
    const summary = await this.productRepository
      .createQueryBuilder('product')
      .select('COUNT(product.id)', 'totalProducts')
      .addSelect(
        'SUM(product.costPrice * product.stockQuantity)',
        'inventoryValue',
      )
      .addSelect(
        'SUM(CASE WHEN product.stockQuantity <= product.lowStockThreshold THEN 1 ELSE 0 END)',
        'lowStockItemsCount',
      )
      .addSelect('SUM(product.stockQuantity)', 'totalStock')
      .where('product.isActive = :isActive', { isActive: true })
      .getRawOne();

    // Calculate total revenue from all sales
    // Note: You'll need a sales/orders table to track actual revenue
    // For now, this is a placeholder calculation
    const totalRevenue = await this.calculateTotalRevenue();

    return {
      totalProducts: parseInt(summary.totalProducts) || 0,
      inventoryValue: parseFloat(summary.inventoryValue) || 0,
      lowStockItemsCount: parseInt(summary.lowStockItemsCount) || 0,
      totalRevenue: totalRevenue,
      totalStock: parseInt(summary.totalStock) || 0,
    };
  }

  /**
   * Get inventory summary for a specific business
   */
  async getBusinessInventorySummary(ownerId: string) {
    const summary = await this.productRepository
      .createQueryBuilder('product')
      .select('COUNT(product.id)', 'totalProducts')
      .addSelect(
        'SUM(product.costPrice * product.stockQuantity)',
        'inventoryValue',
      )
      .addSelect(
        'SUM(CASE WHEN product.stockQuantity <= product.lowStockThreshold THEN 1 ELSE 0 END)',
        'lowStockItemsCount',
      )
      .addSelect('SUM(product.stockQuantity)', 'totalStock')
      .where('product.ownerId = :ownerId', { ownerId })
      .andWhere('product.isActive = :isActive', { isActive: true })
      .getRawOne();

    // Calculate total revenue for this business
    const totalRevenue = await this.calculateBusinessRevenue(ownerId);

    return {
      ownerId,
      totalProducts: parseInt(summary.totalProducts) || 0,
      inventoryValue: parseFloat(summary.inventoryValue) || 0,
      lowStockItemsCount: parseInt(summary.lowStockItemsCount) || 0,
      totalRevenue: totalRevenue,
      totalStock: parseInt(summary.totalStock) || 0,
    };
  }

  /**
   * Get low stock products (platform-wide)
   */
  async getLowStockProducts(limit: number = 50) {
    return await this.productRepository
      .createQueryBuilder('product')
      .where('product.stockQuantity <= product.lowStockThreshold')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .orderBy('product.stockQuantity', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get low stock products for a specific business
   */
  async getBusinessLowStockProducts(ownerId: string) {
    return await this.productRepository
      .createQueryBuilder('product')
      .where('product.ownerId = :ownerId', { ownerId })
      .andWhere('product.stockQuantity <= product.lowStockThreshold')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .orderBy('product.stockQuantity', 'ASC')
      .getMany();
  }

  /**
   * Update platform inventory record
   * This should be called periodically (e.g., via cron job) or after significant changes
   */
  async updatePlatformInventory() {
    const summary = await this.getPlatformInventorySummary();

    // Get category breakdown
    const categoryBreakdown = await this.getCategoryBreakdown();

    // Count unique businesses with active products
    const businessCount = await this.productRepository
      .createQueryBuilder('product')
      .select('COUNT(DISTINCT product.businessId)', 'count')
      .where('product.isActive = :isActive', { isActive: true })
      .getRawOne();

    // Count out of stock products
    const outOfStockCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.stockQuantity = 0')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .getCount();

    // Get or create platform inventory record
    let platformInventory = await this.platformInventoryRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!platformInventory) {
      platformInventory = this.platformInventoryRepository.create();
    }

    // Update values
    platformInventory.totalRevenue = summary.totalRevenue;
    platformInventory.totalInventoryValue = summary.inventoryValue;
    platformInventory.totalStock = summary.totalStock;
    platformInventory.lowStockItemsCount = summary.lowStockItemsCount;
    platformInventory.totalProducts = summary.totalProducts;
    platformInventory.totalBusinesses = parseInt(businessCount.count) || 0;
    platformInventory.activeProducts = summary.totalProducts;
    platformInventory.outOfStockProducts = outOfStockCount;
    platformInventory.categoryBreakdown = categoryBreakdown;

    return await this.platformInventoryRepository.save(platformInventory);
  }

  /**
   * Get category breakdown
   */
  private async getCategoryBreakdown() {
    const breakdown = await this.productRepository
      .createQueryBuilder('product')
      .select('product.category', 'category')
      .addSelect('COUNT(product.id)', 'totalProducts')
      .addSelect('SUM(product.stockQuantity)', 'totalStock')
      .addSelect('SUM(product.costPrice * product.stockQuantity)', 'totalValue')
      .where('product.isActive = :isActive', { isActive: true })
      .groupBy('product.category')
      .getRawMany();

    return breakdown.map((item) => ({
      category: item.category,
      totalProducts: parseInt(item.totalProducts),
      totalStock: parseInt(item.totalStock) || 0,
      totalValue: parseFloat(item.totalValue) || 0,
    }));
  }

  /**
   * Calculate total revenue across platform
   * NOTE: This requires a sales/orders table to track actual revenue
   * This is a placeholder that you'll need to implement based on your sales tracking
   */
  private async calculateTotalRevenue(): Promise<number> {
    // TODO: Implement this based on your sales/orders table
    // Example:
    // return await this.salesRepository
    //   .createQueryBuilder('sale')
    //   .select('SUM(sale.totalAmount)', 'total')
    //   .getRawOne()
    //   .then(result => parseFloat(result.total) || 0);

    return 0; // Placeholder
  }

  /**
   * Calculate revenue for a specific business
   * NOTE: This requires a sales/orders table to track actual revenue
   */
  private async calculateBusinessRevenue(businessId: string): Promise<number> {
    // TODO: Implement this based on your sales/orders table
    // Example:
    // return await this.salesRepository
    //   .createQueryBuilder('sale')
    //   .innerJoin('sale.product', 'product')
    //   .select('SUM(sale.totalAmount)', 'total')
    //   .where('product.businessId = :businessId', { businessId })
    //   .getRawOne()
    //   .then(result => parseFloat(result.total) || 0);

    return 0; // Placeholder
  }

  /**
   * Get inventory value by category
   */
  async getInventoryValueByCategory() {
    return await this.productRepository
      .createQueryBuilder('product')
      .select('product.category', 'category')
      .addSelect(
        'SUM(product.costPrice * product.stockQuantity)',
        'inventoryValue',
      )
      .addSelect('COUNT(product.id)', 'productCount')
      .where('product.isActive = :isActive', { isActive: true })
      .groupBy('product.category')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          category: r.category,
          inventoryValue: parseFloat(r.inventoryValue) || 0,
          productCount: parseInt(r.productCount),
        })),
      );
  }

  /**
   * Get top businesses by inventory value
   */
  async getTopBusinessesByInventoryValue(limit: number = 10) {
    return await this.productRepository
      .createQueryBuilder('product')
      .select('product.businessId', 'businessId')
      .addSelect(
        'SUM(product.costPrice * product.stockQuantity)',
        'inventoryValue',
      )
      .addSelect('COUNT(product.id)', 'productCount')
      .addSelect('SUM(product.stockQuantity)', 'totalStock')
      .where('product.isActive = :isActive', { isActive: true })
      .groupBy('product.businessId')
      .orderBy('inventoryValue', 'DESC')
      .limit(limit)
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          businessId: r.businessId,
          inventoryValue: parseFloat(r.inventoryValue) || 0,
          productCount: parseInt(r.productCount),
          totalStock: parseInt(r.totalStock),
        })),
      );
  }

  /**
   * Get products that need restocking soon
   */
  async getProductsNeedingRestock(threshold: number = 20) {
    return await this.productRepository
      .createQueryBuilder('product')
      .where('product.stockQuantity <= :threshold', { threshold })
      .andWhere('product.stockQuantity > 0')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .orderBy('product.stockQuantity', 'ASC')
      .getMany();
  }

  async addCategory(category: string) {
    // sanitize input
    const sanitized = category.trim().toLowerCase().replace(/\s+/g, '_');

    if (!sanitized || sanitized.length === 0) {
      throw new BadRequestException('Category name cannot be empty');
    }

    let platformInventory = await this.platformInventoryRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    // Create record if none exists
    if (!platformInventory) {
      platformInventory = this.platformInventoryRepository.create({
        categoriesList: [],
      });
    }

    // Prevent duplicates
    if (platformInventory.categoriesList.includes(sanitized)) {
      throw new BadRequestException(`Category "${sanitized}" already exists`);
    }

    // Add category
    platformInventory.categoriesList.push(sanitized);

    await this.platformInventoryRepository.save(platformInventory);

    return {
      message: 'Category added successfully',
      category: sanitized,
    };
  }

  async getCategoriesList() {
    const platformInventory = await this.ensureInventoryExists();

    const productCounts = await this.productRepository
      .createQueryBuilder('product')
      .select('product.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('product.isActive = :active', { active: true })
      .groupBy('product.category')
      .getRawMany();

    const categories = platformInventory.categoriesList.map((catValue) => {
      const found = productCounts.find((p) => p.category === catValue);
      return {
        value: catValue,
        label: this.formatCategoryLabel(catValue),
        count: found ? Number(found.count) : 0,
      };
    });

    const totalProducts = productCounts.reduce(
      (sum, p) => sum + Number(p.count),
      0,
    );

    return {
      categories: [
        {
          value: 'all',
          label: 'All Products',
          count: totalProducts,
        },
        ...categories,
      ],
    };
  }

  /**
   * Ensures a PlatformInventory record exists.
   * If none exists, it will create one with the default categories.
   */
  async ensureInventoryExists(): Promise<PlatformInventory> {
    let platformInventory = await this.platformInventoryRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!platformInventory) {
      // Create new inventory record with default categories
      platformInventory = this.platformInventoryRepository.create();
      await this.platformInventoryRepository.save(platformInventory);
    }

    return platformInventory;
  }

  /**
   * Update the platform's categories list
   */
  async updateCategoriesList(categories: string[]) {
    let platformInventory = await this.ensureInventoryExists();

    // sanitize only
    const sanitized = categories
      .map((cat) => cat.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter((cat) => cat.length > 0);

    // NO ENUM VALIDATION — allow new categories
    platformInventory.categoriesList = sanitized;

    await this.platformInventoryRepository.save(platformInventory);

    return {
      message: 'Categories list updated successfully',
      categories: platformInventory.categoriesList,
    };
  }
  /**
   * Helper method to format category labels
   */
  private formatCategoryLabel(category: string): string {
    if (category === 'tools_equipment') {
      return 'Tools & Equipment';
    }
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
