const mongoose = require("mongoose");

const loginBonusTrackerSchema = new mongoose.Schema(
  {
    identity: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    mobileNumber: { type: String, trim: true, default: "" },
    loginType: { type: Number, required: true },
    rewardedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

loginBonusTrackerSchema.index({ loginType: 1 });

module.exports = mongoose.model("LoginBonusTracker", loginBonusTrackerSchema);
