import { Test, TestingModule } from '@nestjs/testing';
import { ClientController } from './client.controller';
import { ClientProfileService } from '../services/client-profile.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ClientFiltersDto,
  CreateClientAddressDto,
  CreateClientDto,
  CreateClientProfileDto,
  CreateClientSettingsDto,
  CreateEmergencyContactDto,
} from '../dtos/requests/ClientDto';
import { ClientSource, Pronouns, ClientType } from '../entities/client.entity';
import { Gender } from '../types/constants';
import {
  Languages,
  PreferredContactMethod,
  Timezone,
} from '../entities/client-settings.entity';
import { ClientAddressService } from '../services/client-address.service';
import { EmergencyContactService } from '../services/emergency-contact.service';
import { ClientSettingsService } from '../services/client-settings.service';
import { ClientService } from '../services/client.service';

describe('ClientController - createClientProfile', () => {
  let controller: ClientController;
  let service: ClientProfileService;

  const mockClientService = { getClients: jest.fn() };
  const mockClientProfileService = { createClientProfile: jest.fn() };
  const mockClientAddressService = { addClientAddress: jest.fn() };
  const mockEmergencyContactService = { addEmergencyContact: jest.fn() };
  const mockClientSettingsService = { addClientSettings: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: mockClientService },
        { provide: ClientProfileService, useValue: mockClientProfileService },
        { provide: ClientAddressService, useValue: mockClientAddressService },
        {
          provide: EmergencyContactService,
          useValue: mockEmergencyContactService,
        },
        { provide: ClientSettingsService, useValue: mockClientSettingsService },
      ],
    }).compile();

    controller = module.get<ClientController>(ClientController);
    service = module.get<ClientProfileService>(ClientProfileService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ✅ SUCCESS CASE
  it('should create a client profile successfully', async () => {
    // const dto: CreateClientDto = {
    //   profile: {
    //     firstName: 'John',
    //     lastName: 'Doe',
    //     email: 'john@example.com',
    //     phone: '1234567890',
    //     clientSource: ClientSource.WALK_IN,
    //   },
    //   settings: {
    //     emailNotifications: true,
    //     smsNotifications: false,
    //     marketingEmails: false,
    //     preferences: {
    //       preferredContactMethod: PreferredContactMethod.EMAIL,
    //       language: 'en',
    //       timezone: 'UTC',
    //     },
    //     clientId: 'bbf9f0a9-b83e-418b-8f8c-bb06f547b1f9',
    //   },
    //   addresses: [],
    //   emergencyContacts: [],
    // };

    const dto: CreateClientProfileDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      clientSource: ClientSource.WALK_IN,
      clientType: ClientType.NEW,
      gender: Gender.MALE,
      pronouns: Pronouns.HE_HIM,
      phoneCode: '+61',
    };

    const req = { user: { sub: 'owner-123' } };

    const result = { success: true, data: { id: 'client-1' } };
    mockClientProfileService.createClientProfile.mockResolvedValue(result);

    expect(await controller.createClientProfile(req, dto)).toBe(result);
    expect(service.createClientProfile).toHaveBeenCalledWith(dto, 'owner-123');
  });

  // ✅ NO USER / NOT AUTHENTICATED
  it('should throw UNAUTHORIZED if no ownerId exists', async () => {
    const req = { user: {} }; // missing sub/userId
    const dto = {} as CreateClientProfileDto;

    await expect(controller.createClientProfile(req, dto)).rejects.toThrow(
      new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED),
    );
  });

  // ✅ SERVICE RETURNS ERROR
  it('should throw BAD_REQUEST if service returns failure', async () => {
    const dto: CreateClientProfileDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      clientSource: ClientSource.WALK_IN,
      clientType: ClientType.NEW,
      gender: Gender.MALE,
      pronouns: Pronouns.HE_HIM,
      phoneCode: '+61',

      // profile: {
      //   firstName: 'John',
      //   lastName: 'Doe',
      //   email: 'john@example.com',
      //   phone: '1234567890',
      //   clientSource: ClientSource.WALK_IN,
      // },
      // settings: {
      //   emailNotifications: true,
      //   smsNotifications: false,
      //   marketingEmails: false,
      //   preferences: {
      //     preferredContactMethod: PreferredContactMethod.EMAIL,
      //     language: 'en',
      //     timezone: 'UTC',
      //   },
      //   clientId: 'bbf9f0a9-b83e-418b-8f8c-bb06f547b1f9',
      // },
      // addresses: [],
      // emergencyContacts: [],
    };

    const req = { user: { sub: 'owner-123' } };

    const errorResponse = {
      success: false,
      message: 'Validation failed',
      error: 'INVALID_DATA',
    };

    mockClientProfileService.createClientProfile.mockResolvedValue(
      errorResponse,
    );

    await expect(controller.createClientProfile(req, dto)).rejects.toThrow(
      new HttpException(
        { message: 'Validation failed', error: 'INVALID_DATA' },
        HttpStatus.BAD_REQUEST,
      ),
    );

    expect(service.createClientProfile).toHaveBeenCalledWith(dto, 'owner-123');
  });
});

