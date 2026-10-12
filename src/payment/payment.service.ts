import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@Injectable()
export class PaymentService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createPayment(data: {
    order_id: number;
    payment_method: string;
    payment_amount: number;
    payment_status?: string;
  }) {
    const status = data.payment_status || 'pending';

    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO payment (order_id, payment_method, payment_amount, payment_status) VALUES (?, ?, ?, ?)',
      [data.order_id, data.payment_method, data.payment_amount, status],
    );

    return this.findOne(result.insertId);
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT payment_id, order_id, payment_method, payment_amount, payment_status FROM payment',
    );

    return rows;
  }

  async findOne(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT payment_id, order_id, payment_method, payment_amount, payment_status FROM payment WHERE payment_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Payment record not found');
    return rows[0];
  }

  async updatePaymentStatus(id: number, payment_status: string) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'UPDATE payment SET payment_status = ? WHERE payment_id = ?',
      [payment_status, id],
    );

    if (result.affectedRows === 0) throw new NotFoundException('Payment record not found');
    return this.findOne(id);
  }

  async deletePayment(id: number) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM payment WHERE payment_id = ?',
      [id],
    );

    return result.affectedRows > 0;
  }
}