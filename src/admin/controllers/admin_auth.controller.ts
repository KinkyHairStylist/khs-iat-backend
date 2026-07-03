import { Controller, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { AdminAuthService } from '../services/admin_auth.service';
import {
  AdminInviteDto,
  AdminLoginDto,
  AdminRegisterDto,
  AdminForgotPasswordDto,
  AdminResetPasswordDto,
} from '../dtos/admin_auth.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { RolesGuard } from 'src/middleware/roles.guard';
import { AdminAuthGuard } from 'src/middleware/admin-auth.guard';
import {
  LoginRateLimit,
  RegisterRateLimit,
  PasswordRateLimit,
  InviteRateLimit,
} from 'src/common/rate-limit-decorator';

@ApiTags('Admin Authentication')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @LoginRateLimit()
  login(@Body() dto: AdminLoginDto) {
    return this.auth.Admin_login(dto.email, dto.password);
  }

  @Post('invite')
  @InviteRateLimit()
  @ApiBearerAuth('access-token')
  @UseGuards(AdminAuthGuard, RolesGuard)
  invite(@Body() dto: AdminInviteDto) {
    return this.auth.Admin_invite(dto.email, dto.role);
  }

  @Post('register')
  @RegisterRateLimit()
  register(@Body() dto: AdminRegisterDto, @Query('token') token: string) {
    return this.auth.Admin_register(dto, token);
  }

  @Post('forgot-password')
  @PasswordRateLimit()
  async forgotPassword(@Body() dto: AdminForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { success: true, message: 'If an account with this email exists, a password reset link has been sent.' };
  }

  @Post('reset-password')
  @PasswordRateLimit()
  async resetPassword(
    @Query('token') token: string,
    @Query('email') email: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    await this.auth.resetPassword(email, token, dto.password);
    return { success: true, message: 'Password has been reset successfully.' };
  }
}
