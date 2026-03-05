import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  mapWorkflow,
  mapWorkflowStep,
  WorkflowCreateDto,
  WorkflowResponseDto,
  WorkflowSearchDto,
  WorkflowStepDto,
  WorkflowStepResponseDto,
  WorkflowTriggerResponseDto,
  WorkflowUpdateDto,
} from 'src/dtos/workflow.dto';
import { Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { getWorkflowTriggers, isMethodCompatible } from 'src/utils/workflow';

@Injectable()
export class WorkflowService extends BaseService {
  getTriggers(): WorkflowTriggerResponseDto[] {
    return getWorkflowTriggers();
  }

  async search(auth: AuthDto, dto: WorkflowSearchDto): Promise<WorkflowResponseDto[]> {
    const workflows = await this.workflowRepository.search({ ...dto, ownerId: auth.user.id });
    return workflows.map((workflow) => mapWorkflow(workflow));
  }

  async get(auth: AuthDto, id: string): Promise<WorkflowResponseDto> {
    await this.requireAccess({ auth, permission: Permission.WorkflowRead, ids: [id] });
    const workflow = await this.findOrFail(id);
    return mapWorkflow(workflow);
  }

  async create(auth: AuthDto, dto: WorkflowCreateDto): Promise<WorkflowResponseDto> {
    const workflow = await this.workflowRepository.create({
      ownerId: auth.user.id,
      trigger: dto.trigger,
      name: dto.name,
      description: dto.description,
      enabled: dto.enabled ?? true,
    });

    return mapWorkflow({ ...workflow, steps: [] });
  }

  async update(auth: AuthDto, id: string, dto: WorkflowUpdateDto): Promise<WorkflowResponseDto> {
    await this.requireAccess({ auth, permission: Permission.WorkflowUpdate, ids: [id] });
    const workflow = await this.workflowRepository.update(id, dto);
    return mapWorkflow(workflow);
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.WorkflowDelete, ids: [id] });
    await this.workflowRepository.delete(id);
  }

  async getSteps(auth: AuthDto, workflowId: string) {
    await this.requireAccess({ auth, permission: Permission.WorkflowRead, ids: [workflowId] });
    const steps = await this.workflowRepository.getSteps(workflowId);
    return steps.map((step) => mapWorkflowStep(step));
  }

  async replaceSteps(auth: AuthDto, workflowId: string, dtos: WorkflowStepDto[]): Promise<WorkflowStepResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.WorkflowUpdate, ids: [workflowId] });

    const workflow = await this.findOrFail(workflowId);

    // validate all steps have a common type that is compatible with the workflow trigger
    for (const dto of dtos) {
      const pluginMethod = await this.pluginRepository.getMethod(dto.pluginMethodId);
      if (!pluginMethod) {
        throw new BadRequestException(`Invalid method ID: ${dto.pluginMethodId}`);
      }

      if (!isMethodCompatible(pluginMethod, workflow.trigger)) {
        throw new BadRequestException(
          `Method "${pluginMethod.title}" is incompatible with workflow trigger: "${workflow.trigger}"`,
        );
      }
    }

    const steps = await this.workflowRepository.replaceSteps(workflowId, dtos);
    return steps.map((step) => mapWorkflowStep(step));
  }

  private async findOrFail(id: string) {
    const workflow = await this.workflowRepository.get(id);
    if (!workflow) {
      throw new BadRequestException('Workflow not found');
    }
    return workflow;
  }
}
