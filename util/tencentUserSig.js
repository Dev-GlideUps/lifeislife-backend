/**
 * Tencent TRTC UserSig Generator
 *
 * UserSig is a signature used to authenticate users in TRTC.
 * It must be generated server-side using the SecretKey.
 *
 * SECURITY: The SecretKey must NEVER be sent to clients.
 */

const TLSSigAPIv2 = require("tls-sig-api-v2");

/**
 * Generate a UserSig for TRTC authentication
 *
 * @param {string} userId - The user ID (string, typically MongoDB ObjectId)
 * @param {number} expireTime - Expiration time in seconds (default: 24 hours)
 * @returns {object} - { userSig, expireAt, expireIn, sdkAppId, userId }
 */
const generateUserSig = (userId, expireTime = 86400) => {
  const sdkAppId = global.settingJSON?.tencentSdkAppId;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!sdkAppId) {
    throw new Error("Tencent SDKAppID not configured in settings");
  }

  if (!secretKey) {
    throw new Error("TENCENT_SECRET_KEY not configured in .env");
  }

  if (!userId || typeof userId !== "string") {
    throw new Error("userId must be a non-empty string");
  }

  const api = new TLSSigAPIv2.Api(sdkAppId, secretKey);
  const userSig = api.genUserSig(userId, expireTime);

  const now = Math.floor(Date.now() / 1000);
  const expireAt = now + expireTime;

  return {
    sdkAppId,
    userId,
    userSig,
    expireAt,    // Absolute unix timestamp
    expireIn: expireTime, // Seconds remaining
  };
};

/**
 * Generate a room ID for TRTC
 * Uses string room IDs as per project decision
 *
 * @param {string} prefix - Prefix for the room ID (e.g., "live", "call", "audio")
 * @param {string} identifier - Unique identifier (e.g., liveHistoryId, callId)
 * @returns {object} - { roomId, roomIdType }
 */
const generateRoomId = (prefix, identifier) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const roomId = `${prefix}_${identifier}_${timestamp}`;

  return {
    roomId,
    roomIdType: "string",
    numericRoomId: 0, // Not used for string room IDs
  };
};

/**
 * Build a complete Tencent block for API responses
 *
 * @param {string} userId - The user ID
 * @param {string} roomId - The room ID (optional, will generate if not provided)
 * @param {string} prefix - Room ID prefix if generating (default: "live")
 * @param {string} identifier - Room ID identifier if generating
 * @returns {object} - Complete tencent block for API response
 */
const buildTencentBlock = (userId, roomId = null, prefix = "live", identifier = null) => {
  const userSigData = generateUserSig(userId);

  let roomData;
  if (roomId) {
    roomData = {
      roomId,
      roomIdType: "string",
      numericRoomId: 0,
    };
  } else if (identifier) {
    roomData = generateRoomId(prefix, identifier);
  } else {
    roomData = generateRoomId(prefix, userId);
  }

  return {
    ...roomData,
    userId: userSigData.userId,
    userSig: userSigData.userSig,
    expireAt: userSigData.expireAt,
    sdkAppId: userSigData.sdkAppId,
  };
};

/**
 * Check if Tencent is enabled and should be used
 *
 * @returns {boolean}
 */
const isTencentEnabled = () => {
  const settings = global.settingJSON;
  return settings?.isTencentEnabled === true &&
         settings?.liveSdkProvider === "tencent";
};

module.exports = {
  generateUserSig,
  generateRoomId,
  buildTencentBlock,
  isTencentEnabled,
};
