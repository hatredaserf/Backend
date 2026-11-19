import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService, FoodBody } from './dashboard.service';

// Everything the customer dashboard needs, kept apart from the admin-style CRUD routes:
//   GET  /my/menu          menu cards (food items with category and restaurant names)
//   GET  /my/profile       the logged-in user's profile
//   PUT  /my/profile       save name, phone and default delivery address
//   GET  /my/orders        the logged-in user's own orders
//   GET  /my/orders/:id    one of their orders, with items
//   POST /my/orders        place an order
//   POST /my/menu          add a food item        (PUT /my/menu/:id edits, DELETE /my/menu/:id removes)
//   GET/POST /my/categories and /my/restaurants   the dropdowns in the add/edit form
@UseGuards(JwtAuthGuard)
@Controller('my')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // Different JWT strategies put the user id under different names, so check the usual ones
  private userId(req: any): number {
    const u = req.user ?? {};
    const id = Number(u.userId ?? u.user_id ?? u.id ?? u.sub);
    if (!Number.isInteger(id) || id <= 0) throw new UnauthorizedException('Please log in again.');
    return id;
  }

  @Get('menu')
  async getMenu() {
    return this.dashboardService.getMenu();
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.dashboardService.getProfile(this.userId(req));
  }

  @Put('profile')
  async saveProfile(@Req() req: any, @Body() body: { name?: string; phone?: string; address?: string }) {
    return this.dashboardService.saveProfile(this.userId(req), body);
  }

  @Get('orders')
  async getMyOrders(@Req() req: any) {
    return this.dashboardService.getMyOrders(this.userId(req));
  }

  @Get('orders/:id')
  async getMyOrder(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.getMyOrder(this.userId(req), id);
  }

  @Post('orders')
  async placeOrder(
    @Req() req: any,
    @Body()
    body: {
      items?: { food_id: number; quantity: number }[];
      payment_method?: string;
      delivery_address?: string;
    },
  ) {
    return this.dashboardService.placeOrder(this.userId(req), body);
  }

  /* ---------- Menu editing ---------- */

  @Post('menu')
  async createFood(@Req() req: any, @Body() body: FoodBody) {
    return this.dashboardService.createFood(this.userId(req), body);
  }

  @Put('menu/:id')
  async updateFood(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: FoodBody) {
    return this.dashboardService.updateFood(this.userId(req), id, body);
  }

  @Delete('menu/:id')
  async deleteFood(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.deleteFood(this.userId(req), id);
  }

  @Get('categories')
  async getCategories() {
    return this.dashboardService.getCategories();
  }

  @Post('categories')
  async addCategory(@Req() req: any, @Body() body: { category_name?: string }) {
    return this.dashboardService.addCategory(this.userId(req), body);
  }

  @Get('restaurants')
  async getRestaurants() {
    return this.dashboardService.getRestaurants();
  }

  @Post('restaurants')
  async addRestaurant(@Req() req: any, @Body() body: { restaurant_name?: string; address?: string; phone?: string }) {
    return this.dashboardService.addRestaurant(this.userId(req), body);
  }
}