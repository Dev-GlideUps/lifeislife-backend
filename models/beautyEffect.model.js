const mongoose = require("mongoose");

const beautyEffectSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" }, // Effect name (e.g. Smooth, Whitening)
    icon: { type: String, default: "" },
    effect: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

beautyEffectSchema.index({ isActive: 1 });
beautyEffectSchema.index({ createdAt: -1 });

module.exports = mongoose.model("BeautyEffect", beautyEffectSchema);
