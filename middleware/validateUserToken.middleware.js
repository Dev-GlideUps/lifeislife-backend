const admin = require("firebase-admin");

const privateKey = settingJSON?.privateKey;

if (!privateKey) {
  console.error("❌ Firebase private key not found in global setting.");
  process.exit(1); // Exit process to prevent running without credentials
}

//import model
const User = require("../models/user.model");

// Test token prefix for test authentication (only works when isDummyData is true)
const TEST_TOKEN_PREFIX = "TEST_TOKEN_";

const validateUserAccessToken = async (req, res, next) => {
  console.log("🔹 [AUTH] Received authentication request.");

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const userUid = req.headers["x-user-uid"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("⚠️ [AUTH] Missing or invalid authorization header.");
    return res.status(401).json({ status: false, message: "Authorization token required" });
  }

  const token = authHeader.split("Bearer ")[1];

  // Check for test token (only in test mode)
  if (global.settingJSON?.isDummyData && token.startsWith(TEST_TOKEN_PREFIX)) {
    console.log("🧪 [AUTH] Test token detected, validating...");

    try {
      const parts = token.replace(TEST_TOKEN_PREFIX, "").split("_");
      const userId = parts[0];

      if (!userId) {
        console.warn("⚠️ [AUTH] Invalid test token format.");
        return res.status(401).json({ status: false, message: "Invalid test token format." });
      }

      const mongoUser = await User.findById(userId).select("_id firebaseUid isBlock isInstantBlock isDeviceBanned").lean();

      if (!mongoUser) {
        console.warn(`⚠️ [AUTH] No user found for test token userId: ${userId}`);
        return res.status(200).json({ status: false, message: "User not found in the database." });
      }

      if (mongoUser.isBlock) {
        return res.status(200).json({ status: false, message: "User are blocked by the admin." });
      }

      if (mongoUser.isInstantBlock) {
        return res.status(200).json({ status: false, message: "Access denied. Your account has been restricted by the admin." });
      }

      if (mongoUser.isDeviceBanned) {
        return res.status(200).json({ status: false, message: "This account is not allowed to access from this device." });
      }

      req.user = {
        uid: mongoUser.firebaseUid,
        userId: mongoUser._id,
      };

      console.log(`✅ [AUTH] Test user authentication successful. MongoID: ${mongoUser._id}`);
      return next();
    } catch (error) {
      console.error("❌ [AUTH ERROR] Test token validation failed:", error.message);
      return res.status(401).json({ status: false, message: "Invalid test token." });
    }
  }

  // Regular Firebase authentication
  if (!userUid) {
    console.warn("⚠️ [AUTH] Missing API key or User UID.");
    return res.status(401).json({ status: false, message: "User UID required for authentication." });
  }

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
