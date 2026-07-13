import { JwtService } from '@nestjs/jwt';

export const getTokens = async (
  jwtService: JwtService,
  userId: string,
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> => {
  const payload = { sub: userId, email };

  const [accessToken, refreshToken] = await Promise.all([
    jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '2d',
    }),
    jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    }),
  ]);

  return { accessToken, refreshToken };
};
