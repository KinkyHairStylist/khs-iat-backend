import {
    IsNotEmpty,
    IsOptional,
} from 'class-validator';


export class CreateBlockedTimeDto {
    @IsOptional()
    type: string;

    @IsOptional()
    title: string;

    @IsNotEmpty({ message: 'date must not be empty.' })
    date: string;

    @IsNotEmpty()
    startTime: string;

    @IsNotEmpty()
    endTime: string;

    @IsOptional()
    teamMember: string;

    @IsOptional()
    description: string;

    ownerMail?: string;
}
