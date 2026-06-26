const sql = require("mssql");

async function getAccessibleDatabases(userGuid, currentDb) {
  let masterPool;

  try {
    // Single dealership user
    if (!userGuid) {
      return [
        {
          database: currentDb,
          companyName: null,
          companyCode: null,
          clientId: null,
        },
      ];
    }

    masterPool = await new sql.ConnectionPool({
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

    const result = await masterPool
      .request()
      .input("userGuid", sql.UniqueIdentifier, userGuid).query(`
        SELECT
            CM.unqid AS clientId,
            CM.propertycode AS companyCode,
            CM.propertyname AS companyName,
            CM.propertydb AS database
        FROM MA_UserDatabaseAccess UA
        INNER JOIN MA_ClientMaster CM
            ON UA.ClientId = CM.unqid
        WHERE UA.UserGuid = @userGuid
      `);

    if (result.recordset.length === 0) {
      return [
        {
          database: currentDb,
          companyName: null,
          companyCode: null,
          clientId: null,
        },
      ];
    }

    return result.recordset;
  } finally {
    if (masterPool) await masterPool.close();
  }
}

module.exports = {
  getAccessibleDatabases,
};
