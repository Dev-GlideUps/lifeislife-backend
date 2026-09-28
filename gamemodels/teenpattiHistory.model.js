const mongoose = require("mongoose");

const teenpattiHistorySchema = new mongoose.Schema(
  {
    cardCoin: { type: Array, default: [] },
    date: { type: String, default: "" },
    winnerIndex: { type: Number, default: 0 },
    userBits: { type: Array, default: [] },
    combination: { type: Array, default: [] },
    updatedAdminCoin: { type: Number, default: 0 },
    winnerCoinMinus: { type: Number, default: 0 },
    totalAdd: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("TeenPattiHistory", teenpattiHistorySchema);
