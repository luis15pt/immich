import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Updateable } from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { WorkflowSearchDto, WorkflowStepDto } from 'src/dtos/workflow.dto';
import { DB } from 'src/schema';
import { WorkflowTable } from 'src/schema/tables/workflow.table';

@Injectable()
export class WorkflowRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  private queryBuilder() {
    return this.db
      .selectFrom('workflow')
      .selectAll()
      .select((eb) => [
        jsonArrayFrom(
          eb.selectFrom('workflow_step').selectAll().whereRef('workflow_step.workflowId', '=', 'workflow.id'),
        ).as('steps'),
      ]);
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  search(dto: WorkflowSearchDto & { ownerId?: string }) {
    return this.queryBuilder()
      .$if(!!dto.ownerId, (qb) => qb.where('ownerId', '=', dto.ownerId!))
      .$if(!!dto.trigger, (qb) => qb.where('trigger', '=', dto.trigger!))
      .$if(dto.enabled !== undefined, (qb) => qb.where('enabled', '=', dto.enabled!))
      .orderBy('createdAt', 'desc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  get(id: string) {
    return this.queryBuilder().where('id', '=', id).executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getForWorkflowRun(id: string) {
    return this.db
      .selectFrom('workflow')
      .select(['workflow.id', 'workflow.name', 'workflow.trigger'])
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom('workflow_step')
            .innerJoin('plugin_method', 'plugin_method.id', 'workflow_step.pluginMethodId')
            .whereRef('workflow_step.workflowId', '=', 'workflow.id')
            .where('workflow_step.enabled', '=', true)
            .select([
              'workflow_step.id',
              'workflow_step.config',
              'plugin_method.pluginId as pluginId',
              'plugin_method.name as methodName',
              'plugin_method.types as types',
            ]),
        ).as('steps'),
      ])
      .where('id', '=', id)
      .where('enabled', '=', true)
      .executeTakeFirst();
  }

  create(workflow: Insertable<WorkflowTable>) {
    return this.db.insertInto('workflow').values(workflow).returningAll().executeTakeFirstOrThrow();
  }

  update(id: string, workflow: Updateable<WorkflowTable>) {
    // handle empty update
    if (Object.values(workflow).filter((prop) => prop !== undefined).length === 0) {
      return this.queryBuilder().where('id', '=', id).executeTakeFirstOrThrow();
    }

    return this.db
      .updateTable('workflow')
      .set(workflow)
      .where('id', '=', id)
      .returningAll()
      .returning((eb) => [
        jsonArrayFrom(
          eb.selectFrom('workflow_step').selectAll().whereRef('workflow_step.workflowId', '=', 'workflow.id'),
        ).as('steps'),
      ])
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async delete(id: string) {
    await this.db.deleteFrom('workflow').where('id', '=', id).execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getSteps(workflowId: string) {
    return this.db
      .selectFrom('workflow_step')
      .selectAll()
      .where('workflowId', '=', workflowId)
      .orderBy('order', 'asc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async deleteStep(workflowId: string, stepId: string) {
    await this.db.deleteFrom('workflow_step').where('workflowId', '=', workflowId).where('id', '=', stepId).execute();
  }

  replaceSteps(id: string, steps: WorkflowStepDto[]) {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('workflow_step').where('workflowId', '=', id).execute();
      if (steps.length === 0) {
        return [];
      }

      return trx
        .insertInto('workflow_step')
        .values(
          steps.map((step, i) => ({
            workflowId: id,
            enabled: step.enabled ?? true,
            pluginMethodId: step.pluginMethodId,
            config: step.config,
            order: i,
          })),
        )
        .returningAll()
        .execute();
    });
  }

  getForAssetV1(assetId: string) {
    return this.db
      .selectFrom('asset')
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .select((eb) => [
        ...columns.workflowAssetV1,
        jsonObjectFrom(
          eb
            .selectFrom('asset_exif')
            .select([
              'asset_exif.make',
              'asset_exif.model',
              'asset_exif.orientation',
              'asset_exif.dateTimeOriginal',
              'asset_exif.modifyDate',
              'asset_exif.exifImageWidth',
              'asset_exif.exifImageHeight',
              'asset_exif.fileSizeInByte',
              'asset_exif.lensModel',
              'asset_exif.fNumber',
              'asset_exif.focalLength',
              'asset_exif.iso',
              'asset_exif.latitude',
              'asset_exif.longitude',
              'asset_exif.city',
              'asset_exif.state',
              'asset_exif.country',
              'asset_exif.description',
              'asset_exif.fps',
              'asset_exif.exposureTime',
              'asset_exif.livePhotoCID',
              'asset_exif.timeZone',
              'asset_exif.projectionType',
              'asset_exif.profileDescription',
              'asset_exif.colorspace',
              'asset_exif.bitsPerSample',
              'asset_exif.autoStackId',
              'asset_exif.rating',
              'asset_exif.tags',
              'asset_exif.updatedAt',
            ])
            .whereRef('asset_exif.assetId', '=', 'asset.id'),
        ).as('exifInfo'),
      ])
      .where('id', '=', assetId)
      .executeTakeFirstOrThrow();
  }
}
