import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientModule } from './client.module';
import { ClientSchema } from './entities/client.entity';
import { Communication } from './entities/communication.entity';
import { CommunicationController } from './controllers/communication.controller';
import { CommunicationService } from './services/communication.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Communication, ClientSchema]), // ✅ Load Reminder repository
    ClientModule,
  ],
  controllers: [CommunicationController], // ✅ Expose controller
  providers: [CommunicationService], // ✅ Provide service
  exports: [CommunicationService], // ✅ Export if other modules need it
})
export class CommunicationModule {}
