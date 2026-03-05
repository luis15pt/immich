import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsSemVer,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { WorkflowType } from 'src/enum';
import { JSONSchema } from 'src/types';
import { ValidateEnum } from 'src/validation';

class PluginManifestMethodDto {
  @ApiProperty({ description: 'Method name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Method title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Method description' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ArrayMinSize(1)
  @ValidateEnum({ enum: WorkflowType, name: 'WorkflowType', each: true, description: 'Workflow type' })
  types!: WorkflowType[];

  @ApiPropertyOptional({ description: 'Method schema' })
  @IsObject()
  @IsOptional()
  schema?: JSONSchema;
}

export class PluginManifestDto {
  @ApiProperty({ description: 'Plugin name (lowercase, numbers, hyphens only)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+[a-z0-9]$/, {
    message: 'Plugin name must contain only lowercase letters, numbers, and hyphens, and cannot end with a hyphen',
  })
  name!: string;

  @ApiProperty({ description: 'Plugin version (semver)' })
  @IsString()
  @IsNotEmpty()
  @IsSemVer()
  version!: string;

  @ApiProperty({ description: 'Plugin title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Plugin description' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ description: 'WASM file path' })
  @IsString()
  @IsNotEmpty()
  wasmPath!: string;

  @ApiProperty({ description: 'Plugin author' })
  @IsString()
  @IsNotEmpty()
  author!: string;

  @ApiPropertyOptional({ description: 'Plugin filters' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PluginManifestMethodDto)
  @IsOptional()
  methods!: PluginManifestMethodDto[];
}
