// import { Test, TestingModule } from '@nestjs/testing';
// import { UserController } from './user.controller';
// import { UserService } from '../services/user.service';

// describe('UserController', () => {
//   let controller: UserController;

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       controllers: [UserController],
//       providers: [
//         {
//           provide: UserService,
//           useValue: {
//             getStarted: jest.fn(),
//             verifyCode: jest.fn(),
//             resendCode: jest.fn(),
//             signUp: jest.fn(),
//             login: jest.fn(),
//             startResetPassword: jest.fn(),
//             verifyResetCode: jest.fn(),
//             finishResetPassword: jest.fn(),
//           },
//         },
//       ],
//     }).compile();

//     controller = module.get<UserController>(UserController);
//   });
//   it('should be defined', () => {
//     expect(controller).toBeDefined();
//   });
// });
