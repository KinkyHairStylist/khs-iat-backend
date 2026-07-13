import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../user_entities/address.entity';
import { CreateAddressDto, UpdateAddressDto } from '../dtos/address.dto';
import { User } from '../../all_user_entities/user.entity';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(UserAddress)
    private addressRepository: Repository<UserAddress>,
  ) {}

  async createAddress(user: User, createAddressDto: CreateAddressDto): Promise<UserAddress> {
    const address = this.addressRepository.create({
      ...createAddressDto,
      user,
    });
    return this.addressRepository.save(address);
  }

  async getUserAddresses(user: User): Promise<UserAddress[]> {
    return this.addressRepository.find({
      where: { user: { id: user.id } },
    });
  }

  async updateAddress(addressId: string, updateAddressDto: UpdateAddressDto): Promise<UserAddress> {
    await this.addressRepository.update(addressId, updateAddressDto);
    const updatedAddress = await this.addressRepository.findOne({ where: { id: addressId } });
    if (!updatedAddress) {
      throw new Error('Address not found');
    }
    return updatedAddress;
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.addressRepository.delete(addressId);
  }
}