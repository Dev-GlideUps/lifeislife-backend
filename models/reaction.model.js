const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    image: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

reactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Reaction", reactionSchema);
