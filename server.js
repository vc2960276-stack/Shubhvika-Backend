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
const DB_NAME = process.env.DB_NAME || "Shubhvika";
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
  {
    key: "confirmed",
    label: "Confirmed",
    minutes: 0,
  },
  {
    key: "packed",
    label: "Packed",
    minutes: 2,
  },
  {
    key: "shipped",
    label: "Shipped",
    minutes: 5,
  },
  {
    key: "delivered",
    label: "Delivered",
    minutes: 10,
  },
];

// ---------------------------------------------------------------------------
// Seed data — imagery + curated + generator
// ---------------------------------------------------------------------------

const IMG = (id) =>
  `https://images.unsplash.com/${id}?w=1000&q=80&auto=format&fit=crop`;

const WOMEN_IMGS = [
  [
    "photo-1490481651871-ab68de25d43d",
    "photo-1483985988355-763728e1935b",
    "photo-1595777457583-95e059d581b8",
  ],
  [
    "photo-1585487000160-6ebcfceb0d03",
    "photo-1539109136881-3be0616acf4b",
    "photo-1571908599407-cdb918ed83bf",
  ],
  [
    "photo-1594633312681-425c7b97ccd1",
    "photo-1509631179647-0177331693ae",
    "photo-1548624313-0396c75e4b1a",
  ],
  [
    "photo-1576995853123-5a10305d93c0",
    "photo-1608228088998-57828365d486",
    "photo-1618354691373-d851c5c3a990",
  ],
  [
    "photo-1591047139829-d91aecb6caea",
    "photo-1544441893-675973e31985",
    "photo-1490481651871-ab68de25d43d",
  ],
  [
    "photo-1541099649105-f69ad21f3246",
    "photo-1594633312681-425c7b97ccd1",
    "photo-1603252109303-2751441dd157",
  ],
  [
    "photo-1564257577-2d3ee9a7f7b1",
    "photo-1571908599407-cdb918ed83bf",
    "photo-1483985988355-763728e1935b",
  ],
  [
    "photo-1608228088998-57828365d486",
    "photo-1618354691373-d851c5c3a990",
    "photo-1576566588028-4147f3842f27",
  ],
];

const MEN_IMGS = [
  [
    "photo-1490578474895-699cd4e2cf59",
    "photo-1516826957135-700dedea698c",
    "photo-1552374196-1ab2a1c593e8",
  ],
  [
    "photo-1520975916090-3105956dac38",
    "photo-1552374196-c4480e293c21",
    "photo-1611601679872-6b4b64bcdd6f",
  ],
  [
    "photo-1541580621-cd769892f7b0",
    "photo-1516826957135-700dedea698c",
    "photo-1617137968427-85924c800a22",
  ],
  [
    "photo-1602810318383-e386cc2a3ccf",
    "photo-1489987707025-afc232f7ea0f",
    "photo-1603252109303-2751441dd157",
  ],
  [
    "photo-1552374196-1ab2a1c593e8",
    "photo-1611601679872-6b4b64bcdd6f",
    "photo-1516826957135-700dedea698c",
  ],
  [
    "photo-1541099649105-f69ad21f3246",
    "photo-1602810318383-e386cc2a3ccf",
    "photo-1594633312681-425c7b97ccd1",
  ],
  [
    "photo-1617137968427-85924c800a22",
    "photo-1490578474895-699cd4e2cf59",
    "photo-1552374196-1ab2a1c593e8",
  ],
  [
    "photo-1520975916090-3105956dac38",
    "photo-1516826957135-700dedea698c",
    "photo-1552374196-c4480e293c21",
  ],
];

const KIDS_IMGS = [
  [
    "photo-1519689680058-324335c77eba",
    "photo-1543269664-56d93c1b41a6",
    "photo-1522771930-78848d9293e8",
  ],
  [
    "photo-1587616211892-f743fcca64f9",
    "photo-1519689680058-324335c77eba",
    "photo-1543269664-56d93c1b41a6",
  ],
  [
    "photo-1522771930-78848d9293e8",
    "photo-1587616211892-f743fcca64f9",
    "photo-1519689680058-324335c77eba",
  ],
  [
    "photo-1543269664-56d93c1b41a6",
    "photo-1522771930-78848d9293e8",
    "photo-1587616211892-f743fcca64f9",
  ],
  [
    "photo-1519689680058-324335c77eba",
    "photo-1587616211892-f743fcca64f9",
    "photo-1522771930-78848d9293e8",
  ],
  [
    "photo-1543269664-56d93c1b41a6",
    "photo-1519689680058-324335c77eba",
    "photo-1587616211892-f743fcca64f9",
  ],
];

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL"];

const KID_SIZES = ["2Y", "4Y", "6Y", "8Y", "10Y"];

const DEFAULT_DESC =
  "A wardrobe essential crafted from premium fabrics, tailored for a refined silhouette that transitions from day into evening.";

const DEFAULT_DETAILS = [
  "Premium fabric composition",
  "Regular fit — true to size",
  "Machine wash cold, tumble dry low",
  "Imported. Ethically produced.",
];

const mk = (o) => ({
  id: o.id,
  name: o.name,
  price: o.price,
  old_price: o.old_price ?? null,
  category: o.category,
  collection: o.collection ?? null,
  is_new: !!o.is_new,
  is_popular: !!o.is_popular,
  sizes: o.sizes || DEFAULT_SIZES,
  colors: o.colors || ["Ivory", "Camel", "Espresso"],
  description: o.description || DEFAULT_DESC,
  details: o.details || DEFAULT_DETAILS,
  images: (o.images || []).map(IMG),
});

