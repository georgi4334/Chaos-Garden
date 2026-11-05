import { IsString, IsUrl, Length } from 'class-validator';

export class CreateTargetDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  baseUrl: string;
}

export class UpdateTargetDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  baseUrl: string;
}
