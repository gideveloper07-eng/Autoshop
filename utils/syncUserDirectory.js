const sql = require("mssql");
const openCommunicationPool = require("../utils/communicationPool");
const openPool = require("../utils/dynamicPoolManager");

async function syncUserDirectory(user) {
  const dealershipPool = await openPool(user.loginDatabase);

  const branchResult = await dealershipPool
    .request()
    .input("BranchUnq", sql.NVarChar, user.branchUnq).query(`
      SELECT TOP 1 ISNULL(sp_607,'') AS BranchName
      FROM rh_sp_60
      WHERE sp_602 = @BranchUnq
  `);

  const branchName =
    branchResult.recordset.length > 0
      ? branchResult.recordset[0].BranchName
      : "";
  const pool = await openCommunicationPool();

  await pool
    .request()
    .input("UserGuid", sql.UniqueIdentifier, user.userGuid)
    .input("LoginId", sql.NVarChar, user.userId)
    .input("PropertyCode", sql.NVarChar, user.loginPropertyCode)
    .input("PropertyName", sql.NVarChar, user.loginPropertyName)
    .input("PropertyDB", sql.NVarChar, user.loginDatabase)
    .input("BranchUnq", sql.NVarChar, user.branchUnq)
    .input("BranchName", sql.NVarChar, branchName).query(`
MERGE MA_UserDirectory AS T
USING
(
SELECT
    @UserGuid UserGuid
) S

ON T.UserGuid=S.UserGuid

WHEN MATCHED THEN
UPDATE SET

LoginId=@LoginId,
PropertyCode=@PropertyCode,
PropertyName=@PropertyName,
PropertyDB=@PropertyDB,
BranchUnq=@BranchUnq,
BranchName=@BranchName,
LastSeen=GETDATE()

WHEN NOT MATCHED THEN

INSERT
(
UserGuid,
LoginId,
PropertyCode,
PropertyName,
PropertyDB,
BranchUnq,
BranchName,
LastSeen
)

VALUES
(
@UserGuid,
@LoginId,
@propertyCode,
@PropertyName,
@PropertyDB,
@BranchUnq,
@BranchName,
GETDATE()
);
`);
}

module.exports = syncUserDirectory;
