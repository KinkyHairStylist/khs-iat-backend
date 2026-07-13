// import { Test, TestingModule } from '@nestjs/testing';
// import { AuthService } from '../services/auth.service';
// import { getModelToken } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import { User, UserDocument } from '../entities/user.entity';
// import { JwtService } from '@nestjs/jwt';
// import { PasswordUtil } from '../utils/password.util';
// import { CreateUserDto } from '../dtos/requests/CreateUserDto';
// import mongoose from 'mongoose';
// import { Gender } from '../types/constants';
// // --- NEW DEPENDENCY IMPORTS ---
// import { OtpService } from '../services/otp.service';
// import { IEmailService } from '../services/emailService/interfaces/i.email.service';
// import {
//   RefreshToken,
//   RefreshTokenDocument,
// } from '../entities/refresh.token.entity';
//
// // Setup environment variables for JWT secrets (Required for verifyAsync/signAsync)
// process.env.JWT_ACCESS_SECRET = 'test_access_secret';
// process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
// process.env.JWT_VERIFICATION_SECRET = 'test_verification_secret';
// process.env.JWT_RESET_SECRET = 'test_reset_secret'; // 👈 REQUIRED FOR FORGOT PASSWORD
//
// // --- MOCK CONSTANTS & DATA ---
// const mockUserId = new mongoose.Types.ObjectId();
// const mockHashedPassword = 'hashedPassword123';
// const mockAccessToken = 'mock_access_token';
// const mockRefreshTokenValue = 'mock_refresh_token_value'; // Actual JWT value
// const mockRefreshTokenHash = 'hashed_refresh_token_from_db'; // Hashed value stored in DB
// const mockVerificationToken = 'valid_verification_jwt';
// const mockResetToken = 'mock_password_reset_jwt'; // Mock for the generated reset token
//
// const mockPayload = { sub: mockUserId.toString(), email: 'test@example.com' };
//
// const mockCreateUserDto: CreateUserDto = {
//   email: 'test@example.com',
//   firstname: 'Test',
//   surname: 'User',
//   password: 'StrongPassword123!',
//   phone: '1234567890',
//   gender: Gender.CUSTOM,
//   verificationToken: mockVerificationToken,
// };
//
// // Mock User Document instance (used when mocking the constructor return value)
// const mockUserDocumentInstance = {
//   _id: mockUserId,
//   email: mockCreateUserDto.email,
//   phone: mockCreateUserDto.phone,
//   password: mockHashedPassword,
//   isVerified: true,
//   save: jest.fn().mockImplementation(function (this: UserDocument) {
//     return Promise.resolve(this);
//   }),
// } as unknown as UserDocument;
//
// // Mock RefreshToken Document instance (used when mocking the constructor return value)
// const mockRefreshTokenDocument = {
//   _id: new mongoose.Types.ObjectId(),
//   user: mockUserId,
//   tokenHash: mockRefreshTokenHash,
//   save: jest.fn().mockResolvedValue({}),
// } as unknown as RefreshTokenDocument;
//
// // --- MOCK DEPENDENCIES ---
//
// // 1. Mock PasswordUtil
// const mockPasswordUtil = {
//   hashPassword: jest.fn().mockImplementation((password: string) => {
//     return password === mockRefreshTokenValue
//       ? Promise.resolve(mockRefreshTokenHash)
//       : Promise.resolve(mockHashedPassword);
//   }),
//   validatePasswordStrength: jest.fn(),
//   comparePassword: jest.fn().mockResolvedValue(true),
// };
//
// // 2. Mock OtpService (Minimal mock for dependency resolution)
// const mockOtpService = {};
//
// // 3. Mock EmailService
// const mockEmailService = {
//   sendPasswordReset: jest.fn().mockResolvedValue(undefined),
// };
//
// // 4. Mock JwtService
// const mockJwtService = {
//   signAsync: jest.fn((payload, options) => {
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
//     if (options.secret === process.env.JWT_ACCESS_SECRET) {
//       return Promise.resolve(mockAccessToken);
//     }
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
//     if (options.secret === process.env.JWT_REFRESH_SECRET) {
//       return Promise.resolve(mockRefreshTokenValue);
//     }
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
//     if (options.secret === process.env.JWT_RESET_SECRET) {
//       return Promise.resolve(mockResetToken);
//     }
//     return Promise.resolve('unknown_token');
//   }),
//   verifyAsync: jest.fn().mockResolvedValue({ email: mockCreateUserDto.email }),
// };
//
// // 5. Mock Mongoose RefreshToken Model (Callable Constructor + Static Methods)
// const mockRefreshTokenModel = jest.fn().mockImplementation((dto) => {
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-return
//   return {
//     ...mockRefreshTokenDocument,
//     ...dto,
//     save: jest.fn().mockResolvedValue(mockRefreshTokenDocument),
//   };
// }) as unknown as Model<RefreshTokenDocument>;
//
// mockRefreshTokenModel.findOne = jest.fn();
// mockRefreshTokenModel.deleteMany = jest.fn().mockResolvedValue({});
// mockRefreshTokenModel.deleteOne = jest.fn().mockResolvedValue({});
//
// // 6. Mock Mongoose User Model (Callable Constructor + Static Methods)
// const mockUserModel = jest.fn().mockImplementation((dto) => {
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-return
//   return {
//     ...mockUserDocumentInstance,
//     ...dto,
//   };
// }) as unknown as Model<UserDocument>;
//
// // FIX: Set up findOne to return a chainable object with an 'exec' method
// (mockUserModel as jest.Mock & typeof mockUserModel).findOne = jest
//   .fn()
//   .mockImplementation(() => ({ exec: jest.fn() })); // Default to a chainable exec mock
//
// // Existing findById mock already uses this pattern
// (mockUserModel as jest.Mock & typeof mockUserModel).findById = jest
//   .fn()
//   .mockReturnValue({ exec: jest.fn() });
//
// describe('AuthService', () => {
//   let service: AuthService;
//   let userModel: Model<UserDocument>;
//   let refreshTokenModel: Model<RefreshTokenDocument>;
//   let emailService: IEmailService;
//
//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         AuthService,
//         {
//           provide: getModelToken(User.name),
//           useValue: mockUserModel,
//         },
//         {
//           provide: getModelToken(RefreshToken.name),
//           useValue: mockRefreshTokenModel,
//         },
//         { provide: OtpService, useValue: mockOtpService },
//         { provide: JwtService, useValue: mockJwtService },
//         { provide: PasswordUtil, useValue: mockPasswordUtil },
//         { provide: IEmailService, useValue: mockEmailService },
//       ],
//     }).compile();
//
//     service = module.get<AuthService>(AuthService);
//     userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
//     refreshTokenModel = module.get<Model<RefreshTokenDocument>>(
//       getModelToken(RefreshToken.name),
//     );
//     emailService = module.get<IEmailService>(IEmailService);
//
//     jest.clearAllMocks();
//     mockPasswordUtil.comparePassword.mockResolvedValue(true);
//   });
//
//   it('should be defined', () => {
//     expect(service).toBeDefined();
//   });
//
//   // --- FORGOT PASSWORD TESTS (FIXED MOCKING) ---
//   describe('requestPasswordReset', () => {
//     const forgotPasswordDto = { email: 'existing@example.com' };
//
//     // Helper function to set the mock return value for findOne().exec()
//     const mockFindOneExec = (returnValue: any) => {
//       (userModel.findOne as jest.Mock).mockReturnValue({
//         exec: jest.fn().mockResolvedValue(returnValue),
//       });
//     };
//
//     it('should generate a reset token and send email if user exists', async () => {
//       // Setup: User found
//       mockFindOneExec(mockUserDocumentInstance);
//
//       const result = await service.requestPasswordReset(forgotPasswordDto);
//
//       // 1. Assert user lookup (case-insensitive)
//       // eslint-disable-next-line @typescript-eslint/unbound-method
//       expect(userModel.findOne).toHaveBeenCalledWith({
//         email: { $regex: new RegExp(`^${forgotPasswordDto.email}$`, 'i') },
//       });
//
//       // 2. Assert JWT creation
//       expect(mockJwtService.signAsync).toHaveBeenCalledWith(
//         expect.objectContaining({ sub: mockUserId.toString() }),
//         { secret: process.env.JWT_RESET_SECRET, expiresIn: '1h' },
//       );
//
//       // 3. Assert email was sent with the correct link format
//       const expectedLinkPrefix = '[FRONTEND_BASE_URL]/reset-password?token=';
//       // eslint-disable-next-line @typescript-eslint/unbound-method
//       expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
//         mockUserDocumentInstance.email,
//         expect.stringContaining(expectedLinkPrefix + mockResetToken), // Checks for the token in the URL
//       );
//
//       // 4. Assert generic success message
//       expect(result).toEqual({
//         message:
//           'If a user with that email exists, a password reset link has been sent.',
//       });
//     });
//
//     it('should return generic success message if user does NOT exist (security measure)', async () => {
//       // Setup: User not found
//       mockFindOneExec(null);
//
//       const result = await service.requestPasswordReset(forgotPasswordDto);
//
//       // Assert user lookup still happened
//       // eslint-disable-next-line @typescript-eslint/unbound-method
//       expect(userModel.findOne).toHaveBeenCalled();
//       // Assert no JWT was generated
//       expect(mockJwtService.signAsync).not.toHaveBeenCalled();
//       // Assert no email was attempted
//       // eslint-disable-next-line @typescript-eslint/unbound-method
//       expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
//       // Assert generic success message
//       expect(result).toEqual({
//         message:
//           'If a user with that email exists, a password reset link has been sent.',
//       });
//     });
//   });
//
//   // --- REGISTRATION TESTS (existing tests below...) ---
//   describe('register', () => {
//     beforeEach(() => {
//       // Reset findOne mock for registration tests
//       (userModel.findOne as jest.Mock).mockResolvedValue(null);
//       mockJwtService.verifyAsync.mockResolvedValue({
//         email: mockCreateUserDto.email,
//       });
//       mockPasswordUtil.validatePasswordStrength.mockClear();
//     });
//
//     it('should successfully register a new user and return tokens', async () => {
//       const result = await service.register(mockCreateUserDto);
//       expect(result.accessToken).toBe(mockAccessToken);
//       expect(result.refreshToken).toBe(mockRefreshTokenValue);
//     });
//
//     // ... (Other registration tests) ...
//   });
//
//   // --- GET TOKENS (with RTR Hash Saving) ---
//   describe('getTokens', () => {
//     it('should generate tokens, hash the refresh token, and save it to the database', async () => {
//       const tokens = await service.getTokens(
//         mockUserId.toString(),
//         mockCreateUserDto.email,
//       );
//
//       expect(mockPasswordUtil.hashPassword).toHaveBeenCalledWith(
//         mockRefreshTokenValue,
//       );
//       expect(tokens).toEqual({
//         accessToken: mockAccessToken,
//         refreshToken: mockRefreshTokenValue,
//       });
//     });
//   });
//
//   // --- REFRESH TOKENS API TESTS ---
//   describe('refreshTokens', () => {
//     beforeEach(() => {
//       mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
//       (userModel.findById as jest.Mock).mockReturnValue({
//         exec: jest.fn().mockResolvedValue(mockUserDocumentInstance),
//       });
//       (refreshTokenModel.findOne as jest.Mock).mockResolvedValue(
//         mockRefreshTokenDocument,
//       );
//       mockPasswordUtil.comparePassword.mockResolvedValue(true);
//     });
//
//     it('should successfully refresh tokens when refresh token is valid and matches DB hash', async () => {
//       const result = await service.refreshTokens(mockRefreshTokenValue);
//       expect(result.accessToken).toBe(mockAccessToken);
//       expect(result.refreshToken).toBe(mockRefreshTokenValue);
//     });
//
//     it('should throw UnauthorizedException if token does not match stored hash (RTR breach)', async () => {
//       mockPasswordUtil.comparePassword.mockResolvedValue(false);
//
//       await expect(
//         service.refreshTokens(mockRefreshTokenValue),
//       ).rejects.toThrow('Token mismatch. All tokens for this user revoked.');
//     });
//   });
//
//   // --- FINDER METHODS TESTS ---
//   describe('findOneById', () => {
//     it('should call model.findById with the correct ID', async () => {
//       const mockExec = jest.fn().mockResolvedValue(mockUserDocumentInstance);
//       (userModel.findById as jest.Mock).mockReturnValue({ exec: mockExec });
//
//       const result = await service.findOneById(mockUserId.toString());
//       expect(result).toEqual(mockUserDocumentInstance);
//     });
//   });
// });
