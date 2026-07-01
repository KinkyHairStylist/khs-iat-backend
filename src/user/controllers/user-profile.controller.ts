import {
  Controller,
  Get,
  Put,
  UseGuards,
  Body,
  UseInterceptors,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiBody
} from '@nestjs/swagger';

import { RolesGuard } from 'src/middleware/roles.guard';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { UserProfileService } from '../services/user-profile.service';
import { UpdateUserProfileDto, ChangePasswordDto } from '../dtos/update-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { fileUploadOptions } from 'src/middleware/file-upload.middleware';

@ApiTags('Customer Profile')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@GetUser() user: User) {
    const profile = await this.userProfileService.getProfile(user);
    return { success: true, data: profile };
  }

  @Put('update')
  @ApiOperation({ summary: 'Update user profile' })
  async updateProfile(@GetUser() user: User, @Body() dto: UpdateUserProfileDto) {
    const updated = await this.userProfileService.updateProfile(user, dto);
    return { success: true, data: updated };
  }

  @Put('avatar')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions()))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload user avatar to Cloudinary' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (jpg, jpeg, png)',
        },
      },
    },
  })
  async uploadAvatar(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userProfileService.uploadAvatar(user, file);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Delete user avatar from Cloudinary' })
  async deleteAvatar(@GetUser() user: User) {
    await this.userProfileService.deleteAvatar(user);
    return { success: true, message: 'Avatar deleted successfully' };
  }

  @Put('/change-password')
  @ApiOperation({ summary: 'Change account password' })
  async changePassword(@GetUser() user: User, @Body() dto: ChangePasswordDto) {
    await this.userProfileService.changePassword(user, dto);
    return { success: true, message: 'Password changed successfully' };
  }

  @Delete('/delete-account-permanently')
  @ApiOperation({ summary: 'Delete user account (permanently)' })
  async deleteAccountPermanently(@GetUser() user: User) {
    await this.userProfileService.permanentlyDeleteAccount(user);
    return { success: true, message: 'Account permanently removed' };
  }
}
