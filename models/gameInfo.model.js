const mongoose = require("mongoose");

const GameInfoSchema = new mongoose.Schema(
  {
    gameId: { type: Number, default: 0 },
    name: { type: String, default: "" },
    previewUrl: { type: String, default: "" },
    gameVersion: { type: String, default: "" },
    downloadUrl: { type: String, default: "" },
    lastSyncedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("GameInfo", GameInfoSchema);
