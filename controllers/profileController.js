const jwt    = require("jsonwebtoken");
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const { getPool, sql } = require("../config/db");

// ── Multer storage ────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const uploadFields = upload.fields([
  { name: "profileImage",  maxCount: 1 },
  { name: "marksheet10",   maxCount: 1 },
  { name: "marksheet12",   maxCount: 1 },
  { name: "idProof",       maxCount: 1 },
  { name: "passportPhoto", maxCount: 1 },
]);

// ── Helper ────────────────────────────────────────────────────────────────
const getUserId = (req) => {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try { return jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET).userId; }
  catch { return null; }
};

// ── Helper to decode full token ──────────────────────────────────────────
const decodeToken = (req) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

// ── GET profile ───────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const pool = await getPool();
    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query("SELECT * FROM Profiles WHERE userId = @userId");

    res.json(result.recordset[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── SAVE profile (upsert) ─────────────────────────────────────────────────
const saveProfile = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const data  = req.body;
    const files = req.files || {};
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Attach uploaded file URLs
    if (files.profileImage)  data.profileImage  = `${baseUrl}/uploads/${files.profileImage[0].filename}`;
    if (files.marksheet10)   data.marksheet10   = `${baseUrl}/uploads/${files.marksheet10[0].filename}`;
    if (files.marksheet12)   data.marksheet12   = `${baseUrl}/uploads/${files.marksheet12[0].filename}`;
    if (files.idProof)       data.idProof       = `${baseUrl}/uploads/${files.idProof[0].filename}`;
    if (files.passportPhoto) data.passportPhoto = `${baseUrl}/uploads/${files.passportPhoto[0].filename}`;

    const profileCompleted = !!(data.fullName && data.mobile && data.highestQualification);

    const pool = await getPool();

    // Check if profile exists
    const existing = await pool.request()
      .input("userId", sql.Int, userId)
      .query("SELECT id FROM Profiles WHERE userId = @userId");

    const req2 = pool.request()
      .input("userId",               sql.Int,      userId)
      .input("fullName",             sql.NVarChar, data.fullName             || "")
      .input("email",                sql.NVarChar, data.email                || "")
      .input("mobile",               sql.NVarChar, data.mobile               || "")
      .input("dob",                  sql.NVarChar, data.dob                  || "")
      .input("gender",               sql.NVarChar, data.gender               || "Male")
      .input("profileImage",         sql.NVarChar, data.profileImage         || "")
      .input("highestQualification", sql.NVarChar, data.highestQualification || "")
      .input("schoolCollegeName",    sql.NVarChar, data.schoolCollegeName    || "")
      .input("boardUniversity",      sql.NVarChar, data.boardUniversity      || "")
      .input("passingYear",          sql.NVarChar, data.passingYear          || "")
      .input("percentageCgpa",       sql.NVarChar, data.percentageCgpa       || "")
      .input("subjectStream",        sql.NVarChar, data.subjectStream        || "")
      .input("entranceExam",         sql.NVarChar, data.entranceExam         || "")
      .input("rankScore",            sql.NVarChar, data.rankScore            || "")
      .input("addressLine1",         sql.NVarChar, data.addressLine1         || "")
      .input("addressLine2",         sql.NVarChar, data.addressLine2         || "")
      .input("city",                 sql.NVarChar, data.city                 || "")
      .input("state",                sql.NVarChar, data.state                || "")
      .input("pincode",              sql.NVarChar, data.pincode              || "")
      .input("marksheet10",          sql.NVarChar, data.marksheet10          || "")
      .input("marksheet12",          sql.NVarChar, data.marksheet12          || "")
      .input("idProof",              sql.NVarChar, data.idProof              || "")
      .input("passportPhoto",        sql.NVarChar, data.passportPhoto        || "")
      .input("skills",               sql.NVarChar, data.skills               || "")
      .input("interests",            sql.NVarChar, data.interests            || "")
      .input("preferredCourse",      sql.NVarChar, data.preferredCourse      || "")
      .input("preferredCollege",     sql.NVarChar, data.preferredCollege     || "")
      .input("profileCompleted",     sql.Bit,      profileCompleted ? 1 : 0);

    let result;
    if (existing.recordset.length > 0) {
      result = await req2.query(`
        UPDATE Profiles SET
          fullName=@fullName, email=@email, mobile=@mobile, dob=@dob, gender=@gender,
          profileImage=@profileImage, highestQualification=@highestQualification,
          schoolCollegeName=@schoolCollegeName, boardUniversity=@boardUniversity,
          passingYear=@passingYear, percentageCgpa=@percentageCgpa,
          subjectStream=@subjectStream, entranceExam=@entranceExam, rankScore=@rankScore,
          addressLine1=@addressLine1, addressLine2=@addressLine2, city=@city,
          state=@state, pincode=@pincode, marksheet10=@marksheet10,
          marksheet12=@marksheet12, idProof=@idProof, passportPhoto=@passportPhoto,
          skills=@skills, interests=@interests, preferredCourse=@preferredCourse,
          preferredCollege=@preferredCollege, profileCompleted=@profileCompleted,
          updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE userId = @userId
      `);
    } else {
      result = await req2.query(`
        INSERT INTO Profiles (
          userId, fullName, email, mobile, dob, gender, profileImage,
          highestQualification, schoolCollegeName, boardUniversity, passingYear,
          percentageCgpa, subjectStream, entranceExam, rankScore,
          addressLine1, addressLine2, city, state, pincode,
          marksheet10, marksheet12, idProof, passportPhoto,
          skills, interests, preferredCourse, preferredCollege, profileCompleted
        )
        OUTPUT INSERTED.*
        VALUES (
          @userId, @fullName, @email, @mobile, @dob, @gender, @profileImage,
          @highestQualification, @schoolCollegeName, @boardUniversity, @passingYear,
          @percentageCgpa, @subjectStream, @entranceExam, @rankScore,
          @addressLine1, @addressLine2, @city, @state, @pincode,
          @marksheet10, @marksheet12, @idProof, @passportPhoto,
          @skills, @interests, @preferredCourse, @preferredCollege, @profileCompleted
        )
      `);
    }

    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── SAVE Device Token (FCM) ───────────────────────────────────────────────
const saveDeviceToken = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    const { userId, currentDatabase } = decoded;
    const { fcm_token, device_type } = req.body;

    if (!fcm_token) {
      return res.status(400).json({ 
        success: false, 
        message: "fcm_token is required" 
      });
    }

    console.log("💾 SAVING DEVICE TOKEN — User:", userId, "Device:", device_type);

    // Use the database from token
    const openPool = require("../utils/dynamicPoolManager");
    const pool = await openPool(currentDatabase);

    // Check if token already exists
    const existing = await pool
      .request()
      .input("user_id", sql.NVarChar, userId)
      .input("fcm_token", sql.NVarChar(sql.MAX), fcm_token)
      .query(`
        SELECT id 
        FROM app_user_devices 
        WHERE user_id = @user_id AND fcm_token = @fcm_token
      `);

    if (existing.recordset.length > 0) {
      // Update existing record
      await pool
        .request()
        .input("user_id", sql.NVarChar, userId)
        .input("fcm_token", sql.NVarChar(sql.MAX), fcm_token)
        .input("device_type", sql.NVarChar(50), device_type || "")
        .query(`
          UPDATE app_user_devices 
          SET 
            device_type = @device_type,
            updated_at = GETDATE()
          WHERE user_id = @user_id AND fcm_token = @fcm_token
        `);

      console.log("✅ DEVICE TOKEN UPDATED");
    } else {
      // Insert new record
      await pool
        .request()
        .input("user_id", sql.NVarChar, userId)
        .input("fcm_token", sql.NVarChar(sql.MAX), fcm_token)
        .input("device_type", sql.NVarChar(50), device_type || "")
        .query(`
          INSERT INTO app_user_devices 
          (user_id, fcm_token, device_type, created_at, updated_at)
          VALUES 
          (@user_id, @fcm_token, @device_type, GETDATE(), GETDATE())
        `);

      console.log("✅ DEVICE TOKEN SAVED");
    }

    return res.json({ 
      success: true, 
      message: "Device token saved successfully" 
    });
  } catch (err) {
    console.error("❌ SAVE DEVICE TOKEN ERROR:", err.message);
    return res.status(500).json({ 
      success: false,
      message: "Server Error",
      error: err.message 
    });
  }
};

module.exports = { getProfile, saveProfile, uploadFields, saveDeviceToken };
