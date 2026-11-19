import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentModule } from './payment/payment.module';
import { DeliveryModule } from './delivery/delivery.module';
import { CategoriesModule } from './categories/categories.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { FoodItemsModule } from './fooditems/food-items.module';
import { OrderItemsModule } from './orderitems/order-items.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    OrdersModule,
    PaymentModule,
    DeliveryModule,
    CategoriesModule,
    RestaurantsModule,
    FoodItemsModule,
    OrderItemsModule,
      DashboardModule
  ],
})
export class AppModule {}