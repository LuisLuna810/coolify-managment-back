import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'
import * as bcrypt from 'bcrypt'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
  ) { }

  findAll(): Promise<User[]> {
    return this.userRepository.find()
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } })
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`)
    }
    return user
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'username', 'email', 'password', 'role', 'isActive'],
    });
  }


  async update(id: string, data: Partial<User>): Promise<User> {
    const before = await this.userRepository.findOne({ where: { id } })

    // Regla: el rol de un admin no se puede cambiar (ni demoter ni promover
    // a otra cosa). Si querés "removerlo", desactivá o eliminá el usuario.
    if (data.role !== undefined && before && before.role === 'admin' && data.role !== 'admin') {
      throw new ForbiddenException('No se puede cambiar el rol de un admin')
    }

    // Defensa: si el caller mete password por el endpoint genérico, hashearlo
    // antes de persistir (el flujo recomendado es changePassword).
    const patch: Partial<User> = { ...data }
    if (patch.password) {
      patch.password = await bcrypt.hash(patch.password, 10)
    }

    await this.userRepository.update(id, patch)
    const after = await this.findOne(id)

    // Si cambió un campo de auth (isActive, role, password), invalidar el cache
    // de validación de tokens y la sesión activa, así el siguiente request
    // re-evalúa contra la DB en lugar de usar el cache de 5min.
    const authCritical =
      (before && before.isActive !== after.isActive) ||
      (before && before.role !== after.role) ||
      patch.password !== undefined
    if (authCritical) {
      await Promise.all([
        this.redisService.clearPattern('token:valid:*'),
        this.redisService.del(`session:${id}`),
        this.redisService.del(`user:email:${after.email}`),
      ])
    }

    return after
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres')
    }
    const user = await this.findOne(id)
    const hashed = await bcrypt.hash(newPassword, 10)
    await this.userRepository.update(id, { password: hashed })

    // Invalidar cache de tokens/sesión para forzar re-login del usuario afectado.
    await Promise.all([
      this.redisService.clearPattern('token:valid:*'),
      this.redisService.del(`session:${id}`),
      this.redisService.del(`user:email:${user.email}`),
    ])
  }

  async create(user: Partial<User>): Promise<User> {
    if (!user.email || !user.password) {
      throw new Error('Email and password are required')
    }

    const existingUser = await this.findByEmail(user.email)
    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(user.password, saltRounds);

    const newUser = this.userRepository.create({
      ...user,
      password: hashedPassword,
    });

    return this.userRepository.save(newUser)
  }


  async remove(id: string): Promise<void> {
    const user = await this.findOne(id)
    await this.userRepository.delete(id)
    // Invalidar cache de tokens/sesión del usuario eliminado
    await Promise.all([
      this.redisService.clearPattern('token:valid:*'),
      this.redisService.del(`session:${id}`),
      this.redisService.del(`user:email:${user.email}`),
    ])
  }
}
