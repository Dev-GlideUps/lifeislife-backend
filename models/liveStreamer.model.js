const mongoose = require("mongoose");
const seat = require("../util/defaultSeat");
const requestedDefault = require("../util/requestedDefault");

const liveStreamerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    liveHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: "LiveStreamerHistory", default: null },

    countryFlagImage: { type: String, default: "" },
    country: { type: String, lowercase: true, default: "" },

    agoraUid: { type: Number, default: 0 },
    channel: { type: String, default: "" },
    token: { type: String, default: "" },
    earnedCoins: { type: Number, default: 0 }, //room coin earned during live
    hostCoins: { type: Number, default: 0 }, //coin earned during live

    view: { type: Number, default: 0 },
    liveType: { type: Number, enum: [0, 1, 2, 3, 4], default: 0 }, //1.normal-live 2.audio-live 3.multi-live 4.call-join

    isPkMode: { type: Boolean, default: false },
    pkEndTime: { type: String, default: null },
    pkId: { type: String, default: null },
    pkConfig: {
      host1Id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, //user who started Pk
      host1Name: { type: String, default: "" },
      host1Image: { type: String, default: "" },
      host1UniqueId: { type: String, default: "" },
      host1ObjId: { type: String, default: "" },
      host1LiveId: { type: String, default: "" },
      host1Channel: { type: String, default: "" },
      host1AgoraUID: { type: Number, default: 0 },

      host2Id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, //user who joined in Pk
      host2Name: { type: String, default: "" },
      host2userName: { type: String, default: "" },
      host2Image: { type: String, default: "" },
      host2UniqueId: { type: String, default: "" },
      host2ObjId: { type: String, default: "" },
      host2LiveId: { type: String, default: "" },
      host2Channel: { type: String, default: "" },
      host2AgoraUID: { type: Number, default: 0 },

      localRank: { type: Number, default: 0 },
      localGiftCount: { type: Number, default: 0 },
      remoteRank: { type: Number, default: 0 },
      remoteGiftCount: { type: Number, default: 0 },
      isWinner: { type: Number, enum: [0, 1, 2], default: 0 }, // 0: draw(tie), 1: loose, 2: winner

      host1Details: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        name: { type: String, default: "" },
        userName: { type: String, default: "" },
        image: { type: String, default: "" },
        isProfilePicBanned: { type: Boolean, default: false },
        isVerified: { type: Boolean, default: false },
        gender: { type: String, default: "" },
        age: { type: Number, default: 0 },
        countryFlagImage: { type: String, default: "" },
        country: { type: String, lowercase: true, default: "" },
        uniqueId: { type: String, default: "" },
        coin: { type: Number, default: 0 },
        wealthLevelImage: { type: String, default: "" },
        avtarFrameType: { type: Number, default: 0 },
        avtarFrame: { type: String, default: "" },
      },
      host2Details: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        name: { type: String, default: "" },
        userName: { type: String, default: "" },
        image: { type: String, default: "" },
        isProfilePicBanned: { type: Boolean, default: false },
        isVerified: { type: Boolean, default: false },
        gender: { type: String, default: "" },
        age: { type: Number, default: 0 },
        countryFlagImage: { type: String, default: "" },
        country: { type: String, lowercase: true, default: "" },
        uniqueId: { type: String, default: "" },
        coin: { type: Number, default: 0 },
        wealthLevelImage: { type: String, default: "" },
        avtarFrameType: { type: Number, default: 0 },
        avtarFrame: { type: String, default: "" },
      },
    },

    audioLiveType: { type: Number, enum: [0, 1, 2], default: 0 }, //1.private 2.public
    privateCode: { type: Number, default: 0 }, //max 4 digit
    roomName: { type: String, default: "" },
    roomWelcome: { type: String, default: "" },
    roomImage: { type: String, default: "" },
    bgTheme: { type: String, default: "" },
    isAudio: { type: Boolean, default: false },
    isHostActiveInRoom: { type: Boolean, default: false },
    hostIsMuted: { type: Number, default: 0 }, //1.hostMute 2.hostunMute
    blockedUsers: [
      {
        blockedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],
    admins: [
      {
        adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],

    seat: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          name: { type: String, default: "" },
          userName: { type: String, default: "" },
          image: { type: String, default: "" },
          isProfilePicBanned: { type: Boolean, default: false },
          gender: { type: String, default: "" },
          age: { type: Number, default: 0 },
          countryFlagImage: { type: String, default: "" },
          country: { type: String, lowercase: true, default: "" },
          avtarFrameType: { type: Number, default: 0 },
          avtarFrame: { type: String, default: "" },
          uniqueId: { type: String, default: "" },
          isVerified: { type: Boolean, default: false },
          coin: { type: Number, default: 0 },
          position: { type: Number, default: 0 },
          invite: { type: Boolean, default: false },
          reserved: { type: Boolean, default: false },
          speaking: { type: Boolean, default: false },
          mute: { type: Number, enum: [0, 1, 2, 3], default: 0 }, //1.mute 2.unMute 3.muteByHostToUser
          lock: { type: Boolean, default: false },
          agoraUid: { type: Number, default: 0 },
        },
      ],
      default: seat.default,
    },

    isHostCameraEnabled: { type: Boolean, default: true },
    isHostMuteEnabled: { type: Boolean, default: true },
    requested: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          name: { type: String, default: "" },
          userName: { type: String, default: "" },
          image: { type: String, default: "" },
          isProfilePicBanned: { type: Boolean, default: false },
          gender: { type: String, default: "" },
          age: { type: Number, default: 0 },
          countryFlagImage: { type: String, default: "" },
          country: { type: String, lowercase: true, default: "" },
          avtarFrameType: { type: Number, default: 0 },
          avtarFrame: { type: String, default: "" },
          uniqueId: { type: String, default: "" },
          isVerified: { type: Boolean, default: false },
          agoraUid: { type: String, default: "" },
          isMute: { type: Number, enum: [0, 1, 2, 3], default: 0 }, //1.mute 2.unMute 3.muteByHostToUser
          isRequested: { type: Boolean, default: false },
          isAccepted: { type: Boolean, default: false },
          isInvited: { type: Boolean, default: false },
          isCameraEnabled: { type: Boolean, default: true },
          hostAcceptedViaRequest: { type: Boolean, default: false },
          isSendrequestByHost: { type: Boolean, default: false },
          position: { type: Number, default: 0 },
          coin: { type: Number, default: 0 },
        },
      ],
      default: requestedDefault,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

liveStreamerSchema.index({ userId: 1 });
liveStreamerSchema.index({ liveHistoryId: 1 });
liveStreamerSchema.index({ createdAt: -1 });
liveStreamerSchema.index({ liveType: 1, isAudio: 1, country: 1 });

module.exports = mongoose.model("LiveStreamer", liveStreamerSchema);
