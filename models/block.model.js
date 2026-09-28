const mongoose = require("mongoose");

const BlockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // The user who is blocking
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // The user being blocked
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

BlockSchema.index({ userId: 1, toUserId: 1 }, { unique: true });

module.exports = mongoose.model("Block", BlockSchema);
