"use strict";

// Load .env for local/supervisor runs.
// Vercel injects env vars directly, so this is a no-op there but harmless.
try {
  require("dotenv").config();
} catch (_) {
  /* dotenv optional */
}

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || "test_database";
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@shubhvika.com";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "change-this-admin-password";
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://shubhvika-frontend.vercel.app";
const PORT = process.env.PORT || 8001;

if (!MONGO_URL) {
  console.error("[fatal] MONGO_URL environment variable is missing");
}

if (!JWT_SECRET) {
  console.error("[fatal] JWT_SECRET environment variable is missing");
}

const JWT_ALG = "HS256";

const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// MongoDB connection — Vercel serverless safe
// ---------------------------------------------------------------------------

let cachedClient = null;
let cachedDb = null;
let dbPromise = null;
let seedPromise = null;

async function getDB() {
  if (cachedDb) return cachedDb;

  if (!MONGO_URL) {
    throw new Error("MONGO_URL environment variable is missing");
  }

  if (!dbPromise) {
    dbPromise = (async () => {
      const client = new MongoClient(MONGO_URL, {
        serverSelectionTimeoutMS: 10000,
      });

      await client.connect();

      const db = client.db(DB_NAME);

      cachedClient = client;
      cachedDb = db;

      console.log("[mongodb] Connected to database:", DB_NAME);

      return db;
    })().catch((error) => {
      dbPromise = null;
      cachedClient = null;
      cachedDb = null;

      console.error("[mongodb] Connection failed:", error);

      throw error;
    });
  }

  return dbPromise;
}

// ---------------------------------------------------------------------------
// Order tracking
// ---------------------------------------------------------------------------

const TRACKING_STAGES = [
  { key: "confirmed", label: "Confirmed", minutes: 0 },
  { key: "packed", label: "Packed", minutes: 2 },
  { key: "shipped", label: "Shipped", minutes: 5 },
  { key: "delivered", label: "Delivered", minutes: 10 },
];

// ---------------------------------------------------------------------------
// Shopify MongoDB product formatter
// ---------------------------------------------------------------------------

