const ReferralSystem = require("../../models/referralSystem.model");

//get referral system
exports.fetchReferralSystems = async (req, res) => {
  try {
    const referralSettings = await ReferralSystem.find().sort({ targetReferrals: 1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Referral system settings retrieved successfully!",
      data: referralSettings,
    });
  } catch (error) {
    console.error("Error retrieving referral system settings:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
