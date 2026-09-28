const mongoose = require("mongoose");

const gameadminCoinSchema = new mongoose.Schema(
  {
    coin: { type: Number, required: true, default: 0 },
    totalCoin: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("GameadminCoin", gameadminCoinSchema);
