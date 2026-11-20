import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

const DELIVERY_FEE = 49; // keep in sync with DELIVERY_FEE in the dashboard page
const PAYMENT_METHODS = ['Cash on delivery', 'GCash', 'Card']; // keep in sync with PAYMENT_METHODS in the dashboard page

// Set to true so only admins (usersx.user_role = 'Admin') can add, edit and delete menu items.
// Keep it in sync with ONLY_ADMINS_CAN_EDIT_MENU in the dashboard page.
const ONLY_ADMINS_CAN_EDIT_MENU = true;

export type FoodBody = {
  food_name?: string;
  price?: number | string;
  category_id?: number | string;
  restaurant_id?: number | string;
  availability?: boolean | number | string;
  image_url?: string | null;
};

// Demo helper: nothing in this project updates an order's status yet (no kitchen or rider app),
// so orders move along by their age whenever the customer looks at them:
//   30 seconds: Preparing, 2 minutes: Out for delivery, 4 minutes: Delivered.
// Set this to false once real statuses are updated some other way (an admin screen, SQL, a rider app).
const AUTO_ADVANCE_ORDERS = true;

const MENU_SQL = `
  SELECT f.food_id, f.food_name, f.price, f.availability,
         f.category_id, c.category_name,
         f.restaurant_id, r.restaurant_name, f.image_url
  FROM food_item f
  JOIN category c ON c.category_id = f.category_id
  JOIN restaurant r ON r.restaurant_id = f.restaurant_id`;

const ORDER_STATUSES = ['Pending', 'Preparing', 'Out for delivery', 'Delivered', 'Cancelled'];

