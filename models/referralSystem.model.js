const mongoose = require("mongoose");

const ReferralSystemSchema = new mongoose.Schema(
  {
    targetReferrals: { type: Number, required: true },
    rewardCoins: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("ReferralSystem", ReferralSystemSchema);
