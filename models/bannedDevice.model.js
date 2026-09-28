const mongoose = require("mongoose");

const bannedDeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, trim: true, unique: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("BannedDevice", bannedDeviceSchema);
