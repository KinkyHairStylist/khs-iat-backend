import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ClientFormData,
  ClientlistResponse,
  ApiResponse,
} from '../types/client.types';
import { Business } from '../entities/business.entity';
import { ClientSchema, ClientType } from '../entities/client.entity';
import { ClientAddressSchema } from '../entities/client-address.entity';
import { EmergencyContactSchema } from '../entities/emergency-contact-schema.entity';
import {
  ClientSettingsSchema,
} from '../entities/client-settings.entity';
import { formatClientType } from '../utils/client.utils';
import { ClientFiltersDto, UpdateClientDto } from '../dtos/requests/ClientDto';
import {
  BusinessCloudinaryService,
  FileUpload,
} from './business-cloudinary.service';
import { PasswordHashingHelper } from 'src/helpers/password-hashing.helper';
import { User } from 'src/all_user_entities/user.entity';
import sgMail from '@sendgrid/mail';

@Injectable()
export class ClientService {
  private fromEmail: string;
  private frontendUrl: string;

  constructor(
    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,

    @InjectRepository(ClientAddressSchema)
    private readonly clientAddressRepo: Repository<ClientAddressSchema>,

    @InjectRepository(EmergencyContactSchema)
    private readonly emergencyContactRepo: Repository<EmergencyContactSchema>,

    @InjectRepository(ClientSettingsSchema)
    private readonly clientSettingsRepo: Repository<ClientSettingsSchema>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly businessCloudinaryService: BusinessCloudinaryService,
    private readonly dataSource: DataSource,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const frontendUrl = process.env.FRONTEND_URL;

    if (!apiKey || !fromEmail || !frontendUrl) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
    this.frontendUrl = frontendUrl;
  }

