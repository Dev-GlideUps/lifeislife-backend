const mongoose = require("mongoose");

const subadminSchema = new mongoose.Schema(
  {
    authId: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: "Role", required: true },
    isActive: { type: Boolean, default: true },
    lastLoginIp: { type: String, trim: true, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

subadminSchema.index({ createdAt: -1 });
subadminSchema.index({ isActive: 1 });

module.exports = mongoose.model("Subadmin", subadminSchema);
