import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';

import { User } from 'src/all_user_entities/user.entity';
import { AdminInvite } from '../admin_entities/admin-invite.entity';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getTokens } from '../../helpers/token.helper';
import { PasswordHashingHelper } from '../../helpers/password-hashing.helper';
import { EmailService } from '../../email/email.service';
import { AdminRole } from '../../middleware/admin-role.enum';

@Injectable()
export class AdminAuthService {
  private frontendUrl: string;
  private jwtSecret: string;
  private inviteExpireMinutes = 30;
  private fromEmail: string;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,

    @InjectRepository(AdminInvite)
    private inviteRepo: Repository<AdminInvite>,

    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
  ) {
    const frontend = this.config.get<string>('FRONTEND_URL');
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    const fromEmail = this.config.get<string>('SENDGRID_FROM_EMAIL');

    if (!frontend) {
        throw new Error('Missing required config: FRONTEND_URL');
    }
    if (!secret) {
        throw new Error('Missing required config: JWT_ACCESS_SECRET')
    }
    if (!apiKey || !fromEmail) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
    this.frontendUrl = frontend
    this.jwtSecret = secret
  }

  // -----------------------------------
  // ADMIN LOGIN
  // -----------------------------------
  async Admin_login(email: string, password: string) {    
    const user = await this.usersRepo.findOne({ 
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isStaff) {
      throw new UnauthorizedException('You are not authorized as admin');
    }

    const valid = user.password && await PasswordHashingHelper.comparePassword(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    const { accessToken, refreshToken } = await getTokens(
      this.jwt,
      user.id,
      user.email,
    );

    return {
      message: 'Admin Login Successful',
      token: accessToken,
      refreshToken,
    };
  }

  async findUserById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  private async sendAdminInviteEmail(email: string, link: string): Promise<void> {
    const msg = {
      to: email,
      from: this.fromEmail,
      subject: 'You have been invited as an Admin',
      text: `Please use the following link to register: ${link}`,
    };
    await sgMail.send(msg);
  }

  private async sendPasswordResetEmail(email: string, link: string): Promise<void> {
    const msg = {
      to: email,
      from: this.fromEmail,
      subject: 'Admin Password Reset Request',
      text: `Please use the following link to reset your password: ${link}`,
    };
    await sgMail.send(msg);
  }

  // -----------------------------------
  // ADMIN INVITE
  // -----------------------------------
  async Admin_invite(email: string, role: string) {
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException(
        'A user with this email address is already registered on the platform.',
      );
    }

    const invite = this.inviteRepo.create({
      email,
      expiresAt: new Date(Date.now() + this.inviteExpireMinutes * 60000),
    });

    await this.inviteRepo.save(invite);

    const token = this.jwt.sign(
      { inviteId: invite.id, email, role },
      { secret: this.jwtSecret, expiresIn: `${this.inviteExpireMinutes}m` },
    );

    const roleUpper = (role || 'CLIENT').toUpperCase();
    let link = '';
    if (roleUpper === 'BUSINESS' || roleUpper === 'MERCHANT') {
      link = `${this.frontendUrl}/auth?role=merchant`;
    } else if (roleUpper === 'CLIENT' || roleUpper === 'CUSTOMER') {
      link = `${this.frontendUrl}/auth`;
    } else {
      link = `${this.frontendUrl}/invites/admin-signup?token=${token}`;
    }

    await this.emailService.sendUserInviteEmail(email, role, link);

    return {
      message: `Invitation sent to ${email} as ${role}`,
    };
  }

  // -----------------------------------
  // ADMIN REGISTRATION
  // -----------------------------------
  async Admin_register(dto: any, token: string) {
    let decoded: any;

    try {
      decoded = await this.jwt.verifyAsync(token, {
        secret: this.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invitation link invalid or expired');
    }

    const invite = await this.inviteRepo.findOne({
      where: { id: decoded.inviteId },
    });

    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.expiresAt < new Date()) throw new UnauthorizedException('Expired link');

    const roleNormalized = (decoded.role || 'ADMIN').toUpperCase();
    const isStaff = roleNormalized === 'ADMIN' || roleNormalized === 'STAFF';
    const isMerchant = roleNormalized === 'BUSINESS' || roleNormalized === 'MERCHANT';
    const isCustomer = roleNormalized === 'CLIENT' || roleNormalized === 'CUSTOMER' || (!isStaff && !isMerchant);

    const hash = await PasswordHashingHelper.hashPassword(dto.password);

    const user = this.usersRepo.create({
      email: invite.email,
      password: hash,
      firstName: dto.firstName,
      surname: dto.surname,
      phoneNumber: dto.phoneNumber,
      gender: dto.gender,
      isVerified: true,
      isStaff,
      adminRole: isStaff ? AdminRole.ADMIN : null,
      isMerchant,
      isCustomer,
    });

    await this.usersRepo.save(user);
    await this.inviteRepo.delete(invite.id);

    return {
      message: `${roleNormalized} account created successfully`,
      user: {
        id: user.id,
        email: user.email,
        isStaff: user.isStaff,
        isMerchant: user.isMerchant,
        isCustomer: user.isCustomer,
      },
    };
  }

  // -----------------------------------
  // ADMIN FORGOT PASSWORD
  // -----------------------------------
  async forgotPassword(email: string) {
    const user = await this.usersRepo.findOne({ 
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isStaff) {
      throw new UnauthorizedException('You are not authorized as admin');
    }

    const resetToken = randomBytes(32).toString('hex');
    user.resetCode = await PasswordHashingHelper.hashPassword(resetToken);
    user.resetCodeExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.usersRepo.save(user);

    const resetLink = `${this.frontendUrl}/invites/admin-reset-password?token=${resetToken}&email=${email}`;
    await this.sendPasswordResetEmail(email, resetLink);

    return { message: 'If an account with this email exists, a password reset link has been sent.' };
  }

  // -----------------------------------
  // ADMIN RESET PASSWORD
  // -----------------------------------
  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.usersRepo.findOne({ where: { email } });

    if (!user || !user.resetCode || !user.resetCodeExpires) {
      throw new UnauthorizedException('Invalid reset token.');
    }

    if (user.resetCodeExpires < new Date()) {
      throw new UnauthorizedException('Reset token has expired.');
    }

    const isTokenValid = await PasswordHashingHelper.comparePassword(token, user.resetCode);
    if (!isTokenValid) {
      throw new UnauthorizedException('Invalid reset token.');
    }

    user.password = await PasswordHashingHelper.hashPassword(newPassword);
    user.resetCode = null;
    user.resetCodeExpires = null;

    await this.usersRepo.save(user);

    return { message: 'Password has been reset successfully.' };
  }
}
