const mongoose = require("mongoose");

const { VALIDITY_TYPE } = require("../types/constant");

const ThemeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    image: { type: String, default: "" },
    coin: { type: Number, default: 0 },
    validity: { type: Number, default: 0 },
    validityType: { type: Number, enum: VALIDITY_TYPE }, //1.day 2.month 3.year
    isRecommended: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isDelete: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Theme", ThemeSchema);
