const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const dbExists = fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Initialize database tables
db.serialize(() => {
  // Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER', -- 'USER' or 'ADMIN'
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Properties Table
  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT,
      map_url TEXT,
      floor TEXT,
      shop_name TEXT,
      area REAL, -- Pyeong
      deposit INTEGER, -- in Ten Thousand Won (만원)
      rent INTEGER, -- in Ten Thousand Won (만원)
      premium INTEGER, -- in Ten Thousand Won (만원)
      maintenance INTEGER, -- in Ten Thousand Won (만원)
      note TEXT,
      sheet_name TEXT, -- Trace origin
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('Database tables initialized.');
});

module.exports = db;
