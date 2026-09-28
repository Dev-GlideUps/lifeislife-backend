const mongoose = require("mongoose");

const likeHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, //user who like on video Or post
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, //represents the owner of video or post
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

likeHistorySchema.index({ videoId: 1 });
likeHistorySchema.index({ postId: 1 });
likeHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model("LikeHistory", likeHistorySchema);
