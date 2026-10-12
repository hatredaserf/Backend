import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface CreateCustomerDto {
  user_id: number;
  name: string;
  phone?: string;
  address?: string;
}

export interface UpdateCustomerDto {
  name?: string;
  phone?: string;
  address?: string;
}

@Injectable()
export class CustomersService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createCustomer(body: CreateCustomerDto) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO customer (user_id, name, phone, address) VALUES (?, ?, ?, ?)',
      [
        body.user_id ?? null,
        body.name ?? null,
        body.phone ?? null,
        body.address ?? null,
      ],
    );

    return { customer_id: result.insertId, ...body };
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT * FROM customer',
    );
    return rows;
  }

  async findOne(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT * FROM customer WHERE customer_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Customer not found');
    return rows[0];
  }

  async updateCustomer(id: number, body: UpdateCustomerDto) {
    const fields: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      fields.push('name = ?');
      values.push(body.name);
    }
    if (body.phone !== undefined) {
      fields.push('phone = ?');
      values.push(body.phone);
    }
    if (body.address !== undefined) {
      fields.push('address = ?');
      values.push(body.address);
    }

    if (fields.length === 0) return this.findOne(id);

    values.push(id);

    const sql = `UPDATE customer SET ${fields.join(', ')} WHERE customer_id = ?`;
    await this.pool().execute(sql, values);

    return this.findOne(id);
  }

  async deleteCustomer(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM customer WHERE customer_id = ?',
      [id],
    );

    if (res.affectedRows === 0) throw new NotFoundException('Customer not found');
    return { message: 'Customer deleted successfully' };
  }
}