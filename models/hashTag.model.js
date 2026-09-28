const mongoose = require("mongoose");

const hashTagSchema = new mongoose.Schema(
  {
    hashTag: { type: String, unique: true, trim: true, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

hashTagSchema.index({ createdAt: -1 });

module.exports = mongoose.model("HashTag", hashTagSchema);
