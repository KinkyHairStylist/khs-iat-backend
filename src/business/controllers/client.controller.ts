import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientService } from '../services/client.service';
import { ClientProfileService } from '../services/client-profile.service';
import { ClientAddressService } from '../services/client-address.service';
import { EmergencyContactService } from '../services/emergency-contact.service';
import {
  UpdateClientDto,
  ClientFiltersDto,
  CreateClientAddressDto,
  CreateEmergencyContactDto,
  CreateClientSettingsDto,
  CreateClientProfileDto,
  UpdateEmergencyContactDto,
  UpdateClientAddressDto,
  UpdateClientSettingsDto,
} from '../dtos/requests/ClientDto';
import { ClientFormData } from '../types/client.types';
import { ClientType } from '../entities/client.entity';
import { PreferredContactMethod } from '../entities/client-settings.entity';
import { ClientSettingsService } from '../services/client-settings.service';
import { Roles } from 'src/middleware/roles.decorator';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Business Clients')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant, Role.Staff)
@Controller('clients')
@UsePipes(new ValidationPipe({ transform: true }))
export class ClientController {
  constructor(
    private readonly clientService: ClientService,
    private readonly clientProfileService: ClientProfileService,
    private readonly clientAddressService: ClientAddressService,
    private readonly emergencyContactService: EmergencyContactService,
    private readonly clientSettingsService: ClientSettingsService,
  ) {}

  @Delete('/clear')
  async deleteAllClients() {
    await this.clientService.clearAllClients();
  }

  @Post()
  async createClient(@Request() req) {
    const body = req.body;

    const isEmailValid: RegExp =
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!isEmailValid.test(body.email)) {
      throw new HttpException(
        'Email is not valid. Please enter a valid email',
        HttpStatus.BAD_REQUEST,
      );
    }

