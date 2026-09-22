import 'reflect-metadata';
import { instanceToPlain } from 'class-transformer';
import { User } from './user.entity';

// A user's secrets stay out of any response, including when the user is nested inside something else.

const user = () =>
  Object.assign(new User(), {
    id: 'u1',
    firstName: 'Olu',
    email: 'olu@example.com',
    password: 'hash',
    verificationCode: '111111',
    verificationExpires: new Date(),
    resetCode: '654321',
    resetCodeExpires: new Date(),
    refreshTokens: [{ token: 't' }],
  });

describe('a user in a response', () => {
  it('has no password, verification code or reset code', () => {
    const plain = instanceToPlain(user());

    for (const field of ['password', 'verificationCode', 'verificationExpires', 'resetCode', 'resetCodeExpires', 'refreshTokens']) {
      expect(plain).not.toHaveProperty(field);
    }
    expect(plain).toMatchObject({ id: 'u1', firstName: 'Olu', email: 'olu@example.com' });
  });

  it('has none when it is nested, as a booking owner or client is', () => {
    const plain: any = instanceToPlain({ business: { owner: user() }, client: user(), list: [user()] });

    expect(plain.business.owner).not.toHaveProperty('resetCode');
    expect(plain.client).not.toHaveProperty('password');
    expect(plain.list[0]).not.toHaveProperty('password');
  });
});
