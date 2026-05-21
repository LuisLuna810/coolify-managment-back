import { ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ProjectsService } from '../projects/projects.service';
import { UserProjectsService } from '../user-projects/user-projects.service';
import { Project } from '../projects/entities/project.entity';

export interface ContainerLogEntry {
  ts: string;
  container: string;
  resource?: string;
  environment?: string;
  vps?: string;
  line: string;
}

export interface ContainerLogsResponse {
  projectId: string;
  source: 'coolify' | 'argocd';
  // Identificador upstream — `coolifyAppId` (Coolify) o `argoAppName` (Argo).
  // Mantenemos `coolifyAppId` para back-compat del front; se llena solo si source='coolify'.
  coolifyAppId?: string;
  argoAppName?: string;
  query: string;
  from: string;
  to: string;
  total: number;
  containers: string[];
  pods: string[];
  // Mapeo `container/service → [pod, ...]` con los pods que aparecieron
  // en esta ventana. El front lo usa para filtrar el dropdown de pods al
  // workload elegido — sin esto un dev podría elegir un pod de otro
  // Deployment y la query Loki queda con cero resultados.
  podsByContainer: Record<string, string[]>;
  entries: ContainerLogEntry[];
}

interface LokiStreamResult {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiQueryRangeResponse {
  status: string;
  data: {
    resultType: 'streams' | 'matrix';
    result: LokiStreamResult[];
  };
}

@Injectable()
export class ContainerLogsService {
  private readonly logger = new Logger(ContainerLogsService.name);
  private readonly baseUrl = (process.env.LOKI_URL || 'http://loki:3100').replace(/\/$/, '');
  private readonly user = process.env.LOKI_USER;
  private readonly pass = process.env.LOKI_PASS;

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly userProjectsService: UserProjectsService,
  ) {}

  private get auth() {
    if (this.user && this.pass) {
      return { username: this.user, password: this.pass };
    }
    return undefined;
  }

  private async checkAccess(userId: string, projectId: string, role: string) {
    if (role === 'admin') return;
    const userProjects = await this.userProjectsService.findByUser(userId);
    const assigned = userProjects.find((up) => up.project.id === projectId);
    if (!assigned) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    if (assigned.canAccessLogs === false) {
      throw new ForbiddenException('No tienes permiso para ver logs de este proyecto');
    }
  }

  private parseSince(since?: string): number {
    if (!since) return 15 * 60 * 1000;
    const m = /^(\d+)\s*(s|m|h|d)$/.exec(since.trim().toLowerCase());
    if (!m) return 15 * 60 * 1000;
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
  }

  /**
   * Arma el selector LogQL según la fuente del proyecto:
   *
   *   coolify  → `{compose_project="<uuid>"}` (+ compose_service="<container>")
   *   argocd   → `<project.lokiSelector>` (+ container_name="<container>")
   *
   * El parámetro `pod` (si viene) agrega `,container="<pod_name>"` que en ambas
   * fuentes representa el pod/container individual (Promtail renombra el label
   * `pod` → `container` en su pipeline).
   */
  private buildLokiQuery(
    project: Project,
    container: string | undefined,
    pod: string | undefined,
  ): string {
    let base: string;

    if (project.source === 'argocd') {
      if (!project.lokiSelector) {
        throw new HttpException(
          'Proyecto Argo sin lokiSelector — falta sync con ArgoCD',
          400,
        );
      }
      base = project.lokiSelector;
      if (container) {
        base = appendLabel(base, 'container_name', container);
      }
    } else {
      // source = 'coolify' (legacy / default)
      if (!project.coolifyAppId) {
        throw new HttpException('El proyecto no tiene coolifyAppId asociado', 400);
      }
      base = `{compose_project="${project.coolifyAppId}"}`;
      if (container) {
        base = appendLabel(base, 'compose_service', container);
      }
    }
    if (pod) base = appendLabel(base, 'container', pod);
    return base;
  }

