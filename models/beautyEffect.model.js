const mongoose = require("mongoose");

const beautyEffectSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" }, // Effect name (e.g. Smooth, Whitening)
    icon: { type: String, default: "" },
    effect: { type: String, default: "" },
    isActive: { type: Boolean, default: true },

    // Provider discriminator for SDK compatibility
    provider: { type: String, enum: ["deepar", "tencent"], default: "deepar" },
    effectType: { type: String, enum: ["filter", "sticker", "makeup", "segmentation", "beauty"], default: "beauty" },

    // Tencent Effect (Xmagic) specific fields
    asset: { type: String, default: "" }, // Asset URL for Xmagic bundles
    assetMd5: { type: String, default: "" }, // Optional integrity check
    assetVersion: { type: Number, default: 1 },
    bundleName: { type: String, default: "" }, // Name the SDK expects inside the bundle
    minSdkVersion: { type: String, default: "" }, // Optional minimum SDK version
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

beautyEffectSchema.index({ isActive: 1 });
beautyEffectSchema.index({ createdAt: -1 });
beautyEffectSchema.index({ provider: 1, isActive: 1 });

module.exports = mongoose.model("BeautyEffect", beautyEffectSchema);
