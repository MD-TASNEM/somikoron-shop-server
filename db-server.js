import express from "express";
import cors from "cors";
import morgan from "morgan";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Database Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "Shop";
const JWT_SECRET = process.env.JWT_SECRET || "somikoron_secret_key_123";

let db;
let client;

// Connect to MongoDB
async function connectToDatabase() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(MONGODB_DB);
    console.log("✅ Connected to MongoDB Atlas successfully!");

    // Create indexes for better performance
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("products").createIndex({ name: 1 });
    await db.collection("orders").createIndex({ userId: 1 });
    await db.collection("carousel").createIndex({ order: 1 });

    // Seed admin user if not exists
    const adminExists = await db
      .collection("users")
      .findOne({ email: "admin@somikoron.com" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await db.collection("users").insertOne({
        name: "Admin User",
        email: "admin@somikoron.com",
        password: hashedPassword,
        role: "admin",
        createdAt: new Date(),
      });
      console.log("👤 Default admin created: admin@somikoron.com / admin123");
    }

    // Seed sample products if empty
    const productCount = await db.collection("products").countDocuments();
    if (productCount === 0) {
      const sampleProducts = [
        {
          name: "Sample Product 1",
          price: 100,
          category: "electronics",
          description: "This is a sample product",
          image: "https://via.placeholder.com/300x200",
          stock: 10,
          featured: true,
          createdAt: new Date(),
        },
        {
          name: "Sample Product 2",
          price: 200,
          category: "clothing",
          description: "Another sample product",
          image: "https://via.placeholder.com/300x200",
          stock: 5,
          featured: false,
          createdAt: new Date(),
        },
      ];
      await db.collection("products").insertMany(sampleProducts);
      console.log("📦 Sample products created");
    }

    // Seed carousel slides if empty
    const carouselCount = await db.collection("carousel").countDocuments();
    if (carouselCount === 0) {
      const sampleSlides = [
        {
          title: "Summer Sale",
          description: "Get up to 50% off on selected items",
          image: "https://via.placeholder.com/800x400",
          link: "/products",
          isActive: true,
          order: 1,
          createdAt: new Date(),
        },
        {
          title: "New Arrivals",
          description: "Check out our latest collection",
          image: "https://via.placeholder.com/800x400",
          link: "/products",
          isActive: true,
          order: 2,
          createdAt: new Date(),
        },
      ];
      await db.collection("carousel").insertMany(sampleSlides);
      console.log("🎠 Sample carousel slides created");
    }
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
    ],
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan("dev"));

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

// Helper function to get user from database
const getUserFromToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await db
      .collection("users")
      .findOne({ _id: new ObjectId(decoded.id) });
  } catch (error) {
    return null;
  }
};

// Basic routes
app.get("/api/debug", (req, res) => {
  res.json({
    status: "ok",
    message: "API is working with MongoDB",
    timestamp: new Date(),
    database: MONGODB_DB,
  });
});

// Authentication routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await db.collection("users").findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, photoURL } = req.body;

    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection("users").insertOne({
      name,
      email,
      password: hashedPassword,
      photoURL,
      role: "user",
      createdAt: new Date(),
    });

    const token = jwt.sign(
      { id: result.insertedId, email, role: "user" },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      token,
      user: {
        id: result.insertedId,
        name,
        email,
        role: "user",
        photoURL,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res
      .status(500)
      .json({ message: "Registration failed", error: error.message });
  }
});

app.post("/api/auth/google", async (req, res) => {
  try {
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
    }

    // Check if user is admin
    const adminEmails = [
      "admin@somikoron.com",
      "tasnem@example.com",
      "test@admin.com",
      "hujaifa@admin.com",
    ];
    if (adminEmails.includes(email)) {
      await db
        .collection("users")
        .updateOne({ _id: user._id }, { $set: { role: "admin" } });
      user.role = "admin";
    }

    const token = jwt.sign(
      { id: user._id, email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res
      .status(500)
      .json({ message: "Google authentication failed", error: error.message });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res
      .status(500)
      .json({ message: "Failed to get user", error: error.message });
  }
});

// Products routes
app.get("/api/products", async (req, res) => {
  try {
    const { category, search } = req.query;
    const query = {};
    if (category && category !== "all") query.category = category;
    if (search) query.name = { $regex: search, $options: "i" };

    const products = await db.collection("products").find(query).toArray();
    res.json(products);
  } catch (error) {
    console.error("Get products error:", error);
    res
      .status(500)
      .json({ message: "Failed to get products", error: error.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await db
      .collection("products")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error("Get product error:", error);
    res.status(400).json({ message: "Invalid product ID" });
  }
});

// Admin stats endpoint
app.get("/api/admin/stats", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Get various statistics
    const totalUsers = await db.collection("users").countDocuments();
    const totalProducts = await db.collection("products").countDocuments();
    const totalOrders = await db.collection("orders").countDocuments();
    const totalRevenue = await db
      .collection("orders")
      .aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$finalTotal" } } },
      ])
      .toArray();

    const recentOrders = await db
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const topProducts = await db
      .collection("orders")
      .aggregate([
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            totalSold: { $sum: "$items.quantity" },
            revenue: {
              $sum: { $multiply: ["$items.price", "$items.quantity"] },
            },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    res.json({
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        recentOrders,
        topProducts,
      },
    });
  } catch (error) {
    console.error("Get admin stats error:", error);
    res
      .status(500)
      .json({ message: "Failed to get admin stats", error: error.message });
  }
});

