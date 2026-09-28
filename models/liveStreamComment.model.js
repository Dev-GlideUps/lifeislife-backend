const mongoose = require("mongoose");

const liveStreamCommentSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    userName: { type: String, default: "" },
    image: { type: String, default: "" },
    isProfilePicBanned: { type: Boolean, default: false },
    age: { type: Number, default: 18 },
    gender: { type: String, default: "" },
    countryFlagImage: { type: String, default: "" },
    country: { type: String, lowercase: true, default: "" },
    uniqueId: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    avtarFrameType: { type: Number, default: 0 },
    avtarFrame: { type: String, default: "" },
    fcmToken: { type: String, default: null },
    isBlock: { type: Boolean, default: false },
    isPushNotificationEnabled: { type: Boolean, default: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // commenter
    liveUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // live stream host ( live user's _id )
    liveStreamerId: { type: mongoose.Schema.Types.ObjectId, ref: "LiveStreamer", default: null },
    liveHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: "LiveStreamerHistory", default: null },
    comment: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

liveStreamCommentSchema.index({ userId: 1, liveStreamerId: 1 });

module.exports = mongoose.model("LiveStreamComment", liveStreamCommentSchema);
