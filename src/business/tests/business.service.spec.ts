// import { Test, TestingModule } from '@nestjs/testing';
// import { BusinessService } from '../services/business.service';
// import { getModelToken } from '@nestjs/mongoose';
// import { Business } from '../entities/business.schema';
// import { CreateBusinessDto } from '../dtos/requests/CreateBusinessDto';
// import { UserDocument } from '../entities/user.entity';
// import mongoose from 'mongoose';
// import { CompanySize } from '../types/constants';
//
// const mockCreateBusinessDto: CreateBusinessDto = {
//   businessName: 'Gemini AI Solutions',
//   description: 'AI-powered business consultation.',
//   primaryAudience: 'Startups',
//   services: ['Consulting', 'Development'],
//   businessAddress: '123 Main St, London',
//   companySize: CompanySize.SMALL_TEAM,
//   howDidYouHear: 'Word of Mouth',
//   bookingPolicies: {
//     minimumLeadTime: 60,
//     bufferTime: 30,
//     cancellationWindow: 24,
//     depositAmount: 50,
//   },
//   bookingHours: [
//     { day: 'Monday', isOpen: true, startTime: '09:00', endTime: '17:00' },
//     { day: 'Tuesday', isOpen: true, startTime: '09:00', endTime: '17:00' },
//   ],
// };
//
// // Mock the authenticated user
// const mockUserId = new mongoose.Types.ObjectId();
// // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
// const mockUserDocument: Partial<UserDocument> = {
//   _id: mockUserId,
//   email: 'owner@example.com',
// } as any;
//
// // --- FIX: MOCK MODEL AS A CONSTRUCTOR FUNCTION ---
//
// // We define the result of a successful save operation
// const savedDocumentResult = {
//   _id: new mongoose.Types.ObjectId(),
//   ...mockCreateBusinessDto,
//   owner: mockUserId,
// };
//
// // This is the Mongoose Document instance mock, containing the save function
// const mockBusinessDocumentInstance = {
//   // This is the function that gets called when `new BusinessModel(...)` is executed
//   save: jest.fn().mockResolvedValue(savedDocumentResult),
// };
//
// // This is the Mongoose Model constructor mock
// // It is a jest.fn that returns the mock document instance when called with 'new'
// const mockBusinessModel = jest.fn().mockImplementation((dto) => {
//   // When the service calls `new this.businessModel(data)`, this function runs.
//   // It returns the document instance mock, merged with the input data.
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-return
//   return {
//     ...mockBusinessDocumentInstance,
//     ...dto,
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
//     owner: dto.owner,
//   };
// });
//
// describe('BusinessService', () => {
//   let service: BusinessService;
//   // We use the mock function directly for asserting calls
//   let modelConstructor: jest.Mock;
//
//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         BusinessService,
//         {
//           provide: getModelToken(Business.name),
//           useValue: mockBusinessModel, // Use the constructor mock here
//         },
//       ],
//     }).compile();
//
//     service = module.get<BusinessService>(BusinessService);
//     modelConstructor = module.get(getModelToken(Business.name));
//     // Clear the mock calls before each test
//     modelConstructor.mockClear();
//     mockBusinessDocumentInstance.save.mockClear();
//   });
//
//   it('should be defined', () => {
//     expect(service).toBeDefined();
//   });
//
//   describe('create', () => {
//     it('should correctly instantiate and save a new business document', async () => {
//       // 1. Call the method being tested
//       const result = await service.create(
//         mockCreateBusinessDto,
//         mockUserDocument,
//       );
//
//       // 2. Assertions
//
//       // Check that the Model constructor function was called exactly once
//       expect(modelConstructor).toHaveBeenCalledTimes(1);
//
//       // Check the arguments passed to the Model constructor
//       expect(modelConstructor).toHaveBeenCalledWith({
//         ...mockCreateBusinessDto,
//         // Crucially, check that the owner ID from the user was passed
//         owner: mockUserId,
//       });
//
//       // Check that the save method on the resulting document instance was called
//       expect(mockBusinessDocumentInstance.save).toHaveBeenCalledTimes(1);
//
//       // Check the structure of the returned result (from mockResolvedValue)
//       expect(result.businessName).toEqual(mockCreateBusinessDto.businessName);
//       expect(result.owner).toEqual(mockUserId);
//       expect(result).toHaveProperty('_id');
//     });
//   });
// });
