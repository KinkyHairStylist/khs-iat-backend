import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingRules,
  BusinessNotifications,
  BusinessOwnerSettings,
  ClientManagement,
  Integrations,
  NotificationSettings,
  OnlinePresence,
  PricingPolicies,
} from '../entities/business-owner-settings.entity';
import {
  CreateUserAddressDto,
  UpdateBusinessOwnerSettingsDto,
  UpdateOwnerProfileDto,
  UpdateUserAddressDto,
} from '../dtos/requests/BusinessOwnerSettingsDto';
import {
  BusinessCloudinaryService,
  FileUpload,
} from './business-cloudinary.service';
import { User } from 'src/all_user_entities/user.entity';
import { ApiResponse } from '../types/client.types';
import { Business } from '../entities/business.entity';

@Injectable()
export class BusinessOwnerSettingsService {
  constructor(
    @InjectRepository(BusinessOwnerSettings)
    private readonly businessOwnerSettingsRepository: Repository<BusinessOwnerSettings>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly businessCloudinaryService: BusinessCloudinaryService,
  ) {}

  async findByBusinessId(businessId: string): Promise<BusinessOwnerSettings> {
    let settings;

    settings = await this.businessOwnerSettingsRepository.findOne({
      where: { businessId },
    });

    if (!settings) {
      const business = await this.businessRepo.findOne({
        where: { id: businessId },
      });

      if (!business) {
        throw new BadRequestException('Business not found');
      }

      settings = this.businessOwnerSettingsRepository.create({
        ownerId: business.ownerId,
        businessId: businessId,
      });

      // Persist to DB
      settings = await this.businessOwnerSettingsRepository.save(settings);
    }

    return settings;
  }

  async findByOwnerId(ownerId: string): Promise<BusinessOwnerSettings | null> {
    let settings;

    settings = await this.businessOwnerSettingsRepository.findOne({
      where: { ownerId },
    });

    // If it doesn't exist → create a new empty settings object
    if (!settings) {
      const business = await this.businessRepo.findOne({ where: { ownerId } });

      if (!business) {
        throw new BadRequestException('Business not found');
      }

      settings = this.businessOwnerSettingsRepository.create({
        ownerId,
        businessId: business.id,
      });

      // Persist to DB
      settings = await this.businessOwnerSettingsRepository.save(settings);
    }

    return settings;
  }

  async update(
    ownerId: string,
    businessId: string,
    updateDto: UpdateBusinessOwnerSettingsDto,
  ): Promise<BusinessOwnerSettings> {
    let settings = await this.findByOwnerId(ownerId);

    // If it doesn't exist → create a new empty settings object
    if (!settings) {
      settings = this.businessOwnerSettingsRepository.create({
        ownerId,
        businessId,
      });
    }

    // --------- FIX: Initialize missing nested objects ----------
    if (!settings.notifications) {
      settings.notifications = new NotificationSettings();
    }

    if (!settings.notifications.businessNotifications) {
      settings.notifications.businessNotifications =
        new BusinessNotifications();
    }

    if (!settings.notifications.reminderRules) {
      settings.notifications.reminderRules = [];
    }

    if (!settings.bookingRules) {
      settings.bookingRules = new BookingRules();
    }

    if (!settings.clientManagement) {
      settings.clientManagement = new ClientManagement();
    }

    if (!settings.onlinePresence) {
      settings.onlinePresence = new OnlinePresence();
    }

    if (!settings.pricingPolicies) {
      settings.pricingPolicies = new PricingPolicies();
    }

    if (!settings.integrations) {
      settings.integrations = new Integrations();
    }

    if (updateDto.notifications) {
      const incoming = updateDto.notifications;

      // Initialize missing structure once
      if (!settings.notifications)
        settings.notifications = new NotificationSettings();
      if (!settings.notifications.businessNotifications)
        settings.notifications.businessNotifications =
          new BusinessNotifications();

      // enableAutomatedReminders
      if (incoming.enableAutomatedReminders !== undefined) {
        settings.notifications.enableAutomatedReminders =
          incoming.enableAutomatedReminders;
      }

      // reminderRules
      if (incoming.reminderRules !== undefined) {
        settings.notifications.reminderRules = incoming.reminderRules;
      }

      // businessNotifications (nested)
      if (incoming.businessNotifications) {
        settings.notifications.businessNotifications = {
          ...settings.notifications.businessNotifications,
          ...incoming.businessNotifications,
        };
      }
    }

    // Deep merge bookingRules
    if (updateDto.bookingRules) {
      settings.bookingRules = {
        ...settings.bookingRules,
        ...updateDto.bookingRules,
      };
    }

    // Deep merge clientManagement
    if (updateDto.clientManagement) {
      settings.clientManagement = {
        ...settings.clientManagement,
        ...updateDto.clientManagement,
      };
    }

    // Deep merge onlinePresence
    if (updateDto.onlinePresence) {
      settings.onlinePresence = {
        ...settings.onlinePresence,
        ...updateDto.onlinePresence,
      };
    }

    // Deep merge pricingPolicies
    if (updateDto.pricingPolicies) {
      settings.pricingPolicies = {
        ...settings.pricingPolicies,
        ...updateDto.pricingPolicies,
      };
    }

    // Deep merge integrations
    if (updateDto.integrations) {
      const incoming = updateDto.integrations;

      // googleCalendar
      if (incoming.googleCalendar !== undefined) {
        settings.integrations.googleCalendar = incoming.googleCalendar;
      }

      // mailChimp
      if (incoming.mailChimp !== undefined) {
        settings.integrations.mailChimp = incoming.mailChimp;
      }

      // zohoBooks
      if (incoming.zohoBooks !== undefined) {
        settings.integrations.zohoBooks = incoming.zohoBooks;
      }
    }

    // update apiKey
    if (updateDto.apiKey) {
      settings.apiKey = updateDto.apiKey;
    }

    return await this.businessOwnerSettingsRepository.save(settings);
  }

