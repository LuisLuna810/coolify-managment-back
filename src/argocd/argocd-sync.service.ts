import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Project } from '../projects/entities/project.entity';
import { ProjectWorkload } from '../projects/entities/project-workload.entity';
import { ArgoInstance } from './entities/argo-instance.entity';
import { ArgoInstancesService } from './argocd-instances.service';
import { ArgoApplication, ArgoCDClient } from './argocd-client';
import { RedisService } from '../redis/redis.service';

/**
 * Sync periódico de proyectos desde ArgoCD. Una corrida = lee todas las
 * Applications de todas las ArgoInstance habilitadas y upserta:
 *   - 1 Project por Argo Application (source='argocd')
 *   - N ProjectWorkload por cada Deployment dentro de la Application
 * Hace soft-archive de huérfanos (Application desaparecida) con guarda
 * anti-bug si la respuesta de Argo vino vacía o falló.
 */
@Injectable()
export class ArgoSyncService implements OnModuleInit {
  private readonly logger = new Logger(ArgoSyncService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectWorkload)
    private readonly workloadRepo: Repository<ProjectWorkload>,
    @InjectRepository(ArgoInstance)
    private readonly instanceRepo: Repository<ArgoInstance>,
    private readonly instances: ArgoInstancesService,
    private readonly scheduler: SchedulerRegistry,
    private readonly redis: RedisService,
  ) {}

  /**
   * Registra un interval por instancia habilitada. Cada instancia puede tener
   * su propio cadence. Mismo patrón que ProjectsService.onModuleInit.
   */
  async onModuleInit() {
    // Si una instancia se añade en runtime via API, el operador debería
    // llamar a registerInterval(); para el caso de boot, leemos lo que haya.
    const enabled = await this.instances.findAllEnabled().catch(() => [] as ArgoInstance[]);
    for (const inst of enabled) this.registerInterval(inst);
  }

  registerInterval(inst: ArgoInstance) {
    const name = `argo-sync-${inst.id}`;
    if (this.scheduler.getIntervals().includes(name)) {
      clearInterval(this.scheduler.getInterval(name));
      this.scheduler.deleteInterval(name);
    }
    const ms = Math.max(60_000, inst.syncIntervalMs || 300_000);
    this.logger.log(`Auto-sync Argo "${inst.name}" cada ${ms / 1000}s`);
    const handle = setInterval(() => this.syncOne(inst.id).catch(() => undefined), ms);
    this.scheduler.addInterval(name, handle);
  }

  unregisterInterval(instanceId: string) {
    const name = `argo-sync-${instanceId}`;
    if (this.scheduler.getIntervals().includes(name)) {
      clearInterval(this.scheduler.getInterval(name));
      this.scheduler.deleteInterval(name);
    }
  }

  /** Corre el sync de TODAS las instancias habilitadas. Útil para endpoint manual. */
  async syncAll(): Promise<{ instanceId: string; count: number; error?: string }[]> {
    const enabled = await this.instances.findAllEnabled();
    const results: { instanceId: string; count: number; error?: string }[] = [];
    for (const inst of enabled) {
      try {
        const count = await this.syncOne(inst.id);
        results.push({ instanceId: inst.id, count });
      } catch (err: any) {
        results.push({ instanceId: inst.id, count: 0, error: err?.message ?? String(err) });
      }
    }
    return results;
  }

  async syncOne(instanceId: string): Promise<number> {
    const inst = await this.instances.findOne(instanceId);
    if (!inst.enabled) {
      this.logger.warn(`Skipping sync de instancia "${inst.name}" (disabled)`);
      return 0;
    }
    const client = this.instances.getClient(inst);
    let appList: ArgoApplication[];
    try {
      appList = await client.listApplications();
    } catch (err: any) {
      this.logger.error(`listApplications falló para ${inst.name}: ${err?.message}`);
      throw err;
    }

    if (!Array.isArray(appList)) {
      this.logger.warn(`Argo ${inst.name} devolvió respuesta no-array, salteo archive`);
      return 0;
    }

    // listApplications es deliberadamente lightweight: NO trae `health.status`
    // a nivel resource. Hacemos un getApplication() por app para tener todo el
    // detalle (resource-level health, history, operationState completo).
    // Para N apps son N+1 requests — fine hasta ~100 apps; si escala más,
    // valdría la pena cachear o hacer batched fetch.
    const apps: ArgoApplication[] = [];
    for (const lite of appList) {
      try {
        const full = await client.getApplication(lite.metadata.name);
        apps.push(full);
      } catch (err: any) {
        this.logger.warn(
          `getApplication(${lite.metadata.name}) falló, uso datos parciales: ${err?.message}`,
        );
        apps.push(lite);
      }
    }

    const upsertedKeys: string[] = []; // (instanceId, argoAppName)
    for (const app of apps) {
      try {
        const project = await this.upsertProjectFromApp(inst, client, app);
        upsertedKeys.push(project.argoAppName!);
      } catch (err: any) {
        this.logger.error(`upsert falló para ${app?.metadata?.name}: ${err?.message}`);
      }
    }

    // Soft-archive: rows de esta instancia que no aparecieron en la respuesta.
    // Guarda anti-empty (mismo patrón que Coolify): si Argo devolvió 0 apps,
    // no archivamos por las dudas (token revocado, network glitch, etc).
    if (apps.length > 0) {
      const result = await this.projectRepo
        .createQueryBuilder()
        .update(Project)
        .set({ archivedAt: () => 'NOW()' })
        .where('argoInstanceId = :iid', { iid: inst.id })
        .andWhere('source = :src', { src: 'argocd' })
        .andWhere('archivedAt IS NULL')
        .andWhere(
          upsertedKeys.length > 0
            ? 'argoAppName NOT IN (:...keys)'
            : '1=1',
          upsertedKeys.length > 0 ? { keys: upsertedKeys } : {},
        )
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`Archivados ${result.affected} proyectos Argo huérfanos en "${inst.name}"`);
      }
    } else {
      this.logger.warn(`Argo "${inst.name}" devolvió lista vacía: salteo archive`);
    }

    // Invalida caches de proyectos del front (mismo pattern que projects.service)
    await this.redis.clearPattern('projects:*').catch(() => undefined);
    return apps.length;
  }

  private async upsertProjectFromApp(
    inst: ArgoInstance,
    client: ArgoCDClient,
    app: ArgoApplication,
  ): Promise<Project> {
    const argoAppName = app.metadata.name;
    const source = app.spec.source ?? app.spec.sources?.[0];
    const dest = app.spec.destination;

    let project = await this.projectRepo.findOne({
      where: { source: 'argocd', argoInstanceId: inst.id, argoAppName },
    });

    if (!project) {
      project = new Project();
      project.source = 'argocd';
      project.coolifyAppId = null;
      project.argoInstanceId = inst.id;
      project.argoAppName = argoAppName;
      project.name = argoAppName;
    } else if (project.archivedAt) {
      project.archivedAt = null;
    }

    project.name = argoAppName;
    project.argoCluster = dest?.server ?? dest?.name ?? null;
    project.argoNamespace = dest?.namespace ?? null;
    project.repoUrl = source?.repoURL ?? null;
    project.targetRevision = source?.targetRevision ?? null;
    project.lastSyncRevision = app.status?.sync?.revision ?? null;
    project.syncStatus = app.status?.sync?.status ?? null;
    project.healthStatus = app.status?.health?.status ?? null;
    project.lokiSelector = buildLokiSelector(inst, dest);
    const finished = app.status?.operationState?.finishedAt;
    project.lastSyncAt = finished ? new Date(finished) : null;
    project.fqdns = await this.collectFqdns(client, app);

    await this.projectRepo.save(project);

    await this.upsertWorkloads(project, client, app);
    return project;
  }

  /**
   * Lee todos los Ingresses de la Application via Argo (que proxea al cluster)
   * y extrae los hosts. Best-effort: si un Ingress falla devuelve los que sí
   * pudo leer. Filtramos hosts vacíos/wildcard y deduplicamos.
   */
  private async collectFqdns(client: ArgoCDClient, app: ArgoApplication): Promise<string[]> {
    const ingresses = (app.status?.resources ?? []).filter(
      (r) =>
        r.kind === 'Ingress' &&
        (r.group === 'networking.k8s.io' || r.group === '' || !r.group) &&
        r.name &&
        r.namespace,
    );

    const out = new Set<string>();
    for (const r of ingresses) {
      try {
        const res = await client.getApplicationResource(app.metadata.name, {
          namespace: r.namespace!,
          resourceName: r.name!,
          kind: 'Ingress',
          group: 'networking.k8s.io',
          version: 'v1',
        });
        if (!res?.manifest) continue;
        const m = JSON.parse(res.manifest);
        // spec.rules[].host  (ingress declarado por host)
        for (const rule of m?.spec?.rules ?? []) {
          if (rule?.host) out.add(String(rule.host).trim());
        }
        // spec.tls[].hosts  (declarado en bloque TLS aunque no haya rule)
        for (const tls of m?.spec?.tls ?? []) {
          for (const h of tls?.hosts ?? []) out.add(String(h).trim());
        }
      } catch (err: any) {
        this.logger.debug(
          `Ingress ${app.metadata.name}/${r.namespace}/${r.name}: ${err?.message}`,
        );
      }
    }
    return [...out].filter((h) => h && !h.includes('*'));
  }

  /**
   * Lee status.resources de la Application, filtra Deployments y crea/actualiza
   * los ProjectWorkload. Para cada Deployment hace un fetch a getApplicationResource
   * (proxy Argo → cluster) para obtener la image y el sha real.
   */
  private async upsertWorkloads(project: Project, client: ArgoCDClient, app: ArgoApplication) {
    const deployments = (app.status?.resources ?? []).filter(
      (r) => r.kind === 'Deployment' && r.group === 'apps' && r.name && r.namespace,
    );

    const seen = new Set<string>();
    for (const r of deployments) {
      const key = `${r.namespace}::${r.name}`;
      seen.add(key);

      let workload = await this.workloadRepo.findOne({
        where: { projectId: project.id, namespace: r.namespace!, name: r.name! },
      });
      if (!workload) {
        workload = this.workloadRepo.create({
          projectId: project.id,
          kind: 'Deployment',
          name: r.name!,
          namespace: r.namespace!,
        });
      }
      workload.syncStatus = r.status ?? null;
      workload.healthStatus = r.health?.status ?? null;

      // Pull del manifest live para image + replicas. Best-effort: si falla,
      // mantenemos la info anterior (no nullificamos).
      try {
        const res = await client.getApplicationResource(app.metadata.name, {
          namespace: r.namespace!,
          resourceName: r.name!,
          kind: 'Deployment',
          group: 'apps',
          version: 'v1',
        });
        if (res?.manifest) {
          const manifest = JSON.parse(res.manifest);
          const image = manifest?.spec?.template?.spec?.containers?.[0]?.image as string | undefined;
          if (image) {
            workload.image = image;
            workload.imageSha = extractShaFromImageTag(image);
          }
          workload.replicasDesired = manifest?.spec?.replicas ?? 0;
          workload.replicasReady = manifest?.status?.readyReplicas ?? 0;
        }
      } catch (err: any) {
        this.logger.debug(
          `getApplicationResource ${app.metadata.name}/${r.namespace}/${r.name} falló: ${err?.message}`,
        );
      }
      await this.workloadRepo.save(workload);
    }

    // Eliminar workloads que ya no están en la Application
    const existing = await this.workloadRepo.find({ where: { projectId: project.id } });
    const toDelete = existing.filter((w) => !seen.has(`${w.namespace}::${w.name}`));
    if (toDelete.length > 0) {
      await this.workloadRepo.remove(toDelete);
    }
  }
}

