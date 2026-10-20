import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@Injectable()
export class RestaurantsService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createRestaurant(restaurant_name: string, address?: string, phone?: string) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO restaurant (restaurant_name, address, phone) VALUES (?, ?, ?)',
      [restaurant_name, address ?? null, phone ?? null],
    );

    return {
      restaurant_id: result.insertId,
      restaurant_name,
      address: address ?? null,
      phone: phone ?? null,
    };
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT restaurant_id, restaurant_name, address, phone FROM restaurant WHERE restaurant_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Restaurant not found');
    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT restaurant_id, restaurant_name, address, phone FROM restaurant',
    );

    return rows;
  }

  async updateRestaurant(
    id: number,
    partial: {
      restaurant_name?: string;
      address?: string;
      phone?: string;
    },
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    if (partial.restaurant_name !== undefined) {
      fields.push('restaurant_name = ?');
      values.push(partial.restaurant_name);
    }

    if (partial.address !== undefined) {
      fields.push('address = ?');
      values.push(partial.address);
    }

    if (partial.phone !== undefined) {
      fields.push('phone = ?');
      values.push(partial.phone);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE restaurant SET ${fields.join(', ')} WHERE restaurant_id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteRestaurant(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM restaurant WHERE restaurant_id = ?',
      [id],
    );

    return res.affectedRows > 0;
  }
}