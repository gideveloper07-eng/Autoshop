-- Run this in SSMS as SA or admin account
-- Step 1: Create the database
CREATE DATABASE GJAUTOSHOP;
GO

-- Step 2: Use the database
USE GJAUTOSHOP;
GO

-- Step 3: Create login if not exists
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'GJAUTOSHOP')
BEGIN
    CREATE LOGIN GJAUTOSHOP WITH PASSWORD = '123456';
END
GO

-- Step 4: Create user in the database
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'GJAUTOSHOP')
BEGIN
    CREATE USER GJAUTOSHOP FOR LOGIN GJAUTOSHOP;
END
GO

-- Step 5: Give full access
ALTER ROLE db_owner ADD MEMBER GJAUTOSHOP;
GO

PRINT 'Database and user setup complete!';