const SEED_PRODUCTS = (() => {
  const curated = [
    // WOMEN
    mk({
      id: "w-101",
      name: "Cashmere Draped Blazer",
      price: 14999,
      old_price: 19999,
      category: "women",
      is_popular: true,
      collection: "Winter Monochrome",
      colors: ["Ivory", "Camel", "Charcoal"],
      images: WOMEN_IMGS[0],
    }),

    mk({
      id: "w-102",
      name: "Silk Slip Midi Dress",
      price: 11499,
      category: "women",
      is_new: true,
      is_popular: true,
      colors: ["Espresso", "Sand"],
      images: WOMEN_IMGS[1],
    }),

    mk({
      id: "w-103",
      name: "Wool Tailored Trouser",
      price: 10299,
      category: "women",
      is_popular: true,
      colors: ["Camel", "Espresso", "Ivory"],
      images: WOMEN_IMGS[2],
    }),

    mk({
      id: "w-104",
      name: "Oversized Knit Sweater",
      price: 7799,
      old_price: 10999,
      category: "women",
      is_new: true,
      colors: ["Cream", "Sand"],
      images: WOMEN_IMGS[3],
    }),

    mk({
      id: "w-105",
      name: "Editorial Trench Coat",
      price: 21499,
      category: "women",
      is_popular: true,
      collection: "Signature",
      colors: ["Camel", "Espresso"],
      images: WOMEN_IMGS[4],
    }),

    mk({
      id: "w-106",
      name: "High-Waist Denim",
      price: 6299,
      category: "women",
      is_new: true,
      colors: ["Ecru", "Deep Indigo"],
      images: WOMEN_IMGS[5],
    }),

    mk({
      id: "w-107",
      name: "Silk Neckerchief Blouse",
      price: 9199,
      category: "women",
      colors: ["Ivory", "Camel"],
      images: WOMEN_IMGS[6],
    }),

    mk({
      id: "w-108",
      name: "Merino Turtleneck",
      price: 7099,
      category: "women",
      is_popular: true,
      colors: ["Cream", "Espresso", "Camel"],
      images: WOMEN_IMGS[7],
    }),

    // MEN
    mk({
      id: "m-201",
      name: "Structured Wool Overcoat",
      price: 22999,
      category: "men",
      is_new: true,
      collection: "Signature",
      colors: ["Camel", "Charcoal"],
      images: MEN_IMGS[0],
    }),

    mk({
      id: "m-202",
      name: "Fine Gauge Merino Sweater",
      price: 9499,
      category: "men",
      is_popular: true,
      colors: ["Ivory", "Espresso", "Olive"],
      images: MEN_IMGS[1],
    }),

    mk({
      id: "m-203",
      name: "Slim Tailored Chino",
      price: 7099,
      category: "men",
      is_popular: true,
      colors: ["Camel", "Stone", "Espresso"],
      images: MEN_IMGS[2],
    }),

    mk({
      id: "m-204",
      name: "Cotton Poplin Shirt",
      price: 6299,
      old_price: 7899,
      category: "men",
      colors: ["White", "Sand"],
      images: MEN_IMGS[3],
    }),

    mk({
      id: "m-205",
      name: "Cashmere Blend Cardigan",
      price: 14299,
      category: "men",
      is_new: true,
      colors: ["Cream", "Camel"],
      images: MEN_IMGS[4],
    }),

    mk({
      id: "m-206",
      name: "Selvedge Denim Jean",
      price: 10299,
      category: "men",
      is_popular: true,
      colors: ["Raw Indigo", "Ecru"],
      images: MEN_IMGS[5],
    }),

    mk({
      id: "m-207",
      name: "Linen Blend Trouser",
      price: 7899,
      category: "men",
      colors: ["Sand", "Espresso"],
      images: MEN_IMGS[6],
    }),

    mk({
      id: "m-208",
      name: "Heritage Wool Blazer",
      price: 19899,
      category: "men",
      collection: "Signature",
      colors: ["Charcoal", "Camel"],
      images: MEN_IMGS[7],
    }),

    // KIDS
    mk({
      id: "k-301",
      name: "Organic Cotton Tee",
      price: 1499,
      category: "kids",
      is_popular: true,
      sizes: KID_SIZES,
      colors: ["Cream", "Sand"],
      images: KIDS_IMGS[0],
    }),

    mk({
      id: "k-302",
      name: "Cozy Knit Jumper",
      price: 2499,
      category: "kids",
      is_new: true,
      sizes: KID_SIZES.slice(0, 4),
      colors: ["Camel", "Ivory"],
      images: KIDS_IMGS[1],
    }),

    mk({
      id: "k-303",
      name: "Soft Denim Overall",
      price: 2999,
      category: "kids",
      sizes: KID_SIZES.slice(0, 4),
      colors: ["Ecru"],
      images: KIDS_IMGS[2],
    }),

    mk({
      id: "k-304",
      name: "Wool Blend Coat",
      price: 4999,
      category: "kids",
      is_new: true,
      is_popular: true,
      sizes: KID_SIZES.slice(1),
      colors: ["Camel", "Espresso"],
      images: KIDS_IMGS[3],
    }),

    mk({
      id: "k-305",
      name: "Corduroy Trouser",
      price: 1999,
      category: "kids",
      sizes: KID_SIZES.slice(0, 4),
      colors: ["Sand", "Espresso"],
      images: KIDS_IMGS[4],
    }),

    mk({
      id: "k-306",
      name: "Cotton Poplin Dress",
      price: 2299,
      category: "kids",
      is_new: true,
      sizes: KID_SIZES.slice(0, 4),
      colors: ["Ivory", "Sand"],
      images: KIDS_IMGS[5],
    }),
  ];

  const ADULT_SIZES_STD = ["XS", "S", "M", "L", "XL", "XXL"];

  const KID_SIZES_STD = ["2Y", "4Y", "6Y", "8Y", "10Y", "12Y"];

  const ONE_SIZE = ["ONE SIZE"];

  const MATERIALS = [
    "Cotton",
    "Linen",
    "Silk",
    "Wool",
    "Cashmere",
    "Merino",
    "Organic Cotton",
    "Modal",
    "Viscose",
    "Denim",
    "Suede",
    "Corduroy",
    "Satin",
    "Chiffon",
    "Tweed",
    "Recycled Wool",
  ];

  const ADJECTIVES = [
    "Draped",
    "Tailored",
    "Oversized",
    "Slim",
    "Relaxed",
    "Cropped",
    "Wide-Leg",
    "High-Waist",
    "Editorial",
    "Signature",
    "Heritage",
    "Structured",
    "Sculpted",
    "Minimalist",
    "Classic",
    "Modern",
    "Vintage",
    "Fluid",
    "Boxy",
    "Asymmetric",
    "Ribbed",
    "Cable-Knit",
    "Textured",
    "Pleated",
    "Belted",
  ];

  const WOMEN_COLORS = [
    "Ivory",
    "Camel",
    "Espresso",
    "Charcoal",
    "Sand",
    "Ecru",
    "Cream",
    "Blush",
    "Olive",
    "Terracotta",
    "Navy",
    "Blackberry",
    "Emerald",
    "Rose",
    "Champagne",
    "Stone",
  ];

  const MEN_COLORS = [
    "White",
    "Ivory",
    "Camel",
    "Charcoal",
    "Espresso",
    "Navy",
    "Olive",
    "Stone",
    "Sand",
    "Raw Indigo",
    "Deep Indigo",
    "Bottle Green",
    "Burgundy",
    "Grey",
    "Slate",
    "Khaki",
  ];

  const KIDS_COLORS = [
    "Cream",
    "Sand",
    "Camel",
    "Espresso",
    "Ivory",
    "Rose",
    "Sky",
    "Sage",
    "Berry",
    "Sunshine",
    "Powder",
    "Mint",
  ];

  const WOMEN_TYPES = [
    {
      type: "Dress",
      count: 30,
      base: [
        "Silk Slip Dress",
        "Midi Dress",
        "Maxi Dress",
        "Mini Dress",
        "Shift Dress",
        "Wrap Dress",
        "A-Line Dress",
        "Sheath Dress",
        "Bodycon Dress",
        "Off-Shoulder Dress",
        "Sundress",
        "Party Dress",
      ],
      min: 3999,
      max: 14999,
      collection: "Editorial",
    },

    {
      type: "Blouse",
      count: 20,
      base: [
        "Blouse",
        "Ruffle Blouse",
        "Peasant Blouse",
        "Silk Shirt",
        "Satin Shirt",
        "Puff-Sleeve Top",
        "Tie-Neck Blouse",
      ],
      min: 2499,
      max: 7999,
    },

    {
      type: "Top",
      count: 18,
      base: [
        "T-Shirt",
        "Tank",
        "Camisole",
        "Halter Top",
        "Bodysuit",
        "Crop Top",
        "Long Sleeve Tee",
        "Rib Tank",
      ],
      min: 999,
      max: 3999,
    },

    {
      type: "Knitwear",
      count: 25,
      base: [
        "Sweater",
        "Turtleneck",
        "Cardigan",
        "Poncho",
        "Pullover",
        "Zip-Up Knit",
        "V-Neck Knit",
        "Knit Vest",
      ],
      min: 3999,
      max: 12999,
    },

    {
      type: "Outerwear",
      count: 20,
      base: [
        "Trench Coat",
        "Wool Coat",
        "Blazer",
        "Peacoat",
        "Puffer Jacket",
        "Denim Jacket",
        "Leather Jacket",
        "Bomber Jacket",
        "Parka",
      ],
      min: 6999,
      max: 34999,
      collection: "Signature",
    },

    {
      type: "Bottom",
      count: 25,
      base: [
        "Trouser",
        "Wide-Leg Pant",
        "Straight Jean",
        "Skinny Jean",
        "Bootcut Jean",
        "Palazzo",
        "Culottes",
        "Midi Skirt",
        "Mini Skirt",
        "Maxi Skirt",
        "Shorts",
        "Mom Jean",
      ],
      min: 1999,
      max: 7999,
    },

    {
      type: "Ethnic",
      count: 25,
      base: [
        "Anarkali Kurta",
        "Straight Kurta",
        "Saree",
        "Lehenga",
        "Sharara Set",
        "Palazzo Set",
        "Kurta Set",
        "Salwar Suit",
        "Anarkali Set",
        "Dupatta",
      ],
      min: 2499,
      max: 24999,
      collection: "Ethnic Atelier",
    },

    {
      type: "Activewear",
      count: 15,
      base: [
        "Yoga Pant",
        "Sports Bra",
        "Legging",
        "Track Suit",
        "Athleisure Hoodie",
        "Workout Tee",
        "Sports Tank",
        "Windbreaker",
      ],
      min: 1499,
      max: 5999,
    },

    {
      type: "Accessory",
      count: 22,
      base: [
        "Silk Scarf",
        "Cashmere Wrap",
        "Leather Belt",
        "Mini Bag",
        "Tote Bag",
        "Crossbody Bag",
        "Sunglasses",
        "Beanie",
        "Beret",
        "Wool Scarf",
        "Bucket Hat",
        "Silk Hair Clip",
      ],
      min: 999,
      max: 9999,
      sizes: ONE_SIZE,
    },
  ];

  const MEN_TYPES = [
    {
      type: "Shirt",
      count: 30,
      base: [
        "Poplin Shirt",
        "Linen Shirt",
        "Oxford Shirt",
        "Denim Shirt",
        "Flannel Shirt",
        "Chambray Shirt",
        "Silk Shirt",
        "Camp Collar Shirt",
        "Formal Shirt",
        "Overshirt",
      ],
      min: 1999,
      max: 6999,
    },

    {
      type: "Tee",
      count: 25,
      base: [
        "Crew Neck Tee",
        "V-Neck Tee",
        "Long Sleeve Tee",
        "Polo",
        "Henley",
        "Ringer Tee",
        "Pocket Tee",
        "Graphic Tee",
      ],
      min: 999,
      max: 2999,
    },

    {
      type: "Knitwear",
      count: 22,
      base: [
        "Sweater",
        "Cardigan",
        "Zip Neck Knit",
        "Turtleneck",
        "Crewneck Knit",
        "Cable-Knit Jumper",
        "Half-Zip Knit",
        "Rollneck",
      ],
      min: 3499,
      max: 12999,
    },

    {
      type: "Outerwear",
      count: 22,
      base: [
        "Wool Overcoat",
        "Trench Coat",
        "Blazer",
        "Peacoat",
        "Puffer Jacket",
        "Denim Jacket",
        "Leather Jacket",
        "Bomber",
        "Field Jacket",
        "Parka",
        "Suede Jacket",
      ],
      min: 6499,
      max: 39999,
      collection: "Signature",
    },

    {
      type: "Bottom",
      count: 28,
      base: [
        "Chino",
        "Wool Trouser",
        "Straight Jean",
        "Slim Jean",
        "Selvedge Denim",
        "Cargo Pant",
        "Short",
        "Linen Trouser",
        "Track Trouser",
        "Corduroy Trouser",
      ],
      min: 1999,
      max: 7999,
    },

    {
      type: "Ethnic",
      count: 22,
      base: [
        "Kurta",
        "Nehru Jacket",
        "Bandhgala",
        "Sherwani",
        "Kurta Pyjama Set",
        "Bandi Waistcoat",
        "Angarkha",
        "Pathani Suit",
      ],
      min: 2499,
      max: 29999,
      collection: "Ethnic Atelier",
    },

    {
      type: "Activewear",
      count: 20,
      base: [
        "Hoodie",
        "Sweatshirt",
        "Jogger",
        "Track Pant",
        "Athletic Short",
        "Tank",
        "Training Tee",
        "Windbreaker",
        "Compression Tee",
      ],
      min: 1499,
      max: 5999,
    },

    {
      type: "Accessory",
      count: 11,
      base: [
        "Leather Belt",
        "Silk Tie",
        "Wool Scarf",
        "Cap",
        "Beanie",
        "Leather Wallet",
        "Weekender Bag",
        "Sunglasses",
        "Pocket Square",
      ],
      min: 999,
      max: 9999,
      sizes: ONE_SIZE,
    },
  ];

  const KIDS_TYPES = [
    {
      type: "Top",
      count: 20,
      base: [
        "Cotton Tee",
        "Long Sleeve Tee",
        "Polo",
        "Shirt",
        "Sweatshirt",
        "Hoodie",
        "Rugby Tee",
      ],
      min: 599,
      max: 2499,
      sizes: KID_SIZES_STD,
    },

    {
      type: "Bottom",
      count: 15,
      base: [
        "Jogger",
        "Legging",
        "Jean",
        "Corduroy Pant",
        "Short",
        "Chino",
        "Track Pant",
      ],
      min: 799,
      max: 2999,
      sizes: KID_SIZES_STD,
    },

    {
      type: "Dress",
      count: 12,
      base: [
        "Cotton Frock",
        "Pinafore",
        "Party Dress",
        "Sundress",
        "Jumper Dress",
        "Twirl Dress",
      ],
      min: 1299,
      max: 4999,
      sizes: KID_SIZES_STD,
    },

    {
      type: "Outerwear",
      count: 10,
      base: [
        "Wool Coat",
        "Puffer Jacket",
        "Denim Jacket",
        "Cardigan",
        "Anorak",
        "Fleece Jacket",
      ],
      min: 1999,
      max: 7999,
      sizes: KID_SIZES_STD,
    },

    {
      type: "Sleepwear",
      count: 8,
      base: [
        "PJ Set",
        "Night Suit",
        "Onesie",
        "Sleepshirt",
      ],
      min: 899,
      max: 2999,
      sizes: KID_SIZES_STD,
    },

    {
      type: "Ethnic",
      count: 10,
      base: [
        "Kurta",
        "Lehenga Set",
        "Sherwani Set",
        "Kurta Pyjama",
        "Anarkali Set",
      ],
      min: 1799,
      max: 8999,
      sizes: KID_SIZES_STD,
      collection: "Ethnic Atelier",
    },

    {
      type: "Accessory",
      count: 5,
      base: [
        "Beanie",
        "Backpack",
        "Cap",
        "Scarf",
        "Mittens",
      ],
      min: 599,
      max: 2499,
      sizes: ONE_SIZE,
    },
  ];

  // Deterministic RNG
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);

      t = Math.imul(t ^ (t >>> 15), t | 1);

      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (rng, arr) =>
    arr[Math.floor(rng() * arr.length)];

  const pickN = (rng, arr, n) => {
    const copy = [...arr];
    const out = [];

    for (
      let i = 0;
      i < n && copy.length;
      i++
    ) {
      out.push(
        copy.splice(
          Math.floor(rng() * copy.length),
          1
        )[0]
      );
    }

    return out;
  };

  const round99 = (v) =>
    Math.max(
      199,
      Math.round(v / 100) * 100 - 1
    );

  function generateCategory({
    prefix,
    startId,
    category,
    types,
    colorPool,
    imagePool,
  }) {
    const items = [];

    const flatImages = [
      ...new Set(imagePool.flat()),
    ];

    let idx = startId;

    for (const t of types) {
      for (let i = 0; i < t.count; i++) {
        const productSeed =
          prefix.charCodeAt(0) * 100000 + idx;

        const rng = mulberry32(productSeed);

        const material = pick(rng, MATERIALS);
        const adj = pick(rng, ADJECTIVES);
        const baseName = pick(rng, t.base);

        const nameParts =
          t.type === "Accessory" ||
            t.type === "Ethnic"
            ? [adj, baseName]
            : [material, adj, baseName];

        const name = nameParts.join(" ");

        const price = round99(
          t.min +
          rng() * (t.max - t.min)
        );

        const hasDiscount = rng() < 0.28;

        const old_price = hasDiscount
          ? round99(
            price *
            (1.18 + rng() * 0.32)
          )
          : null;

        const is_new = rng() < 0.22;

        const is_popular = rng() < 0.18;

        const numColors =
          2 + Math.floor(rng() * 3);

        const colors = pickN(
          rng,
          colorPool,
          numColors
        );

        const imgIdx =
          (idx * 7) % flatImages.length;

        const images = [
          flatImages[imgIdx],
          flatImages[
          (imgIdx + 3) % flatImages.length
          ],
          flatImages[
          (imgIdx + 5) % flatImages.length
          ],
        ];

        items.push(
          mk({
            id: `${prefix}-${String(idx).padStart(
              4,
              "0"
            )}`,
            name,
            price,
            old_price,
            category,
            collection: t.collection || null,
            is_new,
            is_popular,
            sizes:
              t.sizes ||
              (category === "kids"
                ? KID_SIZES_STD
                : ADULT_SIZES_STD),
            colors,
            images,
            description: `${name} — a considered piece in ${material.toLowerCase()}, cut for a ${adj.toLowerCase()} silhouette that layers beautifully across the season.`,
          })
        );

        idx += 1;
      }
    }

    return items;
  }

  const generated = [
    ...generateCategory({
      prefix: "w",
      startId: 1000,
      category: "women",
      types: WOMEN_TYPES,
      colorPool: WOMEN_COLORS,
      imagePool: WOMEN_IMGS,
    }),

    ...generateCategory({
      prefix: "m",
      startId: 1000,
      category: "men",
      types: MEN_TYPES,
      colorPool: MEN_COLORS,
      imagePool: MEN_IMGS,
    }),

    ...generateCategory({
      prefix: "k",
      startId: 1000,
      category: "kids",
      types: KIDS_TYPES,
      colorPool: KIDS_COLORS,
      imagePool: KIDS_IMGS,
    }),
  ];

  return [...curated, ...generated];
})();

