import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  Req,
  Res,
  Get,
  UseGuards,
  Patch,
  Param,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Session } from 'express-session';
import { UserService } from '../services/user.service';
import {
  GetStartedDto,
  VerifyCodeDto,
  ResendCodeDto,
  SignUpDto,
  CustomerLoginDto,
  ResetPasswordStartDto,
  ResetPasswordVerifyDto,
  ResetPasswordFinishDto,
  AuthResponseDto,
} from '../dtos/user.dto';
import { RefreshTokenDto } from '../../business/dtos/requests/RefreshTokenDto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

interface RequestWithSession extends Request {
  session: Session & {
    userId?: string;
    isAuthenticated?: boolean;
  };
}

@ApiTags('Customer') // Groups all endpoints under 'User' in Swagger
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('/auth/get-started')
  @ApiOperation({
    summary: 'Start authentication by sending verification code',
  })
  @ApiBody({ type: GetStartedDto })
  @ApiResponse({
    status: 201,
    description: 'Verification code sent',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async getStarted(@Body() dto: GetStartedDto): Promise<AuthResponseDto> {
    return this.userService.getStarted(dto);
  }

  @Post('/auth/verify-code')
  @ApiOperation({ summary: 'Verify user email or phone with a code' })
  @ApiBody({ type: VerifyCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Verification successful',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async verifyCode(@Body() dto: VerifyCodeDto): Promise<AuthResponseDto> {
    return this.userService.verifyCode(dto);
  }

  @Post('/auth/resend-code')
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiBody({ type: ResendCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Verification code resent',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async resendCode(@Body() dto: ResendCodeDto): Promise<AuthResponseDto> {
    return this.userService.resendCode(dto);
  }

  @Post('/auth/signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: SignUpDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async signup(
    @Request() req,
    @Body() dto: SignUpDto,
  ): Promise<AuthResponseDto> {
    return this.userService.signUp(dto);
  }

  @Post('/auth/login')
  @ApiOperation({ summary: 'Authenticate user and start session' })
  @ApiBody({ type: CustomerLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async login(
    @Body() dto: CustomerLoginDto,
    @Req() req: RequestWithSession,
  ): Promise<AuthResponseDto> {
    const result = await this.userService.login(dto);

    if (result.user) {
      req.session.userId = result.user.id;
      req.session.isAuthenticated = true;
    }

    return result;
  }

  @Get('/auth/logout')
  @ApiOperation({ summary: 'Logout user and destroy session' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(
    @Req() req: RequestWithSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    return new Promise((resolve) => {
      req.session.destroy((err: any) => {
        if (err) {
          resolve({ message: 'Logout failed' });
        } else {
          res.clearCookie('connect.sid');
          resolve({ message: 'Logged out successfully' });
        }
      });
    });
  }

  @Get('/auth/me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Current user data or unauthenticated status',
  })
  async getCurrentUser(@Req() req: RequestWithSession) {
    if (!req.session.userId) {
      return { isAuthenticated: false };
    }

    const user = await this.userService.findById(req.session.userId);
    return {
      isAuthenticated: true,
      user: user ? this.userService.sanitizeUser(user) : null,
    };
  }

  // Password Reset Endpoints
  @Post('/auth/reset-password/start')
  @ApiOperation({
    summary: 'Start password reset by sending code to email/phone',
  })
  @ApiBody({ type: ResetPasswordStartDto })
  @ApiResponse({
    status: 200,
    description: 'Reset code sent',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async startResetPassword(
    @Body() dto: ResetPasswordStartDto,
  ): Promise<AuthResponseDto> {
    return this.userService.startResetPassword(dto);
  }

  @Post('/auth/reset-password/verify')
  @ApiOperation({ summary: 'Verify password reset code' })
  @ApiBody({ type: ResetPasswordVerifyDto })
  @ApiResponse({
    status: 200,
    description: 'Reset code verified',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async verifyResetCode(
    @Body() dto: ResetPasswordVerifyDto,
  ): Promise<AuthResponseDto> {
    return this.userService.verifyResetCode(dto);
  }

  @Post('/auth/reset-password/finish')
  @ApiOperation({ summary: 'Complete password reset with new password' })
  @ApiBody({ type: ResetPasswordFinishDto })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
    type: AuthResponseDto,
  })
  @UsePipes(new ValidationPipe())
  async finishResetPassword(
    @Body() dto: ResetPasswordFinishDto,
  ): Promise<AuthResponseDto> {
    return this.userService.finishResetPassword(dto);
  }

  @Post('/auth/refresh-token')
  @UseGuards(AuthGuard('access-token'))
  @ApiOperation({ summary: 'Refresh authentication tokens' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: AuthResponseDto,
  })
  async refreshTokens(@Req() req) {
    return this.userService.refreshTokens(req.user.refreshToken);
  }

  @Patch('/auth/updateUser/:id')
  updateUser(@Param('id') id: string, @Body() dto: any) {
    return this.userService.updateUser(id, dto);
  }
}
