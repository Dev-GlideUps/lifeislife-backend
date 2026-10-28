/**
 * Test Authentication Controller
 * ONLY FOR TESTING - Creates test users and tokens that bypass Firebase auth
 * Only works when isDummyData is true in settings
 */

const User = require("../../models/user.model");
const mongoose = require("mongoose");
const generateUserUniqueId = require("../../util/generateUserUniqueId");
const generateReferralCode = require("../../util/generateReferralCode");

// Test token prefix - used to identify test tokens
const TEST_TOKEN_PREFIX = "TEST_TOKEN_";

/**
 * Generate a test token for a user
 */
const generateTestToken = (userId) => {
  return `${TEST_TOKEN_PREFIX}${userId}_${Date.now()}`;
};

/**
 * Validate a test token and return the user ID
 */
const validateTestToken = (token) => {
  if (!token || !token.startsWith(TEST_TOKEN_PREFIX)) {
    return null;
  }
  const parts = token.replace(TEST_TOKEN_PREFIX, "").split("_");
  return parts[0] || null;
};

/**
 * POST /api/client/test/createTestUser
 * Creates a test user and returns a test token
 */
exports.createTestUser = async (req, res) => {
  try {
    // Only allow in test mode
    if (!global.settingJSON?.isDummyData) {
      return res.status(403).json({
        status: false,
        message: "Test authentication is disabled in production mode.",
      });
    }

    const { name, identity, loginType = 0 } = req.body;

    if (!identity) {
      return res.status(400).json({
        status: false,
        message: "identity (phone/email) is required.",
      });
    }

    // Check if test user already exists
    let user = await User.findOne({
      $or: [
        { mobileNumber: identity },
        { email: identity },
        { firebaseUid: `test_${identity}` },
      ],
    });

    if (user) {
      // Return existing user with new token
      const testToken = generateTestToken(user._id.toString());
      return res.status(200).json({
        status: true,
        message: "Test user already exists. Token generated.",
        data: {
          user: {
            _id: user._id,
            uniqueId: user.uniqueId,
            name: user.name,
            userName: user.userName,
            image: user.image,
            coin: user.coin,
            identity: user.mobileNumber || user.email,
            firebaseUid: user.firebaseUid,
          },
          token: testToken,
          firebaseUid: user.firebaseUid,
          instructions: {
            header_authorization: `Bearer ${testToken}`,
            header_x_user_uid: user.firebaseUid,
            note: "Use these headers for authenticated API calls",
          },
        },
      });
    }

    // Create new test user
    const uniqueId = await generateUserUniqueId();
    const referralCode = await generateReferralCode(); // async function - must await
    const testFirebaseUid = `test_${identity}`;

    // loginType: 1=Phone, 2=Google, 3=Quick, 4=Email, 5=Apple, 6=Facebook
    // Default to 1 (Phone) if invalid value provided
    const validLoginType = [1, 2, 3, 4, 5, 6].includes(loginType) ? loginType : 1;

    const newUser = new User({
      _id: new mongoose.Types.ObjectId(),
      uniqueId,
      referralCode,
      firebaseUid: testFirebaseUid,
      name: name || `Test User ${Date.now()}`,
      userName: `testuser_${Date.now()}`,
      mobileNumber: validLoginType === 1 ? identity : undefined,
      email: validLoginType === 4 ? identity : undefined,
      loginType: validLoginType,
      isProfileCompleted: false,
      coin: global.settingJSON?.loginBonus || 5000,
      gender: "male",
      age: 25,
      country: "Test Country",
      countryCode: "TC",
      ip: req.ip || "127.0.0.1",
      deviceId: `test_device_${Date.now()}`,
      isTestUser: true, // Mark as test user
    });

    await newUser.save();

    const testToken = generateTestToken(newUser._id.toString());

    return res.status(201).json({
      status: true,
      message: "Test user created successfully.",
      data: {
        user: {
          _id: newUser._id,
          uniqueId: newUser.uniqueId,
          name: newUser.name,
          userName: newUser.userName,
          image: newUser.image,
          coin: newUser.coin,
          identity: newUser.mobileNumber || newUser.email,
          firebaseUid: newUser.firebaseUid,
        },
        token: testToken,
        firebaseUid: newUser.firebaseUid,
        instructions: {
          header_authorization: `Bearer ${testToken}`,
          header_x_user_uid: newUser.firebaseUid,
          note: "Use these headers for authenticated API calls",
        },
      },
    });
  } catch (error) {
    console.error("createTestUser error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

/**
 * GET /api/client/test/verifyTestToken
 * Verifies a test token and returns user info
 */
exports.verifyTestToken = async (req, res) => {
  try {
    if (!global.settingJSON?.isDummyData) {
      return res.status(403).json({
        status: false,
        message: "Test authentication is disabled in production mode.",
      });
    }

    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: false,
        message: "Test token required in Authorization header.",
      });
    }

    const token = authHeader.split("Bearer ")[1];
    const userId = validateTestToken(token);

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Invalid test token format.",
      });
    }

    const user = await User.findById(userId).select("_id uniqueId name userName image coin firebaseUid").lean();

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found for this test token.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Test token is valid.",
      data: {
        user,
        tokenValid: true,
      },
    });
  } catch (error) {
    console.error("verifyTestToken error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Export helper functions for middleware
exports.validateTestToken = validateTestToken;
exports.TEST_TOKEN_PREFIX = TEST_TOKEN_PREFIX;
