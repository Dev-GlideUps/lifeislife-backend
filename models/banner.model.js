const mongoose = require("mongoose");

const { BANNER_TYPE } = require("../types/constant");

const bannerSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    redirectUrl: { type: String, trim: true, default: "" },
    bannerType: { type: Number, enum: BANNER_TYPE },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

bannerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Banner", bannerSchema);
