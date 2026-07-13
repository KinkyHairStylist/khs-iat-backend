import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Client, ApiResponse } from '../types/client.types';
import { ClientSchema } from '../entities/client.entity';
import { CreateClientProfileDto } from '../dtos/requests/ClientDto';
import {
  BusinessCloudinaryService,
  FileUpload,
} from './business-cloudinary.service';
import { Business } from '../entities/business.entity';

@Injectable()
export class ClientProfileService {
  constructor(
    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly businessCloudinaryService: BusinessCloudinaryService,
  ) {}

  async createClientProfile(
    profileData: Partial<CreateClientProfileDto>,
    ownerId: string,
    bodyProfileImage: FileUpload,
  ): Promise<ApiResponse<Client>> {
    try {
      const business = await this.businessRepo.findOne({
        where: { ownerId },
      });
      if (!business) {
        return {
          success: false,
          error: 'Business not found',
          message: 'No business found for this user',
        };
      }

      const existingClient = await this.clientRepo.findOne({
        where: { email: profileData.email },
      });

      if (existingClient) {
        return {
          success: false,
          error: 'Client already exists',
          message: 'A client with this email already exists in your business',
        };
      }

      let profileImage;

      const clientName = `${profileData.firstName}-${profileData.lastName}`
        .trim()
        .replace(/\s+/g, '_'); // replace spaces with underscores

      const folderPath = `KHS/business/${ownerId}/clients/${clientName}`;

      if (bodyProfileImage) {
        try {
          const { imageUrl } = await this.businessCloudinaryService.uploadImage(
            bodyProfileImage,
            folderPath,
          );

          profileImage = imageUrl;
        } catch (error) {
          return {
            success: false,
            error: error.message,
            message: error.message || 'Failed to create client profile image',
          };
        }
      }

      const client = await this.clientRepo.save({
        ...profileData,
        profileImage,
        ownerId,
      });

      return {
        success: true,
        data: client,
        message: 'Client profile created successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to create client profile',
      };
    }
  }

  async getClientProfile(
    clientId: string,
    ownerId: string,
  ): Promise<ApiResponse<Client>> {
    try {
      const client = await this.clientRepo.findOne({
        where: {
          id: clientId,
          ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Profile not found',
          message: 'Client profile not found',
        };
      }

      return {
        success: true,
        data: client,
        message: 'Client profile retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client profile',
      };
    }
  }

  async updateClientProfile(
    clientId: string,
    ownerId: string,
    updates: Partial<Client>,
  ): Promise<ApiResponse<Client>> {
    try {
      const result = await this.clientRepo.update(
        { id: clientId, ownerId, isActive: true },
        { ...updates, updatedAt: new Date() },
      );

      // Check if any rows were affected
      if (result.affected === 0) {
        return {
          success: false,
          error: 'Profile not found',
          message: 'Client profile not found',
        };
      }

      // Fetch the updated client to return it
      const client = await this.clientRepo.findOne({
        where: {
          id: clientId,
          ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Profile not found',
          message: 'Client profile not found',
        };
      }

      return {
        success: true,
        data: client,
        message: 'Client profile updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to update client profile',
      };
    }
  }

  async validateClientProfile(
    profileData: any,
    files: any,
    url: string,
  ): Promise<ApiResponse<boolean>> {
    try {
      const requiredFields = [
        'firstName',
        'lastName',
        'email',
        'phone',
        'pronouns',
        'gender',
        'clientType',
        'clientSource',
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

      const existingClient = await this.clientRepo.findOne({
        where: {
          email: profileData.email,
          isActive: true,
        },
      });
      if (existingClient) {
        return {
          success: false,
          error: 'Email already exists',
          data: false,
          message: 'You already have a client with this email',
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

          const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 2 MB
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

      if (!url.includes('update-profile')) {
        // Check if email already exists
        if (profileData.email) {
          const existingClient = await this.clientRepo.findOne({
            where: {
              email: profileData.email,
              isActive: true,
            },
          });
          if (existingClient) {
            return {
              success: false,
              error: 'Email already exists',
              data: false,
              message: 'You already have a client with this email',
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