function formatShopifyProduct(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const firstVariant = variants[0] || {};

  const images = Array.isArray(product.images)
    ? product.images.map((image) => image?.src).filter(Boolean)
    : [];

  const price = Number(firstVariant.price) || 0;
  const compareAtPrice = firstVariant.compare_at_price
    ? Number(firstVariant.compare_at_price)
    : null;

  const productType = String(product.product_type || "General").trim();
  const normalizedProductType = productType.toLowerCase();

  const tags = Array.isArray(product.tags) ? product.tags : [];
  const normalizedTags = tags.map((tag) => String(tag).trim().toLowerCase());

  const hasAnyTag = (...values) =>
    values.some((value) => normalizedTags.includes(value));

  let category = "general";

  if (
    hasAnyTag("men", "mens", "men's", "man", "male") ||
    [
      "kurta set",
      "kurta pyjama set",
      "nehru jacket",
      "bandhgala",
      "sherwani",
      "bandi waistcoat",
      "angarkha",
      "pathani suit",
    ].includes(normalizedProductType)
  ) {
    category = "men";
  } else if (
    hasAnyTag("women", "womens", "women's", "woman", "female") ||
    [
      "kurta",
      "kurti",
      "leggings",
      "tunic",
      "ethnic sets",
      "jewellery",
    ].includes(normalizedProductType)
  ) {
    category = "women";
  } else if (hasAnyTag("kids", "kid", "children", "child")) {
    category = "kids";
  }

  const options = Array.isArray(product.options) ? product.options : [];

  const sizeOption = options.find(
    (option) => String(option?.name || "").trim().toLowerCase() === "size"
  );

  const colorOption = options.find(
    (option) => String(option?.name || "").trim().toLowerCase() === "color"
  );

  const sizes = Array.isArray(sizeOption?.values) ? sizeOption.values : [];
  const colors = Array.isArray(colorOption?.values) ? colorOption.values : [];

  const createdAt = product.created_at ? new Date(product.created_at) : null;
  const isNewByDate =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000
      : false;
  const isNewByTag = hasAnyTag("new", "new arrival", "new arrivals");
  const isNew = isNewByDate || isNewByTag;

  const isPopular = normalizedTags.some(
    (tag) =>
      tag.includes("popular") ||
      tag.includes("best seller") ||
      tag.includes("bestseller")
  );

  return {
    id: String(product.id),
    name: product.title || "Untitled Product",
    title: product.title || "Untitled Product",
    handle: product.handle || null,
    price,
    old_price: compareAtPrice,
    compare_at_price: compareAtPrice,
    category,
    product_type: productType,
    collection: null,
    is_new: isNew,
    is_popular: isPopular,
    sizes: sizes.length ? sizes : ["ONE SIZE"],
    colors: colors.length ? colors : ["Default"],
    description: product.body_html || "",
    details: [],
    images,
    variants: variants.map((variant) => ({
      id: String(variant.id),
      title: variant.title,
      sku: variant.sku,
      price: Number(variant.price) || 0,
      compare_at_price: variant.compare_at_price
        ? Number(variant.compare_at_price)
        : null,
      available: variant.available !== false,
      option1: variant.option1 || null,
      option2: variant.option2 || null,
      option3: variant.option3 || null,
    })),
    tags,
    vendor: product.vendor || null,
    published_at: product.published_at || null,
    created_at: product.created_at || null,
    updated_at: product.updated_at || null,
  };
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signAccessToken(userId, email) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is missing");
  }

  return jwt.sign(
    { sub: userId, email, type: "access" },
    JWT_SECRET,
    { algorithm: JWT_ALG, expiresIn: "7d" }
  );
}

function setAuthCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.access_token;

    if (!token) {
      const header = req.headers.authorization || "";
      if (header.startsWith("Bearer ")) {
        token = header.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ detail: "Not authenticated" });
    }

    if (!JWT_SECRET) {
      return res
        .status(500)
        .json({ detail: "JWT_SECRET is not configured" });
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALG],
    });

    if (payload.type !== "access") {
      return res.status(401).json({ detail: "Invalid token type" });
    }

    const db = await getDB();

    const user = await db
      .collection("users")
      .findOne(
        { id: payload.sub },
        { projection: { password_hash: 0, _id: 0 } }
      );

    if (!user) {
      return res.status(401).json({ detail: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("[auth]", error);

    return res.status(401).json({
      detail:
        error.name === "TokenExpiredError"
          ? "Token expired"
          : "Invalid token",
    });
  }
}

// ---------------------------------------------------------------------------
// Tracking helpers
// ---------------------------------------------------------------------------

function buildTracking(order) {
  const createdAt = new Date(order.created_at).getTime();
  const now = Date.now();

  const overrideIdx = order.status_override
    ? TRACKING_STAGES.findIndex((s) => s.key === order.status_override)
    : -1;

  const timeline = TRACKING_STAGES.map((s, i) => {
    const target = new Date(createdAt + s.minutes * 60 * 1000);
    const reached = overrideIdx >= i || now >= target.getTime();

    return {
      key: s.key,
      label: s.label,
      target_at: target.toISOString(),
      completed_at: reached ? target.toISOString() : null,
      completed: reached,
    };
  });

  const lastDone = [...timeline].reverse().find((s) => s.completed);
  const current = lastDone ? lastDone.key : "confirmed";
  const estimatedDelivery = timeline[timeline.length - 1].target_at;

  return {
    timeline,
    current_status: current,
    estimated_delivery: estimatedDelivery,
  };
}

function serializeOrder(order) {
  const tracking = buildTracking(order);

  return {
    id: order.id,
    user_id: order.user_id,
    user_email: order.user_email,
    items: order.items,
    address: order.address,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    payment_method: order.payment_method,
    status: tracking.current_status,
    created_at: order.created_at,
    tracking,
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// ✅ CORS — Allow ALL origins (*) while supporting credentials
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: (origin, callback) => {
      // Dynamically echoes the requesting origin back — acts as wildcard (*)
      // but is browser-compatible with credentials: true
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "auth-token"],
  })
);

