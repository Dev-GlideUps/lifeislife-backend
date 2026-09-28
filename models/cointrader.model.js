const mongoose = require("mongoose");

const coinTraderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    uniqueId: { type: Number, default: 0 }, // uniqueId of the user
    countryCode: { type: String, default: "" },
    mobileNumber: { type: String, default: "" },
    coin: { type: Number, default: 0 },
    spendCoin: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

coinTraderSchema.index({ uniqueId: 1 });
coinTraderSchema.index({ isActive: 1 });

module.exports = mongoose.model("CoinTrader", coinTraderSchema);
