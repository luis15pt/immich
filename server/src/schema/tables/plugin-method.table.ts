import { Column, ForeignKeyColumn, Generated, PrimaryGeneratedColumn, Table, Unique } from '@immich/sql-tools';
import { WorkflowType } from 'src/enum';
import { PluginTable } from 'src/schema/tables/plugin.table';
import { JSONSchema } from 'src/types';

@Unique({ columns: ['pluginId', 'name'] })
@Table('plugin_method')
export class PluginMethodTable {
  @PrimaryGeneratedColumn('uuid')
  id!: Generated<string>;

  @ForeignKeyColumn(() => PluginTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  pluginId!: string;

  @Column()
  name!: string;

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column({ type: 'character varying', array: true })
  types!: Generated<WorkflowType[]>;

  @Column({ type: 'jsonb', nullable: true })
  schema!: JSONSchema | null;
}