// Handle preflight OPTIONS requests for all routes
app.options("*", cors());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    service: "Shubhvika API",
    status: "ok",
    runtime: "node",
  });
});

app.get("/health", async (_req, res) => {
  try {
    const db = await getDB();
    await db.command({ ping: 1 });

    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("[health]", error);
    res.status(500).json({
      status: "error",
      database: "disconnected",
      detail: error.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Database middleware for /api
// ---------------------------------------------------------------------------

app.use("/api", async (req, res, next) => {
  try {
    const db = await getDB();
    req.app.locals.db = db;
    next();
  } catch (error) {
    console.error("[database]", error);
    res.status(500).json({
      detail: "Database connection failed",
      error: error.message,
    });
  }
});

const api = express.Router();

api.get("/", (_req, res) => {
  res.json({
    service: "Shubhvika API",
    status: "ok",
    runtime: "node",
  });
});

// ---------------------------------------------------------------------------
// Products Debug
// ---------------------------------------------------------------------------

api.get("/products-debug", async (req, res) => {
  try {
    const db = req.app.locals.db;

    const data = await db
      .collection("products")
      .aggregate([
        { $group: { _id: "$product_type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    res.json(data);
  } catch (error) {
    console.error("[products-debug]", error);
    res.status(500).json({ detail: error.message });
  }
});

// ---------------------------------------------------------------------------
// Get all products
// ---------------------------------------------------------------------------

api.get("/products", async (req, res) => {
  try {
    const db = req.app.locals.db;

    const products = await db
      .collection("products")
      .find(
        req.query.vendor ? { vendor: req.query.vendor } : {},
        { projection: { _id: 0 } }
      )
      .limit(5000)
      .toArray();

    console.log(
      `[products] MongoDB returned ${products.length} raw products`
    );

    let formattedProducts = products.map((product) => {
      const productType = String(product.product_type || "")
        .trim()
        .toLowerCase();

      const tags = Array.isArray(product.tags)
        ? product.tags.map((tag) => String(tag).trim().toLowerCase())
        : [];

      let category = "general";

      if (
        productType === "kurta set" ||
        productType === "kurta pyjama set" ||
        productType === "nehru jacket" ||
        productType === "bandhgala" ||
        productType === "sherwani" ||
        productType === "bandi waistcoat" ||
        productType === "angarkha" ||
        productType === "pathani suit" ||
        tags.includes("men") ||
        tags.includes("mens") ||
        tags.includes("men's") ||
        tags.includes("male")
      ) {
        category = "men";
      } else if (
        productType === "kurta" ||
        productType === "kurti" ||
        productType === "leggings" ||
        productType === "tunic" ||
        productType === "ethnic sets" ||
        productType === "jewellery" ||
        tags.includes("women") ||
        tags.includes("womens") ||
        tags.includes("women's") ||
        tags.includes("woman") ||
        tags.includes("female")
      ) {
        category = "women";
      } else if (
        tags.includes("kids") ||
        tags.includes("kid") ||
        tags.includes("children") ||
        tags.includes("child")
      ) {
        category = "kids";
      }

      const formatted = formatShopifyProduct(product);
      formatted.category = category;

      return formatted;
    });

    const categoryCounts = formattedProducts.reduce((counts, product) => {
      counts[product.category] = (counts[product.category] || 0) + 1;
      return counts;
    }, {});

    console.log("[products] category counts:", categoryCounts);

    if (req.query.category) {
      const requestedCategory = String(req.query.category)
        .trim()
        .toLowerCase();

      formattedProducts = formattedProducts.filter(
        (product) => product.category === requestedCategory
      );
    }

    if (req.query.product_type) {
      const requestedProductType = String(req.query.product_type)
        .trim()
        .toLowerCase();

      formattedProducts = formattedProducts.filter(
        (product) =>
          String(product.product_type || "").trim().toLowerCase() ===
          requestedProductType
      );
    }

    if (req.query.is_new !== undefined) {
      const requestedIsNew =
        String(req.query.is_new).toLowerCase() === "true";

      formattedProducts = formattedProducts.filter(
        (product) => product.is_new === requestedIsNew
      );
    }

    if (req.query.is_popular !== undefined) {
      const requestedIsPopular =
        String(req.query.is_popular).toLowerCase() === "true";

      formattedProducts = formattedProducts.filter(
        (product) => product.is_popular === requestedIsPopular
      );
    }

    console.log(
      `[products] category=${req.query.category || "all"} -> ${formattedProducts.length
      } products`
    );

    res.json({ products: formattedProducts });
  } catch (error) {
    console.error("[products]", error);
    res.status(500).json({
      detail: error.message || "Unable to fetch products",
    });
  }
});

// ---------------------------------------------------------------------------
// Get single product
// ---------------------------------------------------------------------------

api.get("/products/:id", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const productId = req.params.id;

    const product = await db.collection("products").findOne(
      {
        $or: [{ id: productId }, { id: Number(productId) }],
      },
      { projection: { _id: 0 } }
    );

    if (!product) {
      return res.status(404).json({ detail: "Product not found" });
    }

    res.json(formatShopifyProduct(product));
  } catch (error) {
    console.error("[product]", error);
    res.status(500).json({
      detail: error.message || "Unable to fetch product",
    });
  }
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

api.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ detail: "Invalid email" });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        detail: "Password must be at least 6 characters",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ detail: "Name is required" });
    }

    const db = req.app.locals.db;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await db
      .collection("users")
      .findOne({ email: normalizedEmail });

    if (existing) {
      return res.status(400).json({ detail: "Email already registered" });
    }

    const userDoc = {
      id: uuid(),
      email: normalizedEmail,
      password_hash: await hashPassword(password),
      name: name.trim(),
      role: "customer",
      created_at: new Date().toISOString(),
    };

    await db.collection("users").insertOne(userDoc);

    const token = signAccessToken(userDoc.id, normalizedEmail);
    setAuthCookie(res, token);

    res.json({
      user: {
        id: userDoc.id,
        email: normalizedEmail,
        name: userDoc.name,
        role: "customer",
      },
      access_token: token,
    });
  } catch (error) {
    console.error("[register]", error);
    res.status(500).json({
      detail: error.message || "Registration failed",
    });
  }
});

api.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || typeof password !== "string") {
      return res.status(400).json({ detail: "Invalid credentials" });
    }

    const db = req.app.locals.db;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await db
      .collection("users")
      .findOne({ email: normalizedEmail });

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ detail: "Invalid email or password" });
    }

    const token = signAccessToken(user.id, normalizedEmail);
    setAuthCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: normalizedEmail,
        name: user.name,
        role: user.role || "customer",
      },
      access_token: token,
    });
  } catch (error) {
    console.error("[login]", error);
    res.status(500).json({
      detail: error.message || "Login failed",
    });
  }
});

