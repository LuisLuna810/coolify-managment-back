import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Este es el identificador real en Coolify
  @Column({ unique: true })
  coolifyAppId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;
}
