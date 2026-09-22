import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';
import { Business } from 'src/business/entities/business.entity';
import { BusinessService } from 'src/business/services/business.service';
import { CreateBusinessDto } from 'src/business/dtos/requests/CreateBusinessDto';
import { EmailService } from 'src/email/email.service';
import { ReferralService } from 'src/user/services/referral.service';
import { PasswordHashingHelper } from 'src/helpers/password-hashing.helper';
import { AdminRole } from 'src/middleware/admin-role.enum';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
import { AdminService } from './admin.service';
import { AdminCreatePersona, AdminCreateUserDto } from '../dtos/admin-create-user.dto';

const SET_PASSWORD_DAYS = 7;

// Adding a user on someone's behalf. It collects what that person's own sign-up collects, but the
// account is created already verified. The password is random and never shown to anyone; the
// person sets their own from the email they receive.
@Injectable()
export class AdminUserCreationService {
  private readonly logger = new Logger(AdminUserCreationService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    private readonly businessService: BusinessService,
    private readonly adminService: AdminService,
    private readonly emailService: EmailService,
    private readonly referralService: ReferralService,
  ) {}

  async createUser(dto: AdminCreateUserDto, createdBy?: string) {
    const email = dto.email.trim().toLowerCase();
    const phoneNumber = dto.phoneNumber.trim();

    if (dto.persona === 'MERCHANT') this.assertFreeStart(dto.business);
    await this.assertNotTaken(email, phoneNumber);

    const isAdmin = dto.persona === 'ADMIN';
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email,
        firstName: dto.firstName.trim(),
        surname: dto.surname.trim(),
        phoneNumber,
        gender: dto.gender,
        password: await PasswordHashingHelper.hashPassword(this.randomPassword()),
        isVerified: true,
        isSuspended: false,
        suspensionHistory: '.',
        isStaff: isAdmin,
        adminRole: isAdmin ? AdminRole.ADMIN : null,
        isMerchant: dto.persona === 'MERCHANT',
        isCustomer: dto.persona === 'CUSTOMER',
      }),
    );

    let business: Business | null = null;
    let approved = false;

    if (dto.persona === 'MERCHANT') {
      try {
        business = await this.businessService.create(dto.business as CreateBusinessDto, user, {
          sendUnderReviewEmail: false,
        });
      } catch (error) {
        // No business, no merchant: don't leave a half-made account behind.
        await this.usersRepo.delete(user.id);
        throw error;
      }
      approved = await this.approve(business);
    } else if (dto.persona === 'CUSTOMER') {
      try {
        await this.referralService.ensureReferralCode(user.id);
      } catch (error) {
        this.logger.warn(`Couldn't create a referral code for ${email}: ${error.message}`);
      }
    }

    await this.sendAccountEmail(user, dto.persona, business, approved);
    this.notify(user, dto.persona, createdBy);

    return {
      message: this.summary(user, dto.persona, approved),
      user: { id: user.id, persona: this.personaLabel(dto.persona) },
      businessId: business?.id ?? null,
      approved,
    };
  }

  // Customer or admin to merchant: the account exists, so only the business is needed.
  async makeMerchant(
    userId: string,
    business: CreateBusinessDto,
    actor?: { id?: string; email?: string },
  ) {
    if (actor?.id && actor.id === userId) {
      throw new BadRequestException("You can't change your own persona.");
    }
    this.assertFreeStart(business);

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.isMerchant) throw new BadRequestException('This user is already a merchant.');
    if (user.adminRole === AdminRole.SUPER_ADMIN) {
      throw new BadRequestException("A super admin's persona can't be changed here.");
    }

    const original = {
      isMerchant: user.isMerchant,
      isCustomer: user.isCustomer,
      isStaff: user.isStaff,
      adminRole: user.adminRole,
    };
    user.adminRole = null;

    let created: Business;
    try {
      created = await this.businessService.create(business, user, { sendUnderReviewEmail: false });
    } catch (error) {
      // create() flags the owner as a merchant before it saves the business; put that back.
      await this.usersRepo.update(user.id, original);
      throw error;
    }
    const approved = await this.approve(created);

    await this.sendAccountEmail(user, 'MERCHANT', created, approved, true);
    this.notify(user, 'MERCHANT', actor?.email, true);

    return {
      message: approved
        ? `${this.displayName(user)} is now a merchant on the ${created.planTier} fee tier.`
        : `${this.displayName(user)} is now a merchant. Their business still needs approving.`,
      user: { id: user.id, persona: 'Merchant' },
      businessId: created.id,
      approved,
    };
  }

  // Admin-created merchants can't pay, so they start on the Trial or MVP and choose a paid plan
  // from their billing page.
  private assertFreeStart(business: CreateBusinessDto | undefined) {
    const option = business?.signup?.option;
    if (option !== 'trial' && option !== 'reveal') {
      throw new BadRequestException(
        'A merchant added by an admin starts on the Trial or MVP. They choose a paid plan themselves from their billing page.',
      );
    }
  }

  private async assertNotTaken(email: string, phoneNumber: string) {
    const byEmail = await this.usersRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .getOne();
    if (byEmail) throw new ConflictException('User with this email already exists.');

    const byPhone = await this.usersRepo.findOne({ where: { phoneNumber } });
    if (byPhone) throw new ConflictException('User with this phone number already exists.');
  }

  private async approve(business: Business): Promise<boolean> {
    try {
      await this.adminService.approveApplication(business.id);
      return true;
    } catch (error) {
      this.logger.error(`Couldn't approve business ${business.id}: ${error.message}`);
      return false;
    }
  }

  private async sendAccountEmail(
    user: User,
    persona: AdminCreatePersona,
    business: Business | null,
    approved: boolean,
    existingAccount = false,
  ) {
    try {
      const name = user.firstName || 'there';
      let path = '/auth';
      let actionLabel = 'Sign in';
      let intro = `An administrator created your ${this.personaLabel(persona)} account. Your email is already verified.`;
      let footnote = "On the sign-in screen choose 'Forgot password' to set your password.";
      const notes = [`Email: ${user.email}`, `Account type: ${this.personaLabel(persona)}`];

      if (persona === 'ADMIN') {
        const token = randomBytes(32).toString('hex');
        user.resetCode = await PasswordHashingHelper.hashPassword(token);
        user.resetCodeExpires = new Date(Date.now() + SET_PASSWORD_DAYS * 24 * 60 * 60 * 1000);
        await this.usersRepo.save(user);
        path = `/invites/admin-reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
        actionLabel = 'Set your password';
        footnote = `This link works for ${SET_PASSWORD_DAYS} days.`;
      } else if (persona === 'MERCHANT') {
        path = '/auth?role=merchant';
        if (existingAccount) {
          intro = 'An administrator set up your business on your existing account.';
          footnote = 'Sign in with the password you already use.';
        }
        if (business) {
          notes.push(`Business: ${business.businessName}`);
          notes.push(
            approved
              ? 'Your business is approved.'
              : 'Your business is waiting for approval.',
          );
        }
      }

      await this.emailService.sendAccountCreatedByAdminEmail(user.email, {
        name,
        intro,
        notes,
        actionLabel,
        path,
        footnote,
      });
    } catch (error) {
      // The account exists either way; the admin can resend a reset from the sign-in screen.
      this.logger.error(`Couldn't send the account email to ${user.email}: ${error.message}`);
    }
  }

  private notify(user: User, persona: AdminCreatePersona, by?: string, existingAccount = false) {
    try {
      SlackService.notify({
        node: SlackNode.USER_MANAGEMENT,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.INFO,
        type: SlackEventType.ADMIN_ACTION,
        trigger: existingAccount
          ? `Admin made ${user.email} a merchant`
          : `Admin created a ${this.personaLabel(persona)} account: ${user.email}`,
        body: `An admin ${existingAccount ? 'changed a user to a merchant' : 'added a user'}.
• User: ${this.displayName(user)} (${user.email})
• Persona: ${this.personaLabel(persona)}
• By: ${by ?? 'an admin'}`,
      });
    } catch (error) {
      this.logger.error(`Slack notification failed: ${error.message}`);
    }
  }

  private summary(user: User, persona: AdminCreatePersona, approved: boolean): string {
    const name = this.displayName(user);
    if (persona === 'MERCHANT') {
      return approved
        ? `${name} was added as a merchant and their business is approved.`
        : `${name} was added as a merchant. Their business still needs approving.`;
    }
    return `${name} was added as ${persona === 'ADMIN' ? 'an admin' : 'a customer'}. They've been emailed to set up their password.`;
  }

  private personaLabel(persona: AdminCreatePersona): string {
    return persona === 'ADMIN' ? 'Admin' : persona === 'MERCHANT' ? 'Merchant' : 'Customer';
  }

  private displayName(user: User): string {
    return `${user.firstName ?? ''} ${user.surname ?? ''}`.trim() || user.email;
  }

  // Never shown or sent to anyone; it only makes the account unusable until its owner sets a real one.
  private randomPassword(): string {
    return `${randomBytes(24).toString('base64url')}aA1!`;
  }
}
