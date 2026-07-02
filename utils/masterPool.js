const sql = require("mssql");

let pool;

async function openMasterPool() {
  const pool = await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "1433"),
    database: "CMPY_AUTOSHOP",
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }).connect();

  return pool;
}

module.exports = openMasterPool;