  async clearAllClients() {
    try {
      const count = await this.clientRepo.count(); // total reviews before deletion
      if (count === 0) {
        return { message: 'No clients to delete', deleted: 0 };
      }

      // await this.clientRepo.delete({}); // delete all rows
      await this.clientRepo.query(`TRUNCATE TABLE "clients" CASCADE`);
      return { message: '✅ All clients deleted successfully', deleted: count };
    } catch (err) {
      console.error('Failed to delete clients:', err);
      throw new HttpException(
        'Failed to delete clients',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // async createClient(
  //   clientData: ClientFormData,
  //   ownerId: string,
  //   bodyProfileImage: FileUpload,
  // ): Promise<ApiResponse<any>> {
  //   const queryRunner = this.dataSource.createQueryRunner();
  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();

  //   try {
  //     const business = await queryRunner.manager.findOne(Business, {
  //       where: { ownerId },
  //     });

  //     if (!business) {
  //       throw new Error('Business not found');
  //     }

  //     const existingClient = await queryRunner.manager.findOne(ClientSchema, {
  //       where: {
  //         email: clientData.profile.email,
  //         ownerId,
  //         isActive: true,
  //       },
  //     });

  //     if (existingClient) {
  //       throw new Error('Client already exists');
  //     }

  //     // Upload image BEFORE saving DB to avoid holding transaction
  //     let profileImage;
  //     if (bodyProfileImage) {
  //       const clientName =
  //         `${clientData.profile.firstName}-${clientData.profile.lastName}`
  //           .trim()
  //           .replace(/\s+/g, '_');

  //       const folderPath = `KHS/business/${business.businessName}/clients/${clientName}`;
  //       const { imageUrl } = await this.businessCloudinaryService.uploadImage(
  //         bodyProfileImage,
  //         folderPath,
  //       );
  //       profileImage = imageUrl;
  //     }

  //     // Save client
  //     const savedClient = await queryRunner.manager.save(ClientSchema, {
  //       ...clientData.profile,
  //       profileImage,
  //       ownerId,
  //     });

  //     // Insert placeholder address & contacts
  //     await queryRunner.manager.insert(ClientAddressSchema, {
  //       clientId: savedClient.id,
  //       isPrimary: false,
  //     });

  //     await queryRunner.manager.insert(EmergencyContactSchema, {
  //       clientId: savedClient.id,
  //     });

  //     if (clientData.settings) {
  //       await queryRunner.manager.save(ClientSettingsSchema, {
  //         ...clientData.settings,
  //         clientId: savedClient.id,
  //       });
  //     }

  //     // Create linked user
  //     const { generatedPassword, user } =
  //       await this.createUserAccountForClient(savedClient);

  //     await queryRunner.commitTransaction();

  //     console.log('Transaction committed...');

  //     // Load full client (outside transaction)
  //     const populatedClient = await this.getClientWithRelations(savedClient.id);

  //     // Send email AFTER transaction
  //     // Send Email with login credentials to client
  //     console.log('Sending welcome email...');
  //     await this.sendWelcomeClientAccountEmail(
  //       user.email,
  //       `${user.firstName} ${user.surname}`,
  //       generatedPassword,
  //     );
  //     console.log('✔ Welcome email sent');

  //     return {
  //       success: true,
  //       data: populatedClient,
  //       message: 'Client created successfully',
  //     };
  //   } catch (error) {
  //     await queryRunner.rollbackTransaction();
  //     console.error('Create client error:', error);
  //     return {
  //       success: false,
  //       message: error.message || 'Failed to create client',
  //     };
  //   } finally {
  //     await queryRunner.release();
  //   }
  // }

  // async createClient(
  //   clientData: ClientFormData,
  //   ownerId: string,
  //   bodyProfileImage: FileUpload,
  // ): Promise<ApiResponse<any>> {
  //   try {
  //     // Run everything in a single transaction
  //     const result = await this.dataSource.transaction(async (manager) => {
  //       // 1️⃣ Find the business
  //       const business = await manager.findOne(Business, {
  //         where: { ownerId },
  //       });
  //       if (!business) throw new Error('Business not found');

  //       // 2️⃣ Check if client already exists
  //       const existingClient = await manager.findOne(ClientSchema, {
  //         where: { email: clientData.profile.email, ownerId, isActive: true },
  //       });
  //       if (existingClient) throw new Error('Client already exists');

  //       // 3️⃣ Upload profile image before saving to DB
  //       let profileImage: string | undefined;
  //       if (bodyProfileImage) {
  //         const clientName =
  //           `${clientData.profile.firstName}-${clientData.profile.lastName}`
  //             .trim()
  //             .replace(/\s+/g, '_');
  //         const folderPath = `KHS/business/${business.businessName}/clients/${clientName}`;
  //         const { imageUrl } = await this.businessCloudinaryService.uploadImage(
  //           bodyProfileImage,
  //           folderPath,
  //         );
  //         profileImage = imageUrl;
  //       }

  //       // 4️⃣ Save client
  //       const savedClient = await manager.save(ClientSchema, {
  //         ...clientData.profile,
  //         profileImage,
  //         ownerId,
  //       });

  //       // 5️⃣ Insert placeholder address
  //       await manager.insert(ClientAddressSchema, {
  //         clientId: savedClient.id,
  //         isPrimary: false,
  //       });

  //       // 6️⃣ Insert placeholder emergency contact
  //       await manager.insert(EmergencyContactSchema, {
  //         clientId: savedClient.id,
  //       });

  //       // 7️⃣ Save settings if provided
  //       if (clientData.settings) {
  //         await manager.save(ClientSettingsSchema, {
  //           ...clientData.settings,
  //           clientId: savedClient.id,
  //         });
  //       }

  //       // 8️⃣ Create linked user account
  //       const generatedPassword = this.generateSecurePassword(12);
  //       const hashedPassword =
  //         await PasswordHashingHelper.hashPassword(generatedPassword);

  //       const newUser = manager.create(User, {
  //         email: savedClient.email,
  //         firstName: savedClient.firstName,
  //         surname: savedClient.lastName,
  //         phoneNumber: savedClient.phone,
  //         gender: savedClient.gender,
  //         dateOfBirth: savedClient.dateOfBirth,
  //         password: hashedPassword,
  //         isVerified: true,
  //         isClient: true,
  //         isBusiness: false,
  //         isAdmin: false,
  //         isSuperAdmin: false,
  //         addresses: [],
  //         clientAppointments: [],
  //       });

  //       await manager.save(newUser);

  //       // Return everything needed after transaction
  //       return { savedClient, newUser, generatedPassword };
  //     });

  //     // 9️⃣ Send welcome email AFTER transaction commits
  //     console.log('Sending welcome email...');
  //     await this.sendWelcomeClientAccountEmail(
  //       result.newUser.email,
  //       `${result.newUser.firstName} ${result.newUser.surname}`,
  //       result.generatedPassword,
  //     );
  //     console.log('✔ Welcome email sent');

  //     // 10️⃣ Load populated client
  //     const populatedClient = await this.getClientWithRelations(
  //       result.savedClient.id,
  //     );

  //     return {
  //       success: true,
  //       data: populatedClient,
  //       message: 'Client created successfully',
  //     };
  //   } catch (error) {
  //     console.error('Create client error:', error);
  //     return {
  //       success: false,
  //       message: error.message || 'Failed to create client',
  //     };
  //   }
  // }

  async createClient(
    clientData: ClientFormData,
    ownerId: string,
    bodyProfileImage: FileUpload,
  ): Promise<ApiResponse<any>> {
    let profileImage: string | undefined;

    try {
      // 1️⃣ Fetch business info first (needed for Cloudinary path)
      const business = await this.dataSource.getRepository(Business).findOne({
        where: { ownerId },
      });

      if (!business) {
        throw new Error('Business not found');
      }

      // 2️⃣ Upload to Cloudinary BEFORE opening transaction
      if (bodyProfileImage) {
        const clientName =
          `${clientData.profile.firstName}-${clientData.profile.lastName}`
            .trim()
            .replace(/\s+/g, '_');
        const folderPath = `KHS/business/${business.businessName}/clients/${clientName}`;

        console.log('Uploading profile image to Cloudinary...');
        const { imageUrl } = await this.businessCloudinaryService.uploadImage(
          bodyProfileImage,
          folderPath,
        );
        profileImage = imageUrl;
        console.log('✔ Profile image uploaded:', profileImage);
      }

      // 3️⃣ Generate and hash password BEFORE transaction (CPU-intensive)
      const generatedPassword = this.generateSecurePassword(12);
      const hashedPassword =
        await PasswordHashingHelper.hashPassword(generatedPassword);

      // 4️⃣ Now run fast database operations in a transaction
      const result = await this.dataSource.transaction(async (manager) => {
        // Check if client already exists
        const existingClient = await manager.findOne(ClientSchema, {
          where: { email: clientData.profile.email, ownerId, isActive: true },
        });

        if (existingClient) {
          throw new Error('Client already exists');
        }

        // Save client with already-uploaded image
        const savedClient = await manager.save(ClientSchema, {
          ...clientData.profile,
          profileImage,
          ownerId,
        });

        // Insert placeholder address
        await manager.insert(ClientAddressSchema, {
          clientId: savedClient.id,
          isPrimary: false,
        });

        // Insert placeholder emergency contact
        await manager.insert(EmergencyContactSchema, {
          clientId: savedClient.id,
        });

        // Save settings if provided
        if (clientData.settings) {
          await manager.save(ClientSettingsSchema, {
            ...clientData.settings,
            clientId: savedClient.id,
          });
        }

        // Create linked user account with pre-hashed password
        const newUser = manager.create(User, {
          email: savedClient.email,
          firstName: savedClient.firstName,
          surname: savedClient.lastName,
          phoneNumber: savedClient.phone,
          gender: savedClient.gender,
          dateOfBirth: savedClient.dateOfBirth,
          password: hashedPassword,
          isVerified: true,
          isClient: true,
          isBusiness: false,
          isAdmin: false,
          isSuperAdmin: false,
          addresses: [],
          clientAppointments: [],
        });

        await manager.save(newUser);

        return { savedClient, newUser, generatedPassword };
      });

      // 5️⃣ Send welcome email AFTER transaction commits
      console.log('Sending welcome email...');
      await this.sendWelcomeClientAccountEmail(
        result.newUser.email,
        `${result.newUser.firstName} ${result.newUser.surname}`,
        result.generatedPassword,
      );
      console.log('✔ Welcome email sent');

      // 6️⃣ Load populated client
      const populatedClient = await this.getClientWithRelations(
        result.savedClient.id,
      );

      console.log(populatedClient);

      return {
        success: true,
        data: populatedClient,
        message: 'Client created successfully',
      };
    } catch (error) {
      console.error('Create client error:', error);

      // 7️⃣ Cleanup: Delete Cloudinary image if database operations failed
      if (profileImage) {
        try {
          console.log('Rolling back: Deleting uploaded image from Cloudinary');
          await this.businessCloudinaryService.deleteBusinessImage(
            profileImage,
          );
          console.log('✔ Cloudinary image deleted');
        } catch (cleanupError) {
          console.error('Failed to cleanup Cloudinary image:', cleanupError);
        }
      }

      return {
        success: false,
        message: error.message || 'Failed to create client',
      };
    }
  }

  async getClients(
    ownerId: string,
    filters: ClientFiltersDto,
  ): Promise<ApiResponse<ClientlistResponse>> {
    try {
      // const business = await this.businessRepo.findOne({
      //   where: { ownerId },
      // });
      // if (!business) {
      //   return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //     data: { clients: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      //   };
      // }

      const {
        search,
        clientType,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 9,
      } = filters;

      // Build query with QueryBuilder
      const queryBuilder = this.clientRepo
        .createQueryBuilder('client')
        .where('client.ownerId = :ownerId', { ownerId })
        .andWhere('client.isActive = :isActive', { isActive: true });

      // Search filter (case-insensitive LIKE)
      if (search) {
        queryBuilder.andWhere(
          '(LOWER(client.firstName) LIKE LOWER(:search) OR ' +
            'LOWER(client.lastName) LIKE LOWER(:search) OR ' +
            'LOWER(client.email) LIKE LOWER(:search) OR ' +
            'client.phone LIKE :search)',
          { search: `%${search}%` },
        );
      }

      // Client type filter (join with settings table)
      if (clientType && clientType !== 'all') {
        queryBuilder.andWhere('client.clientType = :clientType', {
          clientType,
        });
      }

      // Sorting
      const sortColumn =
        sortBy === 'createdAt' ? 'client.createdAt' : `client.${sortBy}`;
      queryBuilder.orderBy(
        sortColumn,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );

      // Pagination
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);

      // Execute query and get total count
      const [clients, total] = await queryBuilder.getManyAndCount();

      // Early return if no clients found
      if (clients.length === 0) {
        return {
          success: true,
          data: {
            clients: [],
            totalItems: 0,
            totalPages: 0,
            currentPage: page,
            pageSize: limit,
            startIndex: 0,
            endIndex: 0,
          },
          message: 'No clients found',
        };
      }

      // Get client IDs for batch fetching addresses
      const clientIds = clients.map((client) => client.id);

      const addresses = await this.clientAddressRepo
        .createQueryBuilder('address')
        .where('address.clientId IN (:...clientIds)', { clientIds })
        .getMany();

      // Create a map of clientId -> address for quick lookup
      const addressMap = new Map(
        addresses.map((addr) => [addr.clientId, addr.addressLine1]),
      );

      // Transform data (settings already loaded via leftJoinAndSelect)
      const clientsWithSettings = clients.map((client) => ({
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        dateOfBirth: client.dateOfBirth,
        gender: client.gender,
        pronouns: client.pronouns,
        address: addressMap.get(client.id) || undefined,
        clientType: formatClientType(client.clientType || ClientType.REGULAR),
        clientSource: client.clientSource,
        profileImage: client.profileImage,
        isActive: client.isActive,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        ownerId,
      }));

      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit + 1;
      const endIndex = Math.min(page * limit, total);

      return {
        success: true,
        data: {
          clients: clientsWithSettings,
          totalItems: total,
          totalPages,
          currentPage: page,
          pageSize: limit,
          startIndex,
          endIndex,
        },
        message: 'Clients retrieved successfully',
      };
    } catch (error) {
      // console.log('Get clients error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch clients',
      };
    }
  }

  async getClientsList(ownerId: string): Promise<ApiResponse<any[]>> {
    try {
      // const business = await this.businessRepo.findOne({
      //   where: { ownerId },
      // });
      // if (!business) {
      //   return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //     data: { clients: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      //   };
      // }

      const clients = await this.clientRepo.find({
        where: { ownerId, isActive: true },
      });

      // Early return if no clients found
      if (clients.length === 0) {
        return {
          success: true,
          data: clients,
          message: 'No clients available',
        };
      }

      // Transform data (settings already loaded via leftJoinAndSelect)
      const formattedClients = clients.map((client) => ({
        id: client.id,
        name: client.firstName + ' ' + client.lastName,
        profileImage: client.profileImage,
        email: client.email,
      }));

      return {
        success: true,
        data: formattedClients,
        message: 'Clients List retrieved successfully',
      };
    } catch (error) {
      // console.log('Get clients error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch clients',
      };
    }
  }