/**
 * Construye el selector LogQL base para una Argo Application apuntando a un
 * cluster. Combina labels extras configurados en la instancia (ej: `vps`)
 * con `namespace`. El container_name lo agrega container-logs según el
 * workload elegido (no es responsabilidad del selector base).
 */
export function buildLokiSelector(
  inst: ArgoInstance,
  dest: { server?: string; name?: string; namespace?: string } | undefined,
): string | null {
  if (!dest?.namespace) return null;
  const extra = inst.lokiClusterLabels?.[dest.server ?? ''] ??
    inst.lokiClusterLabels?.[dest.name ?? ''] ??
    {};
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(extra)) {
    pairs.push(`${escapeLokiLabel(k)}="${escapeLokiValue(v)}"`);
  }
  pairs.push(`namespace="${escapeLokiValue(dest.namespace)}"`);
  return `{${pairs.join(',')}}`;
}

function escapeLokiLabel(k: string): string {
  // Loki labels: [a-zA-Z_][a-zA-Z0-9_]* — defensive guard.
  return k.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeLokiValue(v: string): string {
  // LogQL string literals: escape backslash y comilla doble.
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Image tags usados acá tienen formato `<env>-<sha-40-hex>` (ej:
 * prod-2a1e529e8bbc53a248288a610dd3e6b6c1e2e4e7). Devuelve el SHA o null si
 * el tag no matchea ese formato (ej: ":latest" o sin sha).
 */
export function extractShaFromImageTag(image: string): string | null {
  const colon = image.lastIndexOf(':');
  if (colon === -1) return null;
  const tag = image.substring(colon + 1);
  const m = /([0-9a-f]{7,40})$/i.exec(tag);
  return m ? m[1] : null;
}
