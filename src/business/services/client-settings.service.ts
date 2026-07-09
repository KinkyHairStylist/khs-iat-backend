import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiResponse, ClientSettings } from '../types/client.types';
import { ClientSchema } from '../entities/client.entity';
import { ClientSettingsSchema } from '../entities/client-settings.entity';
import {
  CreateClientSettingsDto,
  UpdateClientSettingsDto,
} from '../dtos/requests/ClientDto';
// Update the import path below to match your actual schema file location and name
// OR
// import { ClientAddressModel } from '../schemes/client-address.schema';
// (Choose the correct path and filename based on your project structure)
// Update the import path if the file is named differently or located elsewhere

// OR
// import { ClientModel } from '../schemes/client.schema';
// (Choose the correct path and filename based on your project structure)

@Injectable()
export class ClientSettingsService {
  constructor(
    @InjectRepository(ClientSettingsSchema)
    private readonly clientSettingsRepo: Repository<ClientSettingsSchema>,

    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,
  ) {}

  async addClientSettings(
    clientSettingsData: Partial<CreateClientSettingsDto>,
    ownerId: string,
  ): Promise<ApiResponse<ClientSettings>> {
    try {
      if (!clientSettingsData.clientId) {
        return {
          success: false,
          error: 'Client ID missing',
          message: 'A valid Client ID is required to update settings.',
        };
      }

      // Verify client belongs to owner
      const client = await this.clientRepo.findOne({
        where: {
          id: clientSettingsData.clientId,
          ownerId: ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      const settings = await this.clientSettingsRepo.save(clientSettingsData);
      // const savedAddress = await address.save();

      return {
        success: true,
        data: settings,
        message: 'Settings added successfully',
      };
    } catch (error) {
      console.log(error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to add client settings',
      };
    }
  }

  async updateClientSettings(
    ownerId: string,
    clientId: string,
    settingsData: UpdateClientSettingsDto,
  ): Promise<ApiResponse<UpdateClientSettingsDto>> {
    try {
      const { id, ...updates } = settingsData;
      // const business = await this.businessRepo.findOne({
      //   where: { owner: { id: ownerId } },
      // });
      // if (!business) {
      //   return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //   };
      // }

      // if (!id) {
      //   return {
      //     success: false,
      //     error: 'Settings ID required',
      //     message: 'Settings ID required',
      //   };
      // }

      if (!clientId) {
        return {
          success: false,
          error: 'clientId ID is missing',
          message: 'clientId ID is missing',
        };
      }

      // Verify client belongs to owner
      const client = await this.clientRepo.findOne({
        where: {
          id: clientId,
          ownerId: ownerId,
          isActive: true,
        },
      });

      if (!client) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      // Check if all fields are undefined
      const hasUpdates = Object.values(updates).some(
        (value) => value !== undefined,
      );

      if (!hasUpdates) {
        // No updates provided
        return {
          success: true,
          data: settingsData,
          message: 'No changes made to client preferences.',
        };
      }

      const existingSettings = await this.clientSettingsRepo.findOne({
        where: { clientId },
      });

      if (!existingSettings) {
        return {
          success: false,
          error: 'Client Settings not found',
          message: 'Client Settings not found for this client',
          data: undefined,
        };
      }

      // Merge updates, including nested preferences
      const mergedSettings = {
        ...existingSettings,
        ...updates,
        preferences: {
          ...existingSettings.preferences,
          ...(updates.preferences || {}),
        },
        updatedAt: new Date(),
      };

      // Save updated settings
      const updatedSettings =
        await this.clientSettingsRepo.save(mergedSettings);

      return {
        success: true,
        message: 'Client settings updated successfully',
        data: updatedSettings,
      };
    } catch (error) {
      console.error('Update client error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to update client',
      };
    }
  }
}
