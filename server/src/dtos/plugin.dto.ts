import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { PluginMethod } from 'src/database';
import { WorkflowType } from 'src/enum';
import { JSONSchema } from 'src/types';
import { ValidateBoolean, ValidateString, ValidateUUID } from 'src/validation';

export class PluginSearchDto {
  @ValidateUUID({ optional: true, description: 'Plugin ID' })
  id?: string;

  @ValidateBoolean({ optional: true, description: 'Whether the plugin is enabled' })
  enabled?: boolean;

  @ValidateString({ optional: true })
  name?: string;

  @ValidateString({ optional: true })
  version?: string;

  @ValidateString({ optional: true })
  title?: string;

  @ValidateString({ optional: true })
  description?: string;
}

export class PluginResponseDto {
  @ApiProperty({ description: 'Plugin ID' })
  id!: string;
  @ApiProperty({ description: 'Plugin name' })
  name!: string;
  @ApiProperty({ description: 'Plugin title' })
  title!: string;
  @ApiProperty({ description: 'Plugin description' })
  description!: string;
  @ApiProperty({ description: 'Plugin author' })
  author!: string;
  @ApiProperty({ description: 'Plugin version' })
  version!: string;
  @ApiProperty({ description: 'Creation date' })
  createdAt!: string;
  @ApiProperty({ description: 'Last update date' })
  updatedAt!: string;
  @ApiProperty({ description: 'Plugin methods' })
  methods!: PluginMethodResponseDto[];
}

export class PluginMethodResponseDto {
  @ApiProperty({ description: 'ID' })
  id!: string;
  @ApiProperty({ description: 'Plugin ID' })
  pluginId!: string;
  @ApiProperty({ description: 'Name' })
  name!: string;
  @ApiProperty({ description: 'Title' })
  title!: string;
  @ApiProperty({ description: 'Description' })
  description!: string;
  @ValidateString({
    // TODO need enum validation for non-enum type
    // enum: WorkflowType,
    name: 'PluginTypes',
    // each: true,
    description: 'Supported types',
  })
  types!: WorkflowType[];
  @ApiProperty({ description: 'Schema' })
  schema!: JSONSchema | null;
}

export class PluginInstallDto {
  @ApiProperty({ description: 'Path to plugin manifest file' })
  @IsString()
  @IsNotEmpty()
  manifestPath!: string;
}

export type MapPlugin = {
  id: string;
  name: string;
  title: string;
  description: string;
  author: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
  methods: PluginMethod[];
};

export function mapPlugin(plugin: MapPlugin): PluginResponseDto {
  return {
    id: plugin.id,
    name: plugin.name,
    title: plugin.title,
    description: plugin.description,
    author: plugin.author,
    version: plugin.version,
    createdAt: plugin.createdAt.toISOString(),
    updatedAt: plugin.updatedAt.toISOString(),
    methods: plugin.methods,
  };
}
