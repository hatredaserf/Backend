
const express = require("express");
const pool = require("../database/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const DELIVERY_FEE = 49; // keep in sync with DELIVERY_FEE in the dashboard page
const PAYMENT_METHODS = ["Cash on delivery", "GCash", "Card"]; // keep in sync with PAYMENT_METHODS in the dashboard page

// Registration only creates a user, so make the customer row the first time they order
async function customerIdFor(conn, userId) {
  const [found] = await conn.query("SELECT customer_id FROM customer WHERE user_id = ?", [userId]);
  if (found[0]) return found[0].customer_id;

  const [users] = await conn.query("SELECT username FROM usersx WHERE user_id = ?", [userId]);
  if (!users[0]) throw Object.assign(new Error("We couldn't find your account. Please log in again."), { status: 401 });

  const [created] = await conn.query("INSERT INTO customer (user_id, name) VALUES (?, ?)", [userId, users[0].username]);
  return created.insertId;
}

router.post("/", async (req, res) => {
  const { items, payment_method, delivery_address } = req.body || {};
  const address = String(delivery_address ?? "").trim();

  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Your order has no items." });
  if (!address) return res.status(400).json({ message: "Add a delivery address so we know where to bring your order." });
  if (address.length > 255) return res.status(400).json({ message: "The delivery address is too long." });
  if (!PAYMENT_METHODS.includes(payment_method)) return res.status(400).json({ message: "Pick a valid payment method." });

  // Merge repeated items and check quantities
  const wanted = new Map();
  for (const it of items) {
    const id = Number(it?.food_id);
    const qty = Number(it?.quantity);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ message: "One of the items in your order is invalid." });
    }
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Prices come from the database, never from the browser
    const [foods] = await conn.query(
      "SELECT food_id, price FROM food_item WHERE availability = 1 AND food_id IN (?)",
      [[...wanted.keys()]],
    );
    if (foods.length !== wanted.size) {
      await conn.rollback();
      return res.status(400).json({ message: "Some items in your order are no longer available. Please review your cart." });
    }

    let subtotal = 0;
    const lines = foods.map((f) => {
      const lineTotal = Number(f.price) * wanted.get(f.food_id);
      subtotal += lineTotal;
      return { food_id: f.food_id, quantity: wanted.get(f.food_id), subtotal: lineTotal };
    });
    const total = subtotal + DELIVERY_FEE;

    const customerId = await customerIdFor(conn, req.userId);
    const [order] = await conn.query("INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)", [customerId, total]);
    const orderId = order.insertId;

    await conn.query("INSERT INTO order_item (order_id, food_id, quantity, subtotal) VALUES ?", [
      lines.map((l) => [orderId, l.food_id, l.quantity, l.subtotal]),
    ]);
    await conn.query("INSERT INTO payment (order_id, payment_method, payment_amount) VALUES (?, ?, ?)", [orderId, payment_method, total]);
    await conn.query("INSERT INTO delivery (order_id, delivery_address) VALUES (?, ?)", [orderId, address]);

    await conn.commit();
    res.status(201).json({ order_id: orderId, total_amount: total });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server. Please try again." });
  } finally {
    conn.release();
  }
});

/* ---------- READ my orders: GET /orders ---------- */

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

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`${MY_ORDERS_SQL} ORDER BY o.order_date DESC, o.order_id DESC`, [req.userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server. Please try again." });
  }
});

/* ---------- READ one of my orders: GET /orders/:id ---------- */

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid order id." });
  try {
    // Filtering by the logged-in user means nobody can open someone else's order
    const [rows] = await pool.query(`${MY_ORDERS_SQL} AND o.order_id = ?`, [req.userId, id]);
    if (!rows[0]) return res.status(404).json({ message: "Order not found." });
    const [items] = await pool.query(
      `SELECT oi.food_id, f.food_name, oi.quantity, oi.subtotal
       FROM order_item oi JOIN food_item f ON f.food_id = oi.food_id
       WHERE oi.order_id = ?`,
      [id],
    );
    res.json({ ...rows[0], items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server. Please try again." });
  }
});

module.exports = router;