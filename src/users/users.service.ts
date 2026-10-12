import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  async createUser(username: string, hashedPassword: string, email: string, user_role = 'user') {
    // Note: Accept already-hashed password from AuthService
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO usersx (username, password, email, user_role) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, email, user_role],
    );

    return { user_id: result.insertId, username, email, user_role };
  }

  async findByUsername(username: string) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT user_id, username, password, email, user_role, refresh_token FROM usersx WHERE username = ?',
      [username],
    );

    return rows[0];
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT user_id, username, email, user_role FROM usersx WHERE user_id = ?',
      [id],
    );

    if (!rows[0]) throw new NotFoundException('User not found');
    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT user_id, username, email, user_role FROM usersx',
    );

    return rows;
  }

  async updateUser(
    id: number,
    partial: {
      username?: string;
      password?: string;
      email?: string;
      user_role?: string;
    },
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    if (partial.username) {
      fields.push('username = ?');
      values.push(partial.username);
    }

    if (partial.email) {
      fields.push('email = ?');
      values.push(partial.email);
    }

    if (partial.password) {
      const hashed = await bcrypt.hash(partial.password, 10);
      fields.push('password = ?');
      values.push(hashed);
    }

    if (partial.user_role) {
      fields.push('user_role = ?');
      values.push(partial.user_role);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE usersx SET ${fields.join(', ')} WHERE user_id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteUser(id: number) {
    const [res] = await this.pool().execute<ResultSetHeader>(
      'DELETE FROM usersx WHERE user_id = ?',
      [id],
    );

    return res.affectedRows > 0;
  }

  async setRefreshToken(id: number, refreshToken: string | null) {
    await this.pool().execute(
      'UPDATE usersx SET refresh_token = ? WHERE user_id = ?',
      [refreshToken, id],
    );
  }

  async findByRefreshToken(refreshToken: string) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT user_id, username, email, user_role FROM usersx WHERE refresh_token = ?',
      [refreshToken],
    );

    return rows[0];
  }
}