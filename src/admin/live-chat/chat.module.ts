import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserStatus } from 'src/all_user_entities/user-status.entity';
import { ChatMessage } from 'src/all_user_entities/chat-message.entity';
import { User } from 'src/all_user_entities/user.entity';
import { Ticket } from 'src/all_user_entities/ticket.entity';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { CloudinaryService } from 'src/helpers/cloudinary-massage-image-helper';
import { ChatController } from './chat.controller';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, UserStatus, Appointment, Business, User, Ticket])],
  providers: [ChatService, ChatGateway, CloudinaryService],
  controllers: [ChatController],
})
export class ChatModule {}
