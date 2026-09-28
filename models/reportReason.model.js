const mongoose = require("mongoose");

const reportReasonSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

reportReasonSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ReportReason", reportReasonSchema);
