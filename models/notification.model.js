const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, //to whom notification send
    otherUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    image: { type: String, default: "" },
    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1 });
notificationSchema.index({ otherUserId: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
