import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PhoneVerificationService } from '../services/phone-verification.service';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';

@ApiTags('Phone Verification')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/users/phone-verification')
export class PhoneVerificationController {
  constructor(private readonly phoneVerificationService: PhoneVerificationService) {}

  @Post('send/:userId')
  @ApiOperation({ summary: 'Send verification code to user phone' })
  @ApiResponse({ status: 200, description: 'Verification code sent successfully' })
  async sendCode(@Param('userId') userId: string) {
    return this.phoneVerificationService.sendVerificationCode(userId);
  }

  @Post('verify/:userId')
  @ApiOperation({ summary: 'Verify phone number with code' })
  @ApiResponse({ status: 200, description: 'Phone number verified successfully' })
  async verifyCode(@Param('userId') userId: string, @Body('code') code: string) {
    return this.phoneVerificationService.verifyCode(userId, code);
  }
}