  async getLogs(
    user: { userId: string; role: string },
    projectId: string,
    opts: {
      since?: string;
      limit?: number;
      container?: string;
      pod?: string;
      filter?: string;
      direction?: 'forward' | 'backward';
    } = {},
  ): Promise<ContainerLogsResponse> {
    await this.checkAccess(user.userId, projectId, user.role);
    const project = await this.projectsService.findOne(projectId);

    let query = this.buildLokiQuery(project, opts.container, opts.pod);
    if (opts.filter) {
      query += ` ${opts.filter}`;
    }

    const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
    const direction = opts.direction ?? 'backward';
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const fromNs = nowNs - BigInt(this.parseSince(opts.since)) * 1_000_000n;

    try {
      const { data } = await axios.get<LokiQueryRangeResponse>(`${this.baseUrl}/loki/api/v1/query_range`, {
        params: { query, start: fromNs.toString(), end: nowNs.toString(), limit, direction },
        auth: this.auth,
        timeout: 15_000,
      });

      const entries: ContainerLogEntry[] = [];
      const containers = new Set<string>();
      const pods = new Set<string>();
      const podsByContainerSets = new Map<string, Set<string>>();
      for (const stream of data.data.result) {
        const labels = stream.stream;
        // Para Argo, el "container/service" lógico es container_name;
        // para Coolify es compose_service. Caemos al label `container`
        // (pod name) si no hay nada más.
        const containerLabel =
          labels.container_name || labels.compose_service || labels.container || 'unknown';
        containers.add(containerLabel);
        if (labels.container) {
          pods.add(labels.container);
          let bucket = podsByContainerSets.get(containerLabel);
          if (!bucket) {
            bucket = new Set<string>();
            podsByContainerSets.set(containerLabel, bucket);
          }
          bucket.add(labels.container);
        }
        for (const [tsNs, line] of stream.values) {
          entries.push({
            ts: new Date(Number(BigInt(tsNs) / 1_000_000n)).toISOString(),
            container: containerLabel,
            resource: labels.resource,
            environment: labels.environment,
            vps: labels.vps,
            line,
          });
        }
      }
      const podsByContainer: Record<string, string[]> = {};
      for (const [k, v] of podsByContainerSets) {
        podsByContainer[k] = [...v].sort();
      }
      entries.sort((a, b) => (direction === 'forward' ? a.ts.localeCompare(b.ts) : b.ts.localeCompare(a.ts)));

      return {
        projectId,
        source: project.source,
        coolifyAppId: project.source === 'coolify' ? (project.coolifyAppId ?? undefined) : undefined,
        argoAppName: project.source === 'argocd' ? (project.argoAppName ?? undefined) : undefined,
        query,
        from: new Date(Number(fromNs / 1_000_000n)).toISOString(),
        to: new Date(Number(nowNs / 1_000_000n)).toISOString(),
        total: entries.length,
        containers: Array.from(containers).sort(),
        pods: Array.from(pods).sort(),
        podsByContainer,
        entries,
      };
    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `Loki query failed: ${err.message} | status=${err.response?.status} | body=${JSON.stringify(err.response?.data)}`,
        );
        throw new HttpException(
          `Loki query failed: ${err.response?.data?.message || err.message}`,
          err.response?.status || 502,
        );
      }
      throw err;
    }
  }
}

/**
 * Inserta `<key>="<value>"` dentro de un selector LogQL existente `{...}`,
 * preservando los labels ya presentes. Escapa backslash y comillas en el value.
 */
function appendLabel(selector: string, key: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pair = `${key}="${escaped}"`;
  if (!selector.startsWith('{') || !selector.endsWith('}')) {
    // Defensive: si nos pasaron algo raro, devolvemos un selector mínimo.
    return `{${pair}}`;
  }
  const inner = selector.slice(1, -1).trim();
  return inner.length === 0 ? `{${pair}}` : `{${inner},${pair}}`;
}
