import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@Injectable()
export class FoodItemsService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createFoodItem(
    restaurant_id: number,
    category_id: number,
    food_name: string,
    price: number,
    availability = 1,
  ) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO food_item (restaurant_id, category_id, food_name, price, availability) VALUES (?, ?, ?, ?, ?)',
      [restaurant_id, category_id, food_name, price, availability],
    );

    return { food_id: result.insertId, restaurant_id, category_id, food_name, price, availability };
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT food_id, restaurant_id, category_id, food_name, price, availability FROM food_item WHERE food_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Food item not found');
    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT food_id, restaurant_id, category_id, food_name, price, availability FROM food_item',
    );

    return rows;
  }

  async findByRestaurant(restaurantId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT food_id, restaurant_id, category_id, food_name, price, availability FROM food_item WHERE restaurant_id = ?',
      [restaurantId],
    );

    return rows;
  }

  async findByCategory(categoryId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT food_id, restaurant_id, category_id, food_name, price, availability FROM food_item WHERE category_id = ?',
      [categoryId],
    );

    return rows;
  }

  async updateFoodItem(
    id: number,
    partial: {
      restaurant_id?: number;
      category_id?: number;
      food_name?: string;
      price?: number;
      availability?: number;
    },
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    if (partial.restaurant_id !== undefined) {
      fields.push('restaurant_id = ?');
      values.push(partial.restaurant_id);
    }

    if (partial.category_id !== undefined) {
      fields.push('category_id = ?');
      values.push(partial.category_id);
    }

    if (partial.food_name !== undefined) {
      fields.push('food_name = ?');
      values.push(partial.food_name);
    }

    if (partial.price !== undefined) {
      fields.push('price = ?');
      values.push(partial.price);
    }

    if (partial.availability !== undefined) {
      fields.push('availability = ?');
      values.push(partial.availability);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE food_item SET ${fields.join(', ')} WHERE food_id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteFoodItem(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM food_item WHERE food_id = ?',
      [id],
    );

    return res.affectedRows > 0;
  }
}