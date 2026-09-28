const mongoose = require("mongoose");

const hostTargetProgressSchema = new mongoose.Schema(
  {
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: "HostTarget", default: null },
    order: { type: Number, default: 0 },

    month: { type: Number, default: 0 }, // UTC Month (0-11)
    year: { type: Number, default: 0 }, // UTC Year

    currentLiveMinutes: { type: Number, default: 0 },
    currentReceivedCoins: { type: Number, default: 0 },
    currentValidDays: { type: Number, default: 0 },
    validDaysList: { type: [String], default: [] }, // Array of dates in YYYY-MM-DD format

    isLiveRewardClaimed: { type: Boolean, default: false },
    isCoinRewardClaimed: { type: Boolean, default: false },
    isFullRewardClaimed: { type: Boolean, default: false },

    isCompleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

hostTargetProgressSchema.index({ hostId: 1 });
hostTargetProgressSchema.index({ targetId: 1 });
hostTargetProgressSchema.index({ month: 1, year: 1 });

module.exports = mongoose.model("HostTargetProgress", hostTargetProgressSchema);
