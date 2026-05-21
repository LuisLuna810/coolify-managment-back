import { HttpException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { ArgoInstance } from './entities/argo-instance.entity';

// Tipos parciales de la respuesta de ArgoCD. Sólo modelo lo que consumimos —
// el response real trae mucho más. Ver swagger:
// https://cd.apps.argoproj.io/swagger-ui#tag/ApplicationService

export interface ArgoAppDestination {
  server?: string;
  namespace?: string;
  name?: string;
}

export interface ArgoAppSource {
  repoURL?: string;
  path?: string;
  targetRevision?: string;
  chart?: string;
}

export interface ArgoAppResource {
  group?: string;
  version?: string;
  kind?: string;
  namespace?: string;
  name?: string;
  status?: string; // sync status
  health?: { status?: string; message?: string };
}

export interface ArgoApplication {
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    destination?: ArgoAppDestination;
    source?: ArgoAppSource;
    sources?: ArgoAppSource[];
    project?: string;
  };
  status?: {
    sync?: { status?: string; revision?: string };
    health?: { status?: string };
    resources?: ArgoAppResource[];
    operationState?: {
      finishedAt?: string;
      message?: string;
      phase?: string;
    };
    history?: Array<{
      revision?: string;
      deployedAt?: string;
      source?: ArgoAppSource;
    }>;
    reconciledAt?: string;
  };
}

export interface ArgoRevisionMetadata {
  author?: string;
  date?: string;
  message?: string;
  tags?: string[];
}

/**
 * Cliente fino contra el REST API de ArgoCD. Una instancia = una conexión a
 * una ArgoInstance configurada. Cachear/poolear vive en el service que lo usa.
 */
export class ArgoCDClient {
  private readonly logger = new Logger(ArgoCDClient.name);
  private readonly http: AxiosInstance;
  readonly instance: ArgoInstance;

  constructor(instance: ArgoInstance, decryptedToken: string) {
    this.instance = instance;
    this.http = axios.create({
      baseURL: instance.serverUrl.replace(/\/$/, ''),
      timeout: 15_000,
      headers: { Authorization: `Bearer ${decryptedToken}` },
      httpsAgent: instance.insecureSkipTlsVerify
        ? new https.Agent({ rejectUnauthorized: false })
        : undefined,
    });
  }

  private wrap(context: string, err: unknown): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 502;
      const body = err.response?.data;
      this.logger.error(
        `[${context}] ${err.message} | url=${err.config?.url} | status=${status} | body=${JSON.stringify(body)?.slice(0, 400)}`,
      );
      throw new HttpException(
        `ArgoCD ${context} failed: ${(body as any)?.message || err.message}`,
        status >= 500 ? 502 : status,
      );
    }
    throw err as Error;
  }

  /** GET /api/v1/version — útil para health-check y para validar el token. */
  async version(): Promise<{ Version?: string; GoVersion?: string }> {
    try {
      const { data } = await this.http.get('/api/v1/version');
      return data;
    } catch (err) {
      this.wrap('version', err);
    }
  }

  /** GET /api/v1/applications */
  async listApplications(opts: { project?: string } = {}): Promise<ArgoApplication[]> {
    try {
      const { data } = await this.http.get('/api/v1/applications', {
        params: opts.project ? { project: opts.project } : undefined,
      });
      return data?.items ?? [];
    } catch (err) {
      this.wrap('listApplications', err);
    }
  }

  /** GET /api/v1/applications/{name} */
  async getApplication(name: string): Promise<ArgoApplication> {
    try {
      const { data } = await this.http.get(`/api/v1/applications/${encodeURIComponent(name)}`);
      return data;
    } catch (err) {
      this.wrap(`getApplication(${name})`, err);
    }
  }

  /** GET /api/v1/applications/{name}/revisions/{revision}/metadata */
  async getRevisionMetadata(name: string, revision: string): Promise<ArgoRevisionMetadata | null> {
    try {
      const { data } = await this.http.get(
        `/api/v1/applications/${encodeURIComponent(name)}/revisions/${encodeURIComponent(revision)}/metadata`,
      );
      return data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.wrap(`getRevisionMetadata(${name}, ${revision})`, err);
    }
  }

  /** POST /api/v1/applications/{name}/sync */
  async syncApplication(name: string, opts: { prune?: boolean; dryRun?: boolean } = {}): Promise<ArgoApplication> {
    try {
      const { data } = await this.http.post(
        `/api/v1/applications/${encodeURIComponent(name)}/sync`,
        { prune: opts.prune ?? false, dryRun: opts.dryRun ?? false },
      );
      return data;
    } catch (err) {
      this.wrap(`syncApplication(${name})`, err);
    }
  }

  /**
   * "Refresh" en ArgoCD se hace pegándole a GET /applications/{name} con el
   * query ?refresh=normal (o hard). No hay endpoint POST dedicado.
   */
  async refreshApplication(name: string, hard = false): Promise<ArgoApplication> {
    try {
      const { data } = await this.http.get(`/api/v1/applications/${encodeURIComponent(name)}`, {
        params: { refresh: hard ? 'hard' : 'normal' },
      });
      return data;
    } catch (err) {
      this.wrap(`refreshApplication(${name})`, err);
    }
  }

  /**
   * GET /api/v1/applications/{name}/resource — Argo actúa de proxy al cluster
   * y devuelve el manifest "live" del recurso. Útil para leer la image y
   * status real de un Deployment sin necesidad de kubeconfig.
   *
   * El response es del tipo { manifest: "<JSON-stringified manifest>" } —
   * Argo lo devuelve serializado, así que hay que parsearlo del lado del caller.
   */
  async getApplicationResource(
    appName: string,
    q: { namespace: string; resourceName: string; kind: string; group?: string; version?: string },
  ): Promise<{ manifest: string } | null> {
    try {
      const { data } = await this.http.get(
        `/api/v1/applications/${encodeURIComponent(appName)}/resource`,
        {
          params: {
            namespace: q.namespace,
            resourceName: q.resourceName,
            kind: q.kind,
            group: q.group ?? 'apps',
            version: q.version ?? 'v1',
          },
        },
      );
      return data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.wrap(`getApplicationResource(${appName}/${q.kind}/${q.resourceName})`, err);
    }
  }
}
