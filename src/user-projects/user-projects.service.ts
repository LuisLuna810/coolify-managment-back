import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProject } from './entities/user-project.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class UserProjectsService {
  private readonly logger = new Logger(UserProjectsService.name);

  constructor(
    @InjectRepository(UserProject)
    private readonly userProjectRepository: Repository<UserProject>,
    private readonly redisService: RedisService,
  ) {}

  async assign(
    userId: string,
    projectId: string,
    permissions?: Partial<
      Pick<UserProject, 'canStart' | 'canStop' | 'canRestart' | 'canAccessEnvs' | 'canAccessLogs'>
    >,
  ): Promise<UserProject> {
    // Verificar si la asignación ya existe
    const existingAssignment = await this.userProjectRepository.findOne({
      where: {
        user: { id: userId },
        project: { id: projectId }
      }
    });

    if (existingAssignment) {
      throw new ConflictException('Este proyecto ya está asignado a este usuario');
    }

    // Logs default a true: si el admin asigna sin especificar canAccessLogs,
    // damos acceso a logs por convención del producto. El resto de permisos
    // sigue arrancando en false como antes.
    const userProject = this.userProjectRepository.create({
      user: { id: userId },
      project: { id: projectId },
      canAccessLogs: true,
      ...(permissions || {}),
    });
    const result = await this.userProjectRepository.save(userProject);

    // Limpiar cache de forma asíncrona (no bloqueante)
    this.clearAssignmentCache(userId).then(() => {
      this.logger.log(`Cache limpiado después de asignar proyecto ${projectId} a usuario ${userId}`);
    }).catch(err => {
      this.logger.error(`Error limpiando cache: ${err.message}`);
    });

    return result;
  }

  async updatePermissions(
    userId: string,
    projectId: string,
    permissions: Partial<
      Pick<UserProject, 'canStart' | 'canStop' | 'canRestart' | 'canAccessEnvs' | 'canAccessLogs'>
    >,
  ): Promise<UserProject> {
    const assignment = await this.userProjectRepository.findOne({
      where: { user: { id: userId }, project: { id: projectId } },
      relations: ['user', 'project'],
    });

    if (!assignment) {
      throw new ConflictException('Asignación no encontrada');
    }

    Object.assign(assignment, permissions);
    const result = await this.userProjectRepository.save(assignment);

    this.clearAssignmentCache(userId).catch((err) => {
      this.logger.error(`Error limpiando cache: ${err.message}`);
    });

    return result;
  }

  async unassign(id: string): Promise<void> {
    // Obtener la asignación antes de eliminarla para poder limpiar el cache
    const assignment = await this.userProjectRepository.findOne({
      where: { id },
      relations: ['user']
    });

    await this.userProjectRepository.delete(id);

    // Limpiar cache de forma asíncrona (no bloqueante)
    if (assignment?.user?.id) {
      this.clearAssignmentCache(assignment.user.id).then(() => {
        this.logger.log(`Cache limpiado después de desasignar proyecto (id: ${id})`);
      }).catch(err => {
        this.logger.error(`Error limpiando cache: ${err.message}`);
      });
    }
  }

  async unassignUserProject(userId: string, projectId: string): Promise<void> {
    await this.userProjectRepository.delete({
      user: { id: userId },
      project: { id: projectId }
    });

    // Limpiar cache de forma asíncrona (no bloqueante)
    this.clearAssignmentCache(userId).then(() => {
      this.logger.log(`Cache limpiado después de desasignar proyecto ${projectId} de usuario ${userId}`);
    }).catch(err => {
      this.logger.error(`Error limpiando cache: ${err.message}`);
    });
  }

  /**
   * Limpiar todo el cache relacionado con las asignaciones de un usuario
   */
  private async clearAssignmentCache(userId: string): Promise<void> {
    await Promise.all([
      // Cache de proyectos del usuario
      this.redisService.del(`projects:user:${userId}`),
      // Cache de proyectos disponibles para este usuario
      this.redisService.del(`projects:available:${userId}`),
      // Cache general de proyectos disponibles (por compatibilidad)
      this.redisService.del('projects:available'),
    ]);
  }

  async findByUser(userId: string): Promise<UserProject[]> {
    return this.userProjectRepository.find({
      where: { user: { id: userId } },
      relations: ['project'],
    });
  }

  async findByProject(projectId: string): Promise<UserProject[]> {
    return this.userProjectRepository.find({
      where: { project: { id: projectId } },
      relations: ['user'],
    });
  }
}
