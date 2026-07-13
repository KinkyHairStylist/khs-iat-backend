import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientModule } from './client.module';
import { ClientSchema } from './entities/client.entity';
import { CustomMessage } from './entities/custom-message.entity';
import { CustomMessageController } from './controllers/custom-message.controller';
import { CustomMessageService } from './services/custom-message.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomMessage, ClientSchema]), // ✅ Load Reminder repository
    ClientModule,
  ],
  controllers: [CustomMessageController], // ✅ Expose controller
  providers: [CustomMessageService], // ✅ Provide service
  exports: [CustomMessageService], // ✅ Export if other modules need it
})
export class CustomMessageModule {}
