const mongoose = require("mongoose");

const { HOST_APPLICATION_TYPE } = require("../types/constant");

const hostApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null },
    status: { type: Number, enum: HOST_APPLICATION_TYPE, default: 1 },
    reason: { type: String, default: "" },
    appliedAt: { type: String, default: "" },
    reviewedAt: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("HostApplication", hostApplicationSchema);
