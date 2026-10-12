import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.usersService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: { username: string; password: string; email: string }) {
    return this.usersService.createUser(body.username, body.password, body.email);
  }

  // Fixed: Call update user logic instead of deleteUser
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { username?: string; email?: string; user_role?: string },
  ) {
    return this.usersService.updateUser(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.deleteUser(+id);
  }
}