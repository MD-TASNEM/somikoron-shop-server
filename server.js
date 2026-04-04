import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import SslCommerzPayment from "sslcommerz-lts";
import nodemailer from "nodemailer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "somikoron_shop";
const JWT_SECRET = process.env.JWT_SECRET || "somikoron_secret_key_123";

// Email Configuration
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_USER = process.env.EMAIL_USER || "your-email@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "your-app-password";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@somikoron.com";

// Email Transporter Setup
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Email Templates
const generateBuyerInvoiceEmail = (order, user) => {
  const items = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">৳${item.price}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">৳${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Confirmation - Somikoron Shop</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th { background: #f3f4f6; padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        .total-row { font-weight: bold; background: #f9fafb; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        .btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Order Confirmed!</h1>
          <p>Thank you for your purchase from Somikoron Shop</p>
        </div>

        <div class="content">
          <div class="order-info">
            <h2>Order Details</h2>
            <p><strong>Order ID:</strong> ${order._id}</p>
            <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p><strong>Payment Status:</strong> <span style="color: #10b981; font-weight: bold;">${order.paymentStatus.toUpperCase()}</span></p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod === "sslcommerz" ? "Online Payment" : "Cash on Delivery"}</p>
          </div>

          <div class="order-info">
            <h3>Shipping Information</h3>
            <p><strong>Name:</strong> ${order.shippingInfo.name}</p>
            <p><strong>Phone:</strong> ${order.shippingInfo.phone}</p>
            <p><strong>Address:</strong> ${order.shippingInfo.address}</p>
            <p><strong>Area:</strong> ${order.shippingInfo.area}</p>
          </div>

          <h3>Order Items</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Product</th>
                <th style="text-align: center;">Quantity</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items}
              <tr>
                <td colspan="3" style="padding: 12px; text-align: right;"><strong>Subtotal:</strong></td>
                <td style="padding: 12px; text-align: right;">৳${order.totalPrice}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 12px; text-align: right;"><strong>Shipping Fee:</strong></td>
                <td style="padding: 12px; text-align: right;">৳${order.shippingFee}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="padding: 12px; text-align: right;"><strong>Total Amount:</strong></td>
                <td style="padding: 12px; text-align: right; color: #10b981; font-size: 18px;">৳${order.finalTotal}</td>
              </tr>
            </tbody>
          </table>

          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/my-orders" class="btn">View My Orders</a>
          </div>

          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>© 2024 Somikoron Shop. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateAdminInvoiceEmail = (order, user) => {
  const items = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">৳${item.price}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">৳${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Order Received - Somikoron Shop Admin</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th { background: #f3f4f6; padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        .total-row { font-weight: bold; background: #f9fafb; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .urgent { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛍️ New Order Received!</h1>
          <p>A customer has placed a new order on Somikoron Shop</p>
        </div>

        <div class="content">
          <div class="urgent">
            <strong>🚨 Action Required:</strong> Please review and process this order as soon as possible.
          </div>

          <div class="order-info">
            <h2>Order Information</h2>
            <p><strong>Order ID:</strong> ${order._id}</p>
            <p><strong>Customer:</strong> ${user.name} (${user.email})</p>
            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p><strong>Payment Status:</strong> <span style="color: ${order.paymentStatus === "paid" ? "#10b981" : "#f59e0b"}; font-weight: bold;">${order.paymentStatus.toUpperCase()}</span></p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod === "sslcommerz" ? "Online Payment" : "Cash on Delivery"}</p>
            ${order.transactionId ? `<p><strong>Transaction ID:</strong> ${order.transactionId}</p>` : ""}
          </div>

          <div class="order-info">
            <h3>Customer Details</h3>
            <p><strong>Name:</strong> ${order.shippingInfo.name}</p>
            <p><strong>Phone:</strong> ${order.shippingInfo.phone}</p>
            <p><strong>Address:</strong> ${order.shippingInfo.address}</p>
            <p><strong>Area:</strong> ${order.shippingInfo.area}</p>
          </div>

          <h3>Order Summary</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Product</th>
                <th style="text-align: center;">Quantity</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items}
              <tr>
                <td colspan="3" style="padding: 12px; text-align: right;"><strong>Subtotal:</strong></td>
                <td style="padding: 12px; text-align: right;">৳${order.totalPrice}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 12px; text-align: right;"><strong>Shipping Fee:</strong></td>
                <td style="padding: 12px; text-align: right;">৳${order.shippingFee}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="padding: 12px; text-align: right;"><strong>Total Amount:</strong></td>
                <td style="padding: 12px; text-align: right; color: #10b981; font-size: 18px;">৳${order.finalTotal}</td>
              </tr>
            </tbody>
          </table>

          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/admin/orders" class="btn">Manage Order</a>
          </div>

          <div class="footer">
            <p>This is an automated notification from Somikoron Shop Admin System.</p>
            <p>© 2024 Somikoron Shop. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Email Service Functions
const sendInvoiceEmails = async (order, user) => {
  try {
    // Send email to buyer
    const buyerMailOptions = {
      from: `"Somikoron Shop" <${EMAIL_USER}>`,
      to: user.email,
      subject: `Order Confirmation - Somikoron Shop (Order #${order._id})`,
      html: generateBuyerInvoiceEmail(order, user),
    };

    // Send email to admin
    const adminMailOptions = {
      from: `"Somikoron Shop" <${EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: `New Order Received - Somikoron Shop (Order #${order._id})`,
      html: generateAdminInvoiceEmail(order, user),
    };

    // Send both emails
    const [buyerResult, adminResult] = await Promise.all([
      transporter.sendMail(buyerMailOptions),
      transporter.sendMail(adminMailOptions),
    ]);

    console.log(`Buyer email sent: ${buyerResult.messageId}`);
    console.log(`Admin email sent: ${adminResult.messageId}`);

    return {
      success: true,
      buyerEmailId: buyerResult.messageId,
      adminEmailId: adminResult.messageId,
    };
  } catch (error) {
    console.error("Error sending invoice emails:", error);
    return { success: false, error: error.message };
  }
};

// SSLCOMMERZ Configuration
const SSLCOMMERZ_STORE_ID = process.env.SSLCOMMERZ_STORE_ID;
const SSLCOMMERZ_STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD;
const SSLCOMMERZ_IS_LIVE = process.env.SSLCOMMERZ_IS_LIVE === "true";
const SSLCOMMERZ_SUCCESS_URL =
  process.env.SSLCOMMERZ_SUCCESS_URL || "http://localhost:3000/payment/success";
const SSLCOMMERZ_FAIL_URL =
  process.env.SSLCOMMERZ_FAIL_URL || "http://localhost:3000/payment/fail";
const SSLCOMMERZ_CANCEL_URL =
  process.env.SSLCOMMERZ_CANCEL_URL || "http://localhost:3000/payment/cancel";

let db;
let lastConnectionError = null;
let retryCount = 0;
const MAX_RETRIES = 5; // Increased retries

async function connectToDatabase() {
  const maskedUri = MONGODB_URI.replace(/\/\/.*:.*@/, "//***:***@");
  console.log(`Attempting to connect to MongoDB: ${maskedUri}`);

  if (MONGODB_URI === "mongodb://localhost:27017") {
    console.warn(
      "WARNING: Using default MONGODB_URI (localhost). If you are using MongoDB Atlas, please set MONGODB_URI in settings.",
    );
  } else if (
    MONGODB_URI.includes("mongodb.net") &&
    !MONGODB_URI.includes("retryWrites=true")
  ) {
    console.warn(
      'WARNING: Your Atlas MONGODB_URI might be missing "retryWrites=true&w=majority". This can cause transient connection issues.',
    );
  }

  if (
    MONGODB_URI.startsWith("mongodb+srv://") &&
    MONGODB_URI.includes(":") &&
    MONGODB_URI.split("@")[0].split(":").length > 2
  ) {
    // This is a rough check for port in SRV URI
    console.warn(
      'WARNING: Your MONGODB_URI starts with "mongodb+srv://" but seems to include a port. SRV URIs should not have ports.',
    );
  }

  try {
    const options = {
      connectTimeoutMS: 30000,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      heartbeatFrequencyMS: 10000,
      tls: true,
      tlsAllowInvalidCertificates: true,
      maxPoolSize: 10,
      minPoolSize: 1,
      retryReads: true,
      retryWrites: true,
      serverApi: {
        version: "1",
        strict: true,
        deprecationErrors: true,
      },
    };

    // Only force IPv4 if it's not an SRV connection (Atlas usually uses SRV)
    if (!MONGODB_URI.startsWith("mongodb+srv://")) {
      options.family = 4;
    }

    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    db = client.db(MONGODB_DB);
    lastConnectionError = null;
    retryCount = 0;
    console.log("Connected to MongoDB");

    // Seed admin if not exists
    const adminExists = await db.collection("users").findOne({ role: "admin" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await db.collection("users").insertOne({
        name: "Admin User",
        email: "admin@somikoron.com",
        password: hashedPassword,
        role: "admin",
        createdAt: new Date(),
      });
      console.log("Default admin created: admin@somikoron.com / admin123");
    }
  } catch (error) {
    lastConnectionError = error.message;
    console.error("MongoDB connection error:", error);

    if (
      error.message.includes("SSL alert number 80") ||
      error.message.includes("tlsv1 alert internal error")
    ) {
      console.error(
        "CRITICAL: This SSL error often means your IP address is not whitelisted in MongoDB Atlas.",
      );
      console.error(
        'Please go to MongoDB Atlas -> Network Access and add "0.0.0.0/0" (for testing) or your specific IP.',
      );
    }

    // Check for retryable errors
    const labels = error.errorLabels || [];
    const isRetryable =
      labels.includes("RetryableError") ||
      labels.includes("SystemOverloadedError") ||
      error.message.includes("SystemOverloadedError") ||
      error.message.includes("ResetPool") ||
      error.message.includes("ECONNRESET");

    if (isRetryable && retryCount < MAX_RETRIES) {
      retryCount++;
      const delay = Math.min(10000 * retryCount, 30000); // Exponential backoff capped at 30s
      console.warn(
        `MongoDB: Retryable error detected. Attempt ${retryCount}/${MAX_RETRIES}. Retrying in ${delay / 1000}s...`,
      );
      setTimeout(connectToDatabase, delay);
    }
  }
}

// Middleware to check if DB is connected
const checkDB = (req, res, next) => {
  if (!db) {
    let message =
      "Database connection not established. Please check your MONGODB_URI in settings.";
    if (lastConnectionError?.includes("SSL alert number 80")) {
      message =
        "MongoDB SSL Handshake failed. This usually means your IP is not whitelisted in MongoDB Atlas. Please add 0.0.0.0/0 to your Atlas Network Access.";
    }
    return res.status(503).json({
      message,
      error: "DB_NOT_CONNECTED",
      details: lastConnectionError,
    });
  }
  next();
};

// Middleware
const authenticate = async (req, res, next) => {
  if (!db) return res.status(503).json({ message: "Database not connected" });
  const token = req.headers.authorization?.split(" ")[1];

  // For development, if no token provided, create a mock admin user
  if (!token) {
    req.user = {
      _id: "admin_user",
      email: "admin@somikoron.com",
      role: "admin",
      name: "Admin User",
    };
    return next();
  }

  try {
    // First try JWT verification
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(decoded.id) });
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch (error) {
    // If JWT verification fails, try to handle Firebase token format
    if (token.length > 100) {
      // Likely a Firebase token
      req.user = {
        _id: "admin_user",
        email: "admin@somikoron.com",
        role: "admin",
        name: "Admin User",
      };
      return next();
    }
    // For development, if JWT fails but token exists, create a mock admin user
    console.error("JWT verification failed:", error.message);
    req.user = {
      _id: "admin_user",
      email: "admin@somikoron.com",
      role: "admin",
      name: "Admin User",
    };
    next();
  }
};

const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });
  next();
};

async function startServer() {
  console.log(`Node version: ${process.version}`);
  console.log(`OpenSSL version: ${process.versions.openssl}`);

  // Start DB connection in background
  connectToDatabase();

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Setup Morgan for standard logging
  app.use(
    morgan(":method :url :status :res[content-length] - :response-time ms"),
  );

  // Detailed Request/Response Logging Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const { method, url, body, query } = req;

    // Log request details
    console.log(`>>> [REQUEST] ${method} ${url}`);
    if (Object.keys(query).length > 0)
      console.log("    Query:", JSON.stringify(query));

    // Safely log body (exclude sensitive fields)
    if (method !== "GET" && Object.keys(body).length > 0) {
      const safeBody = { ...body };
      if (safeBody.password) safeBody.password = "********";
      if (safeBody.token) safeBody.token = "********";
      console.log("    Body:", JSON.stringify(safeBody));
    }

    // Capture response finish to log status and duration
    res.on("finish", () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const logColor =
        status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";
      const resetColor = "\x1b[0m";

      console.log(
        `<<< [RESPONSE] ${method} ${url} ${logColor}${status}${resetColor} (${duration}ms)`,
      );
    });

    next();
  });

  // API Router
  const apiRouter = express.Router();

  // --- Email Test Endpoint ---
  apiRouter.get("/test-email", async (req, res) => {
    try {
      // Test email configuration
      await transporter.verify();

      // Create test order and user data
      const testOrder = {
        _id: "TEST-123",
        items: [{ name: "Test Product", quantity: 2, price: 500 }],
        totalPrice: 500,
        shippingFee: 60,
        finalTotal: 560,
        shippingInfo: {
          name: "Test Customer",
          phone: "01234567890",
          address: "123 Test Street",
          area: "Test Area",
        },
        paymentMethod: "sslcommerz",
        paymentStatus: "paid",
        createdAt: new Date(),
        transactionId: "TEST-TRANSACTION-123",
      };

      const testUser = {
        name: "Test Customer",
        email: EMAIL_USER, // Send test to the configured email
      };

      // Send test emails
      const emailResult = await sendInvoiceEmails(testOrder, testUser);

      res.json({
        success: true,
        message: "Test emails sent successfully",
        emailResult,
        testEmail: EMAIL_USER,
      });
    } catch (error) {
      console.error("Email test error:", error);
      res.status(500).json({
        success: false,
        message: "Email test failed",
        error: error.message,
      });
    }
  });

  // --- Debug route (no DB check) ---
  apiRouter.get("/debug", (req, res) => {
    res.json({ status: "ok", message: "API is working", dbConnected: !!db });
  });

  // DB check middleware
  apiRouter.use(checkDB);

  // --- Auth API ---
  apiRouter.post("/auth/register", async (req, res) => {
    const { name, email, password, photoURL } = req.body;
    const existing = await db.collection("users").findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection("users").insertOne({
      name,
      email,
      password: hashedPassword,
      photoURL,
      role: "user",
      createdAt: new Date(),
    });
    const token = jwt.sign({ id: result.insertedId }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      token,
      user: { id: result.insertedId, name, email, photoURL, role: "user" },
    });
  });

  apiRouter.post("/auth/google", async (req, res) => {
    const { uid, email, name, photoURL } = req.body;
    let user = await db.collection("users").findOne({ email });

    if (!user) {
      const result = await db.collection("users").insertOne({
        name,
        email,
        photoURL,
        googleId: uid,
        role: "user",
        createdAt: new Date(),
      });
      user = { _id: result.insertedId, name, email, photoURL, role: "user" };
    } else {
      // Update user with googleId if not present
      if (!user.googleId) {
        await db
          .collection("users")
          .updateOne(
            { _id: user._id },
            { $set: { googleId: uid, photoURL: photoURL || user.photoURL } },
          );
      }
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
      },
    });
  });

  apiRouter.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await db.collection("users").findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  });

  apiRouter.get("/auth/me", authenticate, (req, res) => {
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    });
  });

  // --- Products API ---
  apiRouter.get("/products", async (req, res) => {
    const { category, search } = req.query;
    const query = {};
    if (category && category !== "all") query.category = category;
    if (search) query.name = { $regex: search, $options: "i" };
    const products = await db.collection("products").find(query).toArray();
    res.json(products);
  });

  apiRouter.get("/products/:id", async (req, res) => {
    try {
      const product = await db
        .collection("products")
        .findOne({ _id: new ObjectId(req.params.id) });
      if (!product)
        return res.status(404).json({ message: "Product not found" });
      res.json(product);
    } catch (e) {
      res.status(400).json({ message: "Invalid product ID" });
    }
  });

  apiRouter.post("/products", authenticate, isAdmin, async (req, res) => {
    const result = await db
      .collection("products")
      .insertOne({ ...req.body, createdAt: new Date() });
    res.json({ _id: result.insertedId, ...req.body });
  });

  apiRouter.put("/products/:id", authenticate, isAdmin, async (req, res) => {
    await db
      .collection("products")
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
    res.json({ message: "Updated" });
  });

  apiRouter.delete("/products/:id", authenticate, isAdmin, async (req, res) => {
    await db
      .collection("products")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Deleted" });
  });

  // --- SSLCOMMERZ Test Endpoint ---
  apiRouter.get("/payment/test", async (req, res) => {
    try {
      // Check if SSLCOMMERZ is properly configured
      const isConfigured = !!SSLCOMMERZ_STORE_ID && !!SSLCOMMERZ_STORE_PASSWORD;

      if (!isConfigured) {
        return res.status(500).json({
          success: false,
          message: "SSLCOMMERZ not configured",
          config: {
            storeId: !!SSLCOMMERZ_STORE_ID,
            storePassword: !!SSLCOMMERZ_STORE_PASSWORD,
            isLive: SSLCOMMERZ_IS_LIVE,
          },
        });
      }

      const sslcz = new SslCommerzPayment(
        SSLCOMMERZ_STORE_ID,
        SSLCOMMERZ_STORE_PASSWORD,
        !SSLCOMMERZ_IS_LIVE,
      );

      // Test basic connectivity
      const testData = {
        total_amount: 10,
        currency: "BDT",
        tran_id: `TEST-${Date.now()}`,
        success_url: `${req.protocol}://${req.get("host")}/api/payment/test-success`,
        fail_url: `${req.protocol}://${req.get("host")}/api/payment/test-fail`,
        cancel_url: `${req.protocol}://${req.get("host")}/api/payment/test-cancel`,
        product_name: "Test Product",
        product_category: "test",
        product_profile: "general",
        cus_name: "Test Customer",
        cus_email: "test@example.com",
        cus_phone: "01234567890",
        cus_add1: "Test Address",
        cus_city: "Test City",
        cus_country: "Bangladesh",
      };

      const testSession = await sslcz.initiateTransaction(testData);

      res.json({
        success: true,
        message: "SSLCOMMERZ initialized successfully",
        config: {
          storeId: SSLCOMMERZ_STORE_ID,
          isLive: SSLCOMMERZ_IS_LIVE,
          successUrl: SSLCOMMERZ_SUCCESS_URL,
          failUrl: SSLCOMMERZ_FAIL_URL,
          cancelUrl: SSLCOMMERZ_CANCEL_URL,
        },
        testSession: {
          hasGatewayUrl: !!(
            testSession?.gatewayURL?.page || testSession?.GatewayPageURL
          ),
          hasTranId: !!(
            testSession?.tran_id || testSession?.gatewayURL?.tran_id
          ),
        },
      });
    } catch (error) {
      console.error("SSLCOMMERZ test error:", error);
      res.status(500).json({
        success: false,
        message: "SSLCOMMERZ test failed",
        error: error.message,
        config: {
          storeId: !!SSLCOMMERZ_STORE_ID,
          storePassword: !!SSLCOMMERZ_STORE_PASSWORD,
          isLive: SSLCOMMERZ_IS_LIVE,
        },
      });
    }
  });

  // --- Payment Configuration Checker ---
  apiRouter.get("/payment/config", (req, res) => {
    res.json({
      sslcommerz: {
        configured: !!(SSLCOMMERZ_STORE_ID && SSLCOMMERZ_STORE_PASSWORD),
        storeId: SSLCOMMERZ_STORE_ID ? "CONFIGURED" : "NOT_SET",
        storePassword: SSLCOMMERZ_STORE_PASSWORD ? "CONFIGURED" : "NOT_SET",
        isLive: SSLCOMMERZ_IS_LIVE,
        environment: SSLCOMMERZ_IS_LIVE ? "LIVE" : "SANDBOX",
      },
      urls: {
        success: SSLCOMMERZ_SUCCESS_URL,
        fail: SSLCOMMERZ_FAIL_URL,
        cancel: SSLCOMMERZ_CANCEL_URL,
      },
      server: {
        protocol: req.protocol,
        host: req.get("host"),
        baseUrl: `${req.protocol}://${req.get("host")}`,
      },
    });
  });

  // --- Orders API ---
  apiRouter.post("/orders", authenticate, async (req, res) => {
    const { items, totalPrice, shippingFee, finalTotal, formData } = req.body;

    try {
      // Validate required fields
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Cart items are required" });
      }

      if (!formData || !formData.name || !formData.phone || !formData.address) {
        return res
          .status(400)
          .json({ message: "Shipping information is required" });
      }

      // Create order with pending status
      const orderData = {
        userId: req.user._id,
        items,
        totalPrice,
        shippingFee,
        finalTotal,
        shippingInfo: {
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          area: formData.area,
        },
        paymentMethod: formData.paymentMethod,
        paymentStatus:
          formData.paymentMethod === "cod" ? "pending" : "pending_payment",
        status:
          formData.paymentMethod === "cod" ? "pending" : "pending_payment",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection("orders").insertOne(orderData);
      const orderId = result.insertedId.toString();

      // Return the created order with success flag
      const createdOrder = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(orderId) });

      if (formData.paymentMethod === "sslcommerz") {
        // Create SSLCommerz payment session
        const sslcz = new SslCommerzPayment(
          SSLCOMMERZ_STORE_ID,
          SSLCOMMERZ_STORE_PASSWORD,
          !SSLCOMMERZ_IS_LIVE,
        );

        // Prepare payment data for SSLCommerz
        const transactionId = `SOM-${orderId}-${Date.now()}`;
        const paymentData = {
          total_amount: finalTotal,
          currency: "BDT",
          tran_id: transactionId,
          success_url: `${req.protocol}://${req.get("host")}/api/payment/success?order_id=${orderId}`,
          fail_url: `${req.protocol}://${req.get("host")}/api/payment/fail?order_id=${orderId}`,
          cancel_url: `${req.protocol}://${req.get("host")}/api/payment/cancel?order_id=${orderId}`,
          ipn_url: `${req.protocol}://${req.get("host")}/api/payment/ipn`,
          multi_card_name: formData.paymentGateway || "bkash", // Selected gateway
          product_name: "Somikoron Shop Order",
          product_category: "ecommerce",
          product_profile: "general",
          cus_name: formData.name,
          cus_email: req.user.email,
          cus_phone: formData.phone,
          cus_add1: formData.address,
          cus_city: formData.area || "N/A",
          cus_country: "Bangladesh",
          shipping_method: "YES",
          num_of_item: items.length,
          product_names: items.map((item) => item.name).join(", "),
          product_categories: items.map(() => "general").join(", "),
          value_a: orderId,
          value_b: req.user.email, // Store user email for backup
          value_c: req.user.name, // Store user name for backup
        };

        try {
          console.log("Creating SSLCommerz payment session...");
          console.log("Payment data:", JSON.stringify(paymentData, null, 2));

          const paymentSession = await sslcz.initiateTransaction(paymentData);
          console.log(
            "SSLCommerz response:",
            JSON.stringify(paymentSession, null, 2),
          );

          // Check for different response formats
          const gatewayUrl =
            paymentSession?.gatewayURL?.page ||
            paymentSession?.gatewayUrl?.page ||
            paymentSession?.GatewayPageURL ||
            paymentSession?.redirectGatewayURL;

          const tranId =
            paymentSession?.gatewayURL?.tran_id ||
            paymentSession?.tran_id ||
            transactionId;

          if (gatewayUrl) {
            // Update order with payment session info
            await db.collection("orders").updateOne(
              { _id: new ObjectId(orderId) },
              {
                $set: {
                  transactionId: tranId,
                  paymentGatewayUrl: gatewayUrl,
                  paymentStatus: "pending_payment",
                  status: "pending_payment",
                  paymentDetails: {
                    sessionKey: paymentSession.sessionkey,
                    gatewayUrl: gatewayUrl,
                    paymentMethod: formData.paymentGateway || "bkash",
                    sslczResponse: paymentSession,
                  },
                  updatedAt: new Date(),
                },
              },
            );

            console.log(
              `Payment session created successfully for order ${orderId}`,
            );
            return res.json({
              ...createdOrder,
              success: true,
              orderId,
              paymentUrl: gatewayUrl,
              transactionId: tranId,
              message: "Payment session created successfully",
            });
          } else {
            console.error(
              "No gateway URL in SSLCommerz response:",
              paymentSession,
            );
            throw new Error(
              "Invalid payment gateway response - no redirect URL provided",
            );
          }
        } catch (error) {
          console.error("SSLCommerz payment error:", error);
          console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            orderId,
            storeId: SSLCOMMERZ_STORE_ID,
            isLive: SSLCOMMERZ_IS_LIVE,
          });
          return res.status(500).json({
            success: false,
            message: "Payment gateway error. Please try again.",
            error: error.message,
            debug: {
              orderId,
              storeConfigured: !!SSLCOMMERZ_STORE_ID,
              passwordConfigured: !!SSLCOMMERZ_STORE_PASSWORD,
              isLive: SSLCOMMERZ_IS_LIVE,
            },
          });
        }
      } else if (formData.paymentMethod === "cod") {
        // Cash on delivery - order is placed successfully
        // Send invoice emails for COD orders
        const order = await db
          .collection("orders")
          .findOne({ _id: new ObjectId(orderId) });
        if (order) {
          await sendInvoiceEmails(order, req.user);
        }

        return res.json({
          ...createdOrder,
          success: true,
          orderId,
          message: "Order placed successfully",
        });
      }
    } catch (error) {
      console.error("Order creation error:", error);
      return res.status(500).json({
        message: "Failed to create order. Please try again.",
        error: error.message,
      });
    }
  });

  apiRouter.get("/orders/my-orders", authenticate, async (req, res) => {
    const orders = await db
      .collection("orders")
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  });

  // --- Payment API ---
  apiRouter.post("/payment/validate", async (req, res) => {
    const { order_id, tran_id, amount } = req.body;

    try {
      const sslcz = new SslCommerzPayment(
        SSLCOMMERZ_STORE_ID,
        SSLCOMMERZ_STORE_PASSWORD,
        !SSLCOMMERZ_IS_LIVE,
      );
      const validation = await sslcz.validate(tran_id, amount);

      if (validation?.status === "VALIDATED") {
        // Update order status to paid
        await db.collection("orders").updateOne(
          { _id: new ObjectId(order_id) },
          {
            $set: {
              paymentStatus: "paid",
              status: "pending",
              paymentDetails: validation,
              updatedAt: new Date(),
            },
          },
        );

        return res.json({
          success: true,
          message: "Payment validated successfully",
          validation,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Payment validation failed",
          validation,
        });
      }
    } catch (error) {
      console.error("Payment validation error:", error);
      return res.status(500).json({
        success: false,
        message: "Payment validation error",
        error: error.message,
      });
    }
  });

  // SSLCOMMERZ IPN (Instant Payment Notification) Handler
  apiRouter.post("/payment/ipn", async (req, res) => {
    try {
      console.log("IPN received:", JSON.stringify(req.body, null, 2));

      const {
        tran_id,
        status,
        value_a,
        amount,
        currency,
        card_type,
        store_amount,
        bank_tran_id,
        error,
      } = req.body;

      if (!tran_id || !value_a) {
        console.error("Invalid IPN data - missing tran_id or value_a");
        return res.status(400).json({ message: "Invalid IPN data" });
      }

      const orderId = value_a;
      console.log(
        `Processing IPN for order ${orderId}, transaction ${tran_id}, status ${status}`,
      );

      // First check if order exists
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(orderId) });
      if (!order) {
        console.error(`Order not found in IPN: ${orderId}`);
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if payment is already processed
      if (order.paymentStatus === "paid" && status === "VALID") {
        console.log(`Order ${orderId} already paid, IPN is duplicate`);
        return res.status(200).send("IPN processed successfully (duplicate)");
      }

      if (status === "VALID" || status === "VALIDATED") {
        // Payment successful
        console.log(`Payment successful for order ${orderId}, updating status`);
        const updateResult = await db.collection("orders").updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              paymentStatus: "paid",
              status: "pending",
              paymentDetails: {
                tran_id,
                status,
                amount,
                currency,
                card_type,
                store_amount,
                bank_tran_id,
                ipn_received: true,
                ipn_timestamp: new Date(),
                ipn_status: status,
                validation_method: "ipn",
              },
              updatedAt: new Date(),
            },
          },
        );

        console.log(
          `Order ${orderId} updated successfully, modified count: ${updateResult.modifiedCount}`,
        );

        if (updateResult.modifiedCount > 0) {
          // Get user details for email
          const user = await db
            .collection("users")
            .findOne({ _id: order.userId });

          if (order && user) {
            // Send invoice emails
            try {
              await sendInvoiceEmails(order, user);
              console.log(`Invoice emails sent for order ${orderId} via IPN`);
            } catch (emailError) {
              console.error(
                `Failed to send emails for order ${orderId} via IPN:`,
                emailError,
              );
            }
          }
        }

        console.log(`Payment successful for order ${orderId}: ${tran_id}`);
      } else {
        // Payment failed
        console.log(
          `Payment failed for order ${orderId}: ${tran_id} - ${status}`,
        );
        const updateResult = await db.collection("orders").updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              paymentStatus: "failed",
              status: "payment_failed",
              paymentDetails: {
                tran_id,
                status,
                amount,
                currency,
                error,
                ipn_received: true,
                ipn_timestamp: new Date(),
                ipn_status: status,
                validation_method: "ipn",
              },
              updatedAt: new Date(),
            },
          },
        );
        console.log(
          `Order ${orderId} marked as failed, modified count: ${updateResult.modifiedCount}`,
        );
      }

      res.status(200).send("IPN received successfully");
    } catch (error) {
      console.error("IPN handling error:", error);
      console.error("IPN error stack:", error.stack);
      res.status(500).send("IPN processing failed");
    }
  });

  // Mock payment page with payment options (FIXED - removed duplicate content)
  apiRouter.get("/payment/mock", async (req, res) => {
    const { order_id, amount } = req.query;

    if (!order_id || !amount) {
      return res.status(400).send("Invalid payment request");
    }

    // Send simple HTML response
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Mock Payment Gateway</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .payment-method { border: 2px solid #ddd; margin: 10px 0; padding: 20px; border-radius: 8px; cursor: pointer; }
        .payment-method:hover { border-color: #007bff; }
        .payment-method h3 { margin: 0 0 10px 0; color: #333; }
        .payment-method p { margin: 5px 0; color: #666; }
        .btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 10px 5px; }
        .btn:hover { background: #0056b3; }
        .btn.cancel { background: #6c757d; }
        .btn.cancel:hover { background: #545b62; }
    </style>
</head>
<body>
    <h2>Mock Payment Gateway</h2>
    <p><strong>Order ID:</strong> ${order_id}</p>
    <p><strong>Amount:</strong> ৳${amount}</p>

    <div class="payment-method">
        <h3>💳 Credit/Debit Card</h3>
        <p>Visa, Mastercard, AMEX</p>
        <button class="btn" onclick="processPayment('card')">Pay with Card</button>
    </div>

    <div class="payment-method">
        <h3>📱 bKash</h3>
        <p>Mobile Banking</p>
        <button class="btn" onclick="processPayment('bkash')">Pay with bKash</button>
    </div>

    <div class="payment-method">
        <h3>📱 Nagad</h3>
        <p>Mobile Banking</p>
        <button class="btn" onclick="processPayment('nagad')">Pay with Nagad</button>
    </div>

    <div class="payment-method">
        <h3>🚀 Rocket</h3>
        <p>Mobile Banking</p>
        <button class="btn" onclick="processPayment('rocket')">Pay with Rocket</button>
    </div>

    <button class="btn cancel" onclick="window.location.href='/payment/cancel?order_id=${order_id}'">Cancel Payment</button>

    <script>
        function processPayment(method) {
            setTimeout(function() {
                window.location.href = '/payment/success?order_id=${order_id}&tran_id=SOM-${order_id}-' + Date.now() + '&method=' + method + '&status=success';
            }, 1500);
        }
    </script>
</body>
</html>`;

    res.send(html);
  });

  // Payment success handler (for redirect after payment)
  apiRouter.get("/payment/success", async (req, res) => {
    const { order_id, tran_id, amount, status } = req.query;

    try {
      console.log(
        `Payment success callback received: order_id=${order_id}, tran_id=${tran_id}, amount=${amount}, status=${status}`,
      );

      if (!order_id || !tran_id) {
        console.error("Missing payment information in success callback");
        return res.redirect(
          "/payment/fail?message=Missing payment information",
        );
      }

      // First check if order exists
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(order_id) });
      if (!order) {
        console.error(`Order not found: ${order_id}`);
        return res.redirect(
          "/payment/fail?order_id=${order_id}&message=Order not found",
        );
      }

      // Check if payment is already processed
      if (order.paymentStatus === "paid") {
        console.log(`Order ${order_id} already paid, redirecting to success`);
        return res.redirect(
          `/payment-success?order_id=${order_id}&tran_id=${tran_id}`,
        );
      }

      // Validate payment with SSLCommerz
      const sslcz = new SslCommerzPayment(
        SSLCOMMERZ_STORE_ID,
        SSLCOMMERZ_STORE_PASSWORD,
        !SSLCOMMERZ_IS_LIVE,
      );

      console.log(
        `Validating payment: tran_id=${tran_id}, amount=${amount || order.finalTotal}`,
      );
      const validation = await sslcz.validate(
        tran_id,
        amount || order.finalTotal,
      );
      console.log(
        "Payment validation result:",
        JSON.stringify(validation, null, 2),
      );

      if (
        validation?.status === "VALIDATED" ||
        validation?.status === "VALID"
      ) {
        // Update order status
        const updateResult = await db.collection("orders").updateOne(
          { _id: new ObjectId(order_id) },
          {
            $set: {
              paymentStatus: "paid",
              status: "pending",
              paymentDetails: {
                ...validation,
                validatedAt: new Date(),
                callbackReceived: true,
              },
              updatedAt: new Date(),
            },
          },
        );

        console.log(
          `Order ${order_id} payment validated, modified count: ${updateResult.modifiedCount}`,
        );

        if (updateResult.modifiedCount > 0) {
          // Get user details for email
          const user = await db
            .collection("users")
            .findOne({ _id: order.userId });

          if (order && user) {
            // Send invoice emails
            try {
              await sendInvoiceEmails(order, user);
              console.log(`Invoice emails sent for order ${order_id}`);
            } catch (emailError) {
              console.error(
                `Failed to send emails for order ${order_id}:`,
                emailError,
              );
            }
          }
        }

        // Redirect to success page with order info
        return res.redirect(
          `/payment-success?order_id=${order_id}&tran_id=${tran_id}`,
        );
      } else {
        console.error(
          `Payment validation failed for order ${order_id}:`,
          validation,
        );
        return res.redirect(
          `/payment/fail?order_id=${order_id}&message=Payment validation failed`,
        );
      }
    } catch (error) {
      console.error("Payment success handling error:", error);
      console.error("Error stack:", error.stack);
      return res.redirect(
        `/payment/fail?order_id=${order_id || "unknown"}&message=Payment processing error`,
      );
    }
  });

  // Payment fail handler (for redirect after failed payment)
  apiRouter.get("/payment/fail", async (req, res) => {
    const { order_id, message, status } = req.query;

    console.log(
      `Payment fail callback received: order_id=${order_id}, message=${message}, status=${status}`,
    );

    if (order_id) {
      try {
        // Update order status to failed
        const updateResult = await db.collection("orders").updateOne(
          { _id: new ObjectId(order_id) },
          {
            $set: {
              paymentStatus: "failed",
              status: "payment_failed",
              paymentDetails: {
                failureReason: message || "Payment failed",
                failureStatus: status,
                callbackReceived: true,
                failedAt: new Date(),
              },
              updatedAt: new Date(),
            },
          },
        );
        console.log(
          `Order ${order_id} marked as failed, modified count: ${updateResult.modifiedCount}`,
        );
      } catch (error) {
        console.error(`Error updating order ${order_id} as failed:`, error);
      }
    }

    // Redirect to frontend fail page
    const failMessage = message || "Payment failed";
    res.redirect(
      `/payment-fail?order_id=${order_id || ""}&message=${encodeURIComponent(failMessage)}`,
    );
  });

  // Payment cancel handler (for redirect after cancelled payment)
  apiRouter.get("/payment/cancel", async (req, res) => {
    const { order_id } = req.query;

    console.log(`Payment cancel callback received: order_id=${order_id}`);

    if (order_id) {
      try {
        // Update order status to cancelled
        const updateResult = await db.collection("orders").updateOne(
          { _id: new ObjectId(order_id) },
          {
            $set: {
              paymentStatus: "cancelled",
              status: "cancelled",
              paymentDetails: {
                cancelledAt: new Date(),
                callbackReceived: true,
              },
              updatedAt: new Date(),
            },
          },
        );
        console.log(
          `Order ${order_id} marked as cancelled, modified count: ${updateResult.modifiedCount}`,
        );
      } catch (error) {
        console.error(`Error updating order ${order_id} as cancelled:`, error);
      }
    }

    // Redirect to frontend cancel page
    res.redirect(`/payment-cancel?order_id=${order_id || ""}`);
  });

  apiRouter.get("/orders/:id", authenticate, async (req, res) => {
    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (
      req.user.role !== "admin" &&
      order.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(order);
  });

  // --- Admin API ---
  apiRouter.get("/admin/stats", authenticate, isAdmin, async (req, res) => {
    const totalOrders = await db.collection("orders").countDocuments();
    const totalProducts = await db.collection("products").countDocuments();
    const totalUsers = await db.collection("users").countDocuments();
    const recentOrders = await db
      .collection("orders")
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    const revenue = await db
      .collection("orders")
      .aggregate([{ $group: { _id: null, total: { $sum: "$finalTotal" } } }])
      .toArray();

    res.json({
      totalOrders,
      totalProducts,
      totalUsers,
      recentOrders,
      totalRevenue: revenue[0]?.total || 0,
    });
  });

  apiRouter.get("/admin/orders", authenticate, isAdmin, async (req, res) => {
    const orders = await db
      .collection("orders")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  });

  apiRouter.patch(
    "/admin/orders/:id/status",
    authenticate,
    isAdmin,
    async (req, res) => {
      await db
        .collection("orders")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: req.body.status } },
        );
      res.json({ message: "Status updated" });
    },
  );

  apiRouter.get("/debug", (req, res) => {
    res.json({
      dbConnected: !!db,
      lastError: lastConnectionError,
      nodeVersion: process.version,
      opensslVersion: process.versions.openssl,
      env: process.env.NODE_ENV,
      uri: MONGODB_URI.replace(/\/\/.*:.*@/, "//***:***@"),
    });
  });

  apiRouter.get("/admin/users", authenticate, isAdmin, async (req, res) => {
    const users = await db.collection("users").find().toArray();
    res.json(users);
  });

  // --- Offers API ---
  apiRouter.get("/admin/offers", authenticate, isAdmin, async (req, res) => {
    const offers = await db
      .collection("offers")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(offers);
  });

  apiRouter.get(
    "/admin/offers/:id",
    authenticate,
    isAdmin,
    async (req, res) => {
      try {
        const offer = await db
          .collection("offers")
          .findOne({ _id: new ObjectId(req.params.id) });
        if (!offer) return res.status(404).json({ message: "Offer not found" });
        res.json(offer);
      } catch (e) {
        res.status(400).json({ message: "Invalid offer ID" });
      }
    },
  );

  apiRouter.post("/admin/offers", authenticate, isAdmin, async (req, res) => {
    const {
      title,
      description,
      discount,
      code,
      image,
      color,
      startDate,
      endDate,
      isActive,
      minOrderAmount,
      maxDiscount,
      applicableProducts,
      applicableCategories,
    } = req.body;

    const offer = {
      title,
      description,
      discount,
      code: code.toUpperCase(),
      image,
      color,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive !== undefined ? isActive : true,
      minOrderAmount: minOrderAmount || 0,
      maxDiscount: maxDiscount || null,
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      usageCount: 0,
      maxUsage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("offers").insertOne(offer);
    res.json({ _id: result.insertedId, ...offer });
  });

  apiRouter.put(
    "/admin/offers/:id",
    authenticate,
    isAdmin,
    async (req, res) => {
      const {
        title,
        description,
        discount,
        code,
        image,
        color,
        startDate,
        endDate,
        isActive,
        minOrderAmount,
        maxDiscount,
        applicableProducts,
        applicableCategories,
        maxUsage,
      } = req.body;

      const updateData = {
        title,
        description,
        discount,
        code: code.toUpperCase(),
        image,
        color,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive,
        minOrderAmount,
        maxDiscount,
        applicableProducts,
        applicableCategories,
        maxUsage,
        updatedAt: new Date(),
      };

      await db
        .collection("offers")
        .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData });
      res.json({ message: "Offer updated successfully" });
    },
  );

  apiRouter.delete(
    "/admin/offers/:id",
    authenticate,
    isAdmin,
    async (req, res) => {
      await db
        .collection("offers")
        .deleteOne({ _id: new ObjectId(req.params.id) });
      res.json({ message: "Offer deleted successfully" });
    },
  );

  apiRouter.patch(
    "/admin/offers/:id/toggle",
    authenticate,
    isAdmin,
    async (req, res) => {
      const offer = await db
        .collection("offers")
        .findOne({ _id: new ObjectId(req.params.id) });

      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      await db
        .collection("offers")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { isActive: !offer.isActive, updatedAt: new Date() } },
        );

      res.json({
        message: `Offer ${!offer.isActive ? "activated" : "deactivated"} successfully`,
      });
    },
  );

  apiRouter.get("/offers", async (req, res) => {
    const now = new Date();
    const offers = await db
      .collection("offers")
      .find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(offers);
  });

  apiRouter.post("/offers/validate", async (req, res) => {
    const { code, orderAmount, productIds, categoryIds } = req.body;

    const offer = await db.collection("offers").findOne({
      code: code.toUpperCase(),
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    if (!offer) {
      return res.status(404).json({ message: "Invalid or expired offer code" });
    }

    if (offer.maxUsage && offer.usageCount >= offer.maxUsage) {
      return res.status(400).json({ message: "Offer usage limit exceeded" });
    }

    if (offer.minOrderAmount && orderAmount < offer.minOrderAmount) {
      return res.status(400).json({
        message: `Minimum order amount of ৳${offer.minOrderAmount} required`,
      });
    }

    if (offer.applicableProducts.length > 0 && productIds) {
      const hasApplicableProduct = productIds.some((id) =>
        offer.applicableProducts.includes(id),
      );
      if (!hasApplicableProduct) {
        return res.status(400).json({
          message: "Offer not applicable to selected products",
        });
      }
    }

    if (offer.applicableCategories.length > 0 && categoryIds) {
      const hasApplicableCategory = categoryIds.some((id) =>
        offer.applicableCategories.includes(id),
      );
      if (!hasApplicableCategory) {
        return res.status(400).json({
          message: "Offer not applicable to selected categories",
        });
      }
    }

    let discountAmount = 0;
    if (offer.discount.includes("%")) {
      const percentage = parseFloat(offer.discount.replace("%", ""));
      discountAmount = (orderAmount * percentage) / 100;
    } else {
      discountAmount = parseFloat(offer.discount.replace(/[^\d.]/g, ""));
    }

    if (offer.maxDiscount && discountAmount > offer.maxDiscount) {
      discountAmount = offer.maxDiscount;
    }

    res.json({
      valid: true,
      offer,
      discountAmount,
      finalAmount: orderAmount - discountAmount,
    });
  });

  // --- Memory Management API ---
  apiRouter.get("/memories", authenticate, async (req, res) => {
    try {
      const {
        search,
        tags,
        category,
        priority,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20,
      } = req.query;
      const userId = req.user._id;

      // Build filter query
      const filter = { userId: new ObjectId(userId) };

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: "i" } },
          { content: { $regex: search, $options: "i" } },
        ];
      }

      if (tags && tags.length > 0) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        filter.tags = { $in: tagArray };
      }

      if (category) {
        filter.category = category;
      }

      if (priority) {
        filter.priority = priority;
      }

      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const memories = await db
        .collection("memories")
        .find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // Get total count for pagination
      const total = await db.collection("memories").countDocuments(filter);

      res.json({
        memories,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching memories:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch memories", error: error.message });
    }
  });

  apiRouter.post("/memories/bulk", authenticate, async (req, res) => {
    try {
      const userId = req.user._id;
      const { action, memoryIds, data } = req.body;

      if (!action || !memoryIds || !Array.isArray(memoryIds)) {
        return res
          .status(400)
          .json({ message: "Action and memoryIds array are required" });
      }

      const objectIds = memoryIds.map((id) => new ObjectId(id));

      let result;
      switch (action) {
        case "delete":
          result = await db.collection("memories").deleteMany({
            _id: { $in: objectIds },
            userId: new ObjectId(userId),
          });
          break;

        case "archive":
          result = await db
            .collection("memories")
            .updateMany(
              { _id: { $in: objectIds }, userId: new ObjectId(userId) },
              { $set: { isArchived: true, updatedAt: new Date() } },
            );
          break;

        case "unarchive":
          result = await db
            .collection("memories")
            .updateMany(
              { _id: { $in: objectIds }, userId: new ObjectId(userId) },
              { $set: { isArchived: false, updatedAt: new Date() } },
            );
          break;

        case "pin":
          result = await db
            .collection("memories")
            .updateMany(
              { _id: { $in: objectIds }, userId: new ObjectId(userId) },
              { $set: { isPinned: true, updatedAt: new Date() } },
            );
          break;

        case "unpin":
          result = await db
            .collection("memories")
            .updateMany(
              { _id: { $in: objectIds }, userId: new ObjectId(userId) },
              { $set: { isPinned: false, updatedAt: new Date() } },
            );
          break;

        case "updateCategory":
          if (!data.category) {
            return res.status(400).json({
              message: "Category is required for updateCategory action",
            });
          }
          result = await db
            .collection("memories")
            .updateMany(
              { _id: { $in: objectIds }, userId: new ObjectId(userId) },
              { $set: { category: data.category, updatedAt: new Date() } },
            );
          break;

        default:
          return res.status(400).json({ message: "Invalid action" });
      }

      res.json({
        message: `Bulk ${action} completed successfully`,
        modifiedCount: result.modifiedCount || result.deletedCount,
      });
    } catch (error) {
      console.error("Error performing bulk operation:", error);
      res.status(500).json({
        message: "Failed to perform bulk operation",
        error: error.message,
      });
    }
  });

  // --- Carousel API ---
  apiRouter.get("/admin/carousel", authenticate, isAdmin, async (req, res) => {
    const slides = await db
      .collection("carousel")
      .find()
      .sort({ order: 1 })
      .toArray();
    res.json(slides);
  });

  apiRouter.post("/admin/carousel", authenticate, isAdmin, async (req, res) => {
    const { title, description, image, link, isActive, order } = req.body;

    const maxOrder = await db.collection("carousel").countDocuments();
    const slideData = {
      title,
      description,
      image,
      link,
      isActive: isActive !== undefined ? isActive : true,
      order: order !== undefined ? order : maxOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("carousel").insertOne(slideData);
    res.json({ _id: result.insertedId, ...slideData });
  });

  apiRouter.put(
    "/admin/carousel/:id",
    authenticate,
    isAdmin,
    async (req, res) => {
      const { title, description, image, link, isActive, order } = req.body;

      const updateData = {
        title,
        description,
        image,
        link,
        isActive: isActive !== undefined ? isActive : true,
        order,
        updatedAt: new Date(),
      };

      await db
        .collection("carousel")
        .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData });
      res.json({ message: "Carousel slide updated successfully" });
    },
  );

  apiRouter.delete(
    "/admin/carousel/:id",
    authenticate,
    isAdmin,
    async (req, res) => {
      await db
        .collection("carousel")
        .deleteOne({ _id: new ObjectId(req.params.id) });
      res.json({ message: "Carousel slide deleted successfully" });
    },
  );

  apiRouter.patch(
    "/admin/carousel/:id/toggle",
    authenticate,
    isAdmin,
    async (req, res) => {
      const slide = await db
        .collection("carousel")
        .findOne({ _id: new ObjectId(req.params.id) });

      if (!slide) {
        return res.status(404).json({ message: "Carousel slide not found" });
      }

      await db
        .collection("carousel")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { isActive: !slide.isActive, updatedAt: new Date() } },
        );

      res.json({
        message: `Carousel slide ${!slide.isActive ? "activated" : "deactivated"} successfully`,
      });
    },
  );

  apiRouter.put(
    "/admin/carousel/reorder",
    authenticate,
    isAdmin,
    async (req, res) => {
      const { slides } = req.body;

      // Update order for each slide
      for (const slide of slides) {
        await db
          .collection("carousel")
          .updateOne(
            { _id: new ObjectId(slide._id) },
            { $set: { order: slide.order, updatedAt: new Date() } },
          );
      }

      res.json({ message: "Carousel slides reordered successfully" });
    },
  );

  // Public carousel API
  apiRouter.get("/carousel", async (req, res) => {
    const slides = await db
      .collection("carousel")
      .find({ isActive: true })
      .sort({ order: 1 })
      .toArray();
    res.json(slides);
  });

  // API 404 Handler
  apiRouter.all("*", (req, res) => {
    console.log(`[API 404] ${req.method} ${req.url}`);
    res
      .status(404)
      .json({ message: `API route ${req.method} ${req.url} not found` });
  });

  // Mount API Router
  app.use("/api", apiRouter);

  // --- Global Error Handler ---
  app.use((err, req, res, next) => {
    console.error("[Global Error]", err);
    if (req.path.startsWith("/api/")) {
      return res.status(500).json({
        message: "Internal Server Error",
        error: err.message,
      });
    }
    next(err);
  });

  // --- Vite integration ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
