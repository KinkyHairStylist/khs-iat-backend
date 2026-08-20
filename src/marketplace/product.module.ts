import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './controllers/product.controller';
import { Product } from './entity/product.entity';
import { ProductService } from './services/product.service';
import { SkuGeneratorService } from './services/sku-generator.service';
import { InventoryModule } from './inventory.module';
import { BusinessCloudinaryModule } from 'src/business/business-cloudinary.module';
import { Business } from 'src/business/entities/business.entity';
import { BusinessFirebaseModule } from 'src/business/business-firebase.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Business]),
    InventoryModule,
    // BusinessCloudinaryModule,
    BusinessFirebaseModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, SkuGeneratorService],
  exports: [ProductService, SkuGeneratorService],
})
export class ProductModule {}
