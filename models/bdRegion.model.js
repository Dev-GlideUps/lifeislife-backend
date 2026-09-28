const crypto = require("crypto");
const mongoose = require("mongoose");

const bdRegionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // e.g. REG-042891
    name: { type: String, required: true, trim: true },
    countryFlagImage: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bdRegionSchema.index({ createdAt: -1 });
bdRegionSchema.index({ isActive: 1 });

bdRegionSchema.statics.generateUniqueCode = async function generateUniqueCode() {
  for (let i = 0; i < 40; i += 1) {
    const n = crypto.randomInt(0, 1_000_000);
    const code = `REG-${String(n).padStart(6, "0")}`;
    const exists = await this.exists({ code });
    if (!exists) return code;
  }
  const fallback = `REG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  if (!(await this.exists({ code: fallback }))) return fallback;
  return `REG-${Date.now()}`;
};

module.exports = mongoose.model("BdRegion", bdRegionSchema);
