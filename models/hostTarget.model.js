const mongoose = require("mongoose");

const hostTargetSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    title: { type: String, default: "" },

    requiredLiveMinutes: { type: Number, default: 0 },
    requiredValidDays: { type: Number, default: 0 },
    requiredReceiveCoins: { type: Number, default: 0 },

    liveBonusBeans: { type: Number, default: 0 },
    coinBonusBeans: { type: Number, default: 0 },
    fullBonusBeans: { type: Number, default: 0 },

    frameReward: { type: mongoose.Schema.Types.ObjectId, ref: "AvtarFrame", default: null },
    rideReward: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },
    themeReward: { type: mongoose.Schema.Types.ObjectId, ref: "Theme", default: null },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("HostTarget", hostTargetSchema);
