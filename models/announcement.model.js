const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    mediaType: { type: String, enum: ["", "image", "video"], default: "" },
    media: { type: String, trim: true, default: "" },
    thumbnail: { type: String, trim: true, default: "" },
    redirectUrl: { type: String, trim: true, default: "" },
    audienceType: { type: String, enum: ["all", "user"], default: "all", index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ audienceType: 1, createdAt: -1 });
announcementSchema.index({ userId: 1 });

module.exports = mongoose.model("Announcement", announcementSchema);
