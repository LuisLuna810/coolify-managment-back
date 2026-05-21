import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Project } from './project.entity';

// Un "workload" representa un recurso K8s individual que vive dentro de una
// Argo Application — típicamente un Deployment, pero podría extenderse a
// StatefulSet/DaemonSet en el futuro. Una Argo App suele tener N workloads
// (en docappoint-prod hay 3: docappoint-back, analisis-sangre, audio-resumen).
@Entity('project_workloads')
@Unique('uq_workload_per_project', ['projectId', 'namespace', 'name'])
export class ProjectWorkload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, (p) => p.workloads, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  // 'Deployment' | 'StatefulSet' | 'DaemonSet' — por ahora siempre 'Deployment'.
  @Column({ type: 'varchar', length: 32, default: 'Deployment' })
  kind: string;

  // Nombre del recurso K8s (ej: "docappoint-back"). Coincide con el label
  // "container_name" que Promtail expone a Loki para esta app, lo que
  // simplifica armar el selector LogQL.
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  namespace: string;

  // Image completa con tag, ej:
  // 960397511528.dkr.ecr.us-east-1.amazonaws.com/docappoint/docappoint-back:prod-2a1e529e...
  // El tag suele contener el SHA del repo del código.
  @Column({ type: 'text', nullable: true })
  image: string | null;

  // SHA extraído del image tag (ver argocd.service for parsing logic). Es la
  // referencia "real" al commit del código deployado (Argo no la conoce
  // directamente, sólo conoce el SHA del repo de manifestos).
  @Column({ type: 'varchar', length: 64, nullable: true })
  imageSha: string | null;

  @Column({ type: 'int', default: 0 })
  replicasDesired: number;

  @Column({ type: 'int', default: 0 })
  replicasReady: number;

  // Health/status reportado por Argo a nivel de este recurso (vienen de
  // status.resources[] dentro de la Application).
  @Column({ type: 'varchar', length: 32, nullable: true })
  healthStatus: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  syncStatus: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