  async delete(businessId: string): Promise<void> {
    const settings = await this.findByBusinessId(businessId);
    await this.businessOwnerSettingsRepository.remove(settings);
  }

  async findAll(): Promise<BusinessOwnerSettings[]> {
    return await this.businessOwnerSettingsRepository.find();
  }

  async updateOwnerProfile(
    updateOwnerProfileDto: UpdateOwnerProfileDto,
    owner: User,
    bodyprofileImage: FileUpload,
  ): Promise<User> {
    const profilePictureExist =
      updateOwnerProfileDto.profilePicture?.includes('cloudinary');

    // Profile image upload
    let profileImage;

    if (!profilePictureExist && bodyprofileImage) {
      const folderPath = `KHS/business/owner/${owner.surname}`;

      try {
        const { imageUrl } = await this.businessCloudinaryService.uploadImage(
          bodyprofileImage,
          folderPath,
        );

        profileImage = imageUrl;
      } catch (error) {
        throw new BadRequestException(
          error.message || 'Failed to create client profile image',
        );
      }
    }

    owner.firstName = updateOwnerProfileDto.firstName;
    owner.surname = updateOwnerProfileDto.surname;
    owner.gender = updateOwnerProfileDto.gender;
    owner.phoneNumber = updateOwnerProfileDto.phoneNumber;
    owner.dateOfBirth = updateOwnerProfileDto.dateOfBirth;
    if (profilePictureExist || profileImage) {
      owner.avatarUrl = profilePictureExist
        ? updateOwnerProfileDto.profilePicture
        : profileImage;
    }

    const savedUser = await this.userRepo.save(owner);

    return savedUser;
  }

  async addUserAddresses(
    owner: User,
    createUserAddressDto: CreateUserAddressDto,
  ): Promise<User> {
    owner.addresses = [
      ...(owner.addresses ?? []), // fallback to empty array if undefined/null
      ...(createUserAddressDto.addresses ?? []),
    ];

    return await this.userRepo.save(owner);
  }

  async updateUserAddress(
    owner: User,
    addressId: string,
    updateUserAddressDto: UpdateUserAddressDto,
  ): Promise<User> {
    if (!owner.addresses) owner.addresses = [];

    const index = owner.addresses.findIndex((addr) => addr.id === addressId);

    if (index === -1) {
      throw new BadRequestException('Address not found');
    }

    // Update only the fields provided while keeping the id intact
    owner.addresses[index] = {
      fullAddress: updateUserAddressDto.address.fullAddress,
      type: updateUserAddressDto.address.type,
      id: addressId,
    };

    return await this.userRepo.save(owner);
  }

  async deleteUserAddress(owner: User, addressId: string): Promise<User> {
    if (!owner.addresses || owner.addresses.length === 0) {
      throw new BadRequestException('No addresses found for this user');
    }

    const index = owner.addresses.findIndex((addr) => addr.id === addressId);
    if (index === -1) {
      throw new BadRequestException('Address not found');
    }

    // Remove the address from the array
    owner.addresses = owner.addresses.filter((addr) => addr.id !== addressId);

    // Save the updated user
    return await this.userRepo.save(owner);
  }

  async validateUserProfile(
    profileData: any,
    files: any,
  ): Promise<ApiResponse<boolean>> {
    try {
      const requiredFields = [
        'surname',
        'firstName',
        'phoneNumber',
        'gender',
        'dateOfBirth',
      ];
      const missingFields = requiredFields.filter((field) => {
        const value = profileData[field];

        // Missing entirely, null, undefined
        if (value === undefined || value === null) return true;

        // If value is a string, check after trimming
        if (typeof value === 'string' && value.trim() === '') return true;

        return false;
      });

      if (missingFields.length > 0) {
        return {
          success: false,
          error: 'Profile validation failed',
          data: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
        };
      }

      const profilePictureExist =
        profileData.profilePicture?.includes('cloudinary');

      if (!profilePictureExist) {
        // Validate uploaded image
        const uploadedImage = files?.profileImage;

        if (uploadedImage) {
          if (Array.isArray(uploadedImage)) {
            return {
              success: false,
              error: 'Profile validation failed',
              data: false,
              message: `Multiple images not allowed`,
            };
          }

          const mimetype = uploadedImage.mimetype || uploadedImage.type;

          if (
            mimetype?.startsWith('image/svg') ||
            !mimetype?.startsWith('image')
          ) {
            return {
              success: false,
              error: 'Profile validation failed',
              data: false,
              message: `Invalid image format. Only .jpg, .png, .jpeg allowed`,
            };
          }

          const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 4 MB
          if (uploadedImage.size > MAX_SIZE_BYTES) {
            return {
              success: false,
              error: 'Profile validation failed',
              data: false,
              message: `Image is too large. Maximum allowed size is 10 MB`,
            };
          }
        }
      }

      return {
        success: true,
        data: true,
        message: 'Profile validation successful',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: false,
        error: 'Profile validation failed',
      };
    }
  }
}
