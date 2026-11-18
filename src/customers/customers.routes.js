// GET /customers/me  ->  the logged-in user's profile (account + customer details)
// PUT /customers/me  ->  save their name, phone and default delivery address
// Mount: app.use("/customers", require("./customers/customers.routes"));

const express = require("express");
const pool = require("../database/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const PROFILE_SQL = `
  SELECT u.user_id, u.username, u.email, u.user_role,
         c.customer_id, c.name, c.phone, c.address
  FROM usersx u
  LEFT JOIN customer c ON c.user_id = u.user_id
  WHERE u.user_id = ?`;

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server. Please try again." });
}

router.get("/me", async (req, res) => {
  try {
    const [rows] = await pool.query(PROFILE_SQL, [req.userId]);
    if (!rows[0]) return res.status(404).json({ message: "Account not found." });
    res.json(rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.put("/me", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const address = String(req.body?.address ?? "").trim();

  if (!name) return res.status(400).json({ message: "Enter your name so we know who the order is for." });
  if (name.length > 100) return res.status(400).json({ message: "Your name must be 100 characters or fewer." });
  if (phone.length > 20) return res.status(400).json({ message: "Your phone number must be 20 characters or fewer." });
  if (address.length > 255) return res.status(400).json({ message: "Your address must be 255 characters or fewer." });

  try {
    // customer.user_id is UNIQUE, so this creates the row the first time and updates it after
    await pool.query(
      `INSERT INTO customer (user_id, name, phone, address) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), address = VALUES(address)`,
      [req.userId, name, phone || null, address || null],
    );
    const [rows] = await pool.query(PROFILE_SQL, [req.userId]);
    res.json(rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;