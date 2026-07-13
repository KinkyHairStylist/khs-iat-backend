import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientAddress, ApiResponse } from '../types/client.types';
import { ClientAddressSchema } from '../entities/client-address.entity';
import { ClientSchema } from '../entities/client.entity';
import { UpdateClientAddressDto } from '../dtos/requests/ClientDto';
// Update the import path below to match your actual schema file location and name
// OR
// import { ClientAddressModel } from '../schemes/client-address.schema';
// (Choose the correct path and filename based on your project structure)
// Update the import path if the file is named differently or located elsewhere

// OR
// import { ClientModel } from '../schemes/client.schema';
// (Choose the correct path and filename based on your project structure)

@Injectable()
export class ClientAddressService {
  constructor(
    @InjectRepository(ClientAddressSchema)
    private readonly clientAddressRepo: Repository<ClientAddressSchema>,

    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,
  ) {}

  async addClientAddress(
    addressData: Omit<ClientAddress, 'id' | 'createdAt' | 'updatedAt'>,
    ownerId: string,
  ): Promise<ApiResponse<ClientAddress>> {
    try {
      if (!addressData.clientId) {
        return {
          success: false,
          error: 'Client ID missing',
          message: 'Each address must include a valid Client ID',
        };
      }

      // Verify client belongs to owner
      const client = await this.clientRepo.findOne({
        where: {
          id: addressData.clientId,
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

      const placeholderAddress = await this.clientAddressRepo.findOne({
        where: {
          clientId: addressData.clientId,
          addressName: 'No address',
        },
      });

      if (placeholderAddress) {
        await this.clientAddressRepo.delete(placeholderAddress.id);
      }

      // If this is set as primary, unset other primary addresses
      // if (addressData.isPrimary) {
      //   await this.clientAddressRepo.update(
      //     { clientId: addressData.clientId, isPrimary: true },
      //     { isPrimary: false },
      //   );
      // }

      const newAddress = this.clientAddressRepo.create({
        ...addressData,
        id: undefined,
      });

      const address = await this.clientAddressRepo.save(newAddress);

      return {
        success: true,
        data: address,
        message: 'Address added successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to add client address',
      };
    }
  }

  async updateClientAddress(
    addressData: UpdateClientAddressDto,
    ownerId: string,
  ): Promise<ApiResponse<UpdateClientAddressDto>> {
    try {
      const { id, clientId, ...updates } = addressData;

      if (!clientId) {
        return {
          success: false,
          error: 'Client ID missing',
          message: 'Each address must include a valid Client ID',
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

      let existingAddress;

      if (id && id !== '') {
        // Find the address to update
        existingAddress = await this.clientAddressRepo.findOne({
          where: { id, clientId },
        });

        if (!existingAddress) {
          return {
            success: false,
            error: 'Address not found',
            message: 'Address not found for this client',
          };
        }
      }

      // Check if there are any actual updates
      const hasUpdates = Object.values(updates).some(
        (value) => value !== undefined,
      );
      if (!hasUpdates) {
        return {
          success: true,
          data: addressData,
          message: 'No changes made to the client addresses',
        };
      }

      // Perform the update

      // Perform the update
      const updatedAddress = await this.clientAddressRepo.save({
        ...(existingAddress || {}),
        clientId,
        ...updates,
        updatedAt: new Date(),
      });

      return {
        success: true,
        data: updatedAddress,
        message: 'Contact Address updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to update Contact Address',
      };
    }
  }

  async getClientAddresses(
    clientId: string,
    ownerId: string,
  ): Promise<ApiResponse<ClientAddress[]>> {
    try {
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

      const addresses = await this.clientAddressRepo.findBy({
        clientId,
      });

      return {
        success: true,
        data: addresses,
        message: 'Addresses retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client addresses',
      };
    }
  }
}