  async getClientDetails(
    clientId: string,
    ownerId: string,
  ): Promise<ApiResponse<any>> {
    try {
      // const business = await this.businessRepo.findOne({
      //   where: { ownerId },
      // });
      // if (!business) {
      //   return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //   };
      // }

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
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      const populatedClient = await this.getClientWithRelations(client.id);

      return {
        success: true,
        data: populatedClient,
        message: 'Client details retrieved successfully',
      };
    } catch (error) {
      console.error('Get client details error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client details',
      };
    }
  }

  async updateClient(
    clientId: string,
    ownerId: string,
    updates: UpdateClientDto,
    bodyProfileImage: FileUpload,
  ): Promise<ApiResponse<UpdateClientDto>> {
    try {
      const profilePictureExist =
        updates.profilePicture?.includes('cloudinary');

      let profileImage;

      if (!profilePictureExist) {
        const clientName = `${updates.firstName}-${updates.lastName}`
          .trim()
          .replace(/\s+/g, '_'); // replace spaces with underscores

        const folderPath = `KHS/business/${ownerId}/clients/${clientName}`;

        if (bodyProfileImage) {
          try {
            const { imageUrl } =
              await this.businessCloudinaryService.uploadImage(
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
      }

      // Check if all fields are undefined
      const hasUpdates = Object.values(updates).some(
        (value) => value !== undefined,
      );

      if (!hasUpdates) {
        // No updates provided
        return {
          success: true,
          data: updates,
          message: 'No changes made to profile.',
        };
      }

      const { profilePicture, ...restUpdates } = updates;

      // Perform the update
      const result = await this.clientRepo.update(
        {
          id: clientId,
          ownerId,
          isActive: true,
        },
        {
          ...restUpdates,
          profileImage: profilePictureExist
            ? updates.profilePicture
            : profileImage,
          updatedAt: new Date(),
        },
      );

      // Check if any rows were affected
      if (result.affected === 0) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
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
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      return {
        success: true,
        data: client,
        message: 'Client updated successfully',
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

  async deleteClient(
    clientId: string,
    ownerId: string,
  ): Promise<ApiResponse<boolean>> {
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

      const result = await this.clientRepo.update(
        {
          id: clientId,
          ownerId,
        },
        {
          isActive: false,
          updatedAt: new Date(),
        },
      );

      if (result.affected === 0) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      return {
        success: true,
        data: true,
        message: 'Client deleted successfully',
      };
    } catch (error) {
      console.error('Delete client error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to delete client',
      };
    }
  }

  private async getClientWithRelations(clientId: string): Promise<any> {
    const [client, addresses, emergencyContacts, settings] = await Promise.all([
      this.clientRepo.findOneBy({ id: clientId }),
      this.clientAddressRepo.findBy({ clientId }),
      this.emergencyContactRepo.findBy({ clientId }),
      this.clientSettingsRepo.findOneBy({ clientId }),
    ]);

    return {
      profile: client,
      addresses,
      emergencyContacts,
      settings,
    };
  }

  private async createUserAccountForClient(
    client: ClientSchema,
  ): Promise<{ user: User; generatedPassword }> {
    try {
      console.log('Creating account for:', client.email);

      const generatedPassword = this.generateSecurePassword(12);
      console.log('Generated password:', generatedPassword);

      const hashedPassword =
        await PasswordHashingHelper.hashPassword(generatedPassword);

      console.log('Password hashed successfully');

      const newUser = this.userRepo.create({
        email: client.email,
        firstName: client.firstName,
        surname: client.lastName,
        phoneNumber: client.phone,
        gender: client.gender,
        dateOfBirth: client.dateOfBirth,
        password: hashedPassword,
        isVerified: true, // Since client already exists in business system
        addresses: [], // no data yet
        clientAppointments: [], // no appointments yet
      });

      console.log('Attempting to save new user...');
      await this.userRepo.save(newUser);

      console.log('✔ User account created for client!');

      return { user: newUser, generatedPassword };
    } catch (error) {
      console.error('❌ Error creating linked user account:', error);
      throw new InternalServerErrorException(
        'Failed to create user account for client',
      );
    }
  }

  private generateSecurePassword(length: number = 12): string {
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '@$!%*?&';

    const all = lower + upper + numbers + special;

    let password = '';

    // Ensure at least one of each requirement
    password += lower[Math.floor(Math.random() * lower.length)];
    password += upper[Math.floor(Math.random() * upper.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill remaining characters
    for (let i = 4; i < length; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle password so required characters aren't predictable
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  private async sendWelcomeClientAccountEmail(
    clientEmail: string,
    clientName: string,
    password: string,
  ): Promise<void> {
    const emailText = `Dear ${clientName ?? 'Valued Client'},\n\nWelcome! Your account has been successfully created.\n\nYou can now log in using the credentials below:\nEmail: ${clientEmail}\nPassword: ${password}\n\nFor security reasons, please change your password after your first login.\n\nThank you for choosing our services.`;

    const msg = {
      to: clientEmail,
      from: this.fromEmail,
      subject: `Your New Account Login Details`,
      text: emailText,
      html: `
        <p>Dear <strong>${clientName ?? 'Valued Client'}</strong>,</p>
        <p>Welcome to KSH! Your account has been successfully created.</p>
  
        <p>You can now sign in using the following:</p>
        <ul>
          <li><strong>Email:</strong> ${clientEmail}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>

         <p>You can login here: <a href="${`${this.frontendUrl}/users/guests`}" target="_blank">${`${this.frontendUrl}/users/guests`}</a></p>
  
        <p><em>For security reasons, please change your password after your first login.</em></p>
        <p>If you have any questions or need help, we’re always here to assist.</p>
        <p><strong>Thank you</strong>.</p>
      `,
    };

    await sgMail.send(msg);
  }
}
