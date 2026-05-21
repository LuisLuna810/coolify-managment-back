import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArgoInstance } from './entities/argo-instance.entity';
import { CryptoService } from './crypto.service';
import { ArgoCDClient } from './argocd-client';

interface CreateInstanceInput {
  name: string;
  serverUrl: string;
  authToken: string; // plain — se cifra antes de guardar
  syncIntervalMs?: number;
  insecureSkipTlsVerify?: boolean;
  lokiClusterLabels?: Record<string, Record<string, string>>;
}

interface UpdateInstanceInput {
  name?: string;
  serverUrl?: string;
  authToken?: string; // sólo cifrar/rotar si viene
  syncIntervalMs?: number;
  enabled?: boolean;
  insecureSkipTlsVerify?: boolean;
  lokiClusterLabels?: Record<string, Record<string, string>>;
}

@Injectable()
export class ArgoInstancesService {
  private readonly logger = new Logger(ArgoInstancesService.name);
  // Cache de clientes vivos. Invalidamos cuando el row cambia (token rotado,
  // serverUrl modificado, etc.) — clave: instance.id + updatedAt.toISOString().
  private clientCache = new Map<string, ArgoCDClient>();

  constructor(
    @InjectRepository(ArgoInstance)
    private readonly repo: Repository<ArgoInstance>,
    private readonly crypto: CryptoService,
  ) {}

  async create(input: CreateInstanceInput): Promise<ArgoInstance> {
    const entity = this.repo.create({
      name: input.name,
      serverUrl: input.serverUrl.replace(/\/$/, ''),
      authTokenEncrypted: this.crypto.encrypt(input.authToken),
      syncIntervalMs: Math.max(60_000, input.syncIntervalMs ?? 300_000),
      insecureSkipTlsVerify: input.insecureSkipTlsVerify ?? false,
      lokiClusterLabels: input.lokiClusterLabels ?? {},
      enabled: true,
    });
    return this.repo.save(entity);
  }

  async update(id: string, input: UpdateInstanceInput): Promise<ArgoInstance> {
    const current = await this.findOne(id);
    if (input.name !== undefined) current.name = input.name;
    if (input.serverUrl !== undefined) current.serverUrl = input.serverUrl.replace(/\/$/, '');
    if (input.authToken !== undefined) {
      current.authTokenEncrypted = this.crypto.encrypt(input.authToken);
    }
    if (input.syncIntervalMs !== undefined) {
      current.syncIntervalMs = Math.max(60_000, input.syncIntervalMs);
    }
    if (input.enabled !== undefined) current.enabled = input.enabled;
    if (input.insecureSkipTlsVerify !== undefined) {
      current.insecureSkipTlsVerify = input.insecureSkipTlsVerify;
    }
    if (input.lokiClusterLabels !== undefined) {
      current.lokiClusterLabels = input.lokiClusterLabels;
    }
    const saved = await this.repo.save(current);
    this.invalidateClient(id);
    return saved;
  }

  async findAll(): Promise<ArgoInstance[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async findAllEnabled(): Promise<ArgoInstance[]> {
    return this.repo.find({ where: { enabled: true }, order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<ArgoInstance> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`ArgoInstance ${id} no encontrada`);
    return found;
  }

  async remove(id: string): Promise<void> {
    const found = await this.findOne(id);
    await this.repo.remove(found);
    this.invalidateClient(id);
  }

  /**
   * Devuelve un cliente listo para usar. Cachea por (id, updatedAt) — si
   * cambió el token o la URL, el cache key cambia y se construye uno nuevo.
   */
  getClient(instance: ArgoInstance): ArgoCDClient {
    const cacheKey = `${instance.id}:${instance.updatedAt?.toISOString?.() ?? ''}`;
    let client = this.clientCache.get(cacheKey);
    if (!client) {
      const token = this.crypto.decrypt(instance.authTokenEncrypted);
      client = new ArgoCDClient(instance, token);
      this.clientCache.set(cacheKey, client);
    }
    return client;
  }

  /** Versión pública que SÓLO redacta el token al serializar. */
  toPublic(instance: ArgoInstance) {
    const { authTokenEncrypted, ...rest } = instance;
    return { ...rest, hasToken: !!authTokenEncrypted };
  }

  private invalidateClient(id: string) {
    for (const k of this.clientCache.keys()) {
      if (k.startsWith(`${id}:`)) this.clientCache.delete(k);
    }
  }
}
