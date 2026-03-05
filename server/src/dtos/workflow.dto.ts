import type { WorkflowStepConfig } from '@immich/plugin-sdk';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Workflow, WorkflowStep } from 'src/database';
import { WorkflowTrigger, WorkflowType } from 'src/enum';
import { Optional, ValidateBoolean, ValidateEnum, ValidateString, ValidateUUID } from 'src/validation';

export class WorkflowTriggerResponseDto {
  @ValidateEnum({ enum: WorkflowTrigger, name: 'PluginTriggerType', description: 'Trigger type' })
  trigger!: WorkflowTrigger;
  @ValidateEnum({ enum: WorkflowType, name: 'WorkflowType', description: 'Workflow types', each: true })
  types!: WorkflowType[];
}

export class WorkflowSearchDto {
  @ValidateUUID({ optional: true, description: 'Workflow ID' })
  id?: string;

  @ValidateEnum({
    optional: true,
    enum: WorkflowTrigger,
    name: 'PluginTriggerType',
    description: 'Workflow trigger type',
  })
  trigger?: WorkflowTrigger;

  @ValidateString({ optional: true, description: 'Workflow name' })
  name?: string;

  @ValidateString({ optional: true, description: 'Workflow description' })
  description?: string;

  @ValidateBoolean({ optional: true, description: 'Workflow enabled' })
  enabled?: boolean;
}

export class WorkflowCreateDto {
  @ValidateEnum({ enum: WorkflowTrigger, name: 'PluginTriggerType', description: 'Workflow trigger type' })
  trigger!: WorkflowTrigger;

  @ApiProperty({ description: 'Workflow name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Workflow description' })
  @IsString()
  @Optional()
  description?: string;

  @ValidateBoolean({ optional: true, description: 'Workflow enabled' })
  enabled?: boolean;
}

export class WorkflowUpdateDto {
  @ValidateEnum({
    enum: WorkflowTrigger,
    name: 'PluginTriggerType',
    optional: true,
    description: 'Workflow trigger type',
  })
  trigger?: WorkflowTrigger;

  @ApiPropertyOptional({ description: 'Workflow name' })
  @IsString()
  @IsNotEmpty()
  @Optional()
  name?: string;

  @ApiPropertyOptional({ description: 'Workflow description' })
  @IsString()
  @Optional()
  description?: string;

  @ValidateBoolean({ optional: true, description: 'Workflow enabled' })
  enabled?: boolean;
}

export class WorkflowStepDto {
  @ApiProperty({ description: 'Plugin method ID' })
  @IsUUID()
  pluginMethodId!: string;

  @ApiPropertyOptional({ description: 'Method configuration' })
  @IsObject()
  @Optional()
  config?: WorkflowStepConfig;

  @ValidateBoolean({ optional: true, description: 'Workflow step enabled' })
  enabled?: boolean;
}

export class WorkflowStepsCreateDto {
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

export class WorkflowResponseDto {
  @ApiProperty({ description: 'Workflow ID' })
  id!: string;
  @ApiProperty({ description: 'Owner user ID' })
  ownerId!: string;
  @ValidateEnum({ enum: WorkflowTrigger, name: 'PluginTriggerType', description: 'Workflow trigger type' })
  trigger!: WorkflowTrigger;
  @ApiProperty({ description: 'Workflow name' })
  name!: string | null;
  @ApiProperty({ description: 'Workflow description' })
  description!: string | null;
  @ApiProperty({ description: 'Creation date' })
  createdAt!: string;
  @ApiProperty({ description: 'Workflow enabled' })
  enabled!: boolean;
  @ApiProperty({ description: 'Workflow steps' })
  steps!: WorkflowStepResponseDto[];
}

export class WorkflowStepResponseDto {
  @ApiProperty({ description: 'Step ID' })
  id!: string;
  @ApiProperty({ description: 'Workflow ID' })
  workflowId!: string;
  @ApiProperty({ description: 'Plugin method ID' })
  pluginMethodId!: string;
  @ApiProperty({ description: 'Method configuration' })
  config!: WorkflowStepConfig | null;
  @ApiProperty({ description: 'Step order', type: 'number' })
  order!: number;
}

export const mapWorkflow = (workflow: Workflow & { steps: WorkflowStep[] }): WorkflowResponseDto => {
  return {
    id: workflow.id,
    ownerId: workflow.ownerId,
    trigger: workflow.trigger,
    name: workflow.name,
    description: workflow.description,
    createdAt: workflow.createdAt.toISOString(),
    enabled: workflow.enabled,
    steps: workflow.steps.map((step) => mapWorkflowStep(step)),
  };
};

export const mapWorkflowStep = (step: WorkflowStep): WorkflowStepResponseDto => {
  return {
    id: step.id,
    workflowId: step.workflowId,
    pluginMethodId: step.pluginMethodId,
    config: step.config,
    order: step.order,
  };
};
