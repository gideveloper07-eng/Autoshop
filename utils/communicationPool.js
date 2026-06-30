const sql = require("mssql");

let pool;

async function openCommunicationPool() {
  if (pool && pool.connected) {
    return pool;
  }

  pool = await new sql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "1433"),
    database: process.env.COMM_DB,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }).connect();

  return pool;
}

module.exports = openCommunicationPool;
