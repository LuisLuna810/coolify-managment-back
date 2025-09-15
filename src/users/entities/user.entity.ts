import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm'
import { UserProject } from '../../user-projects/entities/user-project.entity'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true, nullable: true })
  username: string

  @Column({ unique: true })
  email: string

  @Column({ select: false })
  password: string

  @Column({ default: 'developer' })
  role: 'admin' | 'developer'

  @Column({ default: true })
  isActive: boolean

  @OneToMany(() => UserProject, (userProject) => userProject.user)
  userProjects: UserProject[]
}
