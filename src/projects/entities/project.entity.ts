import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ArgoInstance } from '../../argocd/entities/argo-instance.entity';
import { ProjectWorkload } from './project-workload.entity';

export type ProjectSource = 'coolify' | 'argocd';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 'coolify' (legacy default) o 'argocd'. Determina cómo se interpreta el resto
  // de las columnas y qué cliente usar para sync/acciones.
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'coolify' })
  source: ProjectSource;

  // Identificador de la app en Coolify. Nullable para rows con source='argocd'.
  // Sigue siendo unique cuando NOT NULL: dos rows distintos no pueden apuntar
  // al mismo coolifyAppId. Postgres permite múltiples NULLs en unique.
  // type explícito porque con `string | null` la metadata reflection infiere
  // Object y TypeORM revienta con DataTypeNotSupportedError.
  @Column({ type: 'varchar', unique: true, nullable: true })
  coolifyAppId: string | null;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string;

  // -------- Campos para source='argocd' --------

  @ManyToOne(() => ArgoInstance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'argoInstanceId' })
  argoInstance: ArgoInstance | null;

  @Column({ type: 'uuid', nullable: true })
  argoInstanceId: string | null;

  // Nombre de la Application en ArgoCD (ej: "docappoint-prod").
  @Column({ type: 'varchar', length: 200, nullable: true })
  argoAppName: string | null;

  // destination.server de la Application (ej: "https://kubernetes.default.svc"
  // o la URL del cluster externo cuando Argo gestiona múltiples clusters).
  @Column({ type: 'varchar', length: 300, nullable: true })
  argoCluster: string | null;

  // destination.namespace (ej: "prod", "staging").
  @Column({ type: 'varchar', length: 200, nullable: true })
  argoNamespace: string | null;

  // Repo del que Argo levanta los manifestos (NO el repo del código de la app).
  @Column({ type: 'varchar', length: 500, nullable: true })
  repoUrl: string | null;

  // Branch / tag / revision configurada en la Application.
  @Column({ type: 'varchar', length: 200, nullable: true })
  targetRevision: string | null;

  // SHA real al que Argo sincronizó por última vez (status.sync.revision).
  @Column({ type: 'varchar', length: 64, nullable: true })
  lastSyncRevision: string | null;

  // Synced / OutOfSync / Unknown.
  @Column({ type: 'varchar', length: 32, nullable: true })
  syncStatus: string | null;

  // Healthy / Progressing / Degraded / Suspended / Missing / Unknown.
  @Column({ type: 'varchar', length: 32, nullable: true })
  healthStatus: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  // Selector LogQL base para esta Application (ej: `{vps="docappoint",namespace="prod"}`).
  // Lo arma argocd-sync.service desde los datos de la Application + labels extras
  // configurados en la ArgoInstance. Permite a container-logs construir queries
  // sin tener que conocer la lógica de Argo. Null para source='coolify'.
  @Column({ type: 'text', nullable: true })
  lokiSelector: string | null;

  // FQDNs públicos extraídos de los Ingresses de la Application (Argo) o de
  // `fqdn` / `docker_compose_domains` de Coolify. Para Argo se popula en el
  // sync leyendo `spec.rules[].host` + `spec.tls[].hosts` de cada Ingress.
  // Mantiene paridad visual con las cards Coolify, que muestran el primer
  // FQDN como link + popover con el resto.
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb", nullable: false })
  fqdns: string[];

  @OneToMany(() => ProjectWorkload, (w) => w.project, {
    cascade: ['insert', 'update', 'remove'],
  })
  workloads: ProjectWorkload[];

  // Soft-archive: el sync setea esta marca cuando un proyecto ya no aparece
  // en su fuente (Coolify o Argo). Los listados filtran archivedAt IS NULL.
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
