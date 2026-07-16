import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../user_entities/address.entity';
import { CreateAddressDto, UpdateAddressDto } from '../dtos/address.dto';
import { User } from '../../all_user_entities/user.entity';
import { EmailService } from '../../email/email.service';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(UserAddress)
    private addressRepository: Repository<UserAddress>,
    private emailService: EmailService,
  ) {}

  async createAddress(user: User, createAddressDto: CreateAddressDto): Promise<UserAddress> {
    const address = this.addressRepository.create({
      ...createAddressDto,
      user,
    });
    const saved = await this.addressRepository.save(address);

    if (user.email) {
      this.emailService.sendAddressUpdateEmail(
        user.email,
        user.firstName || 'Customer',
        saved.type,
        saved.fullAddress,
        'added',
      );
    }

    return saved;
  }

  async getUserAddresses(user: User): Promise<UserAddress[]> {
    return this.addressRepository.find({
      where: { user: { id: user.id } },
    });
  }

  async updateAddress(user: User, addressId: string, updateAddressDto: UpdateAddressDto): Promise<UserAddress> {
    await this.addressRepository.update(addressId, updateAddressDto);
    const updatedAddress = await this.addressRepository.findOne({ where: { id: addressId } });
    if (!updatedAddress) {
      throw new Error('Address not found');
    }

    if (user.email) {
      this.emailService.sendAddressUpdateEmail(
        user.email,
        user.firstName || 'Customer',
        updatedAddress.type,
        updatedAddress.fullAddress,
        'updated',
      );
    }

    return updatedAddress;
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.addressRepository.delete(addressId);
  }
}