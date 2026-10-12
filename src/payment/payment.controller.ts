import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.paymentService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.paymentService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() body: { order_id: number; payment_method: string; payment_amount: number },
  ) {
    return this.paymentService.createPayment(body);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { payment_status: string },
  ) {
    return this.paymentService.updatePaymentStatus(+id, body.payment_status);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.paymentService.deletePayment(+id);
  }
}