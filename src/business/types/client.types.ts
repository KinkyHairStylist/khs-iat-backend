import {
  CreateClientAddressDto,
  CreateClientProfileDto,
  CreateClientSettingsDto,
  CreateEmergencyContactDto,
} from '../dtos/requests/ClientDto';
import { ClientType } from '../entities/client.entity';
import {
  PreferredContactMethod,
} from '../entities/client-settings.entity';
import { ClientSource, Pronouns } from '../entities/client.entity';
import { Gender } from './constants';

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: Date | string;
  gender?: Gender;
  pronouns?: Pronouns;
  address?: string;
  clientSource?: ClientSource;
  profileImage?: string;
  ownerId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientAddress {
  id: string;
  clientId: string;
  addressName: string;
  addressLine1: string;
  addressLine2: string | null;
  location: string;
  city: string | null;
  state: string;
  zipCode: string;
  country: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmergencyContact {
  id: string;
  clientId: string;
  firstName: string;
  lastName?: string;
  email: string;
  relationship: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientSettings {
  id: string;
  clientId: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  clientType?: ClientType;
  notes?: string;
  preferences: {
    preferredContactMethod: PreferredContactMethod | 'email';
    timezone: string;
    language: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// export interface ClientFormData {
//   profile: Omit<
//     Client,
//     'id' | 'ownerId' | 'isActive' | 'createdAt' | 'updatedAt'
//   >;
//   addresses?: Omit<ClientAddress, 'id' | 'createdAt' | 'updatedAt'>[];
//   emergencyContacts?: Omit<
//     EmergencyContact,
//     'id' | 'createdAt' | 'updatedAt'
//   >[];
//   settings?: Omit<ClientSettings, 'id' | 'createdAt' | 'updatedAt'>;
// }

export interface ClientFormData {
  profile: Partial<CreateClientProfileDto>;
  addresses?: CreateClientAddressDto[];
  emergencyContacts?: CreateEmergencyContactDto[];
  settings?: Partial<CreateClientSettingsDto>;
}

export interface ClientFilters {
  search?: string;
  clientType?: ClientType;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  success: boolean;
  error?: string;
}

export interface ClientlistResponse {
  clients: Client[];
  totalPages: number;
  totalItems: number;
  currentPage: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
}
