import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformInventory } from './entity/inventory.entity';
import { Product } from './entity/product.entity';
import { InventoryController } from './controllers/inventory.controller';
import { InventoryService } from './services/inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, PlatformInventory])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
