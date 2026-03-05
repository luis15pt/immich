import { CallContext, Plugin as ExtismPlugin, newPlugin } from '@extism/extism';
import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { PluginSearchDto } from 'src/dtos/plugin.dto';
import { LogLevel } from 'src/enum';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { PluginMethodTable } from 'src/schema/tables/plugin-method.table';
import { PluginTable } from 'src/schema/tables/plugin.table';

type PluginMethod = { pluginId: string; methodName: string };
type PluginLoad = { id: string; name: string; version: string; wasmBytes: Buffer };
type PluginMapItem = { plugin: ExtismPlugin; name: string; version: string };
export type PluginHostFunction = (callContext: CallContext, input: bigint) => any; // TODO probably needs to be bigint return as well
export type PluginLoadOptions = {
  functions: Record<string, PluginHostFunction>;
};

const levels = {
  [LogLevel.Verbose]: 'trace',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Log]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Fatal]: 'error',
} as const;

const asExtismLogLevel = (logLevel: LogLevel) => levels[logLevel] || 'info';

@Injectable()
export class PluginRepository {
  private pluginMap: Map<string, PluginMapItem> = new Map();

  constructor(
    @InjectKysely() private db: Kysely<DB>,
    private logger: LoggingRepository,
  ) {
    this.logger.setContext(PluginRepository.name);
  }

  @GenerateSql()
  getForLoad() {
    return this.db
      .selectFrom('plugin')
      .where('enabled', '=', true)
      .select(['id', 'name', 'version', 'wasmBytes'])
      .execute();
  }

  @GenerateSql()
  search(dto: PluginSearchDto = {}) {
    return this.db
      .selectFrom('plugin')
      .select((eb) => [
        ...columns.plugin,
        jsonArrayFrom(
          eb.selectFrom('plugin_method').selectAll().whereRef('plugin_method.pluginId', '=', 'plugin.id'),
        ).as('methods'),
      ])
      .$if(!!dto.id, (qb) => qb.where('plugin.id', '=', dto.id!))
      .$if(!!dto.name, (qb) => qb.where('plugin.name', '=', dto.name!))
      .$if(!!dto.title, (qb) => qb.where('plugin.name', '=', dto.title!))
      .$if(!!dto.description, (qb) => qb.where('plugin.name', '=', dto.description!))
      .$if(!!dto.version, (qb) => qb.where('plugin.version', '=', dto.version!))
      .orderBy('plugin.name')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.STRING] })
  getByName(name: string) {
    return this.db
      .selectFrom('plugin')
      .select((eb) => [
        ...columns.plugin,
        jsonArrayFrom(
          eb.selectFrom('plugin_method').selectAll().whereRef('plugin_method.pluginId', '=', 'plugin.id'),
        ).as('methods'),
      ])
      .where('plugin.name', '=', name)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  get(id: string) {
    return this.db
      .selectFrom('plugin')
      .select((eb) => [
        ...columns.plugin,
        jsonArrayFrom(
          eb.selectFrom('plugin_method').selectAll().whereRef('plugin_method.pluginId', '=', 'plugin.id'),
        ).as('methods'),
      ])
      .where('plugin.id', '=', id)
      .executeTakeFirst();
  }

  async create(dto: Insertable<PluginTable>, initialMethods: Omit<Insertable<PluginMethodTable>, 'pluginId'>[]) {
    return this.db.transaction().execute(async (tx) => {
      // Upsert the plugin
      const plugin = await tx
        .insertInto('plugin')
        .values(dto)
        .onConflict((oc) =>
          oc.columns(['name', 'version']).doUpdateSet((eb) => ({
            title: eb.ref('excluded.title'),
            description: eb.ref('excluded.description'),
            author: eb.ref('excluded.author'),
            version: eb.ref('excluded.version'),
            wasmBytes: eb.ref('excluded.wasmBytes'),
          })),
        )
        .returning(['id', 'name'])
        .executeTakeFirstOrThrow();

      // TODO: handle methods that were removed in a new version
      const methods =
        initialMethods.length > 0
          ? await tx
              .insertInto('plugin_method')
              .values(initialMethods.map((method) => ({ ...method, pluginId: plugin.id })))
              .onConflict((oc) =>
                oc.columns(['pluginId', 'name']).doUpdateSet((eb) => ({
                  pluginId: eb.ref('excluded.pluginId'),
                  title: eb.ref('excluded.title'),
                  description: eb.ref('excluded.description'),
                  types: eb.ref('excluded.types'),
                  schema: eb.ref('excluded.schema'),
                })),
              )
              .returningAll()
              .execute()
          : [];

      return { ...plugin, methods };
    });
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getMethods(pluginId: string) {
    return this.db.selectFrom('plugin_method').selectAll().where('pluginId', '=', pluginId).execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getMethod(id: string) {
    return this.db.selectFrom('plugin_method').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async load({ id, name, version, wasmBytes }: PluginLoad, { functions }: PluginLoadOptions) {
    const data = new Uint8Array(wasmBytes.buffer, wasmBytes.byteOffset, wasmBytes.byteLength);
    const pluginLabel = `${name}@${version}`;

    try {
      const logger = LoggingRepository.create(`Plugin:${pluginLabel}`);
      const plugin = await newPlugin(
        { wasm: [{ data }] },
        {
          useWasi: true,
          runInWorker: true,
          functions: {
            'extism:host/user': functions,
          },
          logLevel: asExtismLogLevel(logger.getLogLevel()),
          logger: {
            trace: (message) => logger.verbose(message),
            info: (message) => logger.log(message),
            debug: (message) => logger.debug(message),
            warn: (message) => logger.warn(message),
            error: (message) => logger.error(message),
          } as Console,
        },
      );
      this.pluginMap.set(id, { plugin, name, version });
    } catch (error: Error | any) {
      throw new Error(`Unable to instantiate plugin: ${pluginLabel}`, { cause: error });
    }
  }

  async callMethod<T>({ pluginId, methodName }: PluginMethod, input: unknown) {
    const item = this.pluginMap.get(pluginId);
    if (!item) {
      throw new Error(`No loaded plugin found for ${pluginId}`);
    }

    const { plugin, name, version } = item;
    const methodLabel = `${name}@${version}#${methodName}`;

    try {
      const result = await plugin.call(methodName, JSON.stringify(input));
      if (result) {
        return result.json() as T;
      }

      return result as T;
    } catch (error: Error | any) {
      throw new Error(`Plugin method call failed: ${methodLabel}`, { cause: error });
    }
  }
}
