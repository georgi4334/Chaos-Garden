import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** Server-side caps on what a garden owner may set. */
export const MAX_RATE_LIMIT_RPS = 50;
export const MAX_RATE_LIMIT_BURST = 100;

export class CreateGardenDto {
  @IsString()
  @Length(1, 100)
  name: string;
}

export class UpdateGardenDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  /** Sustained requests per second the proxy allows for this garden. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_RATE_LIMIT_RPS)
  rateLimitRps?: number;

  /** How many requests may arrive at once before the sustained rate applies. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_RATE_LIMIT_BURST)
  rateLimitBurst?: number;
}
