const mongoose = require("mongoose");

const { WITHDRAWAL_STATUS, WITHDRAWAL_PERSON } = require("../types/constant");

const payoutRequestSchema = new mongoose.Schema(
  {
    person: { type: Number, enum: WITHDRAWAL_PERSON }, // 1. agency 2. host 3. user
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    uniqueId: { type: String, default: "" },
    status: { type: Number, default: 1, enum: WITHDRAWAL_STATUS },
    coin: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    paymentGateway: { type: String, default: "" },
    paymentDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    reason: { type: String, default: "" },
    requestDate: { type: String, default: "" },
    acceptOrDeclineDate: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

payoutRequestSchema.index({ status: 1 });
payoutRequestSchema.index({ person: 1 });
payoutRequestSchema.index({ userId: 1, person: 1 });
payoutRequestSchema.index({ person: 1, status: 1, userId: 1 });
payoutRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PayoutRequest", payoutRequestSchema);