// Admin carousel routes
app.get("/api/admin/carousel", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const slides = await db
      .collection("carousel")
      .find()
      .sort({ order: 1 })
      .toArray();
    res.json(slides);
  } catch (error) {
    console.error("Get admin carousel error:", error);
    res
      .status(500)
      .json({ message: "Failed to get carousel slides", error: error.message });
  }
});

app.post("/api/admin/carousel", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { title, description, image, link, isActive, order } = req.body;
    const maxOrder = await db.collection("carousel").countDocuments();

    const newSlide = {
      title,
      description,
      image,
      link,
      isActive: isActive !== undefined ? isActive : true,
      order: order || maxOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("carousel").insertOne(newSlide);
    res.status(201).json({ _id: result.insertedId, ...newSlide });
  } catch (error) {
    console.error("Create carousel slide error:", error);
    res.status(500).json({
      message: "Failed to create carousel slide",
      error: error.message,
    });
  }
});

// Public carousel endpoint
app.get("/api/carousel", async (req, res) => {
  try {
    const activeSlides = await db
      .collection("carousel")
      .find({ isActive: true })
      .sort({ order: 1 })
      .toArray();
    res.json(activeSlides);
  } catch (error) {
    console.error("Get public carousel error:", error);
    res
      .status(500)
      .json({ message: "Failed to get carousel slides", error: error.message });
  }
});

// Orders routes
app.post("/api/orders", authenticateToken, async (req, res) => {
  try {
    const { items, totalPrice, shippingFee, finalTotal, formData } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart items are required" });
    }

    if (!formData || !formData.name || !formData.phone || !formData.address) {
      return res
        .status(400)
        .json({ message: "Shipping information is required" });
    }

    // Create order
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

    const result = await db.collection("orders").insertOne(orderData);
    const createdOrder = await db
      .collection("orders")
      .findOne({ _id: result.insertedId });

    res.status(201).json(createdOrder);
  } catch (error) {
    console.error("Create order error:", error);
    res
      .status(500)
      .json({ message: "Failed to create order", error: error.message });
  }
});

app.get("/api/orders/my-orders", authenticateToken, async (req, res) => {
  try {
    const orders = await db
      .collection("orders")
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  } catch (error) {
    console.error("Get user orders error:", error);
    res
      .status(500)
      .json({ message: "Failed to get orders", error: error.message });
  }
});

// Admin orders management
app.get("/api/admin/orders", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });

    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const orders = await db
      .collection("orders")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  } catch (error) {
    console.error("Get admin orders error:", error);
    res
      .status(500)
      .json({ message: "Failed to get orders", error: error.message });
  }
});

// Get specific order details (for users)
app.get("/api/orders/:id", authenticateToken, async (req, res) => {
  try {
    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is admin or order belongs to the user
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Allow access if user is admin or order belongs to the user
    if (user.role === "admin" || order.userId.toString() === req.user.id) {
      res.json(order);
    } else {
      res.status(403).json({ message: "Access denied" });
    }
  } catch (error) {
    console.error("Get order error:", error);
    res.status(400).json({ message: "Invalid order ID" });
  }
});

// Admin get specific order details
app.get("/api/admin/orders/:id", authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });

    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Get admin order error:", error);
    res.status(400).json({ message: "Invalid order ID" });
  }
});

app.patch(
  "/api/admin/orders/:id/status",
  authenticateToken,
  async (req, res) => {
    try {
      // Check if user is admin
      const user = await db
        .collection("users")
        .findOne({ _id: new ObjectId(req.user.id) });

      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      await db
        .collection("orders")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: req.body.status, updatedAt: new Date() } },
        );
      res.json({ message: "Order status updated successfully" });
    } catch (error) {
      console.error("Update order status error:", error);
      res.status(500).json({
        message: "Failed to update order status",
        error: error.message,
      });
    }
  },
);

// Start server
async function startServer() {
  await connectToDatabase();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 API available at http://localhost:${PORT}/api`);
    console.log(`🗄️  Connected to MongoDB database: ${MONGODB_DB}`);
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🔄 Shutting down gracefully...");
  if (client) {
    await client.close();
    console.log("🗄️  MongoDB connection closed");
  }
  process.exit(0);
});

startServer().catch(console.error);
