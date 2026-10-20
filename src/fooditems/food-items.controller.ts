import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { FoodItemsService } from './food-items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('food-items')
export class FoodItemsController {
  constructor(private readonly foodItemsService: FoodItemsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.foodItemsService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('restaurant/:restaurantId')
  async getByRestaurant(@Param('restaurantId') restaurantId: string) {
    return this.foodItemsService.findByRestaurant(+restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('category/:categoryId')
  async getByCategory(@Param('categoryId') categoryId: string) {
    return this.foodItemsService.findByCategory(+categoryId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.foodItemsService.findById(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body()
    body: {
      restaurant_id: number;
      category_id: number;
      food_name: string;
      price: number;
      availability?: number;
    },
  ) {
    return this.foodItemsService.createFoodItem(
      body.restaurant_id,
      body.category_id,
      body.food_name,
      body.price,
      body.availability,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      restaurant_id?: number;
      category_id?: number;
      food_name?: string;
      price?: number;
      availability?: number;
    },
  ) {
    return this.foodItemsService.updateFoodItem(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.foodItemsService.deleteFoodItem(+id);
  }
}