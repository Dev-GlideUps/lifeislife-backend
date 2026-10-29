const mongoose = require("mongoose");

//Recent PK opponents of a host (one document per direction of a pair), used for one-tap rematch
const pkOpponentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    opponentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastBattledAt: { type: Date, default: Date.now },
    battleCount: { type: Number, default: 0 }, //PK sessions played together
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

pkOpponentSchema.index({ userId: 1, opponentId: 1 }, { unique: true });
pkOpponentSchema.index({ userId: 1, lastBattledAt: -1 });
pkOpponentSchema.index({ lastBattledAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); //forget opponents after 30 days

module.exports = mongoose.model("PkOpponent", pkOpponentSchema);
