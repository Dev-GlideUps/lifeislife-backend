const mongoose = require("mongoose");

const songFavoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    songId: { type: mongoose.Schema.Types.ObjectId, ref: "Song", default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

songFavoriteSchema.index({ userId: 1 });
songFavoriteSchema.index({ songId: 1 });
songFavoriteSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SongFavorite", songFavoriteSchema);
