import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@Injectable()
export class CategoriesService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createCategory(category_name: string) {
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO category (category_name) VALUES (?)',
      [category_name],
    );

    return { category_id: result.insertId, category_name };
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT category_id, category_name FROM category WHERE category_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('Category not found');
    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT category_id, category_name FROM category',
    );

    return rows;
  }

  async updateCategory(id: number, partial: { category_name?: string }) {
    const fields: string[] = [];
    const values: any[] = [];

    if (partial.category_name !== undefined) {
      fields.push('category_name = ?');
      values.push(partial.category_name);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE category SET ${fields.join(', ')} WHERE category_id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteCategory(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM category WHERE category_id = ?',
      [id],
    );

    return res.affectedRows > 0;
  }
}