import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAbsenceDto {
  @IsIn(['conge', 'maladie', 'autre'])
  type: 'conge' | 'maladie' | 'autre';

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

export class UpdateOwnAbsenceDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

export class RejectAbsenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class CreateManagedAbsenceDto {
  @IsString()
  userId: string;

  @IsIn(['conge', 'maladie', 'autre'])
  type: 'conge' | 'maladie' | 'autre';

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

export class UpdateManagedAbsenceDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
