import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios from 'axios';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CoolifyService {
  private readonly logger = new Logger(CoolifyService.name);
  // OJO: `COOLIFY_URL` es una variable mágica que Coolify inyecta automáticamente
  // con el FQDN del propio servicio (= URL del dashboard cuando corremos dentro
  // de Coolify). Sobrescribe cualquier valor de la UI/.env. Por eso preferimos
  // `COOLIFY_API_URL` que no choca con la magic. Fallback a COOLIFY_URL solo
  // por compat con dev local (donde Coolify no aplica magic).
  private readonly baseUrl =
    process.env.COOLIFY_API_URL ||
    process.env.COOLIFY_URL ||
    'http://localhost:3000';
  private readonly apiKey = process.env.COOLIFY_API_KEY;

  // Cache TTLs (segundos). Cortos para que el dashboard se sienta vivo pero
  // suficientemente largos para deduplicar el thundering herd cuando todos los
  // cards piden status al mismo tiempo al cargar la página.
  private static readonly CACHE_TTL_STATUS = 15;
  private static readonly CACHE_TTL_DEPLOYMENT = 10;

  constructor(private readonly redisService: RedisService) {}

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  /** Invalida el cache de un app (llamar después de start/stop/restart) */
  async invalidateCache(appId: string) {
    await Promise.all([
      this.redisService.del(`coolify:status:${appId}`),
      this.redisService.del(`coolify:deploy:latest:${appId}`),
    ]);
  }

  private logAxiosError(context: string, err: any) {
    if (axios.isAxiosError(err)) {
      this.logger.error(
        `[${context}] ${err.message} | url=${err.config?.url} | status=${err.response?.status} | body=${JSON.stringify(err.response?.data)}`,
      );
    } else {
      this.logger.error(`[${context}] ${err?.message || err}`);
    }
  }

  async getProjects(): Promise<any[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v1/applications`, {
        headers: this.headers,
        timeout: 10000,
      });
      return data;
    } catch (err) {
      this.logAxiosError('getProjects', err);
      throw new HttpException('Error fetching projects from Coolify', 500);
    }
  }

  async getProjectStatus(appId: string): Promise<any> {
    const cacheKey = `coolify:status:${appId}`;
    const cached = await this.redisService.getJson<any>(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v1/applications/${appId}`, {
        headers: this.headers,
        timeout: 10000,
      });
      await this.redisService.setJson(cacheKey, data, CoolifyService.CACHE_TTL_STATUS);
      return data;
    } catch (err) {
      this.logAxiosError('getProjectStatus', err);
      throw new HttpException('Error fetching project status from Coolify', 500);
    }
  }

  async startProject(appId: string) {
    return axios.post(`${this.baseUrl}/api/v1/applications/${appId}/start`, {}, { headers: this.headers });
  }

  async stopProject(appId: string) {
    return axios.post(`${this.baseUrl}/api/v1/applications/${appId}/stop`, {}, { headers: this.headers });
  }

  async restartProject(appId: string) {
    return axios.post(`${this.baseUrl}/api/v1/applications/${appId}/restart`, {}, { headers: this.headers });
  }

  async pullProject(appId: string) {
    return axios.post(`${this.baseUrl}/api/v1/applications/${appId}/pull`, {}, { headers: this.headers });
  }

  async getApplicationDeployments(
    appId: string,
    take = 10,
    skip = 0,
  ): Promise<{ count: number; deployments: any[] }> {
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/api/v1/deployments/applications/${appId}`,
        {
          headers: this.headers,
          params: { take, skip },
          timeout: 10000,
        },
      );
      return data;
    } catch (err) {
      this.logAxiosError('getApplicationDeployments', err);
      throw new HttpException('Error fetching deployments from Coolify', 500);
    }
  }

  async getLatestDeployment(appId: string): Promise<any | null> {
    const cacheKey = `coolify:deploy:latest:${appId}`;
    const cached = await this.redisService.getJson<any>(cacheKey);
    if (cached !== null) return cached;

    try {
      const { deployments } = await this.getApplicationDeployments(appId, 1, 0);
      const latest = deployments?.[0] || null;
      // Si el deploy actual está en curso, TTL más corto para detectar el
      // cambio a finished/failed rápido. Si ya terminó, TTL normal.
      const isInProgress =
        latest?.status === 'in_progress' || latest?.status === 'queued';
      const ttl = isInProgress
        ? 5
        : CoolifyService.CACHE_TTL_DEPLOYMENT;
      await this.redisService.setJson(cacheKey, latest, ttl);
      return latest;
    } catch (err) {
      this.logger.warn(`getLatestDeployment failed for ${appId}: ${err?.message}`);
      return null;
    }
  }

  async getProjectContainers(appId: string): Promise<any> {
    try {
      // Intenta obtener información de contenedores que puede incluir el SHA
      const { data } = await axios.get(`${this.baseUrl}/api/v1/applications/${appId}/containers`, {
        headers: this.headers,
      });
      return data;
    } catch (err) {
      throw new HttpException('Error fetching container information from Coolify', 500);
    }
  }

  async getProjectEnvs(appId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/applications/${appId}/envs`,
        { headers: this.headers },
      );

      return response.data;
    } catch (err: any) {
      console.error("❌ Error en Coolify al pedir envs:", err.response?.data || err.message);

      // En vez de dejar que caiga, devolvemos una lista vacía
      return [];
    }
  }

  async updateProjectEnv(appId: string, envUuid: string, name: string, value: string) {
    const current = await this.getProjectEnvs(appId);

    const updated = current.map((env: any) => ({
      key: env.uuid,
      value: env.uuid === envUuid ? value : env.value,
      is_build_time: env.is_build_time || false,
      is_preview: env.is_preview || false,
      is_multiline: env.is_multiline || false,
      is_show_once: env.is_show_once || false,
    }));

    if (!updated.find((env: any) => env.key === envUuid)) {
      updated.push({
        key: envUuid,
        value,
        is_build_time: false,
        is_preview: false,
        is_multiline: false,
        is_show_once: false,
      });
    }

    const payload = { data: updated };
    console.log("📦 Payload Coolify:", JSON.stringify(payload, null, 2));

    try {
      const response = await axios.patch(
        `${this.baseUrl}/api/v1/applications/${appId}/envs/bulk`,
        payload,
        { headers: this.headers },
      );
      console.log("✅ Respuesta Coolify:", response.data);
      return response.data;
    } catch (err: any) {
      console.error("❌ Error Coolify:", err.response?.data || err.message);
      throw new HttpException(
        err.response?.data?.message || "Error updating envs in Coolify",
        err.response?.status || 500,
      );
    }
  }

  async getContainers(appId: string): Promise<any[]> {
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/api/v1/applications/${appId}`,
        { headers: this.headers },
      );
      
      // Extraer información de contenedores del response
      const containers: any[] = [];
      
      // Contenedor principal de la aplicación
      if (data.uuid) {
        containers.push({
          id: data.uuid,
          name: data.name || 'Main Application',
          type: 'application',
          status: data.status
        });
      }
      
      // Servicios adicionales (databases, redis, etc.)
      if (data.services && Array.isArray(data.services)) {
        data.services.forEach((service: any) => {
          containers.push({
            id: service.uuid || service.id,
            name: service.name || service.type || 'Service',
            type: service.type || 'service',
            status: service.status
          });
        });
      }
      
      // Bases de datos standalone
      if (data.standalone_databases && Array.isArray(data.standalone_databases)) {
        data.standalone_databases.forEach((db: any) => {
          containers.push({
            id: db.uuid || db.id,
            name: db.name || `${db.type} Database`,
            type: 'database',
            status: db.status
          });
        });
      }
      
      return containers;
    } catch (err) {
      throw new HttpException('Error fetching containers from Coolify', 500);
    }
  }

  async getLogs(appId: string, lines = 100, containerId?: string): Promise<string[]> {
    try {
      // Si se especifica un containerId, obtener logs de ese contenedor específico
      const endpoint = containerId 
        ? `${this.baseUrl}/api/v1/applications/${appId}/logs?container=${containerId}&lines=${lines}`
        : `${this.baseUrl}/api/v1/applications/${appId}/logs?lines=${lines}`;
      
      const { data } = await axios.get(endpoint, { headers: this.headers });
      return data.logs || [];
    } catch (err) {
      throw new HttpException('Error fetching logs from Coolify', 500);
    }
  }

}
