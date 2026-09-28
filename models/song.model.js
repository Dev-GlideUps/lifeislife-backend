const mongoose = require("mongoose");

const songSchema = new mongoose.Schema(
  {
    songCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "SongCategory", default: null },
    songTitle: { type: String, default: "" },
    songImage: { type: String, default: "" },
    singerName: { type: String, default: "" },
    songTime: { type: Number, min: 0 }, //that value always save in seconds
    songLink: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

songSchema.index({ songCategoryId: 1 });
songSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Song", songSchema);
