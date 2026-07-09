import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientController } from './controllers/client.controller';
import { ClientService } from './services/client.service';
import { ClientProfileService } from './services/client-profile.service';
import { ClientAddressService } from './services/client-address.service';
import { EmergencyContactService } from './services/emergency-contact.service';
import { ClientSchema } from './entities/client.entity';
import { ClientAddressSchema } from './entities/client-address.entity';
import { EmergencyContactSchema } from './entities/emergency-contact-schema.entity';
import { ClientSettingsSchema } from './entities/client-settings.entity';
import { Business } from './entities/business.entity';
import { ClientSettingsService } from './services/client-settings.service';
import { ClientProfileValidationMiddleware } from './middlewares/validate-client-data.middleware';
import { FormidableMiddleware } from './middlewares/formidable.middleware';
import { BusinessCloudinaryModule } from './business-cloudinary.module';
import { User } from 'src/all_user_entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientSchema,
      ClientAddressSchema,
      EmergencyContactSchema,
      ClientSettingsSchema,
      Business,
      User,
    ]),
    BusinessCloudinaryModule,
  ],
  controllers: [ClientController],
  providers: [
    ClientService,
    ClientProfileService,
    ClientAddressService,
    EmergencyContactService,
    ClientSettingsService,
  ],
  exports: [ClientService],
})
export class ClientModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FormidableMiddleware).forRoutes(
      { path: 'clients', method: RequestMethod.POST },
      { path: 'clients/client/profile', method: RequestMethod.POST },
      {
        path: 'clients/client/update-profile/:clientId',
        method: RequestMethod.PATCH,
      },
    );

    consumer.apply(ClientProfileValidationMiddleware).forRoutes(
      // POST /clients
      { path: 'clients', method: RequestMethod.POST },

      // POST /clients/client/profile
      { path: 'clients/client/profile', method: RequestMethod.POST },

      // POST /clients/client/profile
      {
        path: 'clients/client/update-profile/:clientId',
        method: RequestMethod.PATCH,
      },
    );
  }
}
