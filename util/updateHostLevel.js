const User = require("../models/user.model");
const HostLevel = require("../models/hostLevel.model");

const updateHostLevel = async (userId) => {
  try {
    const [user, hostLevels] = await Promise.all([User.findById(userId).select("earnedHostCoins hostLevel").lean(), HostLevel.find({ isActive: true }).sort({ level: 1 }).lean()]);

    if (!user) {
      console.log("User not found");
      return { status: false, message: "User not found" };
    }

    if (!hostLevels || hostLevels.length === 0) {
      console.log("No host levels found");
      return { status: false, message: "No host levels found" };
    }

    let newLevel = hostLevels[0];

    if (user.earnedHostCoins > 0) {
      newLevel = hostLevels.reduce((prev, level) => {
        return user.earnedHostCoins >= level.requiredCoin ? level : prev;
      }, hostLevels[0]);
    }

    if (!user.hostLevel || user.hostLevel.toString() !== newLevel._id.toString()) {
      await User.updateOne({ _id: userId }, { $set: { hostLevel: newLevel._id } });
    }

    return { status: true, hostLevel: newLevel };
  } catch (error) {
    console.error("Error updating host level:", error);
    return { status: false, error: error.message };
  }
};

module.exports = updateHostLevel;
