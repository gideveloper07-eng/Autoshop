/**
 * initDb.js — Creates all tables in SQL Server if they don't exist.
 * Run once on server startup.
 */
const { getPool } = require("./db");

const initDb = async () => {
  const pool = await getPool();

  // ── Users ──────────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
    CREATE TABLE Users (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      name        NVARCHAR(255)     NOT NULL,
      email       NVARCHAR(255)     DEFAULT '',
      userId      NVARCHAR(100)     NOT NULL,        -- User ID (login field)
      companyCode NVARCHAR(100)     NOT NULL,        -- Company Code (login field)
      password    NVARCHAR(255)     NOT NULL,
      role        NVARCHAR(50)      NOT NULL DEFAULT 'user',
      createdAt   DATETIME          DEFAULT GETDATE(),
      updatedAt   DATETIME          DEFAULT GETDATE(),
      CONSTRAINT UQ_Users_UserId_Company UNIQUE (userId, companyCode)
    )
  `);

  // ── Profiles ───────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Profiles' AND xtype='U')
    CREATE TABLE Profiles (
      id                    INT IDENTITY(1,1) PRIMARY KEY,
      userId                INT           NOT NULL UNIQUE REFERENCES Users(id) ON DELETE CASCADE,
      fullName              NVARCHAR(255) DEFAULT '',
      email                 NVARCHAR(255) DEFAULT '',
      mobile                NVARCHAR(50)  DEFAULT '',
      dob                   NVARCHAR(50)  DEFAULT '',
      gender                NVARCHAR(50)  DEFAULT 'Male',
      profileImage          NVARCHAR(500) DEFAULT '',
      highestQualification  NVARCHAR(255) DEFAULT '',
      schoolCollegeName     NVARCHAR(255) DEFAULT '',
      boardUniversity       NVARCHAR(255) DEFAULT '',
      passingYear           NVARCHAR(50)  DEFAULT '',
      percentageCgpa        NVARCHAR(50)  DEFAULT '',
      subjectStream         NVARCHAR(255) DEFAULT '',
      entranceExam          NVARCHAR(255) DEFAULT '',
      rankScore             NVARCHAR(100) DEFAULT '',
      addressLine1          NVARCHAR(500) DEFAULT '',
      addressLine2          NVARCHAR(500) DEFAULT '',
      city                  NVARCHAR(255) DEFAULT '',
      state                 NVARCHAR(255) DEFAULT '',
      pincode               NVARCHAR(20)  DEFAULT '',
      marksheet10           NVARCHAR(500) DEFAULT '',
      marksheet12           NVARCHAR(500) DEFAULT '',
      idProof               NVARCHAR(500) DEFAULT '',
      passportPhoto         NVARCHAR(500) DEFAULT '',
      skills                NVARCHAR(MAX) DEFAULT '',
      interests             NVARCHAR(MAX) DEFAULT '',
      preferredCourse       NVARCHAR(255) DEFAULT '',
      preferredCollege      NVARCHAR(255) DEFAULT '',
      profileCompleted      BIT           DEFAULT 0,
      createdAt             DATETIME      DEFAULT GETDATE(),
      updatedAt             DATETIME      DEFAULT GETDATE()
    )
  `);

  // ── Colleges ───────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Colleges' AND xtype='U')
    CREATE TABLE Colleges (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      name        NVARCHAR(255)     NOT NULL,
      location    NVARCHAR(255)     DEFAULT '',
      type        NVARCHAR(100)     DEFAULT 'Private',
      rating      NVARCHAR(20)      DEFAULT '4.0',
      courses     NVARCHAR(50)      DEFAULT '0',
      description NVARCHAR(MAX)     DEFAULT '',
      image       NVARCHAR(500)     DEFAULT '',
      createdAt   DATETIME          DEFAULT GETDATE(),
      updatedAt   DATETIME          DEFAULT GETDATE()
    )
  `);

  // ── AdminCourses ───────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AdminCourses' AND xtype='U')
    CREATE TABLE AdminCourses (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      title       NVARCHAR(255)     NOT NULL,
      department  NVARCHAR(255)     DEFAULT '',
      duration    NVARCHAR(100)     DEFAULT '',
      fees        NVARCHAR(100)     DEFAULT '',
      seats       INT               DEFAULT 0,
      description NVARCHAR(MAX)     DEFAULT '',
      college     NVARCHAR(255)     DEFAULT '',
      createdAt   DATETIME          DEFAULT GETDATE(),
      updatedAt   DATETIME          DEFAULT GETDATE()
    )
  `);

  // ── Notices ────────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notices' AND xtype='U')
    CREATE TABLE Notices (
      id        INT IDENTITY(1,1) PRIMARY KEY,
      title     NVARCHAR(255)   NOT NULL,
      body      NVARCHAR(MAX)   NOT NULL,
      category  NVARCHAR(100)   DEFAULT 'General',
      createdAt DATETIME        DEFAULT GETDATE(),
      updatedAt DATETIME        DEFAULT GETDATE()
    )
  `);

  // ── Applications ───────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Applications' AND xtype='U')
    CREATE TABLE Applications (
      id        INT IDENTITY(1,1) PRIMARY KEY,
      userId    INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      userName  NVARCHAR(255) DEFAULT '',
      college   NVARCHAR(255) NOT NULL,
      course    NVARCHAR(255) NOT NULL,
      message   NVARCHAR(MAX) DEFAULT '',
      status    NVARCHAR(50)  DEFAULT 'Under Review',
      createdAt DATETIME      DEFAULT GETDATE(),
      updatedAt DATETIME      DEFAULT GETDATE()
    )
  `);

  // ── Wishlists ──────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Wishlists' AND xtype='U')
    CREATE TABLE Wishlists (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      userId      INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      collegeId   NVARCHAR(100) NOT NULL,
      collegeName NVARCHAR(255) DEFAULT '',
      location    NVARCHAR(255) DEFAULT '',
      type        NVARCHAR(100) DEFAULT '',
      rating      NVARCHAR(20)  DEFAULT '',
      createdAt   DATETIME      DEFAULT GETDATE(),
      updatedAt   DATETIME      DEFAULT GETDATE(),
      CONSTRAINT UQ_Wishlist_User_College UNIQUE (userId, collegeId)
    )
  `);

  console.log("✅ All SQL Server tables initialized");
};

module.exports = initDb;
