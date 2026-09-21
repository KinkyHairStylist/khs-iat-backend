import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import {
  ClientFormData,
  ClientlistResponse,
  ApiResponse,
} from '../types/client.types';
import { Business } from '../entities/business.entity';
import { ClientSchema, ClientType } from '../entities/client.entity';
import { ClientAddressSchema } from '../entities/client-address.entity';
import { EmergencyContactSchema } from '../entities/emergency-contact-schema.entity';
import { ClientSettingsSchema } from '../entities/client-settings.entity';
import { Review } from '../entities/review.entity';
import { formatClientType } from '../utils/client.utils';
import { groupAppointmentsByClient, summarizeClientAppointments } from '../utils/client-stats';
import { ClientFiltersDto, UpdateClientDto } from '../dtos/requests/ClientDto';
import {
  BusinessCloudinaryService,
  FileUpload,
} from './business-cloudinary.service';
import { PasswordHashingHelper } from 'src/helpers/password-hashing.helper';
import { User } from 'src/all_user_entities/user.entity';
import { Appointment } from '../entities/appointment.entity';
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

    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

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

  //
  //     // Load full client (outside transaction)
  //     const populatedClient = await this.getClientWithRelations(savedClient.id);

  //     // Send email AFTER transaction
  //     // Send Email with login credentials to client
  //       //     await this.sendWelcomeClientAccountEmail(
  //       user.email,
  //       `${user.firstName} ${user.surname}`,
  //       generatedPassword,
  //     );
  //
  //   return {
  //       success: true,
  //       data: populatedClient,
  //       message: 'Client created successfully',
  //     };
  //   } catch (error) {
  //     await queryRunner.rollbackTransaction();
  //     console.error('Create client error:', error);
  //   return {
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
  //         isCustomer: true,
  //         isMerchant: false,
  //         isStaff: false,
  //         addresses: [],
  //         clientAppointments: [],
  //       });

  //       await manager.save(newUser);

  //       // Return everything needed after transaction
  //   return { savedClient, newUser, generatedPassword };
  //     });

  //     // 9️⃣ Send welcome email AFTER transaction commits
  //       //     await this.sendWelcomeClientAccountEmail(
  //       result.newUser.email,
  //       `${result.newUser.firstName} ${result.newUser.surname}`,
  //       result.generatedPassword,
  //     );
  //
  //     // 10️⃣ Load populated client
  //     const populatedClient = await this.getClientWithRelations(
  //       result.savedClient.id,
  //     );

  //   return {
  //       success: true,
  //       data: populatedClient,
  //       message: 'Client created successfully',
  //     };
  //   } catch (error) {
  //     console.error('Create client error:', error);
  //   return {
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
      // STEP 1: VALIDATE — all preconditions checked before any write or slow I/O
      const business = await this.validateClientCreation(
        clientData.profile.email,
        ownerId,
      );

      // STEP 2: UPLOAD — slow I/O outside transaction to keep transaction short
      if (bodyProfileImage) {
        const clientName =
          `${clientData.profile.firstName}-${clientData.profile.lastName}`
            .trim()
            .replace(/\s+/g, '_');
        const folderPath = `KHS/business/${business.businessName}/clients/${clientName}`;
        const { imageUrl } = await this.businessCloudinaryService.uploadImage(
          bodyProfileImage,
          folderPath,
        );
        profileImage = imageUrl;
      }

      // STEP 3: HASH — CPU-intensive work outside transaction
      const generatedPassword = this.generateSecurePassword(12);
      const hashedPassword =
        await PasswordHashingHelper.hashPassword(generatedPassword);

      // STEP 4: CREATE — transaction contains only fast DB writes.
      // Re-check inside transaction as safety net against concurrent requests.
      // The (email, ownerId) unique index is the final DB-level guard.
      const result = await this.dataSource.transaction(async (manager) => {
        const existingClient = await manager.findOne(ClientSchema, {
          where: { email: clientData.profile.email, ownerId, isActive: true },
        });
        if (existingClient) throw new Error('Client already exists');

        const savedClient = await manager.save(ClientSchema, {
          ...clientData.profile,
          profileImage,
          ownerId,
        });

        await manager.insert(ClientAddressSchema, {
          clientId: savedClient.id,
          isPrimary: false,
        });

        await manager.insert(EmergencyContactSchema, {
          clientId: savedClient.id,
        });

        if (clientData.settings) {
          await manager.save(ClientSettingsSchema, {
            ...clientData.settings,
            clientId: savedClient.id,
          });
        }

        const newUser = manager.create(User, {
          email: savedClient.email,
          firstName: savedClient.firstName,
          surname: savedClient.lastName,
          phoneNumber: savedClient.phone,
          gender: savedClient.gender,
          dateOfBirth: savedClient.dateOfBirth,
          password: hashedPassword,
          isVerified: true,
          isCustomer: true,
          isMerchant: false,
          isStaff: false,
          addresses: [],
          clientAppointments: [],
        });
        await manager.save(newUser);

        return { savedClient, newUser, generatedPassword };
      });

      // STEP 5: EMAIL — after transaction commits so we never send on rollback
      await this.sendWelcomeClientAccountEmail(
        result.newUser.email,
        `${result.newUser.firstName} ${result.newUser.surname}`,
        result.generatedPassword,
      );

      const populatedClient = await this.getClientWithRelations(
        result.savedClient.id,
      );

      return {
        success: true,
        data: populatedClient,
        message: 'Client created successfully',
      };
    } catch (error) {
      console.error('Create client error:', error);

      // Cleanup Cloudinary image if DB writes failed after upload
      if (profileImage) {
        try {
          await this.businessCloudinaryService.deleteBusinessImage(
            profileImage,
          );
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

  private async validateClientCreation(
    email: string | undefined,
    ownerId: string,
  ): Promise<Business> {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    const business = await this.businessRepo.findOne({ where: { ownerId } });
    if (!business) {
      throw new HttpException('Business not found', HttpStatus.NOT_FOUND);
    }

    const existing = await this.clientRepo.findOne({
      where: { email, ownerId, isActive: true },
    });
    if (existing) {
      throw new HttpException('Client already exists', HttpStatus.CONFLICT);
    }

    return business;
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
      // return {
      //     success: false,
      //     error: 'Business not found',
      //     message: 'No business found for this user',
      //     data: { clients: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      //   };
      // }

      const {
        search,
        clientType,
        membership,
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

      // Client type filter. VIP is no longer offered (a membership is what marks a special client), so a
      // client still tagged VIP is treated as Regular.
      if (clientType && clientType !== 'all') {
        if (clientType === ClientType.REGULAR) {
          queryBuilder.andWhere('client.clientType IN (:...regularTypes)', {
            regularTypes: [ClientType.REGULAR, ClientType.VIP],
          });
        } else {
          queryBuilder.andWhere('client.clientType = :clientType', {
            clientType,
          });
        }
      }

      // Members: clients whose KHS account (same email) holds an active membership package at one of this
      // merchant's salons.
      if (membership === 'active') {
        queryBuilder.andWhere(`EXISTS (
          SELECT 1 FROM merchant_membership_purchases mp
          JOIN "user" mu ON mu.id = mp."clientId"
          JOIN businesses mb ON mb.id = mp."businessId"
          WHERE LOWER(mu.email) = LOWER(client.email)
            AND mb.owner_id = :ownerId
            AND mp.status = 'ACTIVE'
            AND mp."remainingSessions" > 0
            AND mp."expiresAt" > NOW()
        )`);
      }

      // Sorting — allowlist prevents column name injection
      const ALLOWED_SORT_COLUMNS = new Set(['createdAt', 'firstName', 'lastName', 'email', 'phone', 'updatedAt']);
      const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'createdAt';
      queryBuilder.orderBy(
        `client.${safeSortBy}`,
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

      // Batch fetch average review rating per client (0 when a client has no reviews)
      const ratings = await this.reviewRepo
        .createQueryBuilder('review')
        .select('review.clientId', 'clientId')
        .addSelect('AVG(review.rating)', 'avgRating')
        .where('review.clientId IN (:...clientIds)', { clientIds })
        .groupBy('review.clientId')
        .getRawMany<{ clientId: string; avgRating: string }>();

      const ratingMap = new Map(
        ratings.map((r) => [r.clientId, Number(r.avgRating)]),
      );

      // Visits, what they were worth and the next booking, from each client's real appointments.
      const emails = clients.map((c) => c.email?.trim().toLowerCase()).filter((e): e is string => !!e);
      const appointmentQuery = this.appointmentRepo
        .createQueryBuilder('a')
        .leftJoin('a.businessClient', 'bc')
        .leftJoin('a.client', 'u')
        .leftJoin('a.business', 'b')
        .select(['a.id', 'a.date', 'a.time', 'a.status', 'a.amount'])
        .addSelect(['bc.id', 'u.email'])
        .where('bc.id IN (:...clientIds)', { clientIds })
        .orWhere(
          new Brackets((qb) => {
            qb.where('b.ownerId = :ownerId', { ownerId });
            if (emails.length) qb.andWhere('LOWER(u.email) IN (:...emails)', { emails });
            else qb.andWhere('1 = 0');
          }),
        );
      const appointmentRows = (await appointmentQuery.getMany()).map((a) => ({
        id: a.id,
        date: a.date,
        time: a.time,
        status: a.status,
        amount: a.amount,
        businessClientId: a.businessClient?.id ?? null,
        clientEmail: a.client?.email ?? null,
      }));
      const appointmentsByClient = groupAppointmentsByClient(clients, appointmentRows);
      const today = new Date().toISOString().slice(0, 10);

      // Which of these clients are members, and how many sessions they have left.
      const memberRows: { email: string; sessions: number }[] = emails.length
        ? await this.dataSource.query(
            `SELECT LOWER(u.email) AS email, SUM(p."remainingSessions")::int AS sessions
               FROM merchant_membership_purchases p
               JOIN "user" u ON u.id = p."clientId"
               JOIN businesses b ON b.id = p."businessId"
              WHERE b.owner_id = $1
                AND LOWER(u.email) = ANY($2)
                AND p.status = 'ACTIVE'
                AND p."remainingSessions" > 0
                AND p."expiresAt" > NOW()
              GROUP BY 1`,
            [ownerId, emails],
          )
        : [];
      const sessionsByEmail = new Map(memberRows.map((r) => [r.email, r.sessions]));

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
        averageRating: ratingMap.get(client.id) ?? 0,
        ...summarizeClientAppointments(appointmentsByClient.get(client.id) ?? [], today),
        isMember: sessionsByEmail.has(client.email?.trim().toLowerCase() ?? ''),
        membershipSessionsLeft: sessionsByEmail.get(client.email?.trim().toLowerCase() ?? '') ?? 0,
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
      //return {
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
      //return {
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

  // A client's real booking history — previously the merchant's
  // client-details page rendered a hardcoded mock array here instead of
  // fetching anything. Matches on either side of how an appointment can
  // be linked to a client: businessClient (merchant added them directly)
  // or client (a real platform account whose email matches this client
  // record, scoped to this merchant so it can't leak another business's
  // history for the same email).
  async getClientAppointments(
    clientId: string,
    ownerId: string,
  ): Promise<ApiResponse<any[]>> {
    try {
      const client = await this.clientRepo.findOne({
        where: { id: clientId, ownerId },
      });
      if (!client) {
        return {
          success: false,
          error: 'Client not found',
          message: 'Client not found or access denied',
        };
      }

      const appointments = await this.appointmentRepo.find({
        where: [
          { businessClient: { id: clientId } },
          { client: { email: client.email }, business: { ownerId } },
        ],
        relations: ['service', 'staff', 'business'],
        order: { createdAt: 'DESC' },
      });

      return {
        success: true,
        data: appointments,
        message: 'Client appointments retrieved successfully',
      };
    } catch (error) {
      console.error('Get client appointments error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch client appointments',
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
    const [client, addresses, emergencyContacts, settings, avgRatingRow] = await Promise.all([
      this.clientRepo.findOneBy({ id: clientId }),
      this.clientAddressRepo.findBy({ clientId }),
      this.emergencyContactRepo.findBy({ clientId }),
      this.clientSettingsRepo.findOneBy({ clientId }),
      // Same aggregation the client list uses — average rating THIS
      // client has given out in their own reviews (not a score of them).
      this.reviewRepo
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'avgRating')
        .addSelect('COUNT(review.id)', 'reviewCount')
        .where('review.clientId = :clientId', { clientId })
        .getRawOne<{ avgRating: string | null; reviewCount: string }>(),
    ]);

    return {
      profile: client
        ? {
            ...client,
            averageRating: avgRatingRow?.avgRating ? Number(avgRatingRow.avgRating) : 0,
            reviewCount: Number(avgRatingRow?.reviewCount ?? 0),
          }
        : client,
      addresses,
      emergencyContacts,
      settings,
    };
  }

  private async createUserAccountForClient(
    client: ClientSchema,
  ): Promise<{ user: User; generatedPassword }> {
    try {
      const generatedPassword = this.generateSecurePassword(12);

      const hashedPassword =
        await PasswordHashingHelper.hashPassword(generatedPassword);

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

      await this.userRepo.save(newUser);

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
