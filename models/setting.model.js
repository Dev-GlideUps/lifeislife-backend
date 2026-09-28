const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
  name: { type: String, default: "NAME" },
  image: { type: String, default: "IMAGE" },
  link: { type: String, default: "LINK" },
  minWinPercent: { type: Number, default: 0 },
  maxWinPercent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

const settingSchema = new mongoose.Schema(
  {
    isGooglePlayEnabled: { type: Boolean, default: false },
    googlePlayServiceAccountEmail: { type: String, default: "GOOGLE PLAY SERVICE ACCOUNT EMAIL" },
    googlePlayPrivateKey: { type: Object, default: {} },

    isStripeEnabled: { type: Boolean, default: false },
    stripePublishableKey: { type: String, default: "STRIPE PUBLISHABLE KEY" },
    stripeSecretKey: { type: String, default: "STRIPE SECRET KEY" },

    isRazorpayEnabled: { type: Boolean, default: false },
    razorPayId: { type: String, default: "RAZOR PAY ID" },
    razorSecretKey: { type: String, default: "RAZOR SECRET KEY" },

    isFlutterwaveEnabled: { type: Boolean, default: false },
    flutterWaveId: { type: String, default: "FLUTTER WAVE ID" },

    paypalClientId: { type: String, default: "PAYPAL_CLIENT_ID" },
    paypalSecret: { type: String, default: "PAYPAL_SECRET" },
    isPaypalEnabled: { type: Boolean, default: false },

    paystackSecretKey: { type: String, default: "PAYSTACK_SECRET_KEY" },
    isPaystackEnabled: { type: Boolean, default: false },

    cashfreeClientId: { type: String, default: "CASHFREE_APP_ID" },
    cashfreeClientSecret: { type: String, default: "CASHFREE_SECRET_KEY" },
    isCashfreeEnabled: { type: Boolean, default: false },

    isNowPaymentsEnabled: { type: Boolean, default: false },
    nowPaymentsApiKey: { type: String, default: "" },
    nowPaymentsIpnSecret: { type: String, default: "" },
    nowPaymentsBaseUrl: { type: String, default: "https://api-sandbox.nowpayments.io/v1" },

    isAgoraEnabled: { type: Boolean, default: true },
    agoraAppId: { type: String, default: "AGORA APP ID" },
    agoraAppCertificate: { type: String, default: "AGORA APP CERTIFICATE" },

    isZegoEnabled: { type: Boolean, default: false },
    zegoAppId: { type: String, default: "" },
    zegoAppSign: { type: String, default: "" },
    zegoServerSecret: { type: String, default: "" },

    privacyPolicyLink: { type: String, default: "PRIVACY POLICY LINK" },
    termsOfUsePolicyLink: { type: String, default: "TERMS OF USE POLICY LINK" },
    abouUpolicylink: { type: String, default: "ABOUT US POLICY LINK" },

    isDummyData: { type: Boolean, default: false },
    loginBonus: { type: Number, default: 5000 },
    userNameChangeCoin: { type: Number, default: 0 },
    anonymousCoin: { type: Number, default: 0 },

    privateCallRate: { type: Number, default: 0 }, //per minute
    privateAudioCallRate: { type: Number, default: 0 },

    durationOfShorts: { type: Number, default: 0 }, //in seconds

    minCoinsToCashOut: { type: Number, default: 0 }, //min coin requried for convert coin to default currency i.e., 1000 coin = 1 $
    minCoinsForPayout: { type: Number, default: 0 },
    agencyMinPayout: { type: Number, default: 0 },

    pkEndTime: { type: Number, default: 60 }, //max time in seconds

    adminRate: { type: Number, default: 10, min: 0, max: 100 }, // admin charge  %; 0 allowed, over 100 not allowed
    agencyRate: { type: Number, default: 0, min: 0, max: 100 }, // Agency minimum commission rate %; 0 allowed, over 100 not allowed

    coinGameThreshold: { type: Number, default: 0 }, //If any user sends coins more than this threshold, then an announcement is broadcast to all users (like a "game winning banner").
    coinBroadcastThreshold: { type: Number, default: 0 }, //If any user sends coins more than this threshold, then an announcement is broadcast to all users (like a "gif winning banner").

    luckyGiftAdminTaxPercent: { type: Number, default: 10 },
    luckyGiftReceiverSharePercent: { type: Number, default: 10 },
    luckyGiftTargetCoin: { type: Number, default: 0 },

    currency: {
      name: { type: String, default: "" },
      symbol: { type: String, default: "" },
      countryCode: { type: String, default: "" },
      currencyCode: { type: String, default: "" },
      isDefault: { type: Boolean, default: false },
    }, //default currency

    privateKey: { type: Object, default: {} }, //firebase.json handle notification

    profilePhotoList: { type: Array, default: [] },
    fakeAudioCallAudioList: { type: Array, default: [] },
    fakeVideoCallVideoList: { type: Array, default: [] },

    //video banned setting
    videoBanned: { type: Array, default: [] },
    postBanned: { type: Array, default: [] },
    sightengineUser: { type: String, default: "API USER" },
    sightengineApiSecret: { type: String, default: "API SECRET" },

    //shorts effect setting
    shortsEffectEnabled: { type: Boolean, default: false },
    androidEffectLicenseKey: { type: String, default: "LICENSE KEY" },
    iosEffectLicenseKey: { type: String, default: "LICENSE KEY" },

    watermarkStatus: { type: Number, enum: [1, 2] }, //1.active 2.inactive
    watermarkEnabled: { type: Boolean, default: false },
    watermarkIcon: { type: String, default: "" },

    resendApiKey: { type: String, default: "" },

    isThirdPartyGameEnabled: { type: Boolean, default: false },
    baishunTestServer: { type: String, default: "" },
    baishunProdServer: { type: String, default: "" },
    baishunAppKey: { type: String, default: "" },
    baishunAppChannel: { type: String, default: "" },
    baishunAppId: { type: Number, default: 0 },

    game: [gameSchema],
    gameCoin: { type: Array, default: [100, 200, 500, 1000, 2000] },

    androidAssetLinks: { type: Array, default: [] },
    appleAppSiteAssociation: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

settingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Setting", settingSchema);
