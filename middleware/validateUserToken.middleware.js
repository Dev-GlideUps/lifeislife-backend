const admin = require("firebase-admin");

const privateKey = settingJSON?.privateKey;

if (!privateKey) {
  console.error("❌ Firebase private key not found in global setting.");
  process.exit(1); // Exit process to prevent running without credentials
}

//import model
const User = require("../models/user.model");

const validateUserAccessToken = async (req, res, next) => {
  console.log("🔹 [AUTH] Received authentication request.");

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const userUid = req.headers["x-user-uid"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("⚠️ [AUTH] Missing or invalid authorization header.");
    return res.status(401).json({ status: false, message: "Authorization token required" });
  }

  if (!userUid) {
    console.warn("⚠️ [AUTH] Missing API key or User UID.");
    return res.status(401).json({ status: false, message: "User UID required for authentication." });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    console.log("🔹 [AUTH] Verifying Firebase token...");

    const [decodedToken, mongoUser] = await Promise.all([admin.auth().verifyIdToken(token), User.findOne({ firebaseUid: userUid }).select("_id isBlock isInstantBlock isDeviceBanned").lean()]);

    if (!decodedToken) {
      console.warn("⚠️ [AUTH] Token verification failed.");
      return res.status(401).json({ status: false, message: "Invalid token. Authorization failed." });
    }

    if (!mongoUser) {
      console.warn(`⚠️ [AUTH] No user found in MongoDB for Firebase UID: ${decodedToken.uid}`);
      return res.status(200).json({ status: false, message: "User not found in the database." });
    }

    if (mongoUser.isBlock) {
      console.warn(`⚠️ [AUTH] User is blocked by admin: ${decodedToken.uid}`);
      return res.status(200).json({ status: false, message: "User are blocked by the admin." });
    }

    if (mongoUser.isInstantBlock) {
      console.warn(`⚠️ [AUTH] User is instant blocked by admin: ${decodedToken.uid}`);
      return res.status(200).json({ status: false, message: "Access denied. Your account has been restricted by the admin." });
    }

    if (mongoUser.isDeviceBanned) {
      console.warn(`⚠️ [AUTH] User device is banned: ${decodedToken.uid}`);
      return res.status(200).json({ status: false, message: "This account is not allowed to access from this device." });
    }

    req.user = {
      uid: decodedToken.uid,
      userId: mongoUser._id,
    };

    console.log(`✅ [AUTH] User authentication successful. MongoID: ${mongoUser._id}`);
    next();
  } catch (error) {
    console.error("❌ [AUTH ERROR] Token verification failed:", error.message);

    return res.status(401).json({
      status: false,
      message: error.code === "auth/id-token-expired" ? "Token expired. Please reauthenticate." : "Invalid token. Authorization failed.",
    });
  }
};

module.exports = validateUserAccessToken;
