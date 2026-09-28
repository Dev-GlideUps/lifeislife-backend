const mongoose = require("mongoose");

const coinplanSchema = new mongoose.Schema(
  {
    coin: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    productKey: { type: String, default: "" },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

coinplanSchema.index({ coin: 1, amount: 1 });

const CoinPlan = mongoose.models.CoinPlan || mongoose.model("CoinPlan", coinplanSchema);
module.exports = CoinPlan;