describe('ClientController - addClientAddress', () => {
  let controller: ClientController;
  let service: ClientAddressService;

  const mockClientService = { getClients: jest.fn() };
  const mockClientProfileService = { createClientProfile: jest.fn() };
  const mockClientAddressService = { addClientAddress: jest.fn() };
  const mockEmergencyContactService = { addEmergencyContact: jest.fn() };
  const mockClientSettingsService = { addClientSettings: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: mockClientService },
        { provide: ClientProfileService, useValue: mockClientProfileService },
        { provide: ClientAddressService, useValue: mockClientAddressService },
        {
          provide: EmergencyContactService,
          useValue: mockEmergencyContactService,
        },
        { provide: ClientSettingsService, useValue: mockClientSettingsService },
      ],
    }).compile();

    controller = module.get<ClientController>(ClientController);
    service = module.get<ClientAddressService>(ClientAddressService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ✅ SUCCESS CASE
  it('should add a client address successfully', async () => {
    const req = { user: { sub: 'owner-123' } };

    const dto: CreateClientAddressDto[] = [
      {
        clientId: 'client-1',
        addressName: 'Home',
        addressLine1: '123 Street',
        addressLine2: 'Apt 4',
        location: 'Lagos',
        city: 'Ikeja',
        state: 'Lagos',
        zipCode: '100001',
        country: 'Nigeria',
        isPrimary: true,
      },
    ];

    const expectedTransformed = {
      clientId: 'client-1',
      addressName: 'Home',
      addressLine1: '123 Street',
      addressLine2: 'Apt 4',
      location: 'Lagos',
      city: 'Ikeja',
      state: 'Lagos',
      zipCode: '100001',
      country: 'Nigeria',
      isPrimary: true,
    };

    const result = { success: true, data: { id: 'address-1' } };
    mockClientAddressService.addClientAddress.mockResolvedValue(result);

    expect(await controller.addClientAddress(req, { addresses: dto })).toBe(
      result,
    );

    expect(service.addClientAddress).toHaveBeenCalledWith(
      expectedTransformed,
      'owner-123',
    );
  });

  // ✅ MISSING OWNER ID
  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const req = { user: {} }; // missing sub and userId
    const dto = {} as CreateClientAddressDto[];

    await expect(
      controller.addClientAddress(req, { addresses: dto }),
    ).rejects.toThrow(
      new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED),
    );
  });

  // ✅ SERVICE FAILURE CASE
  it('should return BAD_REQUEST when service returns failure', async () => {
    const req = { user: { sub: 'owner-123' } };

    const dto: CreateClientAddressDto[] = [
      {
        clientId: 'client-1',
        addressName: 'Home',
        addressLine1: '123 Street',
        addressLine2: undefined,
        location: 'Lagos',
        city: undefined,
        state: '',
        zipCode: '',
        country: '',
        isPrimary: false,
      },
    ];

    const errorResponse = {
      success: false,
      message: 'Invalid client ID',
      error: 'CLIENT_NOT_FOUND',
    };

    mockClientAddressService.addClientAddress.mockResolvedValue(errorResponse);

    await expect(
      controller.addClientAddress(req, { addresses: dto }),
    ).rejects.toThrow(
      new HttpException(
        { message: 'Invalid client ID', error: 'CLIENT_NOT_FOUND' },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });
});

