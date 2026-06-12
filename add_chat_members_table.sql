-- Run this in SSMS on every company database that uses chat.
-- Creates MA_ChallanChatMembers for group-style member management.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'MA_ChallanChatMembers'
)
BEGIN
    CREATE TABLE MA_ChallanChatMembers (
        MemberId    UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
        ChallanId   NVARCHAR(100)     NOT NULL,
        UserId      NVARCHAR(100)     NOT NULL,
        UserName    NVARCHAR(500)     NOT NULL,
        AddedBy     NVARCHAR(100)     NOT NULL,
        AddedOn     DATETIME          NOT NULL DEFAULT GETDATE(),
        IsActive    BIT               NOT NULL DEFAULT 1,

        CONSTRAINT UQ_ChallanChatMember UNIQUE (ChallanId, UserId)
    );

    CREATE INDEX IX_ChallanChatMembers_ChallanId
        ON MA_ChallanChatMembers (ChallanId);

    PRINT 'MA_ChallanChatMembers table created.';
END
ELSE
BEGIN
    PRINT 'MA_ChallanChatMembers already exists.';
END
GO
