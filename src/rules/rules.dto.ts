import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { FAULT_TYPES, type FaultType } from './rule-params.js';

export class CreateRuleDto {
  /** HTTP method or `*` for any. */
  @IsOptional()
  @IsIn(['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
  method?: string;

  /** Path pattern, must start with `/`. `*` is a wildcard. */
  @IsOptional()
  @IsString()
  @Matches(/^\/[\w\-./:*]*$/, { message: 'pathPattern must start with / and use simple path characters' })
  pathPattern?: string;

  @IsIn(FAULT_TYPES)
  type: FaultType;

  /** Chance (0..1) that the fault is applied to a matching request. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1)
  probability?: number;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsIn(['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
  method?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\/[\w\-./:*]*$/, { message: 'pathPattern must start with / and use simple path characters' })
  pathPattern?: string;

  @IsOptional()
  @IsIn(FAULT_TYPES)
  type?: FaultType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1)
  probability?: number;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
