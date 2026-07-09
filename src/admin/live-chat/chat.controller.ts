import { Controller, Post, Body, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { CloudinaryService } from 'src/helpers/cloudinary-massage-image-helper';
import { User } from 'src/all_user_entities/user.entity';
import { RolesGuard } from 'src/middleware/roles.guard';
import { ChatMessageResponseDto, SendMessageDto } from './send-message.dto';
import { GetUser } from 'src/middleware/get-user.decorator';

@ApiTags('Admin and Client Chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin, Role.Client, Role.Business)
@Controller('users/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Post('send')
  async sendMessage(
    @GetUser() user: User,
    @Body() data: SendMessageDto,
  ) {
    let imageUrl: string | undefined;

    if (data.imageBase64) {
      imageUrl = await this.cloudinary.uploadBase64(data.imageBase64);
    }

    const saved = await this.chatService.storeMessage({
      sender: user,
      receiver: { id: data.receiverId } as User,
      message: data.message,
      imageUrl,
    });

    await this.chatGateway.sendMessageToReceiver(saved);

    return saved;
  }

  @Get('messages')
  async getMessages(
    @GetUser() user: User,
    @Query('otherUserId') otherUserId: string,
  ) {
    return this.chatService.getMessagesBetween(user.id, otherUserId);
  }

  @Get('list')
  async getChatList(@GetUser() user: User) {
    return this.chatService.getChatList(user.id);
  }

  // GET /chat/messages/:otherUserId
  @Get('messages/:otherUserId')
  async getMessagesBetweenUsers(
    @GetUser() user: User,           // Authenticated user
    @Param('otherUserId') otherUserId: string  // Second user passed via URL
  ): Promise<ChatMessageResponseDto[]> {
    return this.chatService.getChatMessageWithUserInfo(user.id, otherUserId);
  }
}