    const files = req.files;
    if (files?.profileImage) {
      body.profileImage = files.profileImage;
    }
    const bodyProfileImage = body.profileImage;

    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Transform the data to match ClientFormData exactly
    const clientFormData: ClientFormData = {
      profile: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        occupation: body.occupation,
        clientType: body.clientType,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        gender: body.gender,
        pronouns: body.pronouns,
        clientSource: body.clientSource,
        phoneCode: body.phoneCode,
      },
      settings: {
        emailNotifications: body?.emailNotifications || false,
        smsNotifications: body?.smsNotifications || false,
        marketingEmails: body?.marketingEmails || false,
        notes: body?.notes || undefined,
        preferences: {
          preferredContactMethod:
            body?.preferences?.preferredContactMethod ??
            PreferredContactMethod.EMAIL,
          language: body?.preferences?.language || 'en',
          timezone: body?.preferences?.timezone || 'UTC',
        },
      },
    };

    const result = await this.clientService.createClient(
      clientFormData,
      ownerId,
      bodyProfileImage,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Get()
  async getClients(@Request() req, @Query() filters: ClientFiltersDto) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientService.getClients(ownerId, filters);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Get('/list')
  async getClientsListMessaging(@Request() req) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientService.getClientsList(ownerId);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Get('/client/search')
  async searchClients(
    @Request() req,
    @Query('q') query: string,
    @Query() filters: ClientFiltersDto,
  ) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Validate clientType to match allowed values
    const allowedTypes: ClientType[] = [];
    const clientType: (typeof allowedTypes)[number] | undefined =
      allowedTypes.includes(filters.clientType as any)
        ? (filters.clientType as (typeof allowedTypes)[number])
        : undefined;

    // Ensure sortOrder is "asc", "desc", or undefined
    const allowedSortOrders = ['asc', 'desc'] as const;
    const sortOrder: (typeof allowedSortOrders)[number] | undefined =
      filters.sortOrder && allowedSortOrders.includes(filters.sortOrder as any)
        ? (filters.sortOrder as (typeof allowedSortOrders)[number])
        : undefined;

    const result = await this.clientService.getClients(ownerId, {
      ...filters,
      clientType,
      search: query,
      sortOrder,
    });

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Get('/client/:clientId')
  async getClientDetails(@Request() req, @Param('clientId') clientId: string) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientService.getClientDetails(clientId, ownerId);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Delete('/client/:clientId')
  async deleteClient(@Request() req, @Param('clientId') clientId: string) {
    const ownerId = req.user._id || req.user.userId;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientService.deleteClient(clientId, ownerId);

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Post('/client/profile')
  async createClientProfile(
    @Request() req,
    @Body() profileData: CreateClientProfileDto,
  ) {
    const body = req.body;
    const files = req.files;
    if (files?.profileImage) {
      body.profileImage = files.profileImage;
    }
    const bodyProfileImage = body.profileImage;

    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientProfileService.createClientProfile(
      profileData,
      ownerId,
      bodyProfileImage,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Get('/client/:clientId/profile')
  async getClientProfile(@Request() req, @Param('clientId') clientId: string) {
    const ownerId = req.user._id || req.user.userId;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientProfileService.getClientProfile(
      clientId,
      ownerId,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  // @Post('/client/validate/profile')
  // async validateClientProfile(@Body() profileData: any) {
  //   const result =
  //     await this.clientProfileService.validateClientProfile(profileData);

  //   if (!result.success) {
  //     throw new HttpException(
  //       { message: result.message, error: result.error },
  //       HttpStatus.BAD_REQUEST,
  //     );
  //   }

  //   return result;
  // }

  @Post('/client/addresses')
  async addClientAddress(
    @Request() req,
    @Body() body: { addresses: CreateClientAddressDto[] },
  ) {
    const ownerId = req.user.id || req.user.sub;

    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (
      !body.addresses ||
      !Array.isArray(body.addresses) ||
      body.addresses.length === 0
    ) {
      throw new HttpException(
        'Addresses array is required and must not be empty',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Optional: Limit to 2 addresses
    if (body.addresses.length > 2) {
      throw new HttpException(
        'Maximum 2 addresses allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate each address
    body.addresses.forEach((address, index) => {
      if (!address.addressLine1 || !address.addressLine1.trim()) {
        throw new HttpException(
          `Address name is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!address.location || !address.location.trim()) {
        throw new HttpException(
          `Address location is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    // Transform address data to match ClientAddress type

    const transformedAddresses = body.addresses.map((addressData) => ({
      clientId: addressData.clientId,
      addressName: addressData.addressName,
      addressLine1: addressData.addressLine1,
      addressLine2: addressData.addressLine2 ? addressData.addressLine2 : null,
      location: addressData.location,
      city: addressData.city || null,
      state: addressData.state || '',
      zipCode: addressData.zipCode || '',
      country: addressData.country || '',
      isPrimary: addressData.isPrimary || false,
    }));

    // Process all addresses
    const results = await Promise.all(
      transformedAddresses.map((address) =>
        this.clientAddressService.addClientAddress(address as any, ownerId),
      ),
    );

    // Check if any failed
    const failedResults = results.filter((result) => !result.success);

    if (failedResults.length > 0) {
      const combinedMessage = failedResults.map((r) => r.message).join('; '); // Add separator

      throw new HttpException(
        {
          message: combinedMessage, // âœ… FINAL message shown to the user
          errors: failedResults.map((r) => ({
            message: r.message,
            error: r.error,
          })),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Collect all successfully saved addresses
    const savedAddresses = results
      .filter((r) => r.success && r.data)
      .map((r) => r.data);

    const savedCount = savedAddresses.length;
    return {
      success: true,
      message:
        savedCount === 1
          ? 'Address added successfully'
          : `${savedCount} addresses added successfully`,
      data: savedAddresses,
    };
  }

  @Patch('/client/addresses/:clientId')
  async updateClientAddresess(
    @Request() req,
    @Param('clientId') clientId: string,
    @Body() body: { addresses: UpdateClientAddressDto[] },
  ) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Optional: Limit to 2 contacts
    if (body.addresses.length > 2) {
      throw new HttpException(
        'Maximum 2 addresses allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate each contact
    body.addresses.forEach((address, index) => {
      if (!clientId || !clientId.trim()) {
        throw new HttpException(`Client ID is missing`, HttpStatus.BAD_REQUEST);
      }

      if (!address.addressName || !address.addressName.trim()) {
        throw new HttpException(
          `Address name is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!address.location || !address.location.trim()) {
        throw new HttpException(
          `Address location is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    // Transform contacts to match service input
    const transformedAddresses = body.addresses.map((addressData) => ({
      id: addressData.id,
      clientId: clientId,
      addressName: addressData.addressName,
      addressLine1: addressData.addressLine1,
      addressLine2: addressData.addressLine2 ? addressData.addressLine2 : null,
      location: addressData.location,
      city: addressData.city,
      state: addressData.state || '',
      zipCode: addressData.zipCode || '',
      country: addressData.country || '',
      isPrimary: addressData.isPrimary || false,
    }));

    // Update contacts via service
    const results = await Promise.all(
      transformedAddresses.map((address) =>
        this.clientAddressService.updateClientAddress(address, ownerId),
      ),
    );

    // Handle failed updates
    const failedResults = results.filter((result) => !result.success);
    if (failedResults.length > 0) {
      const combinedMessage = failedResults.map((r) => r.message).join('; ');
      throw new HttpException(
        {
          message: combinedMessage,
          errors: failedResults.map((r) => ({
            message: r.message,
            error: r.error,
          })),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Return successfully updated contacts
    const updatedAddresses = results
      .filter((r) => r.success && r.data)
      .map((r) => r.data);

    if (updatedAddresses.length === 0) {
      return {
        success: false,
        error: 'No updates provided',
        message: 'No changes made to contact addresses',
      };
    } else {
      const updatedCount = updatedAddresses.length;
      return {
        success: true,
        message:
          updatedCount === 1
            ? 'Address updated successfully'
            : `${updatedCount} addresses updated successfully`,
        data: updatedAddresses,
      };
    }
  }

  @Get('/client/:clientId/addresses')
  async getClientAddresses(
    @Request() req,
    @Param('clientId') clientId: string,
  ) {
    const ownerId = req.user._id || req.user.userId;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientAddressService.getClientAddresses(
      clientId,
      ownerId,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Post('/client/emergency-contacts')
  async addEmergencyContact(
    @Request() req,
    @Body() body: { contactsData: CreateEmergencyContactDto[] },
  ) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (
      !body.contactsData ||
      !Array.isArray(body.contactsData) ||
      body.contactsData.length === 0
    ) {
      throw new HttpException(
        'Emergency Contacts array is required and must not be empty',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Optional: Limit to 2 addresses
    if (body.contactsData.length > 2) {
      throw new HttpException(
        'Maximum 2 emergency contacts allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate each address
    body.contactsData.forEach((contact, index) => {
      if (!contact.firstName || !contact.firstName.trim()) {
        throw new HttpException(
          `contact First Name is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!contact.email || !contact.email.trim()) {
        throw new HttpException(
          `contact Email is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!contact.phone || !contact.phone.trim()) {
        throw new HttpException(
          `Enter contact valid phone number`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!contact.relationship || !contact.relationship.trim()) {
        throw new HttpException(
          `Specify Relationship with contact`,
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    // Transform address data to match Contact type
    const transformedContacts = body.contactsData.map((contactData) => ({
      clientId: contactData.clientId,
      firstName: contactData.firstName,

      lastName: contactData.lastName,

      email: contactData.email,

      relationship: contactData.relationship,

      phone: contactData.phone,
      emergencyPhoneCode: contactData.emergencyPhoneCode,
    }));

    // Process all contacts
    const results = await Promise.all(
      transformedContacts.map((contact) =>
        this.emergencyContactService.addEmergencyContact(
          contact as any,
          ownerId,
        ),
      ),
    );

    // Check if any failed
    const failedResults = results.filter((result) => !result.success);

    if (failedResults.length > 0) {
      const combinedMessage = failedResults.map((r) => r.message).join('; '); // Add separator

      throw new HttpException(
        {
          message: combinedMessage, // âœ… FINAL message shown to the user
          errors: failedResults.map((r) => ({
            message: r.message,
            error: r.error,
          })),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    // Collect all successfully saved addresses
    const savedContacts = results
      .filter((r) => r.success && r.data)
      .map((r) => r.data);

    return {
      success: true,
      message: `${savedContacts.length} contact(es) added successfully`,
      data: savedContacts,
    };
  }

  @Patch('/client/emergency-contacts/:clientId')
  async updateEmergencyContact(
    @Request() req,
    @Param('clientId') clientId: string,
    @Body() body: { contactsData: UpdateEmergencyContactDto[] },
  ) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Optional: Limit to 2 contacts
    if (body.contactsData.length > 2) {
      throw new HttpException(
        'Maximum 2 emergency contacts allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate each contact
    body.contactsData.forEach((contact, index) => {
      if (!clientId || !clientId.trim()) {
        throw new HttpException(`Client ID is missing`, HttpStatus.BAD_REQUEST);
      }

      if (!contact.firstName || !contact.firstName.trim()) {
        throw new HttpException(
          `contact First Name is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!contact.email || !contact.email.trim()) {
        throw new HttpException(
          `contact Email is missing`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!contact.phone || !contact.phone.trim()) {
        throw new HttpException(
          `Enter contact valid phone number`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!contact.relationship || !contact.relationship.trim()) {
        throw new HttpException(
          `Specify Relationship with contact`,
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    // Transform contacts to match service input
    const transformedContacts = body.contactsData.map((contactData) => ({
      id: contactData.id,
      clientId: clientId,
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      email: contactData.email,
      relationship: contactData.relationship,
      phone: contactData.phone,
      emergencyPhoneCode: contactData.emergencyPhoneCode,
    }));

    // Update contacts via service
    const results = await Promise.all(
      transformedContacts.map((contact) =>
        this.emergencyContactService.updateEmergencyContact(contact, ownerId),
      ),
    );

    // Handle failed updates
    const failedResults = results.filter((result) => !result.success);
    if (failedResults.length > 0) {
      const combinedMessage = failedResults.map((r) => r.message).join('; ');
      throw new HttpException(
        {
          message: combinedMessage,
          errors: failedResults.map((r) => ({
            message: r.message,
            error: r.error,
          })),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Return successfully updated contacts
    const updatedContacts = results
      .filter((r) => r.success && r.data)
      .map((r) => r.data);

    if (updatedContacts.length === 0) {
      return {
        success: false,
        error: 'No updates provided',
        message: 'No changes made to the emergency contact',
      };
    } else {
      return {
        success: true,
        message: `${updatedContacts.length} contact(es) updated successfully`,
        data: updatedContacts,
      };
    }
  }

  @Get('/client/:clientId/emergency-contacts')
  async getEmergencyContacts(
    @Request() req,
    @Param('clientId') clientId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const ownerId = req.user._id || req.user.userId;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.emergencyContactService.getEmergencyContacts(
      clientId,
      ownerId,
      Number(page),
      Number(limit),
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Post('/client/settings')
  async addClientSettings(
    @Request() req,
    @Body() clientSettingsData: CreateClientSettingsDto,
  ) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientSettingsService.addClientSettings(
      clientSettingsData,
      ownerId,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Patch('/client/settings/:clientId')
  async updateClientSettings(
    @Request() req,
    @Param('clientId') clientId: string,
    @Body() updateClientSettingsDto: UpdateClientSettingsDto,
  ) {
    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientSettingsService.updateClientSettings(
      ownerId,
      clientId,
      updateClientSettingsDto,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Patch('/client/update-profile/:clientId')
  async updateClient(
    @Request() req,
    @Param('clientId') clientId: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    const body = req.body;

    const files = req.files;
    if (files?.profileImage) {
      body.profileImage = files.profileImage;
    }
    const bodyProfileImage = body.profileImage;

    const ownerId = req.user.id || req.user.sub;
    if (!ownerId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.clientService.updateClient(
      clientId,
      ownerId,
      updateClientDto,
      bodyProfileImage,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message, error: result.error },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
