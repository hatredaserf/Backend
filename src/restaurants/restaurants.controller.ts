import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll() {
    return this.restaurantsService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.restaurantsService.findById(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: { restaurant_name: string; address?: string; phone?: string }) {
    return this.restaurantsService.createRestaurant(body.restaurant_name, body.address, body.phone);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { restaurant_name?: string; address?: string; phone?: string },
  ) {
    return this.restaurantsService.updateRestaurant(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.restaurantsService.deleteRestaurant(+id);
  }
}