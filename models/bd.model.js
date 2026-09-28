const mongoose = require("mongoose");

const bdSchema = new mongoose.Schema(
  {
    bdRegionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BdRegion" }] /** One BD can cover multiple regions; empty = none assigned yet */,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bdCode: { type: String, unique: true },
    bdName: { type: String, default: "" },
    image: { type: String, default: "" },
    mobileNumber: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    description: { type: String, default: "" },
    commissionRate: { type: Number, default: 0 },
    totalEarning: { type: Number, default: 0, min: 0 }, // total coins earned by bd from call + gift
    netEarning: { type: Number, default: 0, min: 0 }, // total coins earned by bd from call + gift after deducting total coins withdrawn
    totalWithdrawn: { type: Number, default: 0, min: 0 },
    totalWithdrawnAmount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bdSchema.index({ bdRegionIds: 1 });
bdSchema.index({ userId: 1 });
bdSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Bd", bdSchema);