api.post("/auth/logout", (_req, res) => {
  res.clearCookie("access_token", { path: "/" });
  res.json({ ok: true });
});

api.get("/auth/me", requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;

  res.json({
    user: {
      id,
      email,
      name,
      role: role || "customer",
    },
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

api.post("/orders", requireAuth, async (req, res) => {
  try {
    const {
      items,
      address,
      subtotal,
      shipping = 0,
      total,
      payment_method = "COD",
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ detail: "No items in order" });
    }

    if (!address || typeof address !== "object") {
      return res
        .status(400)
        .json({ detail: "Delivery address is required" });
    }

    const db = req.app.locals.db;

    const orderId =
      "HX-" + crypto.randomBytes(5).toString("hex").toUpperCase();

    const orderDoc = {
      id: orderId,
      user_id: req.user.id,
      user_email: req.user.email,
      items,
      address,
      subtotal: Number(subtotal) || 0,
      shipping: Number(shipping) || 0,
      total: Number(total) || 0,
      payment_method,
      status_override: null,
      created_at: new Date().toISOString(),
    };

    await db.collection("orders").insertOne(orderDoc);

    res.json({
      order_id: orderId,
      status: "confirmed",
      message: "Your order has been placed successfully.",
    });
  } catch (error) {
    console.error("[create order]", error);
    res.status(500).json({
      detail: error.message || "Unable to create order",
    });
  }
});

api.get("/orders", requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const orders = await db
      .collection("orders")
      .find({ user_id: req.user.id }, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(200)
      .toArray();

    res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    console.error("[orders]", error);
    res.status(500).json({
      detail: error.message || "Unable to fetch orders",
    });
  }
});

