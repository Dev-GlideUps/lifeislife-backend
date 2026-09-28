const mongoose = require("mongoose");

const wealthLevelSchema = new mongoose.Schema(
  {
    level: { type: Number, unique: true },
    levelName: { type: String, trim: true, default: "" },
    levelImage: { type: String, default: "" },
    coinThreshold: { type: Number, default: 0 }, // Coins user must purchase to achieve this level
    permissions: {
      liveStreaming: { type: Boolean, default: false },
      freeCall: { type: Boolean, default: false },
      redeemCashout: { type: Boolean, default: false },
      uploadSocialPost: { type: Boolean, default: false },
      uploadVideo: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

wealthLevelSchema.index({ coinThreshold: 1 });

module.exports = mongoose.model("WealthLevel", wealthLevelSchema);
