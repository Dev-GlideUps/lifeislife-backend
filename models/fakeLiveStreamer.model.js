const mongoose = require("mongoose");

const { IMAGE_VIDEO_TYPE } = require("../types/constant");

const fakeLiveStreamerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isStreaming: { type: Boolean, default: true },

    streamType: { type: Number, enum: [1, 2, 3, 4] }, // 1.normal-live, 2.audio-live, 3.pk-live, 4.multi-live, 5:call-join

    thumbnailType: { type: Number, enum: IMAGE_VIDEO_TYPE }, // 1.link, 2.file
    thumbnail: { type: String, default: "" },
    pkThumbnails: { type: Array, default: [] },
    multiLiveThumbnails: { type: Array, default: [] },

    streamSourceType: { type: Number, enum: IMAGE_VIDEO_TYPE }, // 1.link, 2.file
    streamSource: { type: String, default: "" },
    pkStreamSources: { type: Array, default: [] },
    multiLiveStreamSources: { type: Array, default: [] },

    roomName: { type: String, default: "" },
    roomWelcome: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

fakeLiveStreamerSchema.index({ userId: 1 });
fakeLiveStreamerSchema.index({ isStreaming: 1 });
fakeLiveStreamerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("FakeLiveStreamer", fakeLiveStreamerSchema);
