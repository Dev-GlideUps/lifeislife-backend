const mongoose = require("mongoose");

const { GIFT_TYPE } = require("../types/constant");

const giftSchema = new mongoose.Schema(
  {
    giftCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCategory", default: null },
    title: { type: String, default: "" },
    type: { type: Number, enum: GIFT_TYPE, default: 1 }, //1.image, 2.gif, 3.svga
    image: { type: String, default: "" },
    svgaImage: { type: String, default: "" },
    coin: { type: Number, default: 0 },
    isDelete: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

giftSchema.index({ coin: 1 });
giftSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Gift", giftSchema);
