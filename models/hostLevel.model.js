const mongoose = require("mongoose");

const hostLevelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    level: { type: Number, required: true },
    image: { type: String, default: "" },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    requiredCoin: { type: Number, default: 0 },
    requiredLiveDuration: { type: Number, default: 0 }, // in minutes
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

hostLevelSchema.index({ level: 1 });
hostLevelSchema.index({ createdAt: -1 });

module.exports = mongoose.model("HostLevel", hostLevelSchema);
