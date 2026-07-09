import {

    IsNotEmpty,

} from 'class-validator';


export class CreateBlockedTimeDto {
    @IsNotEmpty()
    type: string;
    @IsNotEmpty()
    title: string;
    @IsNotEmpty({ message: 'date must not be empty.' })
    date: string;
    @IsNotEmpty()
    startTime: string;
    @IsNotEmpty()
    endTime: string;
    @IsNotEmpty()
    teamMember: string;
    @IsNotEmpty()
    description: string;
    ownerMail?: string;
}
