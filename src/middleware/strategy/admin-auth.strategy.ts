import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminAuthService } from 'src/admin/services/admin_auth.service';

@Injectable()
export class AdminAuthStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly adminAuthService: AdminAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'defaultSecret',
    });
  }

  async validate(payload: any) {
    const user = await this.adminAuthService.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
