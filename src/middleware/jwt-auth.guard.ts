import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/services/user.service';
import { assertNotSuspended } from 'src/user/utils/account-suspension';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private userService: UserService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid token');
    }

    const token = authHeader.split(' ')[1];

    let user;
    try {
      const decoded = this.jwtService.verify(token);
      user = await this.userService.findById(decoded.sub);
      if (!user) {
        console.error('[JwtAuthGuard] User not found for sub:', decoded?.sub);
        throw new UnauthorizedException('User not found or token invalid.');
      }
    } catch (err) {
      console.error('[JwtAuthGuard] Token verification failed:', err.name, err.message, '| URL:', request.url);
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Outside the try, so the suspended message reaches the person instead of a generic token error.
    assertNotSuspended(user);
    request['user'] = user;
    return true;
  }
}
