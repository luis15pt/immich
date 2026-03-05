import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
} from '@immich/sql-tools';
import { WorkflowTrigger } from 'src/enum';
import { UserTable } from 'src/schema/tables/user.table';

@Table('workflow')
export class WorkflowTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
  ownerId!: string;

  @Column()
  trigger!: WorkflowTrigger;

  @Column({ nullable: true })
  name!: string | null;

  @Column({ nullable: true })
  description!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;
}
