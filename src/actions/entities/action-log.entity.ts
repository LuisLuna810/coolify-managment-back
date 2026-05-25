import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('action_logs')
export class ActionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nullable + SET NULL: si se elimina el usuario, el log queda como
  // huérfano (sin user) en vez de bloquear el DELETE por FK.
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @ManyToOne(() => Project, { eager: true })
  project: Project;

  @Column()
  action: string; // start | stop | restart | pull | env-list | env-update

  @CreateDateColumn()
  timestamp: Date;
}
