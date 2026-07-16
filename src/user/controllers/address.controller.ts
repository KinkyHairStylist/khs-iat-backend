import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';

import { AddressService } from '../services/address.service';
import { CreateAddressDto, UpdateAddressDto } from '../dtos/address.dto';
import { RolesGuard } from 'src/middleware/roles.guard';
import { User } from '../../all_user_entities/user.entity';
import { Roles } from '../../middleware/roles.decorator';
import { Role } from '../../middleware/role.enum';
import { GetUser } from '../../middleware/get-user.decorator';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';

@ApiTags('User Addresses')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Customer)
@Controller('user/addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new address for the authenticated user' })
  @ApiBearerAuth()
  @ApiBody({ type: CreateAddressDto })
  @ApiResponse({ status: 201, description: 'Address created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createAddress(
    @GetUser() user: User,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    return this.addressService.createAddress(user, createAddressDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all addresses for the authenticated user' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Addresses retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserAddresses(@GetUser() user: User) {
    return this.addressService.getUserAddresses(user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing address' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Address ID', type: 'string' })
  @ApiBody({ type: UpdateAddressDto })
  @ApiResponse({ status: 200, description: 'Address updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async updateAddress(
    @GetUser() user: User,
    @Param('id') addressId: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return this.addressService.updateAddress(user, addressId, updateAddressDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an address' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Address ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Address deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async deleteAddress(@Param('id') addressId: string) {
    return this.addressService.deleteAddress(addressId);
  }
}
