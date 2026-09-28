const mongoose = require("mongoose");

const { TYPE_OF_REPORT } = require("../types/constant");
const { STATUS_OF_REPORT } = require("../types/constant");

const reportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reportReason: { type: String, default: "" },
    type: { type: Number, enum: TYPE_OF_REPORT }, // 1.video 2.post 3.user-user
    status: { type: Number, enum: STATUS_OF_REPORT, default: 1 }, // 1.pending 2.solved
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

reportSchema.index({ userId: 1 });
reportSchema.index({ toUserId: 1 });
reportSchema.index({ videoId: 1 });
reportSchema.index({ postId: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
