const mongoose = require("mongoose");

const RouletteHistorySchema = new mongoose.Schema(
  {
    cardCoin: { type: Array, default: [] },
    winnerObj: { type: Object, default: {} },
    updatedAdminCoin: { type: Number, default: 0 },
    winnerCoinMinus: { type: Number, default: 0 },
    totalAdd: { type: Number, default: 0 },
    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("RouletteHistory", RouletteHistorySchema);
