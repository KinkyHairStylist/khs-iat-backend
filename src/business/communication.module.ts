import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientModule } from './client.module';
import { ClientSchema } from './entities/client.entity';
import { Communication } from './entities/communication.entity';
import { CommunicationController } from './controllers/communication.controller';
import { CommunicationService } from './services/communication.service';
import { EmailModule } from 'src/email/email.module';
import { Business } from './entities/business.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Communication, ClientSchema, Business]),
    ClientModule,
    EmailModule,
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
