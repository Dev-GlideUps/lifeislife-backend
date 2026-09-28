const mongoose = require("mongoose");

const ProfileVisitorSchema = new mongoose.Schema(
  {
    visitorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    profileOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    localVisitedAt: { type: String, default: "" },
    visitedAt: { type: Date, default: Date.now, index: { expires: 86400 } }, //Used for TTL auto-delete after 24 hours
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ProfileVisitorSchema.index({ visitorId: 1, profileOwnerId: 1 }, { unique: true });

module.exports = mongoose.model("ProfileVisitor", ProfileVisitorSchema);
