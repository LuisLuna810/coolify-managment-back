import { ProjectsService } from './projects.service';

/**
 * Regresión: findByUser arma `permissions` cruzando rows.entities con
 * rows.raw POR ÍNDICE. Como `workloads` es OneToMany y se trae con
 * leftJoinAndSelect, un proyecto con N workloads genera N filas en rows.raw
 * pero 1 sola entity. A partir del primer proyecto multi-workload los índices
 * se desalinean y los permisos quedan corridos al proyecto equivocado.
 */
describe('ProjectsService.findByUser permissions mapping', () => {
  function buildService(rawAndEntities: { entities: any[]; raw: any[] }) {
    const qb: any = {
      leftJoinAndSelect: () => qb,
      innerJoin: () => qb,
      where: () => qb,
      addSelect: () => qb,
      getRawAndEntities: async () => rawAndEntities,
    };

    const projectRepository: any = {
      createQueryBuilder: () => qb,
    };
    const redisService: any = {
      getJson: async () => null, // forzar el path de DB (sin cache)
      setJson: async () => undefined,
    };
    const coolifyService: any = {};
    const schedulerRegistry: any = {};

    return new ProjectsService(
      projectRepository,
      coolifyService,
      redisService,
      schedulerRegistry,
    );
  }

  it('asigna los permisos al proyecto correcto cuando un proyecto previo tiene varios workloads', async () => {
    // Argo con 2 workloads (back + front) => 2 filas raw, 1 entity.
    // Coolify después, con acceso a envs CONCEDIDO en su propia fila.
    const argo = { id: 'argo-1', name: 'docappoint', source: 'argocd', workloads: [{}, {}] };
    const coolify = { id: 'cool-1', name: 'web', source: 'coolify', workloads: [] };

    const permArgo = {
      up_canstart: false,
      up_canstop: false,
      up_canrestart: false,
      up_canaccessenvs: false,
      up_canaccesslogs: true,
    };
    const permCoolify = {
      up_canstart: false,
      up_canstop: false,
      up_canrestart: false,
      up_canaccessenvs: true, // <-- el admin SÍ le dio "ver env vars"
      up_canaccesslogs: true,
    };

    const service = buildService({
      entities: [argo, coolify],
      raw: [
        { project_id: 'argo-1', ...permArgo }, // workload 1 del argo
        { project_id: 'argo-1', ...permArgo }, // workload 2 del argo (fila extra)
        { project_id: 'cool-1', ...permCoolify },
      ],
    });

    const result = await service.findByUser('user-1');
    const cool = result.find((p: any) => p.id === 'cool-1');

    expect(cool.permissions.canAccessEnvs).toBe(true);
  });
});
