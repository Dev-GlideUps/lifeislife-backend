const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null },
    recursiveCommentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    commentText: { type: String, default: "" },
    like: { type: Number, default: 0 },
    dislike: { type: Number, default: 0 },
    totalReplies: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

commentSchema.index({ userId: 1 });
commentSchema.index({ postId: 1 });
commentSchema.index({ videoId: 1 });
commentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
