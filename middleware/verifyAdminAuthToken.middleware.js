const admin = require("firebase-admin");

//import model
const Admin = require("../models/admin.model");
const Subadmin = require("../models/subadmin.model");

const validateAdminFirebaseToken = async (req, res, next) => {
  console.log("🔹 [AUTH] Validating Admin Firebase token...");

  // Check privateKey at runtime, not at require time
  const privateKey = global.settingJSON?.privateKey;
  if (!privateKey) {
    console.error("❌ Firebase private key not found in global setting.");
    return res.status(500).json({ status: false, message: "Server configuration error." });
  }

  const authHeader = req.headers["authorization"];
  const adminUid = req.headers["x-auth-adm"] || req.headers["X-Auth-Adm"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("⚠️ [AUTH] Missing or invalid authorization header.");
    return res.status(401).json({ status: false, message: "Authorization token required" });
  }

  // adminUid is optional - we can also find admin by email from token
  if (!adminUid) {
    console.log("ℹ️ [AUTH] No x-auth-adm header, will use email from token.");
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);

    if (!decodedToken || !decodedToken.email) {
      console.warn("⚠️ [AUTH] Invalid token. Email not found.");
      return res.status(401).json({ status: false, message: "Invalid token. Authorization failed." });
    }

    const email = decodedToken.email;

    // Find admin by uid header OR by email from token
    const adminQuery = adminUid ? { $or: [{ uid: adminUid }, { email: email }] } : { email: email };
    const subadminQuery = adminUid ? { $or: [{ authId: adminUid }, { email: email }] } : { email: email };

    const [adminUser, subadminUser] = await Promise.all([
      Admin.findOne(adminQuery).select("_id email uid"),
      Subadmin.findOne(subadminQuery).select("_id email").populate("role", "name permissions"),
    ]);

    //console.log("✅ Decoded Token:", decodedToken);

    if (adminUser) {
      req.admin = adminUser;
      console.log(`✅ [AUTH] Admin authentication successful. Admin ID: ${adminUser._id}, Email: ${email}`);
    } else if (subadminUser) {
      req.subadmin = subadminUser;
      console.log(`✅ [AUTH] Subadmin authentication successful. Subadmin ID: ${subadminUser._id}`);
    } else {
      console.warn(`⚠️ [AUTH] Admin/Subadmin not found for email: ${email}`);
      return res.status(401).json({ status: false, message: "Admin or Subadmin not found. Authorization failed." });
    }

    next();
  } catch (error) {
    console.error("❌ [AUTH ERROR] Token verification failed:", error.message);
    return res.status(401).json({ status: false, message: "Invalid or expired token. Authorization failed." });
  }
};

module.exports = validateAdminFirebaseToken;