api.get("/orders/:id", requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const order = await db.collection("orders").findOne(
      {
        id: req.params.id,
        user_id: req.user.id,
      },
      { projection: { _id: 0 } }
    );

    if (!order) {
      return res.status(404).json({ detail: "Order not found" });
    }

    res.json(serializeOrder(order));
  } catch (error) {
    console.error("[single order]", error);
    res.status(500).json({
      detail: error.message || "Unable to fetch order",
    });
  }
});

// ---------------------------------------------------------------------------
// Admin — advance order status
// ---------------------------------------------------------------------------

api.patch("/orders/:id/status", requireAuth, async (req, res) => {
  try {
    if ((req.user.role || "customer") !== "admin") {
      return res.status(403).json({ detail: "Admin only" });
    }

    const { status } = req.body || {};

    if (!TRACKING_STAGES.some((s) => s.key === status)) {
      return res.status(400).json({ detail: "Invalid status" });
    }

    const db = req.app.locals.db;

    const result = await db.collection("orders").findOneAndUpdate(
      { id: req.params.id },
      { $set: { status_override: status } },
      { returnDocument: "after", projection: { _id: 0 } }
    );

    const order = result?.value || result;

    if (!order) {
      return res.status(404).json({ detail: "Order not found" });
    }

    res.json(serializeOrder(order));
  } catch (error) {
    console.error("[admin status]", error);
    res.status(500).json({
      detail: error.message || "Unable to update order status",
    });
  }
});

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

api.post("/newsletter", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!isValidEmail(email)) {
      return res
        .status(400)
        .json({ detail: "Please enter a valid email." });
    }

    const db = req.app.locals.db;
    const normalizedEmail = email.toLowerCase().trim();

    await db.collection("newsletter").updateOne(
      { email: normalizedEmail },
      {
        $set: {
          email: normalizedEmail,
          created_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    res.json({ ok: true, message: "You're on the list." });
  } catch (error) {
    console.error("[newsletter]", error);
    res.status(500).json({
      detail: error.message || "Newsletter subscription failed",
    });
  }
});

// ---------------------------------------------------------------------------
// Mount + 404 + error handler
// ---------------------------------------------------------------------------

app.use("/api", api);

app.use("/api", (_req, res) => {
  res.status(404).json({ detail: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({
    detail: err.message || "Internal server error",
  });
});

// ---------------------------------------------------------------------------
// Vercel — DO NOT call app.listen() when imported as a module
// ---------------------------------------------------------------------------

module.exports = app;

// ---------------------------------------------------------------------------
// Local development
// ---------------------------------------------------------------------------

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[Shubhvika] API running on http://localhost:${PORT}`
    );
  });
}