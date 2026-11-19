import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

const DELIVERY_FEE = 49; // keep in sync with DELIVERY_FEE in the dashboard page
const PAYMENT_METHODS = ['Cash on delivery', 'GCash', 'Card']; // keep in sync with PAYMENT_METHODS in the dashboard page

const PROFILE_SQL = `
  SELECT u.user_id, u.username, u.email, u.user_role,
         c.customer_id, c.name, c.phone, c.address
  FROM usersx u
  LEFT JOIN customer c ON c.user_id = u.user_id
  WHERE u.user_id = ?`;

const MY_ORDERS_SQL = `
  SELECT o.order_id, o.order_date, o.total_amount, o.order_status,
         d.delivery_address, d.delivery_status,
         p.payment_method, p.payment_status,
         (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi WHERE oi.order_id = o.order_id) AS item_count
  FROM orders o
  JOIN customer c ON c.customer_id = o.customer_id
  LEFT JOIN delivery d ON d.order_id = o.order_id
  LEFT JOIN payment p ON p.order_id = o.order_id
  WHERE c.user_id = ?`;

@Injectable()
export class DashboardService {
  constructor(private db: DatabaseService) {}

  private pool = () => this.db.getpool();

  /* ---------- Menu ---------- */

  async getMenu() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      `SELECT f.food_id, f.food_name, f.price, f.availability,
              f.category_id, c.category_name,
              f.restaurant_id, r.restaurant_name
       FROM food_item f
       JOIN category c ON c.category_id = f.category_id
       JOIN restaurant r ON r.restaurant_id = f.restaurant_id
       ORDER BY f.food_id`,
    );
    return rows;
  }

  /* ---------- Profile ---------- */

  async getProfile(userId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(PROFILE_SQL, [userId]);
    if (!rows[0]) throw new NotFoundException('Account not found.');
    return rows[0];
  }

  async saveProfile(userId: number, body: { name?: string; phone?: string; address?: string }) {
    const name = String(body?.name ?? '').trim();
    const phone = String(body?.phone ?? '').trim();
    const address = String(body?.address ?? '').trim();

    if (!name) throw new BadRequestException('Enter your name so we know who the order is for.');
    if (name.length > 100) throw new BadRequestException('Your name must be 100 characters or fewer.');
    if (phone.length > 20) throw new BadRequestException('Your phone number must be 20 characters or fewer.');
    if (address.length > 255) throw new BadRequestException('Your address must be 255 characters or fewer.');

    // customer.user_id is UNIQUE, so this creates the row the first time and updates it after
    await this.pool().execute(
      `INSERT INTO customer (user_id, name, phone, address) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), address = VALUES(address)`,
      [userId, name, phone || null, address || null],
    );
    return this.getProfile(userId);
  }

  /* ---------- Orders ---------- */

  async getMyOrders(userId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      `${MY_ORDERS_SQL} ORDER BY o.order_date DESC, o.order_id DESC`,
      [userId],
    );
    return rows;
  }

  async getMyOrder(userId: number, orderId: number) {
    // Filtering by the logged-in user means nobody can open someone else's order
    const [rows] = await this.pool().execute<RowDataPacket[]>(`${MY_ORDERS_SQL} AND o.order_id = ?`, [userId, orderId]);
    if (!rows[0]) throw new NotFoundException('Order not found.');

    const [items] = await this.pool().execute<RowDataPacket[]>(
      `SELECT oi.food_id, f.food_name, oi.quantity, oi.subtotal
       FROM order_item oi JOIN food_item f ON f.food_id = oi.food_id
       WHERE oi.order_id = ?`,
      [orderId],
    );
    return { ...rows[0], items };
  }

  // Registration only creates a user, so make the customer row the first time they order
  private async customerIdFor(conn: PoolConnection, userId: number): Promise<number> {
    const [found] = await conn.query<RowDataPacket[]>('SELECT customer_id FROM customer WHERE user_id = ?', [userId]);
    if (found[0]) return found[0].customer_id as number;

    const [users] = await conn.query<RowDataPacket[]>('SELECT username FROM usersx WHERE user_id = ?', [userId]);
    if (!users[0]) throw new UnauthorizedException("We couldn't find your account. Please log in again.");

    const [created] = await conn.query<ResultSetHeader>('INSERT INTO customer (user_id, name) VALUES (?, ?)', [
      userId,
      users[0].username,
    ]);
    return created.insertId;
  }

  async placeOrder(
    userId: number,
    body: { items?: { food_id: number; quantity: number }[]; payment_method?: string; delivery_address?: string },
  ) {
    const items = body?.items;
    const address = String(body?.delivery_address ?? '').trim();
    const method = String(body?.payment_method ?? '');

    if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('Your order has no items.');
    if (!address) throw new BadRequestException('Add a delivery address so we know where to bring your order.');
    if (address.length > 255) throw new BadRequestException('The delivery address is too long.');
    if (!PAYMENT_METHODS.includes(method)) throw new BadRequestException('Pick a valid payment method.');

    // Merge repeated items and check quantities
    const wanted = new Map<number, number>();
    for (const it of items) {
      const id = Number(it?.food_id);
      const qty = Number(it?.quantity);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        throw new BadRequestException('One of the items in your order is invalid.');
      }
      wanted.set(id, (wanted.get(id) ?? 0) + qty);
    }

    // One transaction: either the whole order is saved, or none of it is
    const conn = await this.pool().getConnection();
    try {
      await conn.beginTransaction();

      // Prices come from the database, never from the browser
      const [foods] = await conn.query<RowDataPacket[]>(
        'SELECT food_id, price FROM food_item WHERE availability = 1 AND food_id IN (?)',
        [[...wanted.keys()]],
      );
      if (foods.length !== wanted.size) {
        throw new BadRequestException('Some items in your order are no longer available. Please review your cart.');
      }

      let subtotal = 0;
      const lines = foods.map((f) => {
        const quantity = wanted.get(f.food_id as number) as number;
        const lineTotal = Number(f.price) * quantity;
        subtotal += lineTotal;
        return { food_id: f.food_id as number, quantity, subtotal: lineTotal };
      });
      const total = subtotal + DELIVERY_FEE;

      const customerId = await this.customerIdFor(conn, userId);
      const [order] = await conn.query<ResultSetHeader>('INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)', [
        customerId,
        total,
      ]);
      const orderId = order.insertId;

      await conn.query('INSERT INTO order_item (order_id, food_id, quantity, subtotal) VALUES ?', [
        lines.map((l) => [orderId, l.food_id, l.quantity, l.subtotal]),
      ]);
      await conn.query('INSERT INTO payment (order_id, payment_method, payment_amount) VALUES (?, ?, ?)', [
        orderId,
        method,
        total,
      ]);
      await conn.query('INSERT INTO delivery (order_id, delivery_address) VALUES (?, ?)', [orderId, address]);

      await conn.commit();
      return { order_id: orderId, total_amount: total };
    } catch (err) {
      await conn.rollback();
      throw err; // Nest turns the exceptions above into proper 400/401 responses
    } finally {
      conn.release();
    }
  }
}