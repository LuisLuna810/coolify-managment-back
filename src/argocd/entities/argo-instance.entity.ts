import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('argo_instances')
export class ArgoInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nombre humano para identificar la instancia ("Argo central techxmx").
  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  // URL del API de ArgoCD (ej: "https://argocd.techxmx.com"). Sin trailing slash.
  @Column({ type: 'varchar', length: 300 })
  serverUrl: string;

  // Token de autenticación (bearer). Cifrado en reposo con AES-GCM via
  // CryptoService — nunca se loguea ni se expone por API.
  @Column({ type: 'text' })
  authTokenEncrypted: string;

  // Intervalo de sync en ms. Mínimo enforzado a 60_000.
  @Column({ type: 'int', default: 300_000 })
  syncIntervalMs: number;

  // Permite desactivar una instancia sin borrarla (útil al rotar tokens).
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  // Opcional: si Argo expone TLS con cert custom y no querés validar.
  @Column({ type: 'boolean', default: false })
  insecureSkipTlsVerify: boolean;

  // Mapeo `clusterServer -> { lokiLabel: value, ... }` que se agrega al selector
  // LogQL de las Applications que apuntan a ese cluster. Permite distinguir
  // logs entre múltiples VPSs/clusters cuando los namespaces pueden colisionar
  // (ej: dos clusters con namespace `prod`). El operador configura esto al
  // registrar la instancia. Ejemplo:
  //   {
  //     "https://kubernetes.default.svc": { "vps": "docappoint" },
  //     "https://kube-otra.techxmx.com:6443": { "vps": "otra-vps" }
  //   }
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb", nullable: false })
  lokiClusterLabels: Record<string, Record<string, string>>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
