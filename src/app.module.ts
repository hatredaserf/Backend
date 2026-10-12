import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentModule } from './payment/payment.module';
import { DeliveryModule } from './delivery/delivery.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    OrdersModule,
    PaymentModule,
    DeliveryModule,
  ],
})
export class AppModule {}