const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    uniquePostId: { type: String, unique: true, trim: true, default: "" },
    caption: { type: String, default: "" },
    mainPostImage: { type: String, default: "" },
    postImage: [
      {
        url: { type: String, trim: true, required: true },
        isBanned: { type: Boolean, default: false },
      },
    ],
    mentionedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    hashTagId: [{ type: mongoose.Schema.Types.ObjectId, ref: "HashTag", default: [] }],
    shareCount: { type: Number, default: 0 },
    isFake: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

postSchema.index({ userId: 1 });
postSchema.index({ hashTagId: 1 });
postSchema.index({ isFake: 1 });
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
