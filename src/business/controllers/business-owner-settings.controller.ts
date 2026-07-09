import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Request,
  HttpException,
  BadRequestException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { BusinessOwnerSettingsService } from '../services/business-owner-settings.service';
import { BusinessOwnerSettings } from '../entities/business-owner-settings.entity';
import {
  CreateUserAddressDto,
  UpdateBusinessOwnerSettingsDto,
  UpdateOwnerProfileDto,
} from '../dtos/requests/BusinessOwnerSettingsDto';
import { UserService } from 'src/user/services/user.service';
import { Business } from '../entities/business.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Business Owner Settings')
@ApiBearerAuth('access-token')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles(Role.Business, Role.SuperAdmin)
@Controller('business-owner-settings')
export class BusinessOwnerSettingsController {
  constructor(
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,

    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
    private readonly userService: UserService,
  ) {}

  // @Post()
  // @HttpCode(HttpStatus.CREATED)
  // async create(
  //   @Body() createDto: CreateBusinessSettingsDto,
  // ): Promise<BusinessSettings> {
  //   return await this.businessSettingsService.create(createDto);
  // }

  @Get('owner')
  async getOwner(@Request() req) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const owner = await this.userService.findById(ownerId);

      if (!owner) {
        throw new BadRequestException(`Owner not found for this business`);
      }

      return {
        success: true,
        data: owner,
        message: 'Owner fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to fetch owner',
      };
    }
  }

  @Patch('owner/update-profile')
  async updateOwnerProfile(@Request() req) {
    const { body, files } = req;
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const owner = await this.userService.findById(ownerId);

      if (!owner) {
        throw new BadRequestException(`Owner not found for this business`);
      }

      const bodyProfileImage = files.profileImage;

      const dto: UpdateOwnerProfileDto = {
        dateOfBirth: body.dateOfBirth,
        firstName: body.firstName,
        gender: body.gender,
        phoneNumber: body.phoneNumber,
        surname: body.surname,
        profilePicture: body.profilePicture,
      };

      const result = await this.businessOwnerSettingsService.updateOwnerProfile(
        dto,
        owner,
        bodyProfileImage,
      );

      return {
        success: true,
        data: result,
        message: 'Profile Updated',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to update profile',
      };
    }
  }

  @Post('owner/address')
  async addOwnerAddress(
    @Request() req,
    @Body() addresses: CreateUserAddressDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const owner = await this.userService.findById(ownerId);

      if (!owner) {
        throw new BadRequestException(`Owner not found for this business`);
      }

      const result = await this.businessOwnerSettingsService.addUserAddresses(
        owner,
        addresses,
      );

      return {
        success: true,
        data: result,
        message: 'Profile Address added',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to add profile address',
      };
    }
  }

  @Patch('owner/:addressId/address')
  async updateOwnerAddress(
    @Request() req,
    @Param('addressId') addressId: string,
    @Body() body: any,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const owner = await this.userService.findById(ownerId);

      if (!owner) {
        throw new BadRequestException(`Owner not found for this business`);
      }

      const result = await this.businessOwnerSettingsService.updateUserAddress(
        owner,
        addressId,
        body,
      );

      return {
        success: true,
        data: result,
        message: 'Profile Address updated',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to update profile address',
      };
    }
  }

  @Delete('owner/:addressId/address')
  async deleteOwnerAddress(
    @Request() req,
    @Param('addressId') addressId: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const owner = await this.userService.findById(ownerId);

      if (!owner) {
        throw new BadRequestException(`Owner not found for this business`);
      }

      const result = await this.businessOwnerSettingsService.deleteUserAddress(
        owner,
        addressId,
      );

      return {
        success: true,
        data: result,
        message: 'Profile Address updated',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to update profile address',
      };
    }
  }

  @Get('/settings')
  async findByOwnerId(@Request() req) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result =
        await this.businessOwnerSettingsService.findByOwnerId(ownerId);

      return {
        success: true,
        data: result,
        message: 'Settings fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to fetch settings',
      };
    }
  }

  @Put('/update')
  async updateSettings(
    @Request() req,
    @Body() updateDto: UpdateBusinessOwnerSettingsDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const business = await this.businessRepository.findOne({
        where: { ownerId },
      });

      if (!business) {
        throw new BadRequestException(`No business found for this user`);
      }

      const result = await this.businessOwnerSettingsService.update(
        ownerId,
        business.id,
        updateDto,
      );

      return {
        success: true,
        data: result,
        message: 'Settings Updated',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to fetch owner',
      };
    }
  }

  @Delete(':businessId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('businessId') businessId: string): Promise<void> {
    return await this.businessOwnerSettingsService.delete(businessId);
  }

  @Get('settings/:businessId')
  async findOne(@Param('businessId') businessId: string, @Request() req) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result =
        await this.businessOwnerSettingsService.findByBusinessId(businessId);

      return {
        success: true,
        data: result,
        message: 'Business Owner settings fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to fetch Business Owner settings ',
      };
    }
  }

  @Get()
  async findAll(): Promise<BusinessOwnerSettings[]> {
    return await this.businessOwnerSettingsService.findAll();
  }
}