// ---------------------------------------------------------------------------
// Shopify MongoDB product formatter
// ---------------------------------------------------------------------------

function formatShopifyProduct(product) {
  const variants = Array.isArray(product.variants)
    ? product.variants
    : [];

  const firstVariant = variants[0] || {};

  const images = Array.isArray(product.images)
    ? product.images
      .map((image) => image?.src)
      .filter(Boolean)
    : [];

  const price = Number(firstVariant.price) || 0;

  const compareAtPrice = firstVariant.compare_at_price
    ? Number(firstVariant.compare_at_price)
    : null;

  // ---------------------------------------------------------
  // PRODUCT TYPE
  // ---------------------------------------------------------
  const productType = String(
    product.product_type || "General"
  ).trim();

  const normalizedProductType = productType.toLowerCase();

  // ---------------------------------------------------------
  // TAGS
  // ---------------------------------------------------------
  const tags = Array.isArray(product.tags)
    ? product.tags
    : [];

  const normalizedTags = tags.map((tag) =>
    String(tag).trim().toLowerCase()
  );

  const hasAnyTag = (...values) =>
    values.some((value) =>
      normalizedTags.includes(value)
    );

  // ---------------------------------------------------------
  // CATEGORY
  // ---------------------------------------------------------
  let category = "general";

  // MEN
  if (
    hasAnyTag(
      "men",
      "mens",
      "men's",
      "man",
      "male"
    ) ||
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
  }

  // WOMEN
  else if (
    hasAnyTag(
      "women",
      "womens",
      "women's",
      "woman",
      "female"
    ) ||
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
  }

  // KIDS
  else if (
    hasAnyTag(
      "kids",
      "kid",
      "children",
      "child"
    )
  ) {
    category = "kids";
  }

  // ---------------------------------------------------------
  // OPTIONS
  // ---------------------------------------------------------
  const options = Array.isArray(product.options)
    ? product.options
    : [];

  const sizeOption = options.find(
    (option) =>
      String(option?.name || "")
        .trim()
        .toLowerCase() === "size"
  );

  const colorOption = options.find(
    (option) =>
      String(option?.name || "")
        .trim()
        .toLowerCase() === "color"
  );

  const sizes =
    Array.isArray(sizeOption?.values)
      ? sizeOption.values
      : [];

  const colors =
    Array.isArray(colorOption?.values)
      ? colorOption.values
      : [];

  // ---------------------------------------------------------
  // NEW PRODUCT
  // ---------------------------------------------------------
  const createdAt = product.created_at
    ? new Date(product.created_at)
    : null;

  const isNewByDate =
    createdAt &&
      !Number.isNaN(createdAt.getTime())
      ? Date.now() - createdAt.getTime() <=
      30 * 24 * 60 * 60 * 1000
      : false;

  const isNewByTag = hasAnyTag(
    "new",
    "new arrival",
    "new arrivals"
  );

  const isNew = isNewByDate || isNewByTag;

  // ---------------------------------------------------------
  // POPULAR
  // ---------------------------------------------------------
  const isPopular = normalizedTags.some(
    (tag) =>
      tag.includes("popular") ||
      tag.includes("best seller") ||
      tag.includes("bestseller")
  );

  // ---------------------------------------------------------
  // FINAL RESPONSE
  // ---------------------------------------------------------
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

    sizes: sizes.length
      ? sizes
      : ["ONE SIZE"],

    colors: colors.length
      ? colors
      : ["Default"],

    description: product.body_html || "",

    details: [],

    images,

    variants: variants.map((variant) => ({
      id: String(variant.id),

      title: variant.title,

      sku: variant.sku,

      price: Number(variant.price) || 0,

      compare_at_price:
        variant.compare_at_price
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
    throw new Error(
      "JWT_SECRET environment variable is missing"
    );
  }

  return jwt.sign(
    {
      sub: userId,
      email,
      type: "access",
    },
    JWT_SECRET,
    {
      algorithm: JWT_ALG,
      expiresIn: "7d",
    }
  );
}

function setAuthCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge:
      7 * 24 * 3600 * 1000,
  });
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

