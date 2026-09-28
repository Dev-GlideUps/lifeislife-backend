const mongoose = require("mongoose");

const { STATUS_OF_HELP } = require("../types/constant");

const helpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    help: { type: String, default: "" },
    contact: { type: String, default: "" }, //Mobile Number Or Email
    image: { type: String, default: "" },
    status: { type: Number, enum: STATUS_OF_HELP, default: 1 }, // 1.pending 2.solved
    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

helpSchema.index({ createdAt: -1 });
helpSchema.index({ userId: 1 });
helpSchema.index({ status: 1 });

module.exports = mongoose.model("Complaint", helpSchema);
