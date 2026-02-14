import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import {
  UpdateBookingDayDto,
  UpdateBookingDaysDto,
  UpdateBusinessContactDto,
  UpdateBusinessLocationDto,
  UpdateBusinessNameDto,
  UpdateBusinessProfileDto,
} from '../dtos/requests/BusinessSettingsDto';
import { BookingDay } from '../entities/booking-day.entity';
import { BusinessCloudinaryService } from './business-cloudinary.service';
import { ApiResponse } from '../types/client.types';

@Injectable()
export class BusinessSettingsService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(BookingDay)
    private readonly bookingDayRepository: Repository<BookingDay>,
    private readonly businessCloudinaryService: BusinessCloudinaryService,
  ) {}

  /**
   * Get business profile by owner ID
   */
  async getBusinessProfileByOwnerId(ownerId: string): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { ownerId },
      relations: [
        'owner',
        'service',
        'bookingPolicies',
        'bookingHours',
        'staff',
        'wallet',
        'ownerSettings',
      ],
    });

    if (!business) {
      throw new NotFoundException(
        `Business not found for owner ID: ${ownerId}`,
      );
    }

    return business;
  }

  /**
   * Create business Image
   */
  async addBusinessImage(
    ownerId: string,
    businessId: string,
    images: any[], // now always array
  ) {
    const business = await this.findBusinessByIdAndOwner(businessId, ownerId);

    const existingImages: string[] = business.businessImage || [];
    const MAX_IMAGES = 4;

    // Check max before upload
    if (existingImages.length + images.length > MAX_IMAGES) {
      throw new BadRequestException(
        `You can only upload ${MAX_IMAGES} business images in total`,
      );
    }

    const folderPath = `KHS/business/${business.businessName}/businessImage`;

    const uploadedUrls: string[] = [];

    try {
      for (const file of images) {
        const { imageUrl } =
          await this.businessCloudinaryService.uploadBusinessImage(
            file,
            folderPath,
          );
        uploadedUrls.push(imageUrl);
      }
    } catch (error) {
      // ❗ Optional: rollback already uploaded Cloudinary images
      // for (const url of uploadedUrls) {
      //   await this.businessCloudinaryService.deleteImage(url);
      // }
      throw new BadRequestException(
        error.message || 'Failed to upload some images',
      );
    }

    // Append to existing
    business.businessImage = [...existingImages, ...uploadedUrls];

    const newBusiness = await this.businessRepository.save(business);

    return {
      business: newBusiness,
      newUploads: uploadedUrls.length,
    };
  }

  async deleteBusinessImage(
    ownerId: string,
    businessId: string,
    imageUrl: string,
  ): Promise<Business> {
    const business = await this.findBusinessByIdAndOwner(businessId, ownerId);

    if (!business.businessImage || !business.businessImage.length) {
      throw new BadRequestException('No images found');
    }

    const imageIndex = business.businessImage.indexOf(imageUrl);

    if (imageIndex === -1) {
      throw new NotFoundException('Image not found in business');
    }

    // Extract publicId from Cloudinary URL
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const publicId = filename.split('.')[0]; // remove extension

    try {
      await this.businessCloudinaryService.deleteBusinessImage(
        `KHS/business/${business.businessName}/businessImage/${publicId}`,
      );
    } catch (error) {
      console.error('Cloudinary deletion failed:', error);
    }

    // Remove from array
    business.businessImage.splice(imageIndex, 1);

    return await this.businessRepository.save(business);
  }

  async validateBusinesImageUpload(
    businessData: any,
    files: any,
  ): Promise<ApiResponse<boolean>> {
    try {
      const uploadedImages = files?.businessImage;

      // Always ensure existingImages is an array
      const existingImagesRaw = businessData?.businessImageExisting;

      // Normalize to array even if single string
      const existingImages: string[] = Array.isArray(existingImagesRaw)
        ? existingImagesRaw
        : existingImagesRaw
          ? [existingImagesRaw]
          : [];

      if (uploadedImages) {
        // Normalize into array (your middleware sends either object or array)
        const imagesArr = Array.isArray(uploadedImages)
          ? uploadedImages
          : [uploadedImages];

        // Validate count max - 4 including existing images
        if (existingImages.length + imagesArr.length > 4) {
          return {
            success: false,
            error: 'Image validation failed',
            data: false,
            message: `Maximum 4 images allowed`,
          };
        }

        const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MBs

        for (const img of imagesArr) {
          const mimetype = img.mimetype || img.type;

          console.log('IMAGE SIZE: ', img.size);

          if (
            mimetype?.startsWith('image/svg') ||
            !mimetype?.startsWith('image')
          ) {
            return {
              success: false,
              error: 'Image validation failed',
              data: false,
              message: `Invalid image format. Only .jpg, .png, .jpeg allowed`,
            };
          }

          if (img.size > MAX_SIZE_BYTES) {
            return {
              success: false,
              error: 'Image validation failed',
              data: false,
              message: `Image is too large. Max. 24MB allowed`,
            };
          }
        }
      } else {
        return {
          success: false,
          error: 'No changes made to business image',
          data: false,
          message: 'No changes made to business images',
        };
      }

      return {
        success: true,
        data: true,
        message: 'Business Image validation successful',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: false,
        error: 'Business Image validation failed',
      };
    }
  }

  /**
   * Get multiple businesses by owner ID (if owner has multiple businesses)
   */
  async getBusinessesByOwnerId(ownerId: string): Promise<Business[]> {
    const businesses = await this.businessRepository.find({
      where: { ownerId },
      relations: [
        'owner',
        'service',
        'bookingPolicies',
        'bookingHours',
        'staff',
        'wallet',
        'ownerSettings',
      ],
    });

    if (!businesses || businesses.length === 0) {
      throw new NotFoundException(
        `No businesses found for owner ID: ${ownerId}`,
      );
    }

    return businesses;
  }

  /**
   * Update business name and description
   */
  async updateBusinessNameAndDescription(
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessNameDto,
  ): Promise<Business> {
    const business = await this.findBusinessByIdAndOwner(businessId, ownerId);

    if (updateDto.businessName !== undefined) {
      business.businessName = updateDto.businessName.trim();
    }

    if (updateDto.description !== undefined) {
      business.description = updateDto.description.trim();
    }

    return await this.businessRepository.save(business);
  }

  /**
   * Update business contact information
   */
  async updateBusinessContact(
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessContactDto,
  ): Promise<Business> {
    const business = await this.findBusinessByIdAndOwner(businessId, ownerId);

    if (updateDto.ownerName !== undefined) {
      business.ownerName = updateDto.ownerName.trim();
    }

    if (updateDto.ownerEmail !== undefined) {
      // Basic email validation
      if (!this.isValidEmail(updateDto.ownerEmail)) {
        throw new BadRequestException('Invalid email format');
      }
      business.ownerEmail = updateDto.ownerEmail.toLowerCase().trim();
    }

    if (updateDto.ownerPhone !== undefined) {
      business.ownerPhone = updateDto.ownerPhone.trim();
    }

    return await this.businessRepository.save(business);
  }

  /**
   * Update business location
   */
  async updateBusinessLocation(
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessLocationDto,
  ): Promise<Business> {
    const business = await this.findBusinessByIdAndOwner(businessId, ownerId);

    if (updateDto.businessAddress !== undefined) {
      business.businessAddress = updateDto.businessAddress.trim();
    }

    if (updateDto.latitude !== undefined) {
      if (updateDto.latitude < -90 || updateDto.latitude > 90) {
        throw new BadRequestException('Latitude must be between -90 and 90');
      }
      business.latitude = updateDto.latitude;
    }

    if (updateDto.longitude !== undefined) {
      if (updateDto.longitude < -180 || updateDto.longitude > 180) {
        throw new BadRequestException('Longitude must be between -180 and 180');
      }
      business.longitude = updateDto.longitude;
    }

    return await this.businessRepository.save(business);
  }

  /**
   * Edit complete business profile (combined update)
   */
  async editBusinessProfile(
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessProfileDto,
  ): Promise<Business> {
    const business = await this.findBusinessByIdAndOwner(businessId, ownerId);

    // Update basic information
    if (updateDto.businessName !== undefined) {
      business.businessName = updateDto.businessName.trim();
    }

    if (updateDto.description !== undefined) {
      business.description = updateDto.description.trim();
    }

    if (updateDto.category !== undefined) {
      // Handle category as array - split by comma and trim each value
      const categoryArray = Array.isArray(updateDto.category) 
        ? updateDto.category 
        : updateDto.category.split(',').map(cat => cat.trim());
      business.category = categoryArray;
    }

    if (updateDto.primaryAudience !== undefined) {
      business.primaryAudience = updateDto.primaryAudience.trim();
    }

    // Update contact information
    if (updateDto.ownerName !== undefined) {
      business.ownerName = updateDto.ownerName.trim();
    }

    if (updateDto.ownerEmail !== undefined) {
      if (!this.isValidEmail(updateDto.ownerEmail)) {
        throw new BadRequestException('Invalid email format');
      }
      business.ownerEmail = updateDto.ownerEmail.toLowerCase().trim();
    }

    if (updateDto.ownerPhone !== undefined) {
      business.ownerPhone = updateDto.ownerPhone.trim();
    }

    // Update location
    if (updateDto.businessAddress !== undefined) {
      business.businessAddress = updateDto.businessAddress.trim();
    }

    if (updateDto.latitude !== undefined) {
      if (updateDto.latitude < -90 || updateDto.latitude > 90) {
        throw new BadRequestException('Latitude must be between -90 and 90');
      }
      business.latitude = updateDto.latitude;
    }

    if (updateDto.longitude !== undefined) {
      if (updateDto.longitude < -180 || updateDto.longitude > 180) {
        throw new BadRequestException('Longitude must be between -180 and 180');
      }
      business.longitude = updateDto.longitude;
    }

    // Update services array if provided
    if (updateDto.services !== undefined) {
      business.service = updateDto.services;
    }

    return await this.businessRepository.save(business);
  }

  /**
   * Update a single booking day
   */
  async updateBookingDay(
    bookingDayId: string,
    businessId: string,
    ownerId: string,
    updateDto: UpdateBookingDayDto,
  ): Promise<BookingDay> {
    // Verify business ownership
    await this.verifyBusinessOwnership(businessId, ownerId);

    const bookingDay = await this.bookingDayRepository.findOne({
      where: { id: bookingDayId },
      relations: ['business'],
    });

    if (!bookingDay) {
      throw new NotFoundException(
        `Booking day with ID ${bookingDayId} not found`,
      );
    }

    if (bookingDay.business.id !== businessId) {
      throw new BadRequestException(
        'Booking day does not belong to this business',
      );
    }

    // Update fields
    if (updateDto.day !== undefined) {
      bookingDay.day = updateDto.day;
    }

    if (updateDto.isOpen !== undefined) {
      bookingDay.isOpen = updateDto.isOpen;
    }

    if (updateDto.startTime !== undefined) {
      this.validateTimeFormat(updateDto.startTime);
      bookingDay.startTime = updateDto.startTime;
    }

    if (updateDto.endTime !== undefined) {
      this.validateTimeFormat(updateDto.endTime);
      bookingDay.endTime = updateDto.endTime;
    }

    // Validate start time is before end time
    if (bookingDay.startTime && bookingDay.endTime) {
      this.validateTimeRange(bookingDay.startTime, bookingDay.endTime);
    }

    return await this.bookingDayRepository.save(bookingDay);
  }

  /**
   * Update multiple booking days at once
   */
  async updateBookingDays(
    businessId: string,
    ownerId: string,
    updateDto: UpdateBookingDaysDto,
  ): Promise<BookingDay[]> {
    // Verify business ownership
    await this.verifyBusinessOwnership(businessId, ownerId);

    const updatedDays: BookingDay[] = [];

    for (const dayUpdate of updateDto.bookingDays) {
      const bookingDay = await this.bookingDayRepository.findOne({
        where: { id: dayUpdate.id },
        relations: ['business'],
      });

      if (!bookingDay) {
        throw new NotFoundException(
          `Booking day with ID ${dayUpdate.id} not found`,
        );
      }

      if (bookingDay.business.id !== businessId) {
        throw new BadRequestException(
          `Booking day ${dayUpdate.id} does not belong to this business`,
        );
      }

      // Update fields
      if (dayUpdate.day !== undefined) {
        bookingDay.day = dayUpdate.day;
      }

      if (dayUpdate.isOpen !== undefined) {
        bookingDay.isOpen = dayUpdate.isOpen;
      }

      if (dayUpdate.startTime !== undefined) {
        this.validateTimeFormat(dayUpdate.startTime);
        bookingDay.startTime = dayUpdate.startTime;
      }

      if (dayUpdate.endTime !== undefined) {
        this.validateTimeFormat(dayUpdate.endTime);
        bookingDay.endTime = dayUpdate.endTime;
      }

      // Validate time range
      if (bookingDay.startTime && bookingDay.endTime) {
        this.validateTimeRange(bookingDay.startTime, bookingDay.endTime);
      }

      updatedDays.push(bookingDay);
    }

    return await this.bookingDayRepository.save(updatedDays);
  }

  /**
   * Toggle booking day availability
   */
  async toggleBookingDayAvailability(
    bookingDayId: string,
    businessId: string,
    ownerId: string,
  ): Promise<BookingDay> {
    await this.verifyBusinessOwnership(businessId, ownerId);

    const bookingDay = await this.bookingDayRepository.findOne({
      where: { id: bookingDayId },
      relations: ['business'],
    });

    if (!bookingDay) {
      throw new NotFoundException(
        `Booking day with ID ${bookingDayId} not found`,
      );
    }

    if (bookingDay.business.id !== businessId) {
      throw new BadRequestException(
        'Booking day does not belong to this business',
      );
    }

    bookingDay.isOpen = !bookingDay.isOpen;
    return await this.bookingDayRepository.save(bookingDay);
  }

  /**
   * Verify business ownership
   */
  private async verifyBusinessOwnership(
    businessId: string,
    ownerId: string,
  ): Promise<void> {
    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    if (business.ownerId !== ownerId) {
      throw new BadRequestException(
        'You do not have permission to update this business',
      );
    }
  }

  /**
   * Validate time format (HH:MM)
   */
  private validateTimeFormat(time: string): void {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      throw new BadRequestException(
        `Invalid time format: ${time}. Expected format: HH:MM (24-hour)`,
      );
    }
  }

  /**
   * Validate start time is before end time
   */
  private validateTimeRange(startTime: string, endTime: string): void {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      throw new BadRequestException('Start time must be before end time');
    }
  }

  /**
   * Helper method to find business by ID and verify ownership
   */
  private async findBusinessByIdAndOwner(
    businessId: string,
    ownerId: string,
  ): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    if (business.ownerId !== ownerId) {
      throw new BadRequestException(
        'You do not have permission to update this business',
      );
    }

    return business;
  }

  /**
   * Helper method for email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
