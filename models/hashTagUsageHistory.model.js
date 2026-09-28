const mongoose = require("mongoose");

const hashTagUsageHistorySchema = new mongoose.Schema(
  {
    hashTagCreator: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    hashTagId: { type: mongoose.Schema.Types.ObjectId, ref: "HashTag", default: null },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

hashTagUsageHistorySchema.index({ hashTagId: 1, videoId: 1 });
hashTagUsageHistorySchema.index({ hashTagId: 1, postId: 1 });
hashTagUsageHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model("HashTagUsageHistory", hashTagUsageHistorySchema);
