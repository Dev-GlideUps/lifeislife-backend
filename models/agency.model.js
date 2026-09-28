const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agencyCode: { type: String, unique: true },
    agencyName: { type: String, default: "" },
    image: { type: String, default: "" },
    countryFlagImage: { type: String, default: "" },
    country: { type: String, lowercase: true, default: "" },
    mobileNumber: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    description: { type: String, default: "" },
    commissionRate: { type: Number, default: 0 }, //commission on gift coin and call charge coin

    hostCoins: { type: Number, default: 0, min: 0 }, // host earnings
    totalEarnings: { type: Number, default: 0, min: 0 }, // agency commission earnings
    netAvailableEarnings: { type: Number, default: 0, min: 0 }, // withdrawable balance after withdrawals [ totalEarnings - totalWithdrawn ]
    totalWithdrawn: { type: Number, default: 0, min: 0 },
    totalWithdrawnAmount: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("Agency", agencySchema);
