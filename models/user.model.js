const { LOGIN_TYPE, ROLE_TYPE } = require("../types/constant");

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    userName: { type: String, default: "" },
    gender: { type: String, default: "" },
    bio: { type: String, default: "" },
    age: { type: Number, default: 18 },
    image: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    isProfilePicBanned: { type: Boolean, default: false },
    email: { type: String, default: "" },
    mobileNumber: { type: String, default: "" },
    countryFlagImage: { type: String, default: "" },
    country: { type: String, lowercase: true, default: "" },
    ipAddress: { type: String, default: "" },
    loginType: { type: Number, enum: LOGIN_TYPE }, //1.mobileNumber 2.google 3.quick(identity) 4.email-password 5.apple 6.facebook
    identity: { type: String, default: "" },
    facebookId: { type: String, default: "" },
    fcmToken: { type: String, default: null },
    uniqueId: { type: String, unique: true, default: "" },

    referralCode: { type: String, trim: true },

    firebaseUid: { type: String, default: "" }, //firebase uid
    provider: { type: String, default: "" },

    coin: { type: Number, default: 0 }, // Gold - for spending only
    silverCoin: { type: Number, default: 0 }, // Silver - earned from gifts/calls, for withdrawal
    loginRewardCoins: { type: Number, default: 0 },
    topUpCoins: { type: Number, default: 0 }, //totalTopUp (Total coins the user has topped up)
    receivedCoins: { type: Number, default: 0 }, //call + gift + referral bonus
    spentCoins: { type: Number, default: 0 },
    withdrawnCoins: { type: Number, default: 0 },
    withdrawnAmount: { type: Number, default: 0 },
    receivedGifts: { type: Number, default: 0 },

    isHostBlocked: { type: Boolean, default: false },

    earnedHostCoins: { type: Number, default: 0 }, //total coins earned by host from call + gift

    hostLevel: { type: mongoose.Schema.Types.ObjectId, ref: "HostLevel", default: null },

    // Host Target Tracking Fields
    hostLifetimeLiveMinutes: { type: Number, default: 0 },
    hostLifetimeReceivedCoins: { type: Number, default: 0 },
    hostCurrentLiveMinutes: { type: Number, default: 0 }, // Reset on target completion and monthly
    hostCurrentReceivedCoins: { type: Number, default: 0 }, // Reset on target completion and monthly

    wealthLevel: { type: mongoose.Schema.Types.ObjectId, ref: "WealthLevel", default: null },
    activeAvtarFrame: { type: mongoose.Schema.Types.ObjectId, ref: "AvtarFrame", default: null },
    activeTheme: { type: mongoose.Schema.Types.ObjectId, ref: "Theme", default: null },
    activeRide: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },

    isBlock: { type: Boolean, default: false }, // normal block (existing system)
    isInstantBlock: { type: Boolean, default: false }, // instant block/unblock by admin (socket based)
    isDeviceBanned: { type: Boolean, default: false }, // banned device

    isFake: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    isBusy: { type: Boolean, default: false },

    isVIP: { type: Boolean, default: false },

    role: { type: [Number], enum: ROLE_TYPE, default: [1] },

    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null }, //If host is under an agency
    agencyOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null }, //If user is an agency

    isLive: { type: Boolean, default: false },
    liveHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: "LiveStreamerHistory", default: null },
    liveStreamerId: { type: mongoose.Schema.Types.ObjectId, ref: "LiveStreamer", default: null },

    isLiveBanned: { type: Boolean, default: false },
    liveBanReason: { type: String, default: "" },
    liveBanAt: { type: Date, default: null },
    liveBanUntil: { type: Date, default: null },

    callId: { type: String, default: null },

    isPushNotificationEnabled: { type: Boolean, default: true },

    videoCallRate: { type: Number, default: 0 }, // per-minute video call rate
    audioCallRate: { type: Number, default: 0 }, // per-minute audio call rate

    isVideoCallEnabled: { type: Boolean, default: true },
    isAudioCallEnabled: { type: Boolean, default: true },

    lastlogin: { type: String, default: "" },
    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ identity: 1, loginType: 1 });
userSchema.index({ isBlock: 1 });
userSchema.index({ isInstantBlock: 1 });
userSchema.index({ isFake: 1 });
userSchema.index({ wealthLevel: 1 });
userSchema.index({ activeAvtarFrame: 1 });
userSchema.index({ activeTheme: 1 });
userSchema.index({ activeRide: 1 });
userSchema.index({ role: 1 });
userSchema.index({ agencyId: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
