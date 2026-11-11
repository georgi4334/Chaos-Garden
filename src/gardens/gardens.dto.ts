import { IsString, Length } from 'class-validator';

export class CreateGardenDto {
  @IsString()
  @Length(1, 100)
  name: string;
}

export class UpdateGardenDto {
  @IsString()
  @Length(1, 100)
  name: string;
}
