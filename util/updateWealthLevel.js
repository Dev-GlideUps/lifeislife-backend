const User = require("../models/user.model");
const WealthLevel = require("../models/wealthLevel.model");

const updateWealthLevel = async (userId) => {
  try {
    const [user, wealthLevels] = await Promise.all([User.findById(userId).select("topUpCoins wealthLevel").lean(), WealthLevel.find().select("coinThreshold").sort({ coinThreshold: 1 }).lean()]);

    if (!user) {
      console.log("User not found");
      return { status: false, message: "User not found" };
    }

    if (!wealthLevels || wealthLevels.length === 0) {
      console.log("No wealth levels found");
      return { status: false, message: "No wealth levels found" };
    }

    if (wealthLevels.length > 0) {
      // Default to the lowest wealth level if no purchased coins
      let newWealthLevel = wealthLevels[0];

      // If the user has purchased coins, find the appropriate level
      if (user.topUpCoins > 0) {
        newWealthLevel = wealthLevels.reduce((prev, level) => {
          return user.topUpCoins >= level.coinThreshold ? level : prev;
        }, wealthLevels[0]); // Start with the lowest level
      }

      // Check if the user's wealth level needs
      if (!user.wealthLevel || user.wealthLevel.toString() !== newWealthLevel._id.toString()) {
        await User.updateOne({ _id: userId }, { $set: { wealthLevel: newWealthLevel._id } });
      }

      return { status: true, wealthLevel: newWealthLevel };
    }
  } catch (error) {
    console.error("Error updating wealth level:", error);
    return { status: false, error: error.message };
  }
};

module.exports = updateWealthLevel;
