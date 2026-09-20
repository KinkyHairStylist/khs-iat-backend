import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConnectMailchimpDto {
  @IsString()
  @MaxLength(100)
  apiKey: string;

  // Needed only when the Mailchimp account has more than one audience.
  @IsString()
  @IsOptional()
  @MaxLength(50)
  audienceId?: string;
}
