import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  senderId: string;

  @IsUUID()
  businessId: string;

  @IsOptional()
  @IsEmail()
  senderEmail: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsString()
  @MinLength(1)
  business: string;

  @IsNumber()
  amount: number;

  @IsString()
  method: string;
}

export interface PaymentResponse {
  payment: any;
  approvalUrl: string;
  orderId: string;
}

export interface PayStackPaymentResponse {
  payment: any;
  authorizationUrl: string;
  reference: string;
}

export interface CaptureResponse {
  captureId: string;
  status: string;
  amount: number;
  businessId: string;
}
