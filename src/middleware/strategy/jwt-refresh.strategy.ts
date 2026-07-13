import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Payload } from '../../types/constants';
import { UserService } from '../../user/services/user.service';
import { Request } from 'express';
import dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly userService: UserService) {
    const secret = process.env.JWT_REFRESH_SECRET;

    if (!secret) {
      throw new Error(
        'JWT_REFRESH_SECRET is not set in environment variables.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: Payload) {
    const authHeader = req.get('authorization');
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header not found.');
    }
    const refreshToken = authHeader.replace('Bearer', '').trim();
    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found or token invalid.');
    }
    return { ...user, refreshToken };
  }
}