const ALL_ORDERS_SQL = `
  SELECT o.order_id, o.order_date, o.total_amount, o.order_status,
         c.name AS customer_name, c.phone AS customer_phone,
         d.delivery_address, d.delivery_status,
         p.payment_method, p.payment_status,
         (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi WHERE oi.order_id = o.order_id) AS item_count
  FROM orders o
  JOIN customer c ON c.customer_id = o.customer_id
  LEFT JOIN delivery d ON d.order_id = o.order_id
  LEFT JOIN payment p ON p.order_id = o.order_id`;

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
    const [rows] = await this.pool().execute<RowDataPacket[]>(`${MENU_SQL} ORDER BY f.food_id`);
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

  // Moves this customer's unfinished orders forward by age (see AUTO_ADVANCE_ORDERS)
  private async advanceOrders(userId: number) {
    if (!AUTO_ADVANCE_ORDERS) return;
    const pool = this.pool();
    const age = 'TIMESTAMPDIFF(SECOND, o.order_date, NOW())';

    const target = `CASE WHEN ${age} >= 240 THEN 'Delivered' WHEN ${age} >= 120 THEN 'Out for delivery' WHEN ${age} >= 30 THEN 'Preparing' ELSE o.order_status END`;
    const rank = (x: string) => `FIELD(${x}, 'Pending', 'Preparing', 'Out for delivery', 'Delivered')`;
    await pool.execute(
      `UPDATE orders o JOIN customer c ON c.customer_id = o.customer_id
       SET o.order_status = ${target}
       WHERE c.user_id = ? AND o.order_status IN ('Pending', 'Preparing', 'Out for delivery')
         AND ${rank('o.order_status')} < ${rank(target)}`,
      [userId],
    );
    // Keep the delivery and payment rows in step with the order
    await pool.execute(
      `UPDATE delivery d
       JOIN orders o ON o.order_id = d.order_id
       JOIN customer c ON c.customer_id = o.customer_id
       SET d.delivery_status = o.order_status,
           d.delivery_date = IF(o.order_status = 'Delivered' AND d.delivery_date IS NULL, NOW(), d.delivery_date)
       WHERE c.user_id = ? AND o.order_status IN ('Preparing', 'Out for delivery', 'Delivered')
         AND d.delivery_status <> o.order_status`,
      [userId],
    );
    await pool.execute(
      `UPDATE payment p
       JOIN orders o ON o.order_id = p.order_id
       JOIN customer c ON c.customer_id = o.customer_id
       SET p.payment_status = 'Paid'
       WHERE c.user_id = ? AND o.order_status = 'Delivered' AND p.payment_status <> 'Paid'`,
      [userId],
    );
  }

  async getMyOrders(userId: number) {
    await this.advanceOrders(userId);
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      `${MY_ORDERS_SQL} ORDER BY o.order_date DESC, o.order_id DESC`,
      [userId],
    );
    return rows;
  }

  async getMyOrder(userId: number, orderId: number) {
    await this.advanceOrders(userId);
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

  /* ---------- Menu editing: POST / PUT / DELETE ---------- */

  private async assertCanEdit(userId: number) {
    if (!ONLY_ADMINS_CAN_EDIT_MENU) return;
    const [rows] = await this.pool().execute<RowDataPacket[]>('SELECT user_role FROM usersx WHERE user_id = ?', [userId]);
    if (!rows[0] || String(rows[0].user_role).toLowerCase() !== 'admin') {
      throw new ForbiddenException('Only admins can change the menu.');
    }
  }

  private parseFood(body: FoodBody) {
    const name = String(body?.food_name ?? '').trim();
    const price = Number(body?.price);
    const categoryId = Number(body?.category_id);
    const restaurantId = Number(body?.restaurant_id);
    const raw = body?.availability;
    const available = raw === undefined ? true : raw === true || raw === 1 || raw === '1' || raw === 'true';

    if (!name) throw new BadRequestException('Food name is required.');
    if (name.length > 100) throw new BadRequestException('Food name must be 100 characters or fewer.');
    if (body?.price === undefined || body?.price === '' || !Number.isFinite(price) || price < 0) {
      throw new BadRequestException('Price must be a number of 0 or more.');
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) throw new BadRequestException('Pick a category.');
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) throw new BadRequestException('Pick a restaurant.');

    const image = String(body?.image_url ?? '').trim();
    if (image && !/^https?:\/\//i.test(image)) throw new BadRequestException('The photo link must start with http:// or https://.');
    if (image.length > 500) throw new BadRequestException('The photo link must be 500 characters or fewer.');

    return { name, price, categoryId, restaurantId, available, image: image || null };
  }

  private async findFood(foodId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(`${MENU_SQL} WHERE f.food_id = ?`, [foodId]);
    if (!rows[0]) throw new NotFoundException('Food item not found.');
    return rows[0];
  }

  async createFood(userId: number, body: FoodBody) {
    await this.assertCanEdit(userId);
    const f = this.parseFood(body);
    try {
      const [result] = await this.pool().execute<ResultSetHeader>(
        'INSERT INTO food_item (restaurant_id, category_id, food_name, price, availability, image_url) VALUES (?, ?, ?, ?, ?, ?)',
        [f.restaurantId, f.categoryId, f.name, f.price, f.available ? 1 : 0, f.image],
      );
      return this.findFood(result.insertId);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      if (err?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Pick a valid category and restaurant.');
      throw err;
    }
  }

  async updateFood(userId: number, foodId: number, body: FoodBody) {
    await this.assertCanEdit(userId);
    const f = this.parseFood(body);
    try {
      const [result] = await this.pool().execute<ResultSetHeader>(
        'UPDATE food_item SET restaurant_id = ?, category_id = ?, food_name = ?, price = ?, availability = ?, image_url = ? WHERE food_id = ?',
        [f.restaurantId, f.categoryId, f.name, f.price, f.available ? 1 : 0, f.image, foodId],
      );
      if (result.affectedRows === 0) throw new NotFoundException('Food item not found.');
      return this.findFood(foodId);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      if (err?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Pick a valid category and restaurant.');
      throw err;
    }
  }

  async deleteFood(userId: number, foodId: number) {
    await this.assertCanEdit(userId);
    try {
      const [result] = await this.pool().execute<ResultSetHeader>('DELETE FROM food_item WHERE food_id = ?', [foodId]);
      if (result.affectedRows === 0) throw new NotFoundException('Food item not found.');
      return { message: 'Food item deleted.' };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      if (err?.code === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException("This item is part of past orders, so it can't be deleted. Mark it as sold out instead.");
      }
      throw err;
    }
  }

  /* ---------- Categories and restaurants (for the add/edit form) ---------- */

  async getCategories() {
    const [rows] = await this.pool().execute<RowDataPacket[]>('SELECT category_id, category_name FROM category ORDER BY category_name');
    return rows;
  }

  async addCategory(userId: number, body: { category_name?: string }) {
    await this.assertCanEdit(userId);
    const name = String(body?.category_name ?? '').trim();
    if (!name) throw new BadRequestException('Category name is required.');
    if (name.length > 50) throw new BadRequestException('Category name must be 50 characters or fewer.');
    const [result] = await this.pool().execute<ResultSetHeader>('INSERT INTO category (category_name) VALUES (?)', [name]);
    return { category_id: result.insertId, category_name: name };
  }

  async getRestaurants() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT restaurant_id, restaurant_name, address, phone FROM restaurant ORDER BY restaurant_name',
    );
    return rows;
  }

  async addRestaurant(userId: number, body: { restaurant_name?: string; address?: string; phone?: string }) {
    await this.assertCanEdit(userId);
    const name = String(body?.restaurant_name ?? '').trim();
    const address = String(body?.address ?? '').trim();
    const phone = String(body?.phone ?? '').trim();
    if (!name) throw new BadRequestException('Restaurant name is required.');
    if (name.length > 100) throw new BadRequestException('Restaurant name must be 100 characters or fewer.');
    if (address.length > 255) throw new BadRequestException('The address must be 255 characters or fewer.');
    if (phone.length > 20) throw new BadRequestException('The phone number must be 20 characters or fewer.');
    const [result] = await this.pool().execute<ResultSetHeader>(
      'INSERT INTO restaurant (restaurant_name, address, phone) VALUES (?, ?, ?)',
      [name, address || null, phone || null],
    );
    return { restaurant_id: result.insertId, restaurant_name: name };
  }

  /* ---------- Admin: manage every customer's orders ---------- */

  private async assertAdmin(userId: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>('SELECT user_role FROM usersx WHERE user_id = ?', [userId]);
    if (!rows[0] || String(rows[0].user_role).toLowerCase() !== 'admin') {
      throw new ForbiddenException('Only admins can do that.');
    }
  }

  async getAllOrders(userId: number) {
    await this.assertAdmin(userId);
    const [rows] = await this.pool().execute<RowDataPacket[]>(`${ALL_ORDERS_SQL} ORDER BY o.order_date DESC, o.order_id DESC`);
    return rows;
  }

  async getOrderAdmin(userId: number, orderId: number) {
    await this.assertAdmin(userId);
    const [rows] = await this.pool().execute<RowDataPacket[]>(`${ALL_ORDERS_SQL} WHERE o.order_id = ?`, [orderId]);
    if (!rows[0]) throw new NotFoundException('Order not found.');
    const [items] = await this.pool().execute<RowDataPacket[]>(
      `SELECT oi.food_id, f.food_name, oi.quantity, oi.subtotal
       FROM order_item oi JOIN food_item f ON f.food_id = oi.food_id
       WHERE oi.order_id = ?`,
      [orderId],
    );
    return { ...rows[0], items };
  }

  async setOrderStatus(userId: number, orderId: number, status: string) {
    await this.assertAdmin(userId);
    if (!ORDER_STATUSES.includes(status)) throw new BadRequestException('Pick a valid status.');

    // The delivery table has no 'Pending', so a new order is 'Preparing' there
    const deliveryStatus = status === 'Pending' ? 'Preparing' : status;

    const conn = await this.pool().getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<ResultSetHeader>('UPDATE orders SET order_status = ? WHERE order_id = ?', [status, orderId]);
      if (result.affectedRows === 0) throw new NotFoundException('Order not found.');
      await conn.query(
        "UPDATE delivery SET delivery_status = ?, delivery_date = IF(? = 'Delivered', NOW(), delivery_date) WHERE order_id = ?",
        [deliveryStatus, status, orderId],
      );
      if (status === 'Delivered') await conn.query("UPDATE payment SET payment_status = 'Paid' WHERE order_id = ?", [orderId]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [rows] = await this.pool().execute<RowDataPacket[]>(`${ALL_ORDERS_SQL} WHERE o.order_id = ?`, [orderId]);
    return rows[0];
  }
}