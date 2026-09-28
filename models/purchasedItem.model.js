const mongoose = require("mongoose");

const { ITEM_TYPE } = require("../types/constant");

const PurchasedItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    itemType: { type: Number, enum: ITEM_TYPE }, //1.theme 2.avtarFrame 3.ride
    theme: { type: mongoose.Schema.Types.ObjectId, refPath: "Theme", default: null },
    avtarFrame: { type: mongoose.Schema.Types.ObjectId, refPath: "AvtarFrame", default: null },
    ride: { type: mongoose.Schema.Types.ObjectId, refPath: "Ride", default: null },
    purchaseDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

PurchasedItemSchema.index({ expiryDate: 1 });

module.exports = mongoose.model("PurchasedItem", PurchasedItemSchema);
