/**
 * Tencent TRTC Controller
 *
 * Handles Tencent RTC operations including UserSig generation
 */

const { generateUserSig, buildTencentBlock, isTencentEnabled } = require("../../util/tencentUserSig");

/**
 * POST /api/client/live/tencentUserSig
 *
 * Generate a UserSig for the authenticated user
 * SECURITY: userId is taken from auth token, NOT from request body
 */
exports.generateTencentUserSig = async (req, res) => {
  try {
    // Check if Tencent is enabled
    if (!isTencentEnabled()) {
      return res.status(400).json({
        status: false,
        message: "Tencent RTC is not enabled",
      });
    }

    // Get userId from authenticated user (from middleware)
    // SECURITY: Never use userId from request body
    const userId = req.user?.userId?.toString() || req.user?._id?.toString() || req.userId?.toString();

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User not authenticated",
      });
    }

    // Optional: roomId for audit/logging purposes only
    const { roomId, role } = req.body;

    console.log(`📡 Generating Tencent UserSig for user: ${userId}, room: ${roomId || "N/A"}, role: ${role || "N/A"}`);

    // Generate UserSig
    const userSigData = generateUserSig(userId);

    return res.status(200).json({
      status: true,
      message: "UserSig generated",
      data: userSigData,
    });
  } catch (error) {
    console.error("Error generating Tencent UserSig:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to generate UserSig",
    });
  }
};

/**
 * GET /api/client/live/tencentStatus
 *
 * Check if Tencent RTC is enabled and get basic config
 */
exports.getTencentStatus = async (req, res) => {
  try {
    const settings = global.settingJSON;

    return res.status(200).json({
      status: true,
      message: "Tencent status retrieved",
      data: {
        isTencentEnabled: settings?.isTencentEnabled || false,
        liveSdkProvider: settings?.liveSdkProvider || "agora",
        tencentSdkAppId: settings?.tencentSdkAppId || 0,
        isTencentEffectEnabled: settings?.isTencentEffectEnabled || false,

        // Android
        tencentEffectAppId: settings?.tencentEffectAppId || 0,
        tencentEffectLicenseUrl: settings?.tencentEffectLicenseUrl || "",
        tencentEffectLicenseKey: settings?.tencentEffectLicenseKey || "",
        tencentEffectPackageName: settings?.tencentEffectPackageName || "",

        // iOS
        tencentEffectIosAppId: settings?.tencentEffectIosAppId || 0,
        tencentEffectIosLicenseUrl: settings?.tencentEffectIosLicenseUrl || "",
        tencentEffectIosLicenseKey: settings?.tencentEffectIosLicenseKey || "",
        tencentEffectIosPackageName: settings?.tencentEffectIosPackageName || "",
      },
    });
  } catch (error) {
    console.error("Error getting Tencent status:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to get Tencent status",
    });
  }
};
