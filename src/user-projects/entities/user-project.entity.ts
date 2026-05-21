import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('user_projects')
export class UserProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.userProjects, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  // Permisos granulares por asignación. Todos arrancan desactivados; el admin
  // habilita explícitamente lo que quiere otorgar al asignar el proyecto.
  @Column({ default: false })
  canStart: boolean;

  @Column({ default: false })
  canStop: boolean;

  @Column({ default: false })
  canRestart: boolean;

  @Column({ default: false })
  canAccessEnvs: boolean;

  // Acceso a los logs por container (vía Loki). El back defaultea a `true`
  // cuando el admin asigna un proyecto sin tocar este flag (ver UserProjectsService.assign).
  @Column({ default: false })
  canAccessLogs: boolean;
}
