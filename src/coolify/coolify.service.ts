import { Injectable, HttpException } from '@nestjs/common';
import axios from 'axios';
import { log } from 'console';

@Injectable()
export class CoolifyService {
  private readonly baseUrl = process.env.COOLIFY_URL || 'http://localhost:3000';
  private readonly apiKey = process.env.COOLIFY_API_KEY;

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async getProjects(): Promise<any[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v1/applications`, {
        headers: this.headers,
      });
      return data;
    } catch (err) {
      throw new HttpException('Error fetching projects from Coolify', 500);
    }
  }

  async getProjectStatus(appId: string): Promise<any> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/v1/applications/${appId}`, {
        headers: this.headers,
      });
      return data;
    } catch (err) {
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

  async getProjectDeployments(appId: string): Promise<any> {
    try {
      // Intenta obtener los deployments de la aplicación
      const { data } = await axios.get(`${this.baseUrl}/api/v1/applications/${appId}/deployments`, {
        headers: this.headers,
      });
      return data;
    } catch (err) {
      console.log('Deployments endpoint not available, trying alternative...');
      // Si no existe, intenta obtener logs que pueden contener información del commit
      try {
        const { data } = await axios.get(`${this.baseUrl}/api/v1/applications/${appId}/logs`, {
          headers: this.headers,
        });
        return data;
      } catch (logErr) {
        throw new HttpException('Error fetching deployment information from Coolify', 500);
      }
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

  async getLogs(appId: string, lines = 100): Promise<string[]> {
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/api/v1/applications/${appId}/logs?lines=${lines}`,
        { headers: this.headers },
      );
      return data.logs || [];
    } catch (err) {
      throw new HttpException('Error fetching logs from Coolify', 500);
    }
  }

}
