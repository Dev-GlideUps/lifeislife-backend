const mongoose = require("mongoose");

const liveStreamerHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", degfault: null },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null }, //If host is under an agency
    sessionId: { type: String, default: "" }, //live_12345_001
    liveType: { type: Number, enum: [1, 2, 3, 4], required: true }, //1.normal-live 2.audio-live 3.multi-live 4.call-join
    isAudio: { type: Boolean, default: false },
    isPkMode: { type: Boolean, default: false },
    pkId: { type: Number, default: 0 },
    pkEndTime: { type: Date, default: null },
    earnedCoins: { type: Number, default: 0 },
    receivedGifts: { type: Number, default: 0 },
    viewerCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    increasedFans: { type: Number, default: 0 },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    duration: { type: String, default: "00:00:00" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

liveStreamerHistorySchema.index({ createdAt: -1 });
liveStreamerHistorySchema.index({ userId: 1 });

module.exports = mongoose.model("LiveStreamerHistory", liveStreamerHistorySchema);
