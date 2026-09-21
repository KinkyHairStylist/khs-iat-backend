import { NotFoundException } from '@nestjs/common';
import { AddressService } from './address.service';

// A customer can only change or delete their own addresses.

function setup() {
  const addressRepository = {
    findOne: jest.fn(async ({ where }: any) => ((where.user === undefined || where.user.id === 'cust-1') && where.id === 'addr-1' ? { id: 'addr-1', type: 'home', fullAddress: 'x' } : null)),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  const service = new AddressService(addressRepository as any, { sendAddressUpdateEmail: jest.fn() } as any);
  return { service, addressRepository };
}

const me: any = { id: 'cust-1', email: 'c@example.com' };
const other: any = { id: 'cust-2', email: 'o@example.com' };

describe('customer addresses', () => {
  it('lets a customer update and delete their own address', async () => {
    const { service, addressRepository } = setup();
    await service.updateAddress(me, 'addr-1', {} as any);
    await service.deleteAddress(me, 'addr-1');
    expect(addressRepository.update).toHaveBeenCalled();
    expect(addressRepository.delete).toHaveBeenCalledWith('addr-1');
  });

  it("refuses another customer's address", async () => {
    const { service, addressRepository } = setup();
    await expect(service.updateAddress(other, 'addr-1', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteAddress(other, 'addr-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(addressRepository.update).not.toHaveBeenCalled();
    expect(addressRepository.delete).not.toHaveBeenCalled();
  });
});
