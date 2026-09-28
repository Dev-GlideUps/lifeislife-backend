const mongoose = require("mongoose");

const watchHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null },
    videoUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, //userId of the particular video
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

watchHistorySchema.index({ userId: 1 });
watchHistorySchema.index({ videoId: 1 });
watchHistorySchema.index({ videoUserId: 1 });

module.exports = mongoose.model("WatchHistory", watchHistorySchema);
