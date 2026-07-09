import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entity/product.entity';

@Injectable()
export class SkuGeneratorService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * Generate a unique SKU based on category, business name, and count
   * Format: CATEGORY-BUSINESSCODE-COUNT
   * Example: BROW-BEAUTYSALON-001
   */
  async generateSku(
    category: string,
    businessName: string,
    businessId: string,
  ): Promise<string> {
    // Format category (take first 4-6 chars or use abbreviation)
    const categoryCode = this.formatCategoryCode(category);

    // Format business name (take first 3-5 letters, uppercase)
    const businessCode = this.formatBusinessCode(businessName);

    // Get product count for this business to generate sequential number
    const productCount = await this.productRepository.count({
      where: { businessId },
    });

    // Generate sequential number with padding (001, 002, etc.)
    const sequentialNumber = String(productCount + 1).padStart(3, '0');

    // Combine to create SKU
    let sku = `${categoryCode}-${businessCode}-${sequentialNumber}`;

    // Ensure uniqueness - if SKU exists, add suffix
    sku = await this.ensureUniqueSku(sku);

    return sku;
  }

  /**
   * Format category into a short code
   */
  private formatCategoryCode(category: string): string {
    const categoryMap: { [key: string]: string } = {
      brow: 'BROW',
      lash: 'LASH',
      tools_equipment: 'TOOL',
      hair_care: 'HAIR',
      styling_products: 'STYL',
      color_treatment: 'COLR',
      nail_care: 'NAIL',
      skin_care: 'SKIN',
    };

    return categoryMap[category] || category.substring(0, 4).toUpperCase();
  }

  /**
   * Format business name into a short code
   */
  private formatBusinessCode(businessName: string): string {
    // Remove special characters and spaces
    const cleaned = businessName.replace(/[^a-zA-Z0-9]/g, '');

    // Take first 5 characters, uppercase
    return cleaned.substring(0, 5).toUpperCase() || '店';
  }

  /**
   * Ensure the SKU is unique, add suffix if needed
   */
  private async ensureUniqueSku(baseSku: string): Promise<string> {
    let sku = baseSku;
    let suffix = 0;

    while (await this.skuExists(sku)) {
      suffix++;
      sku = `${baseSku}-${suffix}`;
    }

    return sku;
  }

  /**
   * Check if SKU already exists
   */
  private async skuExists(sku: string): Promise<boolean> {
    const count = await this.productRepository.count({ where: { sku } });
    return count > 0;
  }

  /**
   * Validate SKU format
   */
  validateSku(sku: string): boolean {
    // SKU should be alphanumeric with hyphens, 8-30 characters
    const skuRegex = /^[A-Z0-9-]{8,30}$/;
    return skuRegex.test(sku);
  }
}
