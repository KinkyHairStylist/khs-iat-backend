import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';
import {
  UpdateUserProfileDto,
  ChangePasswordDto,
} from '../dtos/update-profile.dto';
import { CloudinaryService } from './cloudinary.service';
import { PasswordHashingHelper } from '../../helpers/password-hashing.helper';
import { EmailService } from '../../email/email.service';

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly emailService: EmailService,
  ) {}

  async getProfile(user: User): Promise<User> {
    const foundUser = await this.userRepo.findOne({ where: { id: user.id } });
    if (!foundUser) throw new NotFoundException('User not found');
    return foundUser;
  }

  async updateProfile(user: User, dto: UpdateUserProfileDto): Promise<User> {
    try {
      const foundUser = await this.userRepo.findOne({ where: { id: user.id } });
      if (!foundUser) {
        throw new NotFoundException('User not found');
      }

      Object.assign(foundUser, dto);

      return await this.userRepo.save(foundUser);
    } catch (error) {
      console.error('Error updating profile:', error);

      // If it's already a NestJS exception, rethrow it
      if (error instanceof NotFoundException) {
        throw error;
      }

      // Throw a generic internal error for other types
      throw new InternalServerErrorException(
        error?.message || 'Failed to update user profile',
      );
    }
  }

  async uploadAvatar(user: User, file: Express.Multer.File): Promise<User> {
    if (!file) throw new BadRequestException('No file uploaded');

    const foundUser = await this.userRepo.findOne({ where: { id: user.id } });
    if (!foundUser) throw new NotFoundException('User not found');

    const uploadedUrl = await this.cloudinaryService.uploadFile(file);
    foundUser.avatarUrl = uploadedUrl;

    return this.userRepo.save(foundUser);
  }

  async deleteAvatar(user: User): Promise<{ message: string }> {
    const foundUser = await this.userRepo.findOne({ where: { id: user.id } });
    if (!foundUser) throw new NotFoundException('User not found');

    if (foundUser.avatarUrl) {
      const parts = foundUser.avatarUrl.split('/');
      const publicId = parts[parts.length - 1].split('.')[0];
      await this.cloudinaryService.deleteFile(`user_avatars/${publicId}`);
      foundUser.avatarUrl = undefined;
      await this.userRepo.save(foundUser);
    }

    return { message: 'Avatar deleted successfully' };
  }
  async changePassword(user: User, dto: ChangePasswordDto) {
    const { currentPassword, newPassword } = dto;

    // Fetch full user using ID from JWT payload
    const existingUser = await this.userRepo.findOne({
      where: { id: user.id },
    });

    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    if (!existingUser.password) {
      throw new BadRequestException(
        'Password change not allowed for this account',
      );
    }

    // Compare current password
    const isValid = await PasswordHashingHelper.comparePassword(
      currentPassword,
      existingUser.password,
    );

    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash and save new password
    existingUser.password =
      await PasswordHashingHelper.hashPassword(newPassword);
    await this.userRepo.save(existingUser);

    // Ensure email exists before sending notification
    if (!existingUser.email) {
      throw new BadRequestException(
        'Email is required to send password update notification',
      );
    }

    // Send email notification
    this.emailService.sendPasswordChangedEmail(
      existingUser.email,
      existingUser.firstName || 'Customer',
    );

    return { message: 'Password changed successfully' };
  }

  /**
   * Permanently deletes a user account.
   *
   * CASCADE DELETE (automatically removed with user):
   * - clientAppointments (appointments where user is client)
   * - refreshTokens
   * - businesses (owned by user)
   * - referrals (where user is referrer)
   * - cards
   * - preferences
   * - role
   *
   * SET NULL (automatically handled by database):
   * - sentTransactions (senderId set to null)
   * - receivedTransactions (recipientId set to null)
   * - giftCards (sender set to null)
   * - notificationSettings (handled by cascade)
   */
  async permanentlyDeleteAccount(user: User) {
    const fullUser = await this.userRepo.findOne({
      where: { id: user.id },
    });
    if (!fullUser) {
      throw new NotFoundException('User not found');
    }

    // Store email before deletion for sending confirmation
    const userEmail = fullUser.email;

    this.logger.log(`Attempting to delete account for user ${user.id} (${userEmail})`);

    // Send deletion email
    try {
      this.emailService.sendAccountDeletedEmail(
        userEmail,
        fullUser.firstName || 'Valued Customer',
      );
    } catch (emailError) {
      this.logger.error(`Failed to send deletion email: ${emailError.message}`, emailError.stack);
    }

    // Remove the user - cascade will handle all related entities:
    // - appointments, refreshTokens, businesses, referrals, cards: CASCADE DELETE
    // - preferences, role: CASCADE DELETE
    // - transactions (sender/recipient), giftCards: SET NULL (handled by DB)
    try {
      await this.userRepo.remove(fullUser);
    } catch (dbError) {
      this.logger.error(`Failed to delete user ${user.id}: ${dbError.message}`, dbError.stack);
      throw new InternalServerErrorException(
        `Could not delete account: ${dbError.message}`,
      );
    }

    this.logger.log(`Account ${user.id} deleted successfully`);
    return { message: 'Account permanently removed' };
  }
}
