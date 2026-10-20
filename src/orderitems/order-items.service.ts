import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@Injectable()
export class OrderItemsService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  // subtotal = food_item.price * quantity (looked up server-side so clients can't fake it)
  private async computeSubtotal(food_id: number, quantity: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT price FROM food_item WHERE food_id = ?',
      [food_id],
    );

    if (!rows[0]) throw new NotFoundException('Food item not found');
    return Math.round(Number(rows[0].price) * quantity * 100) / 100;
  }

  async createOrderItem(order_id: number, food_id: number, quantity: number) {
    const subtotal = await this.computeSubtotal(food_id, quantity);

    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO order_item (order_id, food_id, quantity, subtotal) VALUES (?, ?, ?, ?)',
      [order_id, food_id, quantity, subtotal],
    );

    return { order_item_id: result.insertId, order_id, food_id, quantity, subtotal };
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT order_item_id, order_id, food_id, quantity, subtotal FROM order_item WHERE order_item_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Order item not found');
    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT order_item_id, order_id, food_id, quantity, subtotal FROM order_item',
    );

    return rows;
  }

  async findByOrder(orderId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT order_item_id, order_id, food_id, quantity, subtotal FROM order_item WHERE order_id = ?',
      [orderId],
    );

    return rows;
  }

  async updateOrderItem(
    id: number,
    partial: {
      order_id?: number;
      food_id?: number;
      quantity?: number;
    },
  ) {
    const current = await this.findById(id);

    const fields: string[] = [];
    const values: any[] = [];

    if (partial.order_id !== undefined) {
      fields.push('order_id = ?');
      values.push(partial.order_id);
    }

    if (partial.food_id !== undefined) {
      fields.push('food_id = ?');
      values.push(partial.food_id);
    }

    if (partial.quantity !== undefined) {
      fields.push('quantity = ?');
      values.push(partial.quantity);
    }

    if (fields.length === 0) return current;

    // Recalculate subtotal if the food or quantity changed
    if (partial.food_id !== undefined || partial.quantity !== undefined) {
      const subtotal = await this.computeSubtotal(
        partial.food_id ?? current.food_id,
        partial.quantity ?? current.quantity,
      );
      fields.push('subtotal = ?');
      values.push(subtotal);
    }

    values.push(id);

    const sql = `UPDATE order_item SET ${fields.join(', ')} WHERE order_item_id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteOrderItem(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM order_item WHERE order_item_id = ?',
      [id],
    );

    return res.affectedRows > 0;
  }
}