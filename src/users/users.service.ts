import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    await this.userRepository.update(id, data)
    return this.findOne(id)
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
    await this.findOne(id)
    await this.userRepository.delete(id)
  }
}
