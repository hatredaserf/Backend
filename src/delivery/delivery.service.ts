import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@Injectable()
export class DeliveryService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createDelivery(data: {
    order_id: number;
    delivery_address: string;
    delivery_status?: string;
  }) {
    const status = data.delivery_status || 'pending';

    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO delivery (order_id, delivery_address, delivery_status) VALUES (?, ?, ?)',
      [data.order_id, data.delivery_address, status],
    );

    return this.findOne(result.insertId);
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT delivery_id, order_id, delivery_address, delivery_status FROM delivery',
    );

    return rows;
  }

  async findOne(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT delivery_id, order_id, delivery_address, delivery_status FROM delivery WHERE delivery_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Delivery record not found');
    return rows[0];
  }

  async updateDeliveryStatus(id: number, delivery_status: string) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'UPDATE delivery SET delivery_status = ? WHERE delivery_id = ?',
      [delivery_status, id],
    );

    if (result.affectedRows === 0) throw new NotFoundException('Delivery record not found');
    return this.findOne(id);
  }

  async deleteDelivery(id: number) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM delivery WHERE delivery_id = ?',
      [id],
    );

    return result.affectedRows > 0;
  }
}