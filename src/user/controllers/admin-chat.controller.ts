import { Controller, Post, Body, Get, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { Roles } from '../../middleware/roles.decorator';
import { Role } from '../../middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { AdminChatService } from '../services/admin-chat.service';
import { AdminChatGateway } from '../admin-chat.gateway';
import { FirebaseStorageService } from '../../shared/services/firebase-storage.service';
import { User } from '../../all_user_entities/user.entity';
import { SendAdminMessageDto, AdminChatMessageResponseDto, AdminDto } from '../dtos/send-admin-message.dto';
import { GetUser } from '../../middleware/get-user.decorator';

@ApiTags('User Admin Chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Customer)
@Controller('user/admin-chat')
export class AdminChatController {
  constructor(
    private readonly adminChatService: AdminChatService,
    private readonly adminChatGateway: AdminChatGateway,
    private readonly firebaseStorageService: FirebaseStorageService,
  ) {}

  @Post('send')
  async sendMessage(
    @GetUser() user: User,
    @Body() data: SendAdminMessageDto,
  ) {
    // Verify the receiver is actually an admin
    const admins = await this.adminChatService.getAllAdmins();
    const isAdmin = admins.some(admin => admin.id === data.adminId);

    if (!isAdmin) {
      throw new Error('Specified user is not an admin');
    }

    let imageUrl: string | undefined;

    if (data.imageBase64) {
      const uploaded = await this.firebaseStorageService.uploadFromBase64(
        data.imageBase64,
        'KHS/chat',
      );
      imageUrl = uploaded.imageUrl;
    }

    const saved = await this.adminChatService.storeMessage({
      sender: user,
      receiver: { id: data.adminId } as User,
      message: data.message,
      imageUrl,
    });

    await this.adminChatGateway.sendMessageToAdmin(saved);

    return saved;
  }

  @Get('admins')
  async getAllAdmins(): Promise<AdminDto[]> {
    return this.adminChatService.getAllAdmins();
  }

  @Get('messages/:adminId')
  async getMessagesWithAdmin(
    @GetUser() user: User,
    @Param('adminId') adminId: string
  ): Promise<AdminChatMessageResponseDto[]> {
    return this.adminChatService.getChatMessageWithAdmin(user.id, adminId);
  }
}
