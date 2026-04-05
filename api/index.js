import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import SslCommerzPayment from "sslcommerz-lts";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ১. CORS configuration (Updated)
const corsOptions = {
  origin: [
    "https://somikoron-shop.vercel.app",
    "http://localhost:5173", // 👈 Vite ফ্রন্টএন্ডের আসল পোর্ট
    "http://localhost:3000", // ব্যাকআপ হিসেবে রাখা হলো
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ২. CORS মিডলওয়্যার অ্যাপ্লাই করুন
app.use(cors(corsOptions));

app.use(express.json());

// Setup Morgan for logging
app.use(morgan("combined"));

// Database configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "somikoron_shop";
const JWT_SECRET = process.env.JWT_SECRET || "somikoron_secret_key_123";

// Email Configuration
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_USER = process.env.EMAIL_USER || "your-email@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "your-app-password";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@somikoron.com";

// SSLCOMMERZ Configuration
const SSLCOMMERZ_STORE_ID = process.env.SSLCOMMERZ_STORE_ID;
const SSLCOMMERZ_STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD;
const SSLCOMMERZ_IS_LIVE = process.env.SSLCOMMERZ_IS_LIVE === "true";

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

let db;

// Connect to MongoDB
async function connectToDatabase() {
  if (db) return db;

  try {
    const client = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 30000,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      tls: true,
      tlsAllowInvalidCertificates: true,
      maxPoolSize: 10,
      minPoolSize: 1,
      retryReads: true,
      retryWrites: true,
    });

    await client.connect();
    db = client.db(MONGODB_DB);
    console.log("Connected to MongoDB");
    return db;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

// Middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    console.log("No token provided in request");
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    console.log("Verifying token...");
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("Token decoded:", decoded);
    const database = await connectToDatabase();
    req.user = await database
      .collection("users")
      .findOne({ _id: new ObjectId(decoded.id) });
    if (!req.user) {
      console.log("User not found for ID:", decoded.id);
      return res.status(401).json({ message: "User not found" });
    }
    console.log("User authenticated:", req.user.email);
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

// Email Templates (simplified versions)
const generateBuyerInvoiceEmail = (order, user) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Confirmation - Somikoron Shop</title>
    </head>
    <body>
      <h1>Order Confirmed!</h1>
      <p>Thank you for your purchase from Somikoron Shop</p>
      <p><strong>Order ID:</strong> ${order._id}</p>
      <p><strong>Total Amount:</strong> ৳${order.finalTotal}</p>
      <p>View your orders at: https://somikoron-shop.vercel.app/my-orders</p>
    </body>
    </html>
  `;
};

const generateAdminInvoiceEmail = (order, user) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Order Received - Somikoron Shop Admin</title>
    </head>
    <body>
      <h1>New Order Received!</h1>
      <p><strong>Order ID:</strong> ${order._id}</p>
      <p><strong>Customer:</strong> ${user.name} (${user.email})</p>
      <p><strong>Total Amount:</strong> ৳${order.finalTotal}</p>
      <p>Manage order at: https://somikoron-shop.vercel.app/admin/orders</p>
    </body>
    </html>
  `;
};

// Email Service Functions
const sendInvoiceEmails = async (order, user) => {
  try {
    const buyerMailOptions = {
      from: `"Somikoron Shop" <${EMAIL_USER}>`,
      to: user.email,
      subject: `Order Confirmation - Somikoron Shop (Order #${order._id})`,
      html: generateBuyerInvoiceEmail(order, user),
    };

    const adminMailOptions = {
      from: `"Somikoron Shop" <${EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: `New Order Received - Somikoron Shop (Order #${order._id})`,
      html: generateAdminInvoiceEmail(order, user),
    };

    await Promise.all([
      transporter.sendMail(buyerMailOptions),
      transporter.sendMail(adminMailOptions),
    ]);

    return { success: true };
  } catch (error) {
    console.error("Error sending invoice emails:", error);
    return { success: false, error: error.message };
  }
};

// Routes
app.get("/api/debug", (req, res) => {
  res.json({
    status: "ok",
    message: "API is working",
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const database = await connectToDatabase();
    const { name, email, password, photoURL } = req.body;

    const existing = await database.collection("users").findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await database.collection("users").insertOne({
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
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const database = await connectToDatabase();
    const { email, password } = req.body;

    const user = await database.collection("users").findOne({ email });
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
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.post("/api/auth/google", async (req, res) => {
  try {
    const database = await connectToDatabase();
    const { uid, email, name, photoURL } = req.body;

    let user = await database.collection("users").findOne({ email });

    if (!user) {
      const result = await database.collection("users").insertOne({
        name,
        email,
        photoURL,
        googleId: uid,
        role: "user",
        createdAt: new Date(),
      });
      user = { _id: result.insertedId, name, email, photoURL, role: "user" };
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
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// Products routes
app.get("/api/products", async (req, res) => {
  try {
    const database = await connectToDatabase();
    const { category, search } = req.query;
    const query = {};
    if (category && category !== "all") query.category = category;
    if (search) query.name = { $regex: search, $options: "i" };
    const products = await database
      .collection("products")
      .find(query)
      .toArray();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const database = await connectToDatabase();
    const product = await database
      .collection("products")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(400).json({ message: "Invalid product ID" });
  }
});

// Orders routes
app.post("/api/orders", authenticate, async (req, res) => {
  try {
    console.log("Order creation request received");
    console.log("Request body:", req.body);
    console.log("Authenticated user:", req.user.email);

    const database = await connectToDatabase();
    const { items, totalPrice, shippingFee, finalTotal, formData } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Cart items are required" });
    }

    if (!formData || !formData.name || !formData.phone || !formData.address) {
      return res
        .status(400)
        .json({ success: false, message: "Shipping information is required" });
    }

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
      status: formData.paymentMethod === "cod" ? "pending" : "pending_payment",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await database.collection("orders").insertOne(orderData);
    const orderId = result.insertedId.toString();

    console.log("Order created successfully:", {
      orderId,
      paymentMethod: formData.paymentMethod,
    });

    if (formData.paymentMethod === "sslcommerz") {
      const sslcz = new SslCommerzPayment(
        SSLCOMMERZ_STORE_ID,
        SSLCOMMERZ_STORE_PASSWORD,
        !SSLCOMMERZ_IS_LIVE,
      );

      const transactionId = `SOM-${orderId}-${Date.now()}`;
      const paymentData = {
        total_amount: finalTotal,
        currency: "BDT",
        tran_id: transactionId,
        success_url: `https://somikoron-shop.vercel.app/payment/success?order_id=${orderId}`,
        fail_url: `https://somikoron-shop.vercel.app/payment/fail?order_id=${orderId}`,
        cancel_url: `https://somikoron-shop.vercel.app/payment/cancel?order_id=${orderId}`,
        ipn_url: `${req.protocol}://${req.get("host")}/api/payment/ipn`,
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
        value_a: orderId,
      };

      try {
        const paymentSession = await sslcz.initiateTransaction(paymentData);
        const gatewayUrl =
          paymentSession?.GatewayPageURL || paymentSession?.gatewayURL?.page;

        if (gatewayUrl) {
          await database.collection("orders").updateOne(
            { _id: new ObjectId(orderId) },
            {
              $set: {
                transactionId,
                paymentGatewayUrl: gatewayUrl,
                paymentStatus: "pending_payment",
                status: "pending_payment",
                updatedAt: new Date(),
              },
            },
          );

          return res.json({
            success: true,
            orderId,
            paymentUrl: gatewayUrl,
            transactionId,
            message: "Payment session created successfully",
          });
        } else {
          throw new Error("Invalid payment gateway response");
        }
      } catch (error) {
        console.error("SSLCommerz payment error:", error);
        return res.status(500).json({
          success: false,
          message: "Payment gateway error. Please try again.",
          error: error.message,
        });
      }
    } else if (formData.paymentMethod === "cod") {
      const order = await database
        .collection("orders")
        .findOne({ _id: new ObjectId(orderId) });
      if (order) {
        await sendInvoiceEmails(order, req.user);
      }

      return res.json({
        success: true,
        orderId,
        message: "Order placed successfully",
      });
    }
  } catch (error) {
    console.error("Order creation error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to create order. Please try again.",
      error: error.message,
    });
  }
});

app.get("/api/orders/my-orders", authenticate, async (req, res) => {
  try {
    const database = await connectToDatabase();
    const orders = await database
      .collection("orders")
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Payment success/fail handlers
app.get("/api/payment/success", async (req, res) => {
  try {
    const database = await connectToDatabase();
    const { order_id } = req.query;

    await database.collection("orders").updateOne(
      { _id: new ObjectId(order_id) },
      {
        $set: {
          paymentStatus: "paid",
          status: "pending",
          updatedAt: new Date(),
        },
      },
    );

    res.redirect(
      `https://somikoron-shop.vercel.app/payment/success?order_id=${order_id}`,
    );
  } catch (error) {
    res.redirect(
      `https://somikoron-shop.vercel.app/payment/fail?error=${error.message}`,
    );
  }
});

app.get("/api/payment/fail", async (req, res) => {
  const { order_id } = req.query;
  res.redirect(
    `https://somikoron-shop.vercel.app/payment/fail?order_id=${order_id}`,
  );
});

app.get("/api/payment/cancel", async (req, res) => {
  const { order_id } = req.query;
  res.redirect(
    `https://somikoron-shop.vercel.app/payment/cancel?order_id=${order_id}`,
  );
});

// Admin routes
app.get("/api/admin/orders", authenticate, isAdmin, async (req, res) => {
  try {
    const database = await connectToDatabase();
    const orders = await database
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.put("/api/admin/orders/:id", authenticate, isAdmin, async (req, res) => {
  try {
    const database = await connectToDatabase();
    const { status } = req.body;

    await database
      .collection("orders")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status, updatedAt: new Date() } },
      );

    res.json({ message: "Order status updated" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Export for Vercel
export default app;
