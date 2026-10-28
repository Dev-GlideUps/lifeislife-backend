const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../../models/user.model");
const LiveStreamer = require("../../models/liveStreamer.model");
const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");
const Gift = require("../../models/gift.model");

// GET /api/test/users - Get all users for testing
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({ isBlock: false })
      .select("_id name userName uniqueId image")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ status: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// GET /api/test/livestreamers - Get active live streamers
router.get("/livestreamers", async (req, res) => {
  try {
    const liveStreamers = await LiveStreamer.find({})
      .select("_id userId roomName channel liveType isAudio hostIsMuted isHostCameraEnabled createdAt")
      .populate("userId", "name userName uniqueId image")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ status: true, liveStreamers });
  } catch (error) {
    console.error("Error fetching live streamers:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// GET /api/test/livehistories - Get live histories
router.get("/livehistories", async (req, res) => {
  try {
    const histories = await LiveStreamerHistory.find({})
      .select("_id liveStreamerId userId createdAt viewerCount")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ status: true, histories });
  } catch (error) {
    console.error("Error fetching live histories:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// GET /api/test/gifts - Get available gifts
router.get("/gifts", async (req, res) => {
  try {
    const gifts = await Gift.find({ isDelete: false })
      .select("_id title coin image")
      .sort({ coin: 1 })
      .limit(50)
      .lean();

    // Map title to name for frontend compatibility
    const mappedGifts = gifts.map(g => ({ ...g, name: g.title }));
    res.json({ status: true, gifts: mappedGifts });
  } catch (error) {
    console.error("Error fetching gifts:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// GET /api/test/viewers/:liveStreamerId - Get viewers in a live room
router.get("/viewers/:liveStreamerId", async (req, res) => {
  try {
    const LiveStreamerView = require("../../models/liveStreamerView.model");
    const viewers = await LiveStreamerView.find({ liveStreamerId: req.params.liveStreamerId })
      .select("_id userId name userName image")
      .limit(50)
      .lean();

    res.json({ status: true, viewers });
  } catch (error) {
    console.error("Error fetching viewers:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// GET /api/client/test/config - Get test config (secret key, etc.)
router.get("/config", async (req, res) => {
  try {
    const Setting = require("../../models/setting.model");
    const setting = await Setting.findOne().select("isDummyData").lean();

    res.json({
      status: true,
      secretKey: process.env.secretKey || "",
      isDummyData: setting?.isDummyData || false,
      message: "FOR TESTING ONLY - Do not expose in production!"
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// POST /api/client/test/enableTestMode - Enable isDummyData for testing
router.post("/enableTestMode", async (req, res) => {
  try {
    const Setting = require("../../models/setting.model");
    const result = await Setting.updateOne({}, { $set: { isDummyData: true } });

    // Update global setting
    if (global.settingJSON) {
      global.settingJSON.isDummyData = true;
    }

    res.json({
      status: true,
      message: "Test mode enabled! isDummyData is now true.",
      isDummyData: true
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// POST /api/client/test/disableTestMode - Disable isDummyData
router.post("/disableTestMode", async (req, res) => {
  try {
    const Setting = require("../../models/setting.model");
    await Setting.updateOne({}, { $set: { isDummyData: false } });

    // Update global setting
    if (global.settingJSON) {
      global.settingJSON.isDummyData = false;
    }

    res.json({
      status: true,
      message: "Test mode disabled! isDummyData is now false.",
      isDummyData: false
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// ============ TEST LOGIN ENDPOINTS (NO FIREBASE REQUIRED) ============

// POST /api/client/test/login - Test login by email (creates user if not exists)
router.post("/login", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required" });
    }

    let user = await User.findOne({ email: email.toLowerCase() });
    let isNewUser = false;

    if (!user) {
      // Create new test user
      const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();
      user = new User({
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        userName: email.split('@')[0] + '_' + Date.now(),
        loginType: 2,
        identity: 'test_' + Date.now(),
        fcmToken: 'test_fcm_token',
        uniqueId: uniqueId,
        firebaseUid: 'test_firebase_' + Date.now(),
      });
      await user.save();
      isNewUser = true;
      console.log("[TEST LOGIN] Created new user:", user._id);
    }

    // Generate TEST_TOKEN format (works with validateUserToken middleware when isDummyData is true)
    const testToken = `TEST_TOKEN_${user._id}_${Date.now()}`;

    // Also generate JWT token as backup
    const jwt = require("jsonwebtoken");
    const jwtToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      status: true,
      message: isNewUser ? "User created and logged in" : "Login successful",
      token: testToken,
      jwtToken: jwtToken,
      firebaseUid: user.firebaseUid || 'test_uid_' + user._id,
      user: {
        _id: user._id,
        name: user.name,
        userName: user.userName,
        email: user.email,
        image: user.image || "",
        uniqueId: user.uniqueId,
        coin: user.coin || 0,
        firebaseUid: user.firebaseUid,
      }
    });
  } catch (error) {
    console.error("[TEST LOGIN] Error:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// POST /api/client/test/loginById - Test login by user ID
router.post("/loginById", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ status: false, message: "userId is required" });
    }

    const user = await User.findById(userId)
      .select("_id name userName email image uniqueId coin firebaseUid")
      .lean();

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Generate TEST_TOKEN format
    const testToken = `TEST_TOKEN_${user._id}_${Date.now()}`;

    // Also generate JWT token as backup
    const jwt = require("jsonwebtoken");
    const jwtToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      status: true,
      message: "Login successful",
      token: testToken,
      jwtToken: jwtToken,
      firebaseUid: user.firebaseUid || 'test_uid_' + user._id,
      user: user
    });
  } catch (error) {
    console.error("[TEST LOGIN BY ID] Error:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

// GET /api/client/test/token/:userId - Get token for existing user
router.get("/token/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select("_id name userName email image uniqueId coin")
      .lean();

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      status: true,
      message: "Token generated",
      token: token,
      user: user
    });
  } catch (error) {
    console.error("[TEST TOKEN] Error:", error);
    res.status(500).json({ status: false, message: error.message });
  }
});

module.exports = router;
