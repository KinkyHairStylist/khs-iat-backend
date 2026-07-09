// services/emergency-contact.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmergencyContact, ApiResponse } from '../types/client.types';
import { ClientSchema } from '../entities/client.entity';
import { EmergencyContactSchema } from '../entities/emergency-contact-schema.entity';
import { UpdateEmergencyContactDto } from '../dtos/requests/ClientDto';

@Injectable()
export class EmergencyContactService {
  constructor(
    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,

    @InjectRepository(EmergencyContactSchema)
    private readonly emergencyContactRepo: Repository<EmergencyContactSchema>,
  ) {}

  async addEmergencyContact(
    contactData: Omit<EmergencyContact, 'id' | 'createdAt' | 'updatedAt'>,
    ownerId: string,
  ): Promise<ApiResponse<EmergencyContact>> {
    try {
      if (!contactData.clientId) {
        return {
          success: false,
          error: 'Client ID missing',
          message: 'Each contact must include a valid Client ID',
        };
      }

      // Verify client belongs to owner
      const client = await this.clientRepo.findOne({
        where: {
          id: contactData.clientId,
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

      const placeholderEmergencyContact =
        await this.emergencyContactRepo.findOne({
          where: {
            clientId: contactData.clientId,
            firstName: 'No Name',
          },
        });

      if (placeholderEmergencyContact) {
        await this.emergencyContactRepo.delete(placeholderEmergencyContact.id);
      }

      const newContact = this.emergencyContactRepo.create({
        ...contactData,
        id: undefined,
      });

      const contact = await this.emergencyContactRepo.save(newContact);

      return {
        success: true,
        data: contact,
        message: 'Emergency contact added successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to add emergency contact',
      };
    }
  }

  async getEmergencyContacts(
    clientId: string,
    ownerId: string,
  ): Promise<ApiResponse<EmergencyContact[]>> {
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

      const contacts = await this.emergencyContactRepo.findBy({
        clientId,
      });

      return {
        success: true,
        data: contacts,
        message: 'Emergency contacts retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch emergency contacts',
      };
    }
  }

  async updateEmergencyContact(
    contactData: UpdateEmergencyContactDto,
    ownerId: string,
  ): Promise<ApiResponse<UpdateEmergencyContactDto>> {
    try {
      const { id, clientId, ...updates } = contactData;

      if (!clientId) {
        return {
          success: false,
          error: 'Client ID missing',
          message: 'Each contact must include a valid Client ID',
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

      let existingContact;

      if (id && id !== '') {
        // Find the contact to update
        existingContact = await this.emergencyContactRepo.findOne({
          where: { id, clientId },
        });

        if (!existingContact) {
          return {
            success: false,
            error: 'Contact not found',
            message: 'Emergency contact not found for this client',
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
          data: contactData,
          message: 'No changes made to the emergency contact',
        };
      }

      // Perform the update
      const updatedContact = await this.emergencyContactRepo.save({
        ...(existingContact || {}),
        clientId,
        ...updates,
        updatedAt: new Date(),
      });

      return {
        success: true,
        data: updatedContact,
        message: 'Emergency contact updated successfully',
      };
    } catch (error) {
      console.log(error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to update emergency contact',
      };
    }
  }
}
