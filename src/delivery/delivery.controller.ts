import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.deliveryService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.deliveryService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() body: { order_id: number; delivery_address: string },
  ) {
    return this.deliveryService.createDelivery(body);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { delivery_status: string },
  ) {
    return this.deliveryService.updateDeliveryStatus(+id, body.delivery_status);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.deliveryService.deleteDelivery(+id);
  }
}