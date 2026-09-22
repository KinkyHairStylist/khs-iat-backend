import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from 'src/business/types/constants';
import { CreateBusinessDto } from 'src/business/dtos/requests/CreateBusinessDto';

export const ADMIN_CREATE_PERSONAS = ['CUSTOMER', 'MERCHANT', 'ADMIN'] as const;
export type AdminCreatePersona = (typeof ADMIN_CREATE_PERSONAS)[number];

// An admin adding a user: the same details that person's own sign-up asks for. For a merchant the
// business setup (all the steps of the real onboarding) comes with it.
export class AdminCreateUserDto {
  @IsIn(ADMIN_CREATE_PERSONAS as unknown as string[], {
    message: 'Persona must be CUSTOMER, MERCHANT or ADMIN.',
  })
  persona: AdminCreatePersona;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required.' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Surname is required.' })
  surname: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required.' })
  phoneNumber: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'Invalid gender.' })
  gender?: Gender;

  // Required for a merchant: the business, set up the way the real onboarding does it.
  @ValidateIf((o) => o.persona === 'MERCHANT')
  @ValidateNested()
  @Type(() => CreateBusinessDto)
  @IsNotEmpty({ message: 'Business details are required for a merchant.' })
  business?: CreateBusinessDto;
}

// Turning an existing customer or admin into a merchant: they already have an account, so only
// the business (and how it starts) is needed.
export class AdminMakeMerchantDto {
  @ValidateNested()
  @Type(() => CreateBusinessDto)
  @IsNotEmpty({ message: 'Business details are required.' })
  business: CreateBusinessDto;
}
