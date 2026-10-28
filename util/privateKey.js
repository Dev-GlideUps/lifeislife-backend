const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const initFirebase = async () => {
  try {
    // Try loading from file first, then from database settings
    let firebaseConfig = null;
    const configPath = path.join(__dirname, "firebase.json");

    if (fs.existsSync(configPath)) {
      firebaseConfig = require(configPath);
      console.log("📄 Firebase config loaded from firebase.json");
    } else if (global.settingJSON?.privateKey) {
      firebaseConfig = global.settingJSON.privateKey;
      console.log("📄 Firebase config loaded from database settings");
    }

    if (!firebaseConfig) {
      console.warn("⚠️ Firebase config not found. Some features may not work.");
      return admin;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
      });
      console.log("✅ Firebase Admin SDK initialized successfully");
    }
    return admin;
  } catch (error) {
    console.error("⚠️ Firebase initialization failed:", error.message);
    console.warn("⚠️ Server will continue without Firebase. Some features may not work.");
    return admin;
  }
};

module.exports = initFirebase();
