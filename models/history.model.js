const { HISTORY_TYPE, WITHDRAWAL_STATUS } = require("../types/constant");

const mongoose = require("mongoose");

const historySchema = new mongoose.Schema(
  {
    uniqueId: { type: String, unique: true, trim: true, default: "" },
    type: { type: Number, enum: HISTORY_TYPE },

    //for type 1,2,3,4,7,8,9,10,11,12,13,14,15,16,17,18,19,26,27,28,29,30,31
    coin: { type: Number, default: 0 },
    coinType: { type: Number, default: 1 }, // 1 = Gold, 2 = Silver

    //for type 5,6,25
    senderCoin: { type: Number, default: 0 }, //coin deducted from sender
    receiverCoin: { type: Number, default: 0 }, //coin added to receiver
    adminCoin: { type: Number, default: 0 }, //coin kept by admin

    luckyGiftReserve: { type: Number, default: 0 }, //coin kept by admin for lucky gift reserve
    luckyGiftMultiplier: { type: Number, default: 0 }, //lucky gift multiplier value
    luckyGiftEventId: { type: mongoose.Schema.Types.ObjectId, default: null },

    thirdPartyGameId: { type: Number, default: 0 },
    thirdPartyGameName: { type: String, default: "" },

    liveHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: "LiveStreamerHistory", default: null },
    liveType: { type: Number, enum: [1, 2, 3] }, // 1 = Video Live, 2 = Audio Live, 3 - Pk Live

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // Sender Or CoinTrader
    otherUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // Receiver
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null }, // Receiver
    hostAgencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null }, // Agency under which host earned

    giftCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCategory", default: null },
    giftId: { type: mongoose.Schema.Types.ObjectId, ref: "Gift", default: null },
    giftReceivedCount: { type: Number, default: 0 },
    giftCoin: { type: Number, default: 0 },
    giftTitle: { type: String, default: "" },
    giftImage: { type: String, default: "" },

    themeId: { type: mongoose.Schema.Types.ObjectId, ref: "Theme", default: null },
    avtarFrameId: { type: mongoose.Schema.Types.ObjectId, ref: "AvtarFrame", default: null },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },

    themeName: { type: String, default: "" },
    themeValidity: { type: Number, default: 0 },
    themeValidityType: { type: Number, default: 0 }, // 1=day, 2=month, 3=year

    avtarFrameName: { type: String, default: "" },
    avtarFrameValidity: { type: Number, default: 0 },
    avtarFrameValidityType: { type: Number, default: 0 }, // 1=day, 2=month, 3=year

    rideName: { type: String, default: "" },
    rideValidity: { type: Number, default: 0 },
    rideValidityType: { type: Number, default: 0 }, // 1=day, 2=month, 3=year

    callType: { type: String, default: "" }, //audio or video
    callConnect: { type: Boolean, default: false },
    isRandom: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    callStartTime: { type: String, default: "" },
    callEndTime: { type: String, default: "" },
    duration: { type: String, default: "00:00:00" }, //HH:mm:ss

    validity: { type: Number, default: 0 },
    validityType: { type: String, default: "" },
    amount: { type: Number, default: 0 },

    payoutStatus: { type: Number, default: 0, enum: WITHDRAWAL_STATUS },
    reason: { type: String, default: "" },

    paymentGateway: { type: String, default: "" },

    // In-App Purchase tracking (for once-per-token/transaction validation)
    purchaseToken: { type: String, default: null }, // Google Play purchaseToken
    transactionId: { type: String, default: null }, // Apple transactionId
    orderId: { type: String, default: null }, // Google Play orderId

    planId: { type: mongoose.Schema.Types.ObjectId, ref: "CoinPlan", default: null }, //for type 7

    baseType: { type: Number, default: 0 }, //for agency
    baseCoins: { type: Number, default: 0 }, //base coin for calculate agency's commission
    commissionRate: { type: Number, default: 0 }, //for agency

    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

historySchema.index({ type: 1 });
historySchema.index({ userId: 1 });
historySchema.index({ otherUserId: 1 });
historySchema.index({ giftId: 1 });
historySchema.index({ createdAt: -1 });
historySchema.index({ purchaseToken: 1 }, { sparse: true }); // For Google Play once-per-token
historySchema.index({ transactionId: 1 }, { sparse: true }); // For Apple once-per-transaction

module.exports = mongoose.model("History", historySchema);
