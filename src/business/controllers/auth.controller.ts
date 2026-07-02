import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { CreateUserDto } from '../dtos/requests/CreateUserDto';
import { OtpService } from '../services/otp.service';
import { RequestOtpDto } from '../dtos/requests/RequestOtpDto';
import { VerifyOtpDto } from '../dtos/requests/VerifyOtpDto';
import { LoginDto } from '../dtos/requests/LoginDto';
import { RefreshTokenDto } from '../dtos/requests/RefreshTokenDto';
import { ForgotPasswordDto } from '../dtos/requests/ForgotPasswordDto';
import { ResetPasswordDto } from '../dtos/requests/ResetPasswordDto';
import { RequestPhoneOtpDto } from '../dtos/requests/RequestPhoneOtpDto';
import { VerifyPhoneOtpDto } from '../dtos/requests/VerifyPhoneOtpDto';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import {
  LoginRateLimit,
  RegisterRateLimit,
  PasswordRateLimit,
  OtpRateLimit,
  PhoneRateLimit,
  RefreshRateLimit,
} from '../../common/rate-limit-decorator';

@ApiTags('Business Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('/business/register')
  @RegisterRateLimit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new business user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('/business/login')
  @LoginRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login a business user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'Account not verified or suspended',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('/business/forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'OTP sent to email if user exists' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto);
  }

  @Post('/business/verify-password-otp')
  @OtpRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify password reset OTP' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyPasswordOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyPasswordOtp(verifyOtpDto);
  }

  @Post('/business/reset-password')
  @PasswordRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('/business/otp/request')
  @OtpRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request email OTP for verification' })
  @ApiBody({ type: RequestOtpDto })
  @ApiResponse({ status: 200, description: 'OTP sent to email' })
  async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
    await this.otpService.requestOtp(requestOtpDto.email);
    return { message: 'OTP sent to your email.', email: requestOtpDto.email };
  }

  @Post('/business/otp/verify')
  @OtpRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email OTP' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.otpService.verifyOtp(verifyOtpDto.email, verifyOtpDto.otp);
  }

  @Post('/business/otp/refresh')
  @RefreshRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @Post('/business/request-phone-otp')
  @PhoneRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request phone OTP for verification' })
  @ApiBody({ type: RequestPhoneOtpDto })
  @ApiResponse({ status: 200, description: 'OTP sent to phone number' })
  async requestPhoneOtp(@Body() requestPhoneOtpDto: RequestPhoneOtpDto) {
    return this.authService.requestPhoneOtp(requestPhoneOtpDto);
  }

  @Post('/business/verify-phone-number')
  @PhoneRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone number with OTP' })
  @ApiBody({ type: VerifyPhoneOtpDto })
  @ApiResponse({
    status: 200,
    description: 'Phone number verified successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyPhoneNumber(@Body() verifyPhoneOtpDto: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneNumber(verifyPhoneOtpDto);
  }
}
