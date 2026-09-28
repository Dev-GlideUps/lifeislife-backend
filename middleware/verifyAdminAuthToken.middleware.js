const admin = require("firebase-admin");

const privateKey = settingJSON?.privateKey;

if (!privateKey) {
  console.error("❌ Firebase private key not found in global setting.");
  process.exit(1); // Exit process to prevent running without credentials
}

//import model
const Admin = require("../models/admin.model");
const Subadmin = require("../models/subadmin.model");

const validateAdminFirebaseToken = async (req, res, next) => {
  console.log("🔹 [AUTH] Validating Admin Firebase token...");

  const authHeader = req.headers["authorization"];
  const adminUid = req.headers["x-auth-adm"] || req.headers["X-Auth-Adm"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("⚠️ [AUTH] Missing or invalid authorization header.");
    return res.status(401).json({ status: false, message: "Authorization token required" });
  }

  if (!adminUid) {
    console.warn("⚠️ [AUTH] Missing API key or Admin UID.");
    return res.status(401).json({ status: false, message: "Admin UID required for authentication." });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const [decodedToken, adminUser, subadminUser] = await Promise.all([
      admin.auth().verifyIdToken(token),
      Admin.findOne({ uid: adminUid }).select("_id email"),
      Subadmin.findOne({ authId: adminUid }).select("_id email").populate("role", "name permissions"),
    ]);

    if (!decodedToken || !decodedToken.email) {
      console.warn("⚠️ [AUTH] Invalid token. Email not found.");
      return res.status(401).json({ status: false, message: "Invalid token. Authorization failed." });
    }

    //console.log("✅ Decoded Token:", decodedToken);

    if (adminUser) {
      req.admin = adminUser;
      console.log(`✅ [AUTH] Admin authentication successful. Admin ID: ${adminUser._id}`);
    } else if (subadminUser) {
      req.subadmin = subadminUser;
      console.log(`✅ [AUTH] Subadmin authentication successful. Subadmin ID: ${subadminUser._id}`);
    } else {
      console.warn("⚠️ [AUTH] Admin/Subadmin not found.");
      return res.status(401).json({ status: false, message: "Admin or Subadmin not found. Authorization failed." });
    }

    next();
  } catch (error) {
    console.error("❌ [AUTH ERROR] Token verification failed:", error.message);
    return res.status(401).json({ status: false, message: "Invalid or expired token. Authorization failed." });
  }
};

module.exports = validateAdminFirebaseToken;
