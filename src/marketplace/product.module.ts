import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './controllers/product.controller';
import { Product } from './entity/product.entity';
import { ProductService } from './services/product.service';
import { SkuGeneratorService } from './services/sku-generator.service';
import { FormidableMiddleware } from 'src/business/middlewares/formidable.middleware';
import { ProductValidationMiddleware } from './middleware/validate-product.middleware';
import { InventoryModule } from './inventory.module';
import { BusinessCloudinaryModule } from 'src/business/business-cloudinary.module';
import { Business } from 'src/business/entities/business.entity';
import { UserModule } from 'src/user/modules/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Business]),
    InventoryModule,
    BusinessCloudinaryModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, SkuGeneratorService],
  exports: [ProductService, SkuGeneratorService],
})
export class ProductModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FormidableMiddleware).forRoutes({
      path: 'marketplace/products/create',
      method: RequestMethod.POST,
    });

    consumer.apply(ProductValidationMiddleware).forRoutes(
      // POST /products
      { path: 'marketplace/products/create', method: RequestMethod.POST },
    );
  }
}
