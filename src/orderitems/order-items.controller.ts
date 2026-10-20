import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { OrderItemsService } from './order-items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('order-items')
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.orderItemsService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('order/:orderId')
  async getByOrder(@Param('orderId') orderId: string) {
    return this.orderItemsService.findByOrder(+orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.orderItemsService.findById(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: { order_id: number; food_id: number; quantity: number }) {
    return this.orderItemsService.createOrderItem(body.order_id, body.food_id, body.quantity);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { order_id?: number; food_id?: number; quantity?: number },
  ) {
    return this.orderItemsService.updateOrderItem(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.orderItemsService.deleteOrderItem(+id);
  }
}