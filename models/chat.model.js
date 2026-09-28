const mongoose = require("mongoose");

const { MESSAGE_TYPE, CALL_TYPE } = require("../types/constant");

const chatSchema = mongoose.Schema(
  {
    chatTopicId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatTopic", default: null },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    messageType: { type: Number, enum: MESSAGE_TYPE }, //1.text 2.image 3.videoCall 4.audio 5.audioCall 6.gift
    message: { type: String, default: "" },
    image: { type: String, default: "" },
    audio: { type: String, default: "" }, //voice messages
    isMediaBanned: { type: Boolean, default: false },
    isRead: { type: Boolean, default: false },

    giftImage: { type: String, default: "" },
    giftsvgaImage: { type: String, default: "" },
    giftCount: { type: Number, default: 1 },
    giftType: { type: Number, default: 1 },

    callId: { type: mongoose.Schema.Types.ObjectId, ref: "History", default: null },
    callType: { type: Number, enum: CALL_TYPE, default: 0 }, //1.received 2.declined 3.missCalled
    callDuration: { type: String, default: "00:00:00" },

    date: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

chatSchema.index({ createdAt: -1 });
chatSchema.index({ chatTopicId: 1 });
chatSchema.index({ senderId: 1 });

module.exports = mongoose.model("Chat", chatSchema);
