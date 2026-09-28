const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    mentionedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    hashTagId: [{ type: mongoose.Schema.Types.ObjectId, ref: "HashTag", default: [] }],
    songId: { type: mongoose.Schema.Types.ObjectId, ref: "Song", default: null },
    uniqueVideoId: { type: String, unique: true, trim: true, default: "" },
    caption: { type: String, default: "" },
    videoTime: { type: Number, min: 0 }, //that value always save in seconds
    videoImage: { type: String, default: "" },
    videoUrl: { type: String, default: "" },
    shareCount: { type: Number, default: 0 },
    isFake: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

videoSchema.index({ userId: 1 });
videoSchema.index({ songId: 1 });
videoSchema.index({ isFake: 1 });
videoSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Video", videoSchema);
