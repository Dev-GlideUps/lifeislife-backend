const mongoose = require("mongoose");

const { VALIDITY_TYPE, RIDE_TYPE } = require("../types/constant");

const RideSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    type: { type: Number, enum: RIDE_TYPE, default: 1 }, //1.image, 2.gif, 3.svga
    image: { type: String, default: "" },
    svgaImage: { type: String, default: "" },
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

module.exports = mongoose.model("Ride", RideSchema);