describe('ClientController - addEmergencyContact', () => {
  let controller: ClientController;
  let service: EmergencyContactService;

  const mockClientService = { getClients: jest.fn() };
  const mockClientProfileService = { createClientProfile: jest.fn() };
  const mockClientAddressService = { addClientAddress: jest.fn() };
  const mockEmergencyContactService = { addEmergencyContact: jest.fn() };
  const mockClientSettingsService = { addClientSettings: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: mockClientService },
        { provide: ClientProfileService, useValue: mockClientProfileService },
        { provide: ClientAddressService, useValue: mockClientAddressService },
        {
          provide: EmergencyContactService,
          useValue: mockEmergencyContactService,
        },
        { provide: ClientSettingsService, useValue: mockClientSettingsService },
      ],
    }).compile();

    controller = module.get<ClientController>(ClientController);
    service = module.get<EmergencyContactService>(EmergencyContactService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ✅ SUCCESS CASE
  it('should add an emergency contact successfully', async () => {
    const req = { user: { sub: 'owner-123' } };

    const dto: CreateEmergencyContactDto[] = [
      {
        clientId: 'client-1',
        firstName: 'Sarah',
        lastName: 'Johnson',
        relationship: 'Sister',
        phone: '422334455',
        email: 'sarah@example.com',
        emergencyPhoneCode: '+61',
      },
    ];

    const result = { success: true, data: { id: 'contact-1' } };
    mockEmergencyContactService.addEmergencyContact.mockResolvedValue(result);

    expect(
      await controller.addEmergencyContact(req, { contactsData: dto }),
    ).toBe(result);

    expect(service.addEmergencyContact).toHaveBeenCalledWith(dto, 'owner-123');
  });

  // ✅ MISSING OWNER ID
  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const req = { user: {} }; // missing sub or userId
    const dto = [{}] as CreateEmergencyContactDto[];

    await expect(
      controller.addEmergencyContact(req, { contactsData: dto }),
    ).rejects.toThrow(
      new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED),
    );
  });

  // ✅ SERVICE FAILURE CASE
  it('should return BAD_REQUEST when service returns failure', async () => {
    const req = { user: { sub: 'owner-123' } };

    const dto: CreateEmergencyContactDto[] = [
      {
        clientId: 'client-1',
        firstName: 'Sarah',
        lastName: 'Johnson',
        relationship: 'Sister',
        phone: '422334455',
        email: 'sarah@example.com',
        emergencyPhoneCode: '+61',
      },
    ];

    const errorResponse = {
      success: false,
      message: 'Client not found',
      error: 'CLIENT_NOT_FOUND',
    };

    mockEmergencyContactService.addEmergencyContact.mockResolvedValue(
      errorResponse,
    );

    await expect(
      controller.addEmergencyContact(req, { contactsData: dto }),
    ).rejects.toThrow(
      new HttpException(
        { message: 'Client not found', error: 'CLIENT_NOT_FOUND' },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });
});

describe('ClientController - addClientSettings', () => {
  let controller: ClientController;
  let service: ClientSettingsService;

  const mockClientService = { getClients: jest.fn() };
  const mockClientProfileService = { createClientProfile: jest.fn() };
  const mockClientAddressService = { addClientAddress: jest.fn() };
  const mockEmergencyContactService = { addEmergencyContact: jest.fn() };
  const mockClientSettingsService = { addClientSettings: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: mockClientService },
        { provide: ClientProfileService, useValue: mockClientProfileService },
        { provide: ClientAddressService, useValue: mockClientAddressService },
        {
          provide: EmergencyContactService,
          useValue: mockEmergencyContactService,
        },
        { provide: ClientSettingsService, useValue: mockClientSettingsService },
      ],
    }).compile();

    controller = module.get<ClientController>(ClientController);
    service = module.get<ClientSettingsService>(ClientSettingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ✅ SUCCESS CASE
  it('should add client settings successfully', async () => {
    const req = { user: { sub: 'owner-123' } };

    const dto: CreateClientSettingsDto = {
      clientId: 'client-1',
      preferences: {
        preferredContactMethod: PreferredContactMethod.EMAIL,
        language: Languages.ENGLISH,
        timezone: Timezone.BRISBANE,
      },
      clientType: ClientType.REGULAR,
      emailNotifications: true,
      marketingEmails: true,
      smsNotifications: false,
    };

    const result = { success: true, data: { id: 'settings-1' } };
    mockClientSettingsService.addClientSettings.mockResolvedValue(result);

    expect(await controller.addClientSettings(req, dto)).toBe(result);

    expect(service.addClientSettings).toHaveBeenCalledWith(dto, 'owner-123');
  });

  // ✅ MISSING OWNER ID
  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const req = { user: {} }; // missing sub or userId
    const dto = {} as CreateClientSettingsDto;

    await expect(controller.addClientSettings(req, dto)).rejects.toThrow(
      new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED),
    );
  });

  // ✅ SERVICE FAILURE CASE
  it('should return BAD_REQUEST when service returns failure', async () => {
    const req = { user: { sub: 'owner-123' } };

    const dto: CreateClientSettingsDto = {
      clientId: 'client-1',
      preferences: {
        preferredContactMethod: PreferredContactMethod.EMAIL,
        language: Languages.FRENCH,
        timezone: Timezone.ADELAIDE,
      },
      clientType: ClientType.REGULAR,
      emailNotifications: true,
      marketingEmails: true,
      smsNotifications: false,
    };

    const errorResponse = {
      success: false,
      message: 'Client not found',
      error: 'CLIENT_NOT_FOUND',
    };

    mockClientSettingsService.addClientSettings.mockResolvedValue(
      errorResponse,
    );

    await expect(controller.addClientSettings(req, dto)).rejects.toThrow(
      new HttpException(
        { message: 'Client not found', error: 'CLIENT_NOT_FOUND' },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });
});

