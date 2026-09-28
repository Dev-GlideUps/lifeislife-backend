const mongoose = require("mongoose");

const ReferralSchema = new mongoose.Schema(
  {
    referralCodeUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    referees: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        date: { type: String, default: "" },
      },
    ],
    totalReferrals: { type: Number, default: 0 }, // Total successful referrals
    earnedCoins: { type: Number, default: 0 }, // Total earned coins from referrals
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Referral", ReferralSchema);
