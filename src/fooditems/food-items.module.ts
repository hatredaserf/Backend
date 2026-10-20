import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { FoodItemsService } from './food-items.service';
import { FoodItemsController } from './food-items.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [
        DatabaseModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
    ],
    controllers: [FoodItemsController],
    providers: [FoodItemsService],
    exports: [FoodItemsService],
})
export class FoodItemsModule {}