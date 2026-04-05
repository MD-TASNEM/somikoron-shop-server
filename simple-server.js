import express from "express";
import cors from "cors";
import morgan from "morgan";

const app = express();
const PORT = process.env.PORT || 8000;

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

// Mock user data
const mockUsers = [
  {
    id: "admin-1",
    name: "Admin User",
    email: "admin@somikoron.com",
    password: "admin123",
    role: "admin",
    photoURL: "https://via.placeholder.com/100",
  },
  {
    id: "user-1",
    name: "Test User",
    email: "user@example.com",
    password: "user123",
    role: "user",
    photoURL: "https://via.placeholder.com/100",
  },
];

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  // Mock token validation - in production, use JWT
  if (token === "mock-token-123" || token.startsWith("mock-token-")) {
    // Extract user ID from token
    const userId = token.includes("-") ? token.split("-")[2] : "user-1";
    req.user = mockUsers.find((u) => u.id === userId) || mockUsers[1];
    next();
  } else {
    return res.status(403).json({ message: "Invalid token" });
  }
};

// Basic routes
app.get("/api/debug", (req, res) => {
  res.json({ status: "ok", message: "API is working", timestamp: new Date() });
});

app.get("/api/products", (req, res) => {
  // Mock products data
  const mockProducts = [
    {
      _id: "1",
      name: "Sample Product 1",
      price: 100,
      category: "electronics",
      description: "This is a sample product",
      image: "https://via.placeholder.com/300x200",
      stock: 10,
      featured: true,
    },
    {
      _id: "2",
      name: "Sample Product 2",
      price: 200,
      category: "clothing",
      description: "Another sample product",
      image: "https://via.placeholder.com/300x200",
      stock: 5,
      featured: false,
    },
  ];
  res.json(mockProducts);
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = mockUsers.find((u) => u.email === email);

  if (!user || user.password !== password) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Generate mock token
  const token = `mock-token-${user.id}-${Date.now()}`;

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      photoURL: user.photoURL,
    },
  });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password, photoURL } = req.body;

  // Check if user already exists
  const existingUser = mockUsers.find((u) => u.email === email);
  if (existingUser) {
    return res.status(400).json({ message: "Email already exists" });
  }

  // Create new user
  const newUser = {
    id: `user-${Date.now()}`,
    name,
    email,
    password,
    role: "user",
    photoURL: photoURL || "https://via.placeholder.com/100",
  };

  mockUsers.push(newUser);

  // Generate mock token
  const token = `mock-token-${newUser.id}-${Date.now()}`;

  res.status(201).json({
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      photoURL: newUser.photoURL,
    },
  });
});

app.post("/api/auth/google", (req, res) => {
  const { uid, email, name, photoURL } = req.body;

  // Check if user exists
  let user = mockUsers.find((u) => u.email === email);

  if (!user) {
    // Create new user from Google login
    user = {
      id: uid || `google-${Date.now()}`,
      name,
      email,
      password: "", // Google users don't have passwords
      role: "user",
      photoURL: photoURL || "https://via.placeholder.com/100",
    };
    mockUsers.push(user);
  }

  // Check if user is admin
  const adminEmails = [
    "admin@somikoron.com",
    "tasnem@example.com",
    "test@admin.com",
    "hujaifa@admin.com",
  ];
  if (adminEmails.includes(email)) {
    user.role = "admin";
  }

  // Generate mock token
  const token = `mock-token-${user.id}-${Date.now()}`;

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      photoURL: user.photoURL,
    },
  });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      photoURL: req.user.photoURL,
    },
  });
});

// Mock carousel data
const mockCarouselSlides = [
  {
    _id: "1",
    title: "Summer Sale",
    description: "Get up to 50% off on selected items",
    image: "https://via.placeholder.com/800x400",
    link: "/products",
    isActive: true,
    order: 1,
    createdAt: new Date().toISOString(),
  },
  {
    _id: "2",
    title: "New Arrivals",
    description: "Check out our latest collection",
    image: "https://via.placeholder.com/800x400",
    link: "/products",
    isActive: true,
    order: 2,
    createdAt: new Date().toISOString(),
  },
];

// Admin carousel endpoints
app.get("/api/admin/carousel", authenticateToken, (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  res.json(mockCarouselSlides);
});

app.post("/api/admin/carousel", authenticateToken, (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { title, description, image, link, isActive, order } = req.body;
  const newSlide = {
    _id: Date.now().toString(),
    title,
    description,
    image,
    link,
    isActive: isActive !== undefined ? isActive : true,
    order: order || mockCarouselSlides.length + 1,
    createdAt: new Date().toISOString(),
  };

  mockCarouselSlides.push(newSlide);
  res.status(201).json(newSlide);
});

app.put("/api/admin/carousel/:id", authenticateToken, (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { title, description, image, link, isActive, order } = req.body;
  const slideIndex = mockCarouselSlides.findIndex(
    (slide) => slide._id === req.params.id,
  );

  if (slideIndex === -1) {
    return res.status(404).json({ message: "Carousel slide not found" });
  }

  mockCarouselSlides[slideIndex] = {
    ...mockCarouselSlides[slideIndex],
    title,
    description,
    image,
    link,
    isActive:
      isActive !== undefined
        ? isActive
        : mockCarouselSlides[slideIndex].isActive,
    order: order || mockCarouselSlides[slideIndex].order,
  };

  res.json({ message: "Carousel slide updated successfully" });
});

app.delete("/api/admin/carousel/:id", authenticateToken, (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const slideIndex = mockCarouselSlides.findIndex(
    (slide) => slide._id === req.params.id,
  );

  if (slideIndex === -1) {
    return res.status(404).json({ message: "Carousel slide not found" });
  }

  mockCarouselSlides.splice(slideIndex, 1);
  res.json({ message: "Carousel slide deleted successfully" });
});

// Public carousel endpoint
app.get("/api/carousel", (req, res) => {
  const activeSlides = mockCarouselSlides
    .filter((slide) => slide.isActive)
    .sort((a, b) => a.order - b.order);
  res.json(activeSlides);
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 API available at http://localhost:${PORT}/api`);
});
