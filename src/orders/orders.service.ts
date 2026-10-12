import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface CreateOrderDto {
  customer_id: number;
  total_amount: number;
  order_status?: string;
}

export interface UpdateOrderDto {
  total_amount?: number;
  order_status?: string;
}

@Injectable()
export class OrdersService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createOrder(body: CreateOrderDto) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO orders (customer_id, total_amount, order_status) VALUES (?, ?, ?)',
      [
        body.customer_id ?? null,
        body.total_amount ?? null,
        body.order_status ?? 'Pending',
      ],
    );

    return { order_id: result.insertId, ...body };
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT * FROM orders',
    );
    return rows;
  }

  async findOne(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT * FROM orders WHERE order_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Order not found');
    return rows[0];
  }

  async updateOrder(id: number, body: UpdateOrderDto) {
    const fields: string[] = [];
    const values: any[] = [];

    if (body.total_amount !== undefined) {
      fields.push('total_amount = ?');
      values.push(body.total_amount);
    }
    if (body.order_status !== undefined) {
      fields.push('order_status = ?');
      values.push(body.order_status);
    }

    if (fields.length === 0) return this.findOne(id);

    values.push(id);

    const sql = `UPDATE orders SET ${fields.join(', ')} WHERE order_id = ?`;
    await this.pool().execute(sql, values);

    return this.findOne(id);
  }

  async deleteOrder(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM orders WHERE order_id = ?',
      [id],
    );

    if (res.affectedRows === 0) throw new NotFoundException('Order not found');
    return { message: 'Order deleted successfully' };
  }
}