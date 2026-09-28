const ReferralSystem = require("../../models/referralSystem.model");

//create referral system
exports.addReferralSystem = async (req, res) => {
  try {
    const { targetReferrals, rewardCoins } = req.query;

    if (!targetReferrals || !rewardCoins) {
      return res.status(200).json({ status: false, message: "Missing required fields!" });
    }

    const referralSystem = new ReferralSystem({
      targetReferrals,
      rewardCoins,
      isActive: true,
    });

    await referralSystem.save();

    return res.status(200).json({
      status: true,
      message: "Referral system setting created successfully!",
      data: referralSystem,
    });
  } catch (error) {
    console.error("Error creating referral system setting:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//update referral system
exports.modifyReferralSystem = async (req, res) => {
  try {
    const { targetReferrals, rewardCoins, referralId } = req.query;

    if (!referralId) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details!" });
    }

    const referralSystem = await ReferralSystem.findById(referralId);
    if (!referralSystem) {
      return res.status(200).json({ status: false, message: "Oops! Referral system not found!" });
    }

    if (targetReferrals !== undefined) referralSystem.targetReferrals = targetReferrals;
    if (rewardCoins !== undefined) referralSystem.rewardCoins = rewardCoins;

    await referralSystem.save();

    return res.status(200).json({
      status: true,
      message: "Referral system has been updated by admin!",
      data: referralSystem,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//update referral system active status
exports.updateReferralSystemState = async (req, res) => {
  try {
    const { referralId } = req.query;

    if (!referralId) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details!" });
    }

    const referralSetting = await ReferralSystem.findById(referralId);
    if (!referralSetting) {
      return res.status(200).json({ status: false, message: "Oops! Referral setting not found!" });
    }

    referralSetting.isActive = !referralSetting.isActive;
    await referralSetting.save();

    return res.status(200).json({
      status: true,
      message: "Referral system status has been updated successfully!",
      data: referralSetting,
    });
  } catch (error) {
    console.error("Error updating referral system status:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get referral system
exports.retrieveReferralSystems = async (req, res) => {
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

//delete referral system
exports.removeReferralSystem = async (req, res) => {
  try {
    const { referralId } = req.query;

    if (!referralId) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details!" });
    }

    const referralSetting = await ReferralSystem.findById(referralId);
    if (!referralSetting) {
      return res.status(200).json({ status: false, message: "Oops! Referral setting not found!" });
    }

    await referralSetting.deleteOne();

    return res.status(200).json({
      status: true,
      message: "Referral system setting has been deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting referral system setting:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
