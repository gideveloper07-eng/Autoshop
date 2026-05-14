const sql = require("mssql");
require("dotenv").config();

const config = {
  user:     process.env.DB_USER     || "GJAUTOSHOP",
  password: process.env.DB_PASSWORD || "123456",
  server:   "103.123.53.84",          // IP only — no instance name
  port:     parseInt(process.env.DB_PORT) || 61615,
  database: process.env.DB_NAME     || "GJAUTOSHOP",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 30000,
  requestTimeout:    30000,
};

let pool = null;

const getPool = async () => {
  if (pool) return pool;
  pool = await sql.connect(config);
  return pool;
};

module.exports = { getPool, sql };
