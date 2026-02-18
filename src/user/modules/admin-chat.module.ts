import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserStatus } from '../../all_user_entities/user-status.entity';
import { ChatMessage } from '../../all_user_entities/chat-message.entity';
import { AdminChatGateway } from '../admin-chat.gateway';
import { AdminChatService } from '../services/admin-chat.service';
import { CloudinaryService } from '../../helpers/cloudinary-massage-image-helper';
import { AdminChatController } from '../controllers/admin-chat.controller';
import { Appointment } from '../../business/entities/appointment.entity';
import { Business } from '../../business/entities/business.entity';
import { User } from '../../all_user_entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, UserStatus, Appointment, Business, User])],
  providers: [AdminChatService, AdminChatGateway, CloudinaryService],
  controllers: [AdminChatController],
})
export class AdminChatModule {}
