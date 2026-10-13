import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.customersService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.customersService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
create(@Body() body: { name: string; email: string; phone?: string; address?: string }, @Req() req) {
  return this.customersService.create({
    ...body,
    user_id: req.user.id, // or however your auth stores it
  });
}

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; phone?: string; address?: string },
  ) {
    return this.customersService.updateCustomer(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.customersService.deleteCustomer(+id);
  }
}
