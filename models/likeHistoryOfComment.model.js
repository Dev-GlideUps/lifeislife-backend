const mongoose = require("mongoose");

const likeHistoryOfCommentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null }, //postId of post comment
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null }, //videoId of video comment
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

likeHistoryOfCommentSchema.index({ userId: 1 });
likeHistoryOfCommentSchema.index({ commentId: 1 });
likeHistoryOfCommentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("LikeHistoryOfComment", likeHistoryOfCommentSchema);
