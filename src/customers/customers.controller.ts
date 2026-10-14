import { Controller, Get, Post, Put, Delete, Body, Param, Req,UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async getAll() {
    return this.customersService.getAll();
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.findOne(id);
  }

  @Post()
  async create(
    @Body() body: { user_id?: number; name: string; email?: string; phone?: string; address?: string },
    @Req() req: any,
  ) {
    // Uses user_id from body, falls back to authenticated JWT payload user ID
    const userId = body.user_id ?? req.user?.user_id ?? req.user?.id;

    return this.customersService.createCustomer({
      ...body,
      user_id: userId,
    });
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; email?: string; phone?: string; address?: string },
  ) {
    return this.customersService.updateCustomer(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.deleteCustomer(id);
  }
}