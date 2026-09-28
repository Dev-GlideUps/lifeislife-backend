const mongoose = require("mongoose");

const coinTraderHistorySchema = new mongoose.Schema(
  {
    coinTraderId: { type: mongoose.Schema.Types.ObjectId, ref: "CoinTrader", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isIncome: { type: Boolean, default: false },
    coin: { type: Number, default: 0 },
    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

coinTraderHistorySchema.index({ coinTraderId: 1 });

module.exports = mongoose.model("CoinTraderHistory", coinTraderHistorySchema);
