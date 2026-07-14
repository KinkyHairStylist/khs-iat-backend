import {
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';


export class CreateBlockedTimeDto {
    @IsNotEmpty()
    type: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsNotEmpty({ message: 'date must not be empty.' })
    date: string;

    @IsNotEmpty()
    startTime: string;

    @IsNotEmpty()
    endTime: string;

    @IsNotEmpty()
    teamMember: string;

    @IsOptional()
    @IsString()
    description?: string;

    ownerMail?: string;
}
