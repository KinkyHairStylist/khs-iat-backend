import { IsNotEmpty, IsString } from 'class-validator';

export class UploadServiceImageDto {
  @IsString()
  @IsNotEmpty()
  dataUri: string;
}
