import { Controller, Get, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated notifications for the authenticated user' })
  async getNotifications(
    @GetUser() user: User,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getUserNotifications(
      user.id,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for the authenticated user' })
  async getUnreadCount(@GetUser() user: User) {
    const count = await this.notificationService.getUnreadCount(user.id);
    return { unreadCount: count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@GetUser() user: User, @Param('id') id: string) {
    return this.notificationService.markAsRead(user.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for the authenticated user' })
  async markAllAsRead(@GetUser() user: User) {
    await this.notificationService.markAllAsRead(user.id);
    return { message: 'All notifications marked as read' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a specific notification' })
  async deleteNotification(@GetUser() user: User, @Param('id') id: string) {
    await this.notificationService.delete(user.id, id);
    return { message: 'Notification deleted successfully' };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all notifications for the authenticated user' })
  async deleteAllNotifications(@GetUser() user: User) {
    await this.notificationService.deleteAll(user.id);
    return { message: 'All notifications deleted successfully' };
  }
}
