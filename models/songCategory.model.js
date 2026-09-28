const mongoose = require("mongoose");

const songCategorySchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    image: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

songCategorySchema.index({ createdAt: -1 });

module.exports = mongoose.model("SongCategory", songCategorySchema);