async function requireAuth(
  req,
  res,
  next
) {
  try {
    let token =
      req.cookies?.access_token;

    if (!token) {
      const header =
        req.headers.authorization || "";

      if (
        header.startsWith("Bearer ")
      ) {
        token =
          header.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({
        detail: "Not authenticated",
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        detail:
          "JWT_SECRET is not configured",
      });
    }

    const payload =
      jwt.verify(
        token,
        JWT_SECRET,
        {
          algorithms: [JWT_ALG],
        }
      );

    if (
      payload.type !== "access"
    ) {
      return res.status(401).json({
        detail:
          "Invalid token type",
      });
    }

    const db = await getDB();

    const user =
      await db
        .collection("users")
        .findOne(
          {
            id: payload.sub,
          },
          {
            projection: {
              password_hash: 0,
              _id: 0,
            },
          }
        );

    if (!user) {
      return res.status(401).json({
        detail: "User not found",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error(
      "[auth]",
      error
    );

    return res.status(401).json({
      detail:
        error.name ===
          "TokenExpiredError"
          ? "Token expired"
          : "Invalid token",
    });
  }
}

// ---------------------------------------------------------------------------
// Tracking helpers
// ---------------------------------------------------------------------------

function buildTracking(order) {
  const createdAt =
    new Date(
      order.created_at
    ).getTime();

  const now = Date.now();

  const overrideIdx =
    order.status_override
      ? TRACKING_STAGES.findIndex(
        (s) =>
          s.key ===
          order.status_override
      )
      : -1;

  const timeline =
    TRACKING_STAGES.map(
      (s, i) => {
        const target =
          new Date(
            createdAt +
            s.minutes *
            60 *
            1000
          );

        const reached =
          overrideIdx >= i ||
          now >= target.getTime();

        return {
          key: s.key,
          label: s.label,
          target_at:
            target.toISOString(),
          completed_at:
            reached
              ? target.toISOString()
              : null,
          completed:
            reached,
        };
      }
    );

  const lastDone =
    [...timeline]
      .reverse()
      .find(
        (s) => s.completed
      );

  const current =
    lastDone
      ? lastDone.key
      : "confirmed";

  const estimatedDelivery =
    timeline[
      timeline.length - 1
    ].target_at;

  return {
    timeline,
    current_status:
      current,
    estimated_delivery:
      estimatedDelivery,
  };
}

function serializeOrder(order) {
  const tracking =
    buildTracking(order);

  return {
    id: order.id,

    user_id:
      order.user_id,

    user_email:
      order.user_email,

    items:
      order.items,

    address:
      order.address,

    subtotal:
      order.subtotal,

    shipping:
      order.shipping,

    total:
      order.total,

    payment_method:
      order.payment_method,

    status:
      tracking.current_status,

    created_at:
      order.created_at,

    tracking,
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(cookieParser());

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
  })
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get(
  "/",
  (_req, res) => {
    res.json({
      service:
        "HIMAANIX API",
      status: "ok",
      runtime: "node",
    });
  }
);

app.get(
  "/health",
  async (_req, res) => {
    try {
      const db =
        await getDB();

      await db.command({
        ping: 1,
      });

      res.json({
        status: "ok",
        database:
          "connected",
      });
    } catch (error) {
      console.error(
        "[health]",
        error
      );

      res.status(500).json({
        status: "error",
        database:
          "disconnected",
        detail:
          error.message,
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Database middleware for /api
// ---------------------------------------------------------------------------

app.use(
  "/api",
  async (
    req,
    res,
    next
  ) => {
    try {
      const db =
        await getDB();

      req.app.locals.db =
        db;

      next();
    } catch (error) {
      console.error(
        "[database]",
        error
      );

      res.status(500).json({
        detail:
          "Database connection failed",
        error:
          error.message,
      });
    }
  }
);

const api =
  express.Router();

api.get(
  "/",
  (_req, res) => {
    res.json({
      service:
        "HIMAANIX API",
      status: "ok",
      runtime: "node",
    });
  }
);

// ---------------------------------------------------------------------------
// Products Debug
// ---------------------------------------------------------------------------

api.get(
  "/products-debug",
  async (req, res) => {
    try {
      const db =
        req.app.locals.db;

      const data =
        await db
          .collection("products")
          .aggregate([
            {
              $group: {
                _id:
                  "$product_type",
                count: {
                  $sum: 1,
                },
              },
            },

            {
              $sort: {
                count: -1,
              },
            },
          ])
          .toArray();

      res.json(data);
    } catch (error) {
      console.error(
        "[products-debug]",
        error
      );

      res.status(500).json({
        detail:
          error.message,
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Get all products
// ---------------------------------------------------------------------------

api.get("/products", async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Get products directly from MongoDB
    const products = await db
      .collection("products")
      .find(
        req.query.vendor
          ? { vendor: req.query.vendor }
          : {},
        { projection: { _id: 0 } }
      )
      .limit(5000)
      .toArray();

    console.log(
      `[products] MongoDB returned ${products.length} raw products`
    );

    // ---------------------------------------------------------
    // FORMAT + CATEGORY
    // ---------------------------------------------------------
    let formattedProducts = products.map((product) => {
      const productType = String(
        product.product_type || ""
      )
        .trim()
        .toLowerCase();

      const tags = Array.isArray(product.tags)
        ? product.tags.map((tag) =>
          String(tag).trim().toLowerCase()
        )
        : [];

      let category = "general";

      // =========================
      // MEN
      // =========================
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
      }

      // =========================
      // WOMEN
      // =========================
      else if (
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
      }

      // =========================
      // KIDS
      // =========================
      else if (
        tags.includes("kids") ||
        tags.includes("kid") ||
        tags.includes("children") ||
        tags.includes("child")
      ) {
        category = "kids";
      }

      // Use your existing formatter
      const formatted = formatShopifyProduct(product);

      // IMPORTANT:
      // Override formatter category with the category
      // calculated directly above.
      formatted.category = category;

      return formatted;
    });

    // ---------------------------------------------------------
    // DEBUG CATEGORY COUNTS
    // ---------------------------------------------------------
    const categoryCounts = formattedProducts.reduce(
      (counts, product) => {
        counts[product.category] =
          (counts[product.category] || 0) + 1;

        return counts;
      },
      {}
    );

    console.log(
      "[products] category counts:",
      categoryCounts
    );

    // ---------------------------------------------------------
    // CATEGORY FILTER
    // ---------------------------------------------------------
    if (req.query.category) {
      const requestedCategory = String(
        req.query.category
      )
        .trim()
        .toLowerCase();

      formattedProducts = formattedProducts.filter(
        (product) =>
          product.category === requestedCategory
      );
    }

    // ---------------------------------------------------------
    // PRODUCT TYPE FILTER
    // ---------------------------------------------------------
    if (req.query.product_type) {
      const requestedProductType = String(
        req.query.product_type
      )
        .trim()
        .toLowerCase();

      formattedProducts = formattedProducts.filter(
        (product) =>
          String(product.product_type || "")
            .trim()
            .toLowerCase() === requestedProductType
      );
    }

    // ---------------------------------------------------------
    // NEW FILTER
    // ---------------------------------------------------------
    if (req.query.is_new !== undefined) {
      const requestedIsNew =
        String(req.query.is_new).toLowerCase() ===
        "true";

      formattedProducts = formattedProducts.filter(
        (product) =>
          product.is_new === requestedIsNew
      );
    }

    // ---------------------------------------------------------
    // POPULAR FILTER
    // ---------------------------------------------------------
    if (req.query.is_popular !== undefined) {
      const requestedIsPopular =
        String(req.query.is_popular).toLowerCase() ===
        "true";

      formattedProducts = formattedProducts.filter(
        (product) =>
          product.is_popular === requestedIsPopular
      );
    }

    console.log(
      `[products] category=${req.query.category || "all"
      } -> ${formattedProducts.length} products`
    );

    res.json({
      products: formattedProducts,
    });
  } catch (error) {
    console.error("[products]", error);

    res.status(500).json({
      detail:
        error.message ||
        "Unable to fetch products",
    });
  }
});
// ---------------------------------------------------------------------------
// Get single product
// ---------------------------------------------------------------------------

api.get(
  "/products/:id",
  async (req, res) => {
    try {
      const db =
        req.app.locals.db;

      const productId =
        req.params.id;

      const product =
        await db
          .collection("products")
          .findOne(
            {
              $or: [
                {
                  id: productId,
                },
                {
                  id: Number(
                    productId
                  ),
                },
              ],
            },
            {
              projection: {
                _id: 0,
              },
            }
          );

      if (!product) {
        return res
          .status(404)
          .json({
            detail:
              "Product not found",
          });
      }

      res.json(
        formatShopifyProduct(
          product
        )
      );
    } catch (error) {
      console.error(
        "[product]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Unable to fetch product",
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

api.post(
  "/auth/register",
  async (req, res) => {
    try {
      const {
        email,
        password,
        name,
      } = req.body || {};

      if (!isValidEmail(email)) {
        return res.status(400).json({
          detail:
            "Invalid email",
        });
      }

      if (
        typeof password !==
        "string" ||
        password.length < 6
      ) {
        return res.status(400).json({
          detail:
            "Password must be at least 6 characters",
        });
      }

      if (
        typeof name !==
        "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          detail:
            "Name is required",
        });
      }

      const db =
        req.app.locals.db;

      const normalizedEmail =
        email
          .toLowerCase()
          .trim();

      const existing =
        await db
          .collection("users")
          .findOne({
            email:
              normalizedEmail,
          });

      if (existing) {
        return res.status(400).json({
          detail:
            "Email already registered",
        });
      }

      const userDoc = {
        id: uuid(),

        email:
          normalizedEmail,

        password_hash:
          await hashPassword(
            password
          ),

        name:
          name.trim(),

        role:
          "customer",

        created_at:
          new Date().toISOString(),
      };

      await db
        .collection("users")
        .insertOne(
          userDoc
        );

      const token =
        signAccessToken(
          userDoc.id,
          normalizedEmail
        );

      setAuthCookie(
        res,
        token
      );

      res.json({
        user: {
          id: userDoc.id,
          email:
            normalizedEmail,
          name:
            userDoc.name,
          role:
            "customer",
        },

        access_token:
          token,
      });
    } catch (error) {
      console.error(
        "[register]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Registration failed",
      });
    }
  }
);

api.post(
  "/auth/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body || {};

      if (
        !isValidEmail(email) ||
        typeof password !==
        "string"
      ) {
        return res.status(400).json({
          detail:
            "Invalid credentials",
        });
      }

      const db =
        req.app.locals.db;

      const normalizedEmail =
        email
          .toLowerCase()
          .trim();

      const user =
        await db
          .collection("users")
          .findOne({
            email:
              normalizedEmail,
          });

      if (
        !user ||
        !(await verifyPassword(
          password,
          user.password_hash
        ))
      ) {
        return res.status(401).json({
          detail:
            "Invalid email or password",
        });
      }

      const token =
        signAccessToken(
          user.id,
          normalizedEmail
        );

      setAuthCookie(
        res,
        token
      );

      res.json({
        user: {
          id: user.id,
          email:
            normalizedEmail,
          name:
            user.name,
          role:
            user.role ||
            "customer",
        },

        access_token:
          token,
      });
    } catch (error) {
      console.error(
        "[login]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Login failed",
      });
    }
  }
);

api.post(
  "/auth/logout",
  (_req, res) => {
    res.clearCookie(
      "access_token",
      {
        path: "/",
      }
    );

    res.json({
      ok: true,
    });
  }
);

api.get(
  "/auth/me",
  requireAuth,
  (req, res) => {
    const {
      id,
      email,
      name,
      role,
    } = req.user;

    res.json({
      user: {
        id,
        email,
        name,
        role:
          role ||
          "customer",
      },
    });
  }
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

api.post(
  "/orders",
  requireAuth,
  async (req, res) => {
    try {
      const {
        items,
        address,
        subtotal,
        shipping = 0,
        total,
        payment_method = "COD",
      } = req.body || {};

      if (
        !Array.isArray(
          items
        ) ||
        items.length === 0
      ) {
        return res.status(400).json({
          detail:
            "No items in order",
        });
      }

      if (
        !address ||
        typeof address !==
        "object"
      ) {
        return res.status(400).json({
          detail:
            "Delivery address is required",
        });
      }

      const db =
        req.app.locals.db;

      const orderId =
        "HX-" +
        crypto
          .randomBytes(5)
          .toString("hex")
          .toUpperCase();

      const orderDoc = {
        id: orderId,

        user_id:
          req.user.id,

        user_email:
          req.user.email,

        items,

        address,

        subtotal:
          Number(subtotal) ||
          0,

        shipping:
          Number(shipping) ||
          0,

        total:
          Number(total) ||
          0,

        payment_method,

        status_override:
          null,

        created_at:
          new Date().toISOString(),
      };

      await db
        .collection("orders")
        .insertOne(
          orderDoc
        );

      res.json({
        order_id:
          orderId,

        status:
          "confirmed",

        message:
          "Your order has been placed successfully.",
      });
    } catch (error) {
      console.error(
        "[create order]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Unable to create order",
      });
    }
  }
);

api.get(
  "/orders",
  requireAuth,
  async (req, res) => {
    try {
      const db =
        req.app.locals.db;

      const orders =
        await db
          .collection("orders")
          .find(
            {
              user_id:
                req.user.id,
            },
            {
              projection: {
                _id: 0,
              },
            }
          )
          .sort({
            created_at: -1,
          })
          .limit(200)
          .toArray();

      res.json({
        orders:
          orders.map(
            serializeOrder
          ),
      });
    } catch (error) {
      console.error(
        "[orders]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Unable to fetch orders",
      });
    }
  }
);

api.get(
  "/orders/:id",
  requireAuth,
  async (req, res) => {
    try {
      const db =
        req.app.locals.db;

      const order =
        await db
          .collection("orders")
          .findOne(
            {
              id:
                req.params.id,

              user_id:
                req.user.id,
            },
            {
              projection: {
                _id: 0,
              },
            }
          );

      if (!order) {
        return res
          .status(404)
          .json({
            detail:
              "Order not found",
          });
      }

      res.json(
        serializeOrder(
          order
        )
      );
    } catch (error) {
      console.error(
        "[single order]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Unable to fetch order",
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Admin — advance order status
// ---------------------------------------------------------------------------

api.patch(
  "/orders/:id/status",
  requireAuth,
  async (req, res) => {
    try {
      if (
        (req.user.role ||
          "customer") !==
        "admin"
      ) {
        return res.status(403).json({
          detail:
            "Admin only",
        });
      }

      const {
        status,
      } = req.body || {};

      if (
        !TRACKING_STAGES.some(
          (s) =>
            s.key === status
        )
      ) {
        return res.status(400).json({
          detail:
            "Invalid status",
        });
      }

      const db =
        req.app.locals.db;

      const result =
        await db
          .collection("orders")
          .findOneAndUpdate(
            {
              id:
                req.params.id,
            },

            {
              $set: {
                status_override:
                  status,
              },
            },

            {
              returnDocument:
                "after",

              projection: {
                _id: 0,
              },
            }
          );

      const order =
        result?.value ||
        result;

      if (!order) {
        return res
          .status(404)
          .json({
            detail:
              "Order not found",
          });
      }

      res.json(
        serializeOrder(
          order
        )
      );
    } catch (error) {
      console.error(
        "[admin status]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Unable to update order status",
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

api.post(
  "/newsletter",
  async (req, res) => {
    try {
      const {
        email,
      } = req.body || {};

      if (!isValidEmail(email)) {
        return res.status(400).json({
          detail:
            "Please enter a valid email.",
        });
      }

      const db =
        req.app.locals.db;

      const normalizedEmail =
        email
          .toLowerCase()
          .trim();

      await db
        .collection(
          "newsletter"
        )
        .updateOne(
          {
            email:
              normalizedEmail,
          },

          {
            $set: {
              email:
                normalizedEmail,

              created_at:
                new Date().toISOString(),
            },
          },

          {
            upsert: true,
          }
        );

      res.json({
        ok: true,

        message:
          "You're on the list.",
      });
    } catch (error) {
      console.error(
        "[newsletter]",
        error
      );

      res.status(500).json({
        detail:
          error.message ||
          "Newsletter subscription failed",
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Mount + 404 + error handler
// ---------------------------------------------------------------------------

app.use(
  "/api",
  api
);

app.use(
  "/api",
  (_req, res) => {
    res.status(404).json({
      detail:
        "Not found",
    });
  }
);

// eslint-disable-next-line no-unused-vars
app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(
      "[error]",
      err
    );

    res.status(500).json({
      detail:
        err.message ||
        "Internal server error",
    });
  }
);

// ---------------------------------------------------------------------------
// Vercel — DO NOT call app.listen() when imported as a module
// ---------------------------------------------------------------------------

module.exports = app;

// ---------------------------------------------------------------------------
// Local development
// ---------------------------------------------------------------------------

if (
  require.main === module
) {
  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `[shubhvika] API running on http://localhost:${PORT}`
      );
    }
  );
}