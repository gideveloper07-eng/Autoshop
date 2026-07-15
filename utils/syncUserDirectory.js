const sql = require("mssql");
const { openCommunicationPool } = require("../config/db");

async function syncUserDirectory(user) {
  const pool = await openCommunicationPool();

  await pool
    .request()
    .input("UserGuid", sql.UniqueIdentifier, user.userGuid)
    .input("LoginId", sql.NVarChar, user.loginId)
    .input("PropertyCode", sql.NVarChar, user.propertyCode)
    .input("PropertyName", sql.NVarChar, user.propertyName)
    .input("PropertyDB", sql.NVarChar, user.database)
    .input("BranchUnq", sql.NVarChar, user.branchUnq)
    .input("BranchName", sql.NVarChar, user.branchName).query(`
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