describe('ClientController - getClients', () => {
  let controller: ClientController;
  let service: ClientService;

  const mockClientService = { getClients: jest.fn() };
  const mockClientProfileService = { createClientProfile: jest.fn() };
  const mockClientAddressService = { addClientAddress: jest.fn() };
  const mockEmergencyContactService = { addEmergencyContact: jest.fn() };
  const mockClientSettingsService = { addClientSettings: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: mockClientService },
        { provide: ClientProfileService, useValue: mockClientProfileService },
        { provide: ClientAddressService, useValue: mockClientAddressService },
        {
          provide: EmergencyContactService,
          useValue: mockEmergencyContactService,
        },
        { provide: ClientSettingsService, useValue: mockClientSettingsService },
      ],
    }).compile();

    controller = module.get<ClientController>(ClientController);
    service = module.get<ClientService>(ClientService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ✅ SUCCESS CASE
  it('should fetch clients successfully', async () => {
    const req = { user: { sub: 'owner-123' } };

    const filters: ClientFiltersDto = {
      search: 'john',
      clientType: 'vip' as any,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    };

    const expectedParsedFilters = {
      search: 'john',
      clientType: undefined, // invalid type removed because allowedTypes = []
      sortBy: 'createdAt',
      sortOrder: 'asc', // allowed
    };

    const result = {
      success: true,
      data: [{ id: 'client-1', firstName: 'John' }],
    };

    mockClientService.getClients.mockResolvedValue(result);

    expect(await controller.getClients(req, filters)).toBe(result);

    expect(service.getClients).toHaveBeenCalledWith(
      'owner-123',
      expectedParsedFilters,
    );
  });

  // ✅ UNAUTHORIZED USER
  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const req = { user: {} }; // no sub or userId

    await expect(
      controller.getClients(req, {} as ClientFiltersDto),
    ).rejects.toThrow(
      new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED),
    );
  });

  // ✅ SERVICE FAILURE
  it('should throw BAD_REQUEST when service returns failure', async () => {
    const req = { user: { sub: 'owner-123' } };

    const filters: ClientFiltersDto = {
      search: '',
      clientType: undefined,
      sortOrder: 'desc',
    };

    const errorResponse = {
      success: false,
      message: 'Error fetching clients',
      error: 'DB_ERROR',
    };

    mockClientService.getClients.mockResolvedValue(errorResponse);

    await expect(controller.getClients(req, filters)).rejects.toThrow(
      new HttpException(
        { message: 'Error fetching clients', error: 'DB_ERROR' },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  // ✅ VALIDATION CASE: Invalid sortOrder should be removed
  it('should ignore invalid sortOrder values', async () => {
    const req = { user: { sub: 'owner-123' } };

    const filters: ClientFiltersDto = {
      search: 'test',
      sortOrder: 'INVALID_ORDER' as any,
    };

    const expectedParsedFilters = {
      search: 'test',
      sortOrder: undefined,
    };

    const result = { success: true, data: [] };

    mockClientService.getClients.mockResolvedValue(result);

    await controller.getClients(req, filters);

    expect(service.getClients).toHaveBeenCalledWith(
      'owner-123',
      expectedParsedFilters,
    );
  });
});
