///import model
const User = require("./models/user.model");
const ChatTopic = require("./models/chatTopic.model");
const Chat = require("./models/chat.model");
const Privatecall = require("./models/privatecall.model");
const History = require("./models/history.model");
const GiftCategory = require("./models/giftCategory.model");
const Gift = require("./models/gift.model");
const LiveStreamer = require("./models/liveStreamer.model");
const LiveStreamerHistory = require("./models/liveStreamerHistory.model");
const LiveStreamerView = require("./models/liveStreamerView.model");
const LiveStreamComment = require("./models/liveStreamComment.model");
const AvtarFrame = require("./models/avtarFrame.model");
const TopGifter = require("./models/topGifter.model");
const Agency = require("./models/agency.model");
const Setting = require("./models/setting.model");
const Notification = require("./models/notification.model");
const Block = require("./models/block.model");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("./util/generateHistoryUniqueId");

//requestedDefault
const requestedDefault = require("./util/requestedDefault");

//generateUniqueCallId
const generateUniqueCallId = async () => {
  let unique = false;
  let callId;

  while (!unique) {
    const randomSixChar = Math.random().toString(36).substring(2, 8).toUpperCase();
    callId = `CALL-${randomSixChar}`;
    const existingCall = await History.findOne({ callId }).lean();
    if (!existingCall) unique = true;
  }

  return callId;
};

//defaultSeats
const { default: defaultSeats } = require("./util/defaultSeat");

//private key
const admin = require("./util/privateKey");

//mongoose
const mongoose = require("mongoose");

//moment
const moment = require("moment-timezone");

//agora-access-token
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

const { deleteFile } = require("./util/deletefile");

function createLuckyMultiplierGenerator(min = 1, max = 15) {
  let lastMultiplier = null;

  return function getNextMultiplier() {
    let multiplier;

    do {
      multiplier = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (multiplier === lastMultiplier);

    lastMultiplier = multiplier;
    return multiplier;
  };
}

const getLuckyMultiplier = createLuckyMultiplierGenerator();

function getLuckyGiftValue(originalValue) {
  const multiplier = getLuckyMultiplier();
  const luckyValue = originalValue * multiplier;
  return { multiplier, luckyValue };
}

const clearLiveChatReferences = (liveUserObjIds = [], liveHistoryIds = []) => {
  const orConditions = [];

  liveUserObjIds.filter(Boolean).forEach((id) => {
    orConditions.push({ liveUserObjId: new mongoose.Types.ObjectId(id) });
  });

  liveHistoryIds.filter(Boolean).forEach((id) => {
    orConditions.push({ liveHistoryId: new mongoose.Types.ObjectId(id) });
  });

  if (!orConditions.length) {
    return Promise.resolve();
  }

  return Chat.updateMany({ $or: orConditions }, { $set: { liveUserObjId: null, liveHistoryId: null } });
};

const { buildAgencyEarningUpdate } = require("./util/agencyEarnings");

//fs
const fs = require("fs");

io.on("connection", async (socket) => {
  console.log("Socket Connection done Client ID: ", socket.id);
  console.log("Current Rooms Before Join:", Array.from(socket.rooms));

  //high coin game winner
  socket.on("highCoinWin", async (data) => {
    console.log("🎉 [High Coin Win] Broadcasting game result:", data);

    const message = `🎯 ${data?.userName} just won 🪙 ${data?.coin} coins in the "${data?.game}" game! 🔥`;
    const payload = {
      message,
      userImage: data?.userImage,
    };

    io.emit("highCoinWinBroadcast", payload); // ✅ emits to all connected clients
  });

  const { globalRoom } = socket.handshake.query;
  const id = globalRoom?.split(":")[1];
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    console.warn("Invalid or missing ID from globalRoom:", globalRoom);
    return;
  }

  if (globalRoom && globalRoom.includes(":")) {
    //console.log("Socket connected with userId:", id);

    try {
      const user = await User.findById(id).select("_id").lean();
      if (user) {
        if (!socket.rooms.has(globalRoom)) {
          socket.join(globalRoom);
          console.log(`Socket joined room: ${globalRoom}`);
        } else {
          console.log(`User ${id} is already in room: ${globalRoom}, skipping rejoin.`);
        }

        console.log("Updated Rooms After Join:", Array.from(socket.rooms));

        await User.findByIdAndUpdate(user._id, { $set: { isOnline: true } }, { new: true });
        console.log(`User ${id} set to online`);
      }
    } catch (error) {
      console.error("Error updating user status:", error);
    }
  } else {
    console.warn("Invalid globalRoom format:", globalRoom);
  }

  //chat
  socket.on("messageSent", async (data) => {
    const parseData = JSON.parse(data);
    console.log("🔹 Data in message:", parseData);

    const [chatTopic] = await Promise.all([
      ChatTopic.findById(parseData?.chatTopicId)
        .populate("senderId", "_id name image isProfilePicBanned isOnline isVerified fcmToken isBlock isPushNotificationEnabled")
        .populate("receiverId", "_id fcmToken isBlock isPushNotificationEnabled"),
    ]);

    if (!chatTopic) {
      console.log("Chat topic not found");
      return socket.emit("messageSent", "Chat topic not found");
    }

    if (chatTopic.senderId?._id.toString() === chatTopic.receiverId?._id.toString()) {
      console.log("Prevent self messaging");
      return socket.emit("messageSent", "Sender and receiver cannot be the same user.");
    }

    if (parseData?.senderId?.toString() === parseData?.receiverId?.toString()) {
      return socket.emit("messageSent", "You cannot send a message to yourself.");
    }

    let receiverUser, senderUser;
    if (chatTopic.senderId._id.toString() === parseData.senderId.toString()) {
      senderUser = chatTopic.senderId;
      receiverUser = chatTopic.receiverId;
    } else if (chatTopic.receiverId._id) {
      senderUser = chatTopic.receiverId;
      receiverUser = chatTopic.senderId;
    }

    const isBlocked = await Block.exists({
      $or: [
        {
          userId: senderUser._id,
          toUserId: receiverUser._id,
        },
        {
          userId: receiverUser._id,
          toUserId: senderUser._id,
        },
      ],
    });

    if (isBlocked) {
      console.log("If blocked, only notify sender (self) and stop");
      return socket.emit("messageSent", "Message cannot be sent. One of the users has blocked the other.");
    }

    if (chatTopic && parseData?.messageType == 1) {
      const chat = new Chat();
      chat.senderId = parseData?.senderId;
      chat.messageType = 1;
      chat.message = parseData?.message;
      chat.image = "";
      chat.chatTopicId = chatTopic._id;
      chat.date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

      chatTopic.chatId = chat._id;

      await Promise.all([chat.save(), chatTopic.save()]);

      const eventData = {
        data,
        messageId: chat._id.toString(),
      };

      io.in("globalRoom:" + chatTopic?.senderId?._id.toString()).emit("messageSent", eventData);
      io.in("globalRoom:" + chatTopic?.receiverId?._id.toString()).emit("messageSent", eventData);

      if (receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
        const payload = {
          token: receiverUser.fcmToken,
          notification: {
            title: chatTopic?.senderId?.name ? `💌 New Message from ${chatTopic.senderId.name}!` : "💌 You've Got a New Message!",
            body: chatTopic?.senderId?.name ? `📬 ${chatTopic.senderId.name} just sent you a message: ${parseData?.message}` : "📬 Someone just sent you a message. Tap to check!",
          },
          data: {
            type: "CHAT",
            chatTopicId: String(chatTopic._id),
            senderId: String(chatTopic.senderId._id),
            receiverId: String(chatTopic.receiverId._id),
            name: String(chatTopic?.senderId?.name),
            image: String(chatTopic?.senderId?.image),
            isProfilePicBanned: String(chatTopic?.senderId?.isProfilePicBanned),
            isVerified: String(chatTopic?.senderId?.isVerified),
            isOnline: String(chatTopic?.senderId?.isOnline),
          },
        };

        const adminPromise = await admin;
        adminPromise
          .messaging()
          .send(payload)
          .then((response) => {
            console.log("Successfully sent with response: ", response);
          })
          .catch((error) => {
            console.log("Error sending message:      ", error);
          });
      }
    } else {
      console.log("other messageType");

      const eventData = {
        data,
        messageId: parseData?.messageId?.toString() || "",
      };

      io.in("globalRoom:" + chatTopic?.senderId?._id.toString()).emit("messageSent", eventData);
      io.in("globalRoom:" + chatTopic?.receiverId?._id.toString()).emit("messageSent", eventData);
    }
  });

  socket.on("chatGiftMessageSent", async (data) => {
    try {
      const parseData = JSON.parse(data);
      console.log("🎁 [chatGiftMessageSent]:", parseData);

      const { senderId, chatTopicId, giftId, giftCount = 1 } = parseData;

      const [chatTopic, gift] = await Promise.all([
        ChatTopic.findById(chatTopicId)
          .populate("senderId", "_id name image isProfilePicBanned isOnline isVerified fcmToken isBlock isPushNotificationEnabled coin role agencyId")
          .populate("receiverId", "_id name image isProfilePicBanned isOnline isVerified fcmToken isBlock isHostBlocked isPushNotificationEnabled coin role agencyId"),
        Gift.findById(giftId).lean(),
      ]);

      if (!chatTopic || !gift) {
        console.log("❌ Invalid data");
        socket.emit("chatGiftMessageSent", "Invalid chat topic or gift data.");
        return;
      }

      let receiverUser, senderUser;
      if (chatTopic.senderId._id.toString() === parseData.senderId.toString()) {
        senderUser = chatTopic.senderId;
        receiverUser = chatTopic.receiverId;
      } else if (chatTopic.receiverId._id) {
        senderUser = chatTopic.receiverId;
        receiverUser = chatTopic.senderId;
      }

      const coinPerGift = Math.abs(gift.coin || 0);
      const totalCoin = coinPerGift * giftCount;

      if (senderUser.coin < totalCoin) {
        console.log("You don't have sufficient coins");
        io.in("globalRoom:" + senderId).emit("insufficientCoins", "You don't have sufficient coins.");
        return;
      }

      const chat = new Chat({
        senderId,
        messageType: 6,
        message: "🎁 Gift Sent",
        giftImage: gift.image || "",
        giftsvgaImage: gift.svgaImage || "",
        giftCount,
        giftType: gift.type,
        chatTopicId: chatTopic._id,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      });

      chatTopic.chatId = chat._id;

      await Promise.all([chat.save(), chatTopic.save()]);

      const eventData = {
        data,
        messageId: chat._id.toString(),
      };

      io.in("globalRoom:" + chatTopic.senderId._id.toString()).emit("chatGiftMessageSent", eventData);
      io.in("globalRoom:" + chatTopic.receiverId._id.toString()).emit("chatGiftMessageSent", eventData);

      const uniqueId = await generateHistoryUniqueId();
      const giftCategory = await GiftCategory.findById(gift.categoryId).lean();

      const adminRate = Math.abs(settingJSON.adminRate ?? 10);
      let adminCoin = Math.round((totalCoin * adminRate) / 100);
      let receiverCoin = totalCoin - adminCoin;

      let isSenderRewardEnabled = false;
      let adminCoinForLucky = 0;
      let receiverCoinForLucky = 0;
      let luckyUserWinCoin = 0;
      let totalLuckyCoin = 0;
      let luckyHistoryId, mainSetting;
      let luckyGiftEventId = null;

      if (giftCategory && giftCategory.name.toLowerCase() === "lucky") {
        console.log(`[Lucky Gift Triggered] Sender: ${senderUser._id}, Receiver: ${receiverUserId}`);
        console.log(`[Gift Info] ${gift.coin} × ${giftCount} | Total: ${totalCoin} coins`);

        const adminTaxPercent = Number(settingJSON.luckyGiftAdminTaxPercent);
        const receiverSharePercent = Number(settingJSON.luckyGiftReceiverSharePercent);
        luckyGiftEventId = new mongoose.Types.ObjectId();

        adminCoinForLucky = Math.round(totalCoin * ((isNaN(adminTaxPercent) ? 10 : adminTaxPercent) / 100));
        receiverCoinForLucky = Math.round(totalCoin * ((isNaN(receiverSharePercent) ? 10 : receiverSharePercent) / 100));
        totalLuckyCoin = totalCoin - (adminCoinForLucky + receiverCoinForLucky);

        console.log(`• Admin Tax (%${adminTaxPercent}): ${adminCoinForLucky}`);
        console.log(`• Receiver Share (%${receiverSharePercent}): ${receiverCoinForLucky}`);
        console.log(`• Lucky Pool Reserve: ${totalLuckyCoin}`);

        await Setting.updateOne({ _id: settingJSON._id }, { $inc: { luckyGiftTargetCoin: totalLuckyCoin } });

        const { multiplier, luckyValue } = getLuckyGiftValue(totalCoin);
        console.log(`Lucky Gift: multiplier=${multiplier}, luckyValue=${luckyValue}`);

        [luckyHistoryId, mainSetting] = await Promise.all([generateHistoryUniqueId(), Setting.findOne().select("luckyGiftTargetCoin").lean()]);

        console.log(`[Lucky Pool Status] Available: ${mainSetting.luckyGiftTargetCoin}`);

        receiverCoin = receiverCoinForLucky;
        adminCoin = adminCoinForLucky;

        if (luckyValue > 0 && luckyValue <= mainSetting.luckyGiftTargetCoin) {
          console.log(`[Lucky Reward Granted] Coin Returned to Sender: ${luckyValue}`);

          isSenderRewardEnabled = true;
          luckyUserWinCoin = luckyValue;

          console.log(`User Lucky gift bonus applied: ${luckyUserWinCoin} coins`);

          if (isSenderRewardEnabled) {
            io.to("globalRoom:" + senderUser._id.toString()).emit("luckyGiftWin", luckyUserWinCoin);

            await Promise.all([
              Setting.updateOne({ _id: settingJSON._id }, { $set: { luckyGiftTargetCoin: 0 } }),
              User.updateOne(
                { _id: senderUser._id },
                {
                  $inc: { coin: luckyUserWinCoin },
                },
              ),
              luckyUserWinCoin > 0
                ? History.create({
                    uniqueId: luckyHistoryId,
                    type: 15,
                    liveHistoryId: giftData.liveHistoryId,
                    liveType: 2,
                    otherUserId: senderUser._id,
                    giftId: giftData.giftId,
                    giftTitle: gift.title,
                    giftCoin: gift.coin,
                    giftImage: gift.image,
                    giftReceivedCount: giftCount,
                    luckyGiftMultiplier: multiplier,
                    coin: luckyUserWinCoin,
                    luckyGiftEventId,
                    date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
                  })
                : Promise.resolve(),
            ]);
          }

          isSenderRewardEnabled = false;
        } else {
          console.log("Lucky gift bonus criteria not met.");

          isSenderRewardEnabled = false;
        }
      }

      const isHost = Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId && !receiverUser.isBlock && !receiverUser.isHostBlocked;

      // Base update fields for every receiver
      const updateFields = {
        $inc: {
          receivedCoins: receiverCoin,
          receivedGifts: giftCount,
          coin: receiverCoin,
        },
      };

      // For non-hosts → increment coin
      // if (!isHost) {
      //   console.log("For non-hosts → increment coin");

      //   updateFields.$inc.coin = receiverCoin;
      // }

      // For hosts → increment host-related fields only
      if (isHost) {
        console.log("For hosts → increment host-related fields only");

        updateFields.$inc.earnedHostCoins = receiverCoin;
      }

      await Promise.all([
        User.updateOne(
          { _id: senderUser._id },
          {
            $inc: {
              coin: -totalCoin,
              spentCoins: totalCoin,
            },
          },
        ),
        User.updateOne({ _id: receiverUser._id }, updateFields),
        History.create({
          uniqueId,
          type: 25,
          userId: senderUser._id,
          otherUserId: receiverUser._id,
          giftCategoryId: giftCategory?._id,
          giftId,
          giftReceivedCount: giftCount,
          giftCoin: gift.coin,
          giftTitle: gift.title,
          giftImage: gift.image,
          senderCoin: totalCoin,
          receiverCoin,
          adminCoin,
          luckyGiftReserve: totalLuckyCoin,
          hostAgencyId: isHost ? receiverUser.agencyId : null,
          luckyGiftEventId,
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);

      if (isHost) {
        const [uniqueCommissionId, agency] = await Promise.all([
          generateHistoryUniqueId(),
          Agency.findOne({
            _id: receiverUser.agencyId,
            isActive: true,
          })
            .select("_id commissionRate")
            .lean(),
        ]);

        if (agency) {
          const commissionRate = agency.commissionRate || 0;
          const commission = Math.round((receiverCoin * commissionRate) / 100);
          const dateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

          const updates = [];
          const agencyEarningUpdate = buildAgencyEarningUpdate(commission, receiverCoin);

          if (commission > 0) {
            updates.push(
              History.create({
                uniqueId: uniqueCommissionId,
                type: 9,
                coin: commission,
                agencyId: agency._id,
                userId: senderUser._id,
                otherUserId: receiverUser._id,
                baseType: 25,
                baseCoins: receiverCoin,
                commissionRate,
                date: dateStr,
              }),
            );
            agencyEarningUpdate && updates.push(Agency.updateOne({ _id: agency._id }, agencyEarningUpdate));
          }

          await Promise.all(updates);
        }
      }
    } catch (err) {
      console.error("❌ [chatGiftMessageSent] Error:", err);
    }
  });

  socket.on("messageSeen", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data in messageSeen event:", parsedData.messageId);

      const updated = await Chat.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(parsedData.messageId) }, { $set: { isRead: true } }, { new: true });

      if (!updated) {
        console.log(`No message found with ID ${parsedData.messageId}`);
      } else {
        console.log(`Updated isRead to true for message with ID: ${updated._id}`);
      }
    } catch (error) {
      console.error("Error updating messages:", error);
    }
  });

  socket.on("typing:start", (data) => {
    try {
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;

      const senderId = parsedData?.senderId?.toString();
      const receiverId = parsedData?.receiverId?.toString();

      if (!senderId || !receiverId) {
        console.warn("typing:start - Missing senderId or receiverId", parsedData);
        return;
      }

      console.log(`[Typing START] Sender: ${senderId}, Receiver: ${receiverId}`);

      io.in("globalRoom:" + receiverId).emit("typing:start", data);
    } catch (error) {
      console.error("[Typing START] Error:", error);
    }
  });

  socket.on("typing:stop", (data) => {
    try {
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;

      const senderId = parsedData?.senderId?.toString();
      const receiverId = parsedData?.receiverId?.toString();

      if (!senderId || !receiverId) {
        console.warn("typing:stop - Missing senderId or receiverId", parsedData);
        return;
      }

      console.log(`[Typing STOP] Sender: ${senderId}, Receiver: ${receiverId}`);

      io.in("globalRoom:" + receiverId).emit("typing:stop", data);
    } catch (error) {
      console.error("[Typing STOP] Error:", error);
    }
  });

  //private video/audio call
  socket.on("initiateCall", async (data) => {
    console.log("initiateCall request received:", data);

    const parsedData = JSON.parse(data);
    const { callerId, receiverId, agoraUID, channel, callType } = parsedData;

    const role = RtcRole.PUBLISHER;
    const uid = agoraUID ? agoraUID : 0;
    const expirationTimeInSeconds = 24 * 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const [callUniqueId, token, caller, receiver] = await Promise.all([
      generateUniqueCallId(),
      RtcTokenBuilder.buildTokenWithUid(settingJSON?.agoraAppId, settingJSON?.agoraAppCertificate, channel, uid, role, privilegeExpiredTs),
      User.findById(callerId).select("_id name userName image isBlock isBusy callId isOnline coin").lean(),
      User.findById(receiverId).select("_id name userName image isBlock isBusy callId isOnline role agencyId isPushNotificationEnabled fcmToken").lean(),
    ]);

    if (!caller) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", { message: "Caller user does not found." });
      return;
    }

    if (caller.isBlock) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
        message: "Caller user is blocked.",
        isBlock: true,
      });
      return;
    }

    if (caller.isBusy && caller.callId) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
        message: "Caller is busy with someone else.",
        isBusy: true,
      });
      return;
    }

    if (!receiver) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", { message: "Receiver user does not found." });
      return;
    }

    if (receiver.isBlock) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
        message: "Receiver user is blocked.",
        isBlock: true,
      });
      return;
    }

    if (!receiver.isOnline) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
        message: "Receiver is not online.",
        isOnline: false,
      });
      return;
    }

    if (receiver.isBusy && receiver.callId) {
      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
        message: "Receiver is busy with another call.",
        isBusy: true,
      });
      return;
    }

    if (!receiver.isBusy && receiver.callId === null) {
      console.log("Receiver and Caller are free. Proceeding with call setup.");

      const callHistory = new History();
      callHistory.uniqueId = callUniqueId;

      const [callerVerify, receiverVerify] = await Promise.all([
        User.updateOne(
          {
            _id: caller._id,
            isFake: false,
            isLive: false,
            isOnline: true,
            isBusy: false,
            callId: null,
          },
          {
            $set: {
              isBusy: true,
              callId: callHistory._id.toString(),
            },
          },
        ),
        User.updateOne(
          {
            _id: receiver._id,
            isFake: false,
            isLive: false,
            isOnline: true,
            isBusy: false,
            callId: null,
          },
          {
            $set: {
              isBusy: true,
              callId: callHistory._id.toString(),
            },
          },
        ),
      ]);

      if (callerVerify.modifiedCount > 0 && receiverVerify.modifiedCount > 0) {
        const privateCallCharge = Math.abs(settingJSON.privateCallRate) || 100;

        if (caller.coin >= privateCallCharge) {
          // Proceed with saving history and starting call
          const dataOfVideoCall = {
            callType: callType.trim().toLowerCase(),
            isBusy: false,
            callScope: "private",
            callerId: caller._id,
            receiverId: receiver._id,
            callerImage: caller.image,
            callerName: caller.name,
            receiverName: receiver.name,
            receiverImage: receiver.image,
            callId: callHistory._id,
            token,
            channel,
          };

          io.in("globalRoom:" + receiver._id.toString()).emit("incomingCall", dataOfVideoCall); // Notify receiver
          io.in("globalRoom:" + caller._id.toString()).emit("callStarted", dataOfVideoCall); // Notify caller

          console.log(`Call successfully initiated: ${caller.name} → ${receiver.name}`);

          callHistory.type = callType?.trim()?.toLowerCase() === "audio" ? 16 : callType?.trim()?.toLowerCase() === "video" ? 5 : 5;
          callHistory.isPrivate = true;
          callHistory.callType = callType.trim().toLowerCase();
          callHistory.userId = caller._id;
          callHistory.otherUserId = receiver._id;
          if (receiver.role && receiver.role.includes(2)) {
            callHistory.hostAgencyId = receiver.agencyId;
          }
          callHistory.date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

          await Promise.all([
            callHistory.save(),
            Privatecall({
              caller: caller._id,
              receiver: receiver._id,
            }).save(),
          ]);

          if (receiver.isPushNotificationEnabled && !receiver.isBlock && receiver.fcmToken !== null) {
            const callerName = caller.name?.trim() || caller.userName?.trim() || "Someone";
            const receiverName = receiver.name?.trim() || receiver.userName?.trim() || "Someone";
            const isVideo = callType?.trim().toLowerCase() === "video";

            const notificationTitle = isVideo ? `🎥 Video Call from ${callerName}!` : `📞 Audio Call from ${callerName}!`;
            const notificationBody = isVideo
              ? `${callerName} is calling you for a private video chat. Tap to join now! 🚀`
              : `${callerName} wants to start a private audio chat. Tap to connect instantly! 🔊`;

            const payload = {
              token: receiver.fcmToken,
              data: {
                title: notificationTitle,
                body: notificationBody,
                type: "callIncoming",
                callType: dataOfVideoCall.callType,
                callId: dataOfVideoCall.callId.toString(),
                callerId: dataOfVideoCall.callerId.toString(),
                receiverId: dataOfVideoCall.receiverId.toString(),
                callerImage: dataOfVideoCall.callerImage || "",
                callerName: callerName || "",
                receiverName: receiverName || "",
                channel: dataOfVideoCall.channel || "",
              },
            };

            const adminInstance = await admin;
            adminInstance
              .messaging()
              .send(payload)
              .then(async (response) => {
                console.log("📨 Call notification sent successfully:", response);

                const notification = new Notification();
                notification.userId = receiver._id;
                notification.title = notificationTitle;
                notification.message = notificationBody;
                notification.date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
                await notification.save();
              })
              .catch((error) => {
                console.error("⚠️ Failed to send call notification:", error);
              });
          }
        } else {
          // Inform caller not enough coins
          // Reset busy statuses

          io.in("globalRoom:" + caller._id.toString()).emit("insufficientCoins", "You don't have sufficient coins.");

          // Update isBusy only for the user who failed verification
          if (callerVerify.modifiedCount > 0) {
            await User.updateOne({ _id: callerId, isBusy: true }, { $set: { isBusy: false, callId: null } });
            console.log(`🔹 Caller Status Updated: Caller verification failed, isBusy reset`);
          }

          if (receiverVerify.modifiedCount > 0) {
            await User.updateOne({ _id: receiverId, isBusy: true }, { $set: { isBusy: false, callId: null } });
            console.log(`🔹 Receiver Status Updated: Receiver verification failed, isBusy reset`);
          }
          return;
        }
      } else {
        console.log("Failed to verify caller or receiver availability");

        io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
          message: "Call setup failed. One or both users became unavailable.",
          isBusy: true,
        });

        // Update isBusy only for the user who failed verification
        if (callerVerify.modifiedCount > 0) {
          await User.updateOne({ _id: callerId, isBusy: true }, { $set: { isBusy: false, callId: null } });
          console.log(`🔹 Caller Status Updated: Caller verification failed, isBusy reset`);
        }

        if (receiverVerify.modifiedCount > 0) {
          await User.updateOne({ _id: receiverId, isBusy: true }, { $set: { isBusy: false, callId: null } });
          console.log(`🔹 Receiver Status Updated: Receiver verification failed, isBusy reset`);
        }
        return;
      }
    } else {
      console.log("Condition not met - receiver not available");

      io.in("globalRoom:" + caller._id.toString()).emit("initiateCall", {
        message: "Receiver is unavailable for a call at this moment.",
        isBusy: true,
      });
      return;
    }
  });

  socket.on("handleCallResponse", async (data) => {
    console.log("🟢 [handleCallResponse] Event received:", data);

    try {
      const parsedData = JSON.parse(data);
      const { callerId, receiverId, callId, isAccept, callType } = parsedData;

      const callerRoom = `globalRoom:${callerId}`;
      const receiverRoom = `globalRoom:${receiverId}`;

      console.log(`🔄 Fetching caller, receiver, and call history for callId: ${callId}`);

      const [caller, receiver, callHistory] = await Promise.all([
        User.findById(callerId).select("_id name isBusy callId").lean(),
        User.findById(receiverId).select("_id name isBusy callId").lean(),
        History.findById(callId).select("_id callConnect"),
      ]);

      if (!caller || !receiver || !callHistory) {
        console.error("❌ [handleCallResponse] Invalid caller, receiver, or call history.");
        return io.to(callerRoom).emit("callProcessFailed", { message: "Invalid call data." });
      }

      console.log(`✅ Caller: ${caller.name} | Receiver: ${receiver.name} | Call ID: ${callId}`);

      if (!isAccept && caller.callId?.toString() === callId.toString()) {
        console.log(`📵 [handleCallResponse] Call rejected by receiver ${receiver.name}`);

        io.to(callerRoom).emit("callRejectedByReceiver", data);

        const [callerUpdate, receiverUpdate, privateCallDeleted] = await Promise.all([
          User.updateOne({ _id: caller._id }, { $set: { isBusy: false, callId: null } }),
          User.updateOne({ _id: receiver._id }, { $set: { isBusy: false, callId: null } }),
          Privatecall.deleteOne({ caller: caller._id, receiver: receiver._id }),
        ]);

        console.log(`🔹 Caller Status Updated:`, callerUpdate);
        console.log(`🔹 Receiver Status Updated:`, receiverUpdate);
        console.log(`🔹 Private Call Deleted:`, privateCallDeleted);

        let chatTopic;
        chatTopic = await ChatTopic.findOne({
          $or: [
            {
              $and: [{ senderId: caller._id }, { receiverId: receiver._id }],
            },
            {
              $and: [{ senderId: receiver._id }, { receiverId: caller._id }],
            },
          ],
        });

        const chat = new Chat();

        if (!chatTopic) {
          chatTopic = new ChatTopic();

          chatTopic.chatId = chat._id;
          chatTopic.senderId = caller._id;
          chatTopic.receiverId = receiver._id;
        }

        chat.chatTopicId = chatTopic._id;
        chat.senderId = callerId;
        chat.messageType = callType.trim().toLowerCase() === "audio" ? 5 : 3;
        chat.message = callType.trim().toLowerCase() === "audio" ? "📞 Audio Call" : "📽 Video Call";
        chat.callType = 2; // 2.declined
        chat.callId = callId;
        chat.isRead = true;
        chat.date = new Date().toLocaleString();

        chatTopic.chatId = chat._id;

        callHistory.callConnect = false;
        await Promise.all([chat.save(), chatTopic.save(), callHistory?.save()]);
        console.log("✅ Call rejection chat & history saved.");
        return;
      }

      if (isAccept && caller.callId?.toString() === callId.toString()) {
        console.log(`📞 [handleCallResponse] Call accepted by receiver ${receiver.name}`);

        const privateCallDelete = await Privatecall.deleteOne({
          caller: new mongoose.Types.ObjectId(caller._id),
          receiver: new mongoose.Types.ObjectId(receiver._id),
        });

        console.log("🗑 Private call entry deleted:", privateCallDelete);

        if (privateCallDelete?.deletedCount > 0) {
          console.log("🟢 Call accepted, emitting event...");

          const [callerSockets, receiverSockets] = await Promise.all([io.in(callerRoom).fetchSockets(), io.in(receiverRoom).fetchSockets()]);

          const callerSocket = callerSockets?.[0];
          const receiverSocket = receiverSockets?.[0];

          if (callerSocket && !callerSocket.rooms.has(callId)) {
            callerSocket.join(callId);
          }

          if (receiverSocket && !receiverSocket.rooms.has(callId)) {
            receiverSocket.join(callId);
          }

          io.to(callId.toString()).emit("callAcceptedByReceiver", data);

          console.log(`📡 [callAcceptedByReceiver] Event sent to both parties: Caller(${caller.name}) & Receiver(${receiver.name})`);

          let chatTopic;
          chatTopic = await ChatTopic.findOne({
            $or: [
              {
                $and: [{ senderId: caller._id }, { receiverId: receiver._id }],
              },
              {
                $and: [{ senderId: receiver._id }, { receiverId: caller._id }],
              },
            ],
          });

          const chat = new Chat();

          if (!chatTopic) {
            chatTopic = new ChatTopic();

            chatTopic.chatId = chat._id;
            chatTopic.senderId = caller._id;
            chatTopic.receiverId = receiver._id;
          }

          chat.chatTopicId = chatTopic._id;
          chat.senderId = callerId;
          chat.messageType = callType.trim().toLowerCase() === "audio" ? 5 : 3;
          chat.message = callType.trim().toLowerCase() === "audio" ? "📞 Audio Call" : "📽 Video Call";
          chat.callType = 1; //1.received
          chat.callId = callId;
          chat.date = new Date().toLocaleString();

          chatTopic.chatId = chat._id;

          await Promise.all([
            chat?.save(),
            chatTopic?.save(),
            User.updateOne({ _id: caller._id }, { $set: { isBusy: true, callId: callId } }),
            User.updateOne({ _id: receiver._id }, { $set: { isBusy: true, callId: callId } }),
            History.updateOne({ _id: callHistory._id }, { $set: { callConnect: true, callStartTime: moment().tz("Asia/Kolkata").format() } }),
          ]);

          console.log("✅ Caller and Receiver status updated & call history saved.");
        } else {
          console.log(`🚨 Call disconnected`);

          io.to(receiverRoom).emit("callDisconnected", data);

          await Promise.all([
            User.updateOne({ _id: caller._id, isBusy: true }, { $set: { isBusy: false, callId: null } }),
            User.updateOne({ _id: receiver._id, isBusy: true }, { $set: { isBusy: false, callId: null } }),
          ]);

          console.log("🔹 Caller & Receiver status reset.");
        }
      }
    } catch (error) {
      console.error("❌ [handleCallResponse] Error:", error);
      io.to(`globalRoom:${socket.id}`).emit("callProcessFailed", { message: "Server error. Please try again." });
    }
  });

  socket.on("cancelOngoingCall", async (data) => {
    console.log("🟢 [cancelOngoingCall] Event received:", data);

    const parseData = JSON.parse(data);
    const { callerId, receiverId, callId, callType } = parseData;

    console.log(`🔄 Fetching call details for callId: ${callId}`);

    const [caller, receiver, callHistory] = await Promise.all([
      User.findById(callerId).select("_id name image isProfilePicBanned isOnline isVerified fcmToken isBlock").lean(),
      User.findById(receiverId).select("_id name fcmToken isBlock isPushNotificationEnabled").lean(),
      History.findById(callId).select("_id callConnect"),
    ]);

    if (!caller || !receiver || !callHistory) {
      console.error("❌ [cancelOngoingCall] Invalid caller, receiver, or call history.");
      return io.to(`globalRoom:${callerId}`).emit("callCancelFailed", { message: "Invalid call data." });
    }

    io.to("globalRoom:" + callerId).emit("callEnded", data);
    io.to("globalRoom:" + receiverId).emit("callEnded", data);

    console.log(`✅ Caller: ${caller.name} | Receiver: ${receiver.name} | Call ID: ${callId}`);

    const [callerUpdate, receiverUpdate, privateCallDeleted] = await Promise.all([
      User.updateOne({ _id: caller._id }, { $set: { isBusy: false, callId: null } }),
      User.updateOne({ _id: receiver._id }, { $set: { isBusy: false, callId: null } }),
      Privatecall.deleteOne({ caller: caller._id, receiver: receiver._id }),
    ]);

    console.log(`🔹 Caller Status Updated:`, callerUpdate);
    console.log(`🔹 Receiver Status Updated:`, receiverUpdate);
    console.log(`🔹 Private Call Deleted:`, privateCallDeleted);

    callHistory.callConnect = false;
    let chatTopic;
    chatTopic = await ChatTopic.findOne({
      $or: [
        {
          $and: [{ senderId: caller._id }, { receiverId: receiver._id }],
        },
        {
          $and: [{ senderId: receiver._id }, { receiverId: caller._id }],
        },
      ],
    });

    const chat = new Chat();

    if (!chatTopic) {
      chatTopic = new ChatTopic();

      chatTopic.chatId = chat._id;
      chatTopic.senderId = caller._id;
      chatTopic.receiverId = receiver._id;
      await chatTopic.save();
    }

    chat.chatTopicId = chatTopic._id;
    chat.callId = callHistory?._id;
    chat.senderId = callerId;
    chat.messageType = callType.trim().toLowerCase() === "audio" ? 5 : 3;
    chat.message = callType.trim().toLowerCase() === "audio" ? "📞 Audio Call" : "📽 Video Call";
    chat.callType = 3; //3.missedCall
    chat.date = new Date().toLocaleString();
    chat.isRead = true;

    chatTopic.chatId = chat._id;

    await Promise.all([chat?.save(), chatTopic?.save(), callHistory?.save()]);

    if (receiver.isPushNotificationEnabled && !receiver.isBlock && receiver.fcmToken !== null) {
      const payload = {
        token: receiver.fcmToken,
        notification: {
          title: "Missed Call 📞",
          body: "You missed a call. Tap to call back!",
        },
        data: {
          type: "MISSED_CALL",
          chatTopicId: String(chatTopic._id),
          callerId: String(callerId),
          receiverId: String(receiverId),
          name: String(caller.name),
          image: String(caller.image),
          isProfilePicBanned: String(caller.isProfilePicBanned),
          isVerified: String(caller.isVerified),
          isOnline: String(caller.isOnline),
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("Successfully sent with response: ", response);
        })
        .catch((error) => {
          console.log("Error sending message:      ", error);
        });
    }
  });

  socket.on("callEnded", async (data) => {
    console.log("[CALL_ENDED]", "data in callEnded:", data);

    const parseData = JSON.parse(data);
    const { callerId, receiverId, callId, callType } = parseData;

    const [caller, receiver, callHistory] = await Promise.all([
      User.findById(callerId).select("_id name").lean(),
      User.findById(receiverId).select("_id name role agencyId").lean(),
      History.findById(callId).select("_id callStartTime callEndTime callConnect duration"),
    ]);

    if (!caller || !receiver || !callHistory) {
      console.error("❌ [endCallSession] Invalid caller, receiver, or call history.");
      return io.to(`globalRoom:${callerId}`).emit("callTerminationFailed", { message: "Invalid call data." });
    }

    io.to(callId.toString()).emit("callEnded", data);
    io.socketsLeave(callId.toString());

    console.log(`✅ Caller: ${caller.name} | Receiver: ${receiver.name} | Call ID: ${callId}`);

    const [callerUpdate, receiverUpdate, privateCallDeleted] = await Promise.all([
      User.updateOne({ _id: callerId }, { $set: { isBusy: false, callId: null } }),
      User.updateOne({ _id: receiverId }, { $set: { isBusy: false, callId: null } }),
      Privatecall.deleteOne({ caller: callerId, receiver: receiverId }),
    ]);

    console.log(`🔹 Caller Status Updated:`, callerUpdate);
    console.log(`🔹 Receiver Status Updated:`, receiverUpdate);
    console.log(`🔹 Private Call Deleted:`, privateCallDeleted);

    //callHistory.callConnect = false;
    callHistory.callEndTime = moment().tz("Asia/Kolkata").format();

    const start = moment.tz(callHistory.callStartTime, "Asia/Kolkata");
    const end = moment.tz(callHistory.callEndTime, "Asia/Kolkata");
    const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
    callHistory.duration = duration;

    await Promise.all([
      Chat.findOneAndUpdate(
        { callId: callHistory._id },
        {
          $set: {
            callDuration: duration,
            messageType: callType.trim().toLowerCase() === "audio" ? 5 : 3,
            message: callType.trim().toLowerCase() === "audio" ? "📞 Audio Call" : "📽 Video Call",
            callType: 1, // 1 = Received Call
            isRead: true,
          },
        },
        { new: true },
      ),
      callHistory.save(),
    ]);
  });

  socket.on("callCoinDeduction", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      const { callerId, receiverId, callId, callType } = parsedData;
      console.log("[callCoinDeduction] Event Received:", parsedData);

      const [uniqueCommissionId, caller, receiver, callHistory] = await Promise.all([
        generateHistoryUniqueId(),
        User.findById(callerId).select("_id coin").lean(),
        User.findById(receiverId).select("_id coin role agencyId audioCallRate videoCallRate isBlock isHostBlocked").lean(),
        History.findById(callId).select("_id coin isPrivate").lean(),
      ]);

      if (!caller || !receiver || !callHistory) {
        console.log("[callCoinDeduction] Caller, Receiver, or CallHistory not found!");
        return;
      }

      if (!callHistory.isPrivate) return;

      let callCharge = 0;
      let baseType = null;

      if (callType === "audio") {
        callCharge = Math.abs(receiver.audioCallRate || 0);
        baseType = 16;
      } else if (callType === "video") {
        callCharge = Math.abs(receiver.videoCallRate || 0);
        baseType = 5;
      }

      if (!baseType) {
        console.log("[callCoinDeduction] Invalid callType");
        return;
      }

      if (callCharge <= 0) {
        console.log("[callCoinDeduction] Invalid receiver call rate");
        return;
      }

      if (callHistory.isPrivate) {
        const adminRate = Math.abs(settingJSON.adminRate ?? 10);
        const adminCoin = Math.round((callCharge * adminRate) / 100);
        const receiverCoin = callCharge - adminCoin;

        if (caller.coin < callCharge) {
          console.log("You don't have sufficient coins.");

          io.in("globalRoom:" + caller._id.toString()).emit("insufficientCoins", "You don't have sufficient coins.");
          return;
        }

        if (caller.coin >= callCharge) {
          console.log(`
            [Call Deduction]
            CallType: ${callType}
            Rate: ${callCharge}
            Admin: ${adminCoin}
            Receiver: ${receiverCoin}
          `);

          const isHost = Array.isArray(receiver.role) && receiver.role.includes(2) && receiver.agencyId && !receiver.isBlock && !receiver.isHostBlocked;

          // Base update fields for every receiver
          const updateFields = {
            $inc: {
              receivedCoins: receiverCoin,
              coin: receiverCoin,
            },
          };

          // For non-hosts → increment coin
          // if (!isHost) {
          //   console.log("For non-hosts → increment coin");

          //   updateFields.$inc.coin = receiverCoin;
          // }

          // For hosts → increment host-related fields only
          if (isHost) {
            console.log("For hosts → increment host-related fields only");

            updateFields.$inc.earnedHostCoins = receiverCoin;
          }

          await Promise.all([
            User.updateOne({ _id: caller._id, coin: { $gte: callCharge } }, { $inc: { coin: -callCharge } }),
            User.updateOne({ _id: receiver._id }, updateFields),
            History.updateOne(
              { _id: callHistory._id },
              {
                $set: {
                  date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
                },
                $inc: {
                  senderCoin: callCharge,
                  receiverCoin: receiverCoin,
                  adminCoin: adminCoin,
                },
              },
            ),
          ]);

          console.log(`[callCoinDeduction] Success: Caller -${callCharge}, Receiver +${receiverCoin}, Admin +${adminCoin}`);

          if (receiver.role && receiver.role.includes(2) && receiver.agencyId) {
            const agency = await Agency.findOne({ _id: receiver.agencyId, isActive: true }).select("_id commissionRate ").lean();
            //console.log("[callCoinDeduction] Agency fetched:", agency);

            if (agency) {
              const commissionRate = agency.commissionRate || 0;
              const commission = Math.round((callCharge * commissionRate) / 100);
              const dateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

              console.log(`[callCoinDeduction] Commission calculation:
              - Private Call Charge: ${callCharge}
              - Agency Commission Rate: ${commissionRate}%
              - Commission Earned: ${commission} coins`);

              const updatePromises = [];
              const agencyEarningUpdate = buildAgencyEarningUpdate(commission, receiverCoin);

              if (commission > 0) {
                updatePromises.push(
                  History.create({
                    uniqueId: uniqueCommissionId,
                    type: 9,
                    coin: commission,
                    agencyId: agency._id,
                    userId: caller._id,
                    otherUserId: receiver._id,
                    baseType: baseType,
                    baseCoins: callCharge,
                    commissionRate: commissionRate,
                    date: dateStr,
                  }),
                );
                agencyEarningUpdate && updatePromises.push(Agency.updateOne({ _id: agency._id }, agencyEarningUpdate));
              }

              await Promise.all(updatePromises);

              console.log("[callCoinDeduction] Host and agency updates completed successfully.");
            } else {
              console.log("[callCoinDeduction] No active agency found for receiver.");
            }
          }
        }
      }
    } catch (error) {
      console.error("[callCoinDeduction] Error:", error);
    }
  });

  //live-streaming
  socket.on("joinLiveRoom", async (data) => {
    const parsedData = JSON.parse(data);
    console.log("joinLiveRoom connected : ", parsedData);

    if (!parsedData.liveUserObjId) {
      console.log("[joinLiveRoom] Missing liveUserObjId");
      return;
    }

    const sockets = await io.in(globalRoom).fetchSockets();

    if (sockets?.length) {
      sockets.forEach((socket) => {
        // Check if the user is already in the desired live room
        if (socket.rooms.has(parsedData.liveUserObjId)) {
          console.log(`[joinLiveRoom] User ${socket.id} is already in room: ${parsedData.liveUserObjId}`);
          return; // Do not rejoin
        }

        // Leave all previous live rooms dynamically
        socket.rooms.forEach((room) => {
          if (room !== globalRoom) {
            console.log(`Leaving old room: ${room}`);
            socket.leave(room);
          }
        });

        // Join the new live room
        socket.join(parsedData.liveUserObjId);

        console.log(`Joined new room: ${parsedData.liveUserObjId}`);
        console.log("Updated Rooms After Joined new room:", Array.from(socket.rooms));
      });

      io.in(parsedData.liveUserObjId).emit("joinLiveRoom", data);

      const [liveUser, topGifterStats, viewersList] = await Promise.all([
        LiveStreamer.findOne({ _id: parsedData.liveUserObjId }).select("userId earnedCoins view").lean(),
        TopGifter.aggregate([
          { $match: { liveStreamerId: new mongoose.Types.ObjectId(parsedData.liveUserObjId) } },
          {
            $unwind: "$gifters",
          },
          {
            $lookup: {
              from: "users",
              localField: "gifters.userId",
              foreignField: "_id",
              pipeline: [
                {
                  $project: {
                    name: 1,
                    userName: 1,
                    uniqueId: 1,
                    isVerified: 1,
                    image: 1,
                  },
                },
              ],
              as: "gifterUser",
            },
          },
          {
            $unwind: "$gifterUser",
          },
          {
            $lookup: {
              from: "followerfollowings",
              localField: "gifterUser._id",
              foreignField: "toUserId",
              pipeline: [
                {
                  $match: {
                    fromUserId: new mongoose.Types.ObjectId(parsedData.userId),
                  },
                },
                { $limit: 1 },
                {
                  $project: { _id: 1 },
                },
              ],
              as: "followData",
            },
          },
          {
            $addFields: {
              "gifters.userId": {
                _id: "$gifterUser._id",
                name: "$gifterUser.name",
                userName: "$gifterUser.userName",
                uniqueId: "$gifterUser.uniqueId",
                isVerified: "$gifterUser.isVerified",
                image: "$gifterUser.image",
              },
              "gifters.isFollow": {
                $gt: [{ $size: "$followData" }, 0],
              },
            },
          },
          {
            $group: {
              _id: "$_id",
              gifters: { $push: "$gifters" },
            },
          },
        ]),
        LiveStreamerView.aggregate([
          {
            $match: {
              liveStreamerId: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            },
          },
          {
            $lookup: {
              from: "followerfollowings",
              localField: "userId",
              foreignField: "toUserId",
              pipeline: [
                {
                  $match: {
                    fromUserId: new mongoose.Types.ObjectId(parsedData.userId),
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: "followData",
            },
          },
          {
            $addFields: {
              isFollow: { $gt: [{ $size: "$followData" }, 0] },
            },
          },
          {
            $project: {
              userId: 1,
              name: 1,
              userName: 1,
              image: 1,
              isProfilePicBanned: 1,
              avtarFrameType: 1,
              avtarFrame: 1,
              age: 1,
              gender: 1,
              countryFlagImage: 1,
              country: 1,
              uniqueId: 1,
              isVerified: 1,
              agoraUid: 1,
              membershipTierCode: 1,
              isFollow: 1,
            },
          },
        ]),
      ]);

      const earnedCoins = liveUser?.earnedCoins;
      if (earnedCoins !== undefined) {
        io.in(parsedData.liveUserObjId.toString()).emit("liveRoomCoinUpdate", earnedCoins);
        console.log(`[liveRoomCoinUpdate] emitted for room: ${parsedData.liveUserObjId} with earnedCoins: ${earnedCoins}`);
      }

      const topGifters = topGifterStats?.[0]?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];
      io.in(parsedData.liveUserObjId.toString()).emit("topLiveStreamGifter", topGifters);
      io.in(parsedData.liveUserObjId.toString()).emit("liveViewersList", viewersList);
    } else {
      console.log("Sockets not able to emit");
    }
  });

  socket.on("fetchSingleLiveUser", async (payload) => {
    try {
      const parsedPayload = JSON.parse(payload);
      const { liveUserObjId, userId } = parsedPayload;
      console.log("fetchSingleLiveUser parsedPayload : ", parsedPayload);

      if (!liveUserObjId) {
        return socket.emit("singleLiveUserResponse", "Missing liveHistoryId or liveUserObjId");
      }

      const objId = new mongoose.Types.ObjectId(liveUserObjId);
      const requestingUserId = new mongoose.Types.ObjectId(userId);

      const pipeline = [
        {
          $match: {
            _id: objId,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  countryFlagImage: 1,
                  country: 1,
                  uniqueId: 1,
                  coin: 1,
                  isVerified: 1,
                  isFake: 1,
                  wealthLevel: 1,
                  activeAvtarFrame: 1,
                  isBlock: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
        { $match: { "user.isBlock": false } },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "user.wealthLevel",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  levelImage: 1,
                },
              },
            ],
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  image: 1,
                  type: 1,
                },
              },
            ],
            as: "avtarframeDetails",
          },
        },
        { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "userId",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: { fromUserId: requestingUserId },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: "isFollow",
          },
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "pkConfig.host2Id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: { fromUserId: requestingUserId },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: "host2IsFollow",
          },
        },
        {
          $project: {
            _id: 1,
            token: 1,
            channel: 1,
            agoraUid: 1,
            liveHistoryId: 1,
            view: 1,
            liveType: 1,
            isAudio: 1,
            audioLiveType: 1,
            privateCode: 1,
            roomName: 1,
            roomWelcome: 1,
            roomImage: 1,
            hostIsMuted: 1,
            seat: 1,
            isPkMode: 1,
            userId: 1,
            bgTheme: 1,
            name: "$user.name",
            userName: "$user.userName",
            image: "$user.image",
            isProfilePicBanned: "$user.isProfilePicBanned",
            countryFlagImage: "$user.countryFlagImage",
            country: "$user.country",
            uniqueId: "$user.uniqueId",
            coin: "$user.coin",
            isVerified: "$user.isVerified",
            isFake: "$user.isFake",
            wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            host2Id: "$pkConfig.host2Id",
            host2UniqueId: "$pkConfig.host2UniqueId",
            host2Name: "$pkConfig.host2Name",
            host2userName: "$pkConfig.host2userName",
            host2Image: "$pkConfig.host2Image",
            host2isProfilePicBanned: "$pkConfig.host2Details.isProfilePicBanned",
            host2Coin: "$pkConfig.host2Details.coin",
            host2wealthLevelImage: "$pkConfig.host2Details.wealthLevelImage",
            host2AvtarFrame: { $ifNull: ["$pkConfig.host2Details.avtarFrameType", ""] },
            host2AvtarFrameType: { $ifNull: ["$pkConfig.host2Details.avtarFrame", 0] },
            host2Channel: "$pkConfig.host2Channel",
            host2LiveId: "$pkConfig.host2LiveId",
            host2ObjId: "$pkConfig.host2ObjId",
            localRank: "$pkConfig.localRank",
            localGiftCount: "$pkConfig.localGiftCount",
            remoteRank: "$pkConfig.remoteRank",
            remoteGiftCount: "$pkConfig.remoteGiftCount",
            host2IsFollow: { $gt: [{ $size: "$host2IsFollow" }, 0] },
            isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
            viewers: { $ifNull: ["$viewers", []] },

            streamSource: { $ifNull: ["$streamSource", ""] },
            pkThumbnails: { $ifNull: ["$pkThumbnails", []] },
            pkStreamSources: { $ifNull: ["$pkStreamSources", []] },

            admins: {
              $map: {
                input: { $ifNull: ["$admins", []] },
                as: "admin",
                in: "$$admin.adminUserId",
              },
            },
          },
        },
      ];

      const [liveUserInfo] = await LiveStreamer.aggregate(pipeline);

      if (!liveUserInfo) {
        return socket.emit("singleLiveUserResponse", "Live user not found.");
      }

      socket.emit("singleLiveUserResponse", liveUserInfo);
    } catch (err) {
      console.error("Error in fetchSingleLiveUser:", err);
    }
  });

  socket.on("checkUserLiveStatus", async (data) => {
    try {
      const dataOfCheck = JSON.parse(data);
      console.log("[checkUserLiveStatus] Parsed data:", dataOfCheck);

      const { liveHistoryId, userId } = dataOfCheck;

      const liveStreamer = await LiveStreamer.findOne({ userId: userId, liveHistoryId: liveHistoryId }).lean();

      if (liveStreamer && liveStreamer.isAudio) {
        // If it is an audio live stream, check if the seat's userId is not null (i.e., the user is active in the room)
        const isAudioLive = liveStreamer.isHostActiveInRoom === true || liveStreamer.seat.some((seat) => seat.userId !== null);

        if (isAudioLive) {
          console.log(`[checkUserLiveStatus] User ${userId} is live in the audio room.`);
          socket.emit("userLiveStatusResponse", { userId, liveStatus: true });
          return;
        } else {
          console.log(`[checkUserLiveStatus] User ${userId} is not live in the audio room (seat is empty).`);
          socket.emit("userLiveStatusResponse", { userId, liveStatus: false });
          return;
        }
      }

      if (liveStreamer) {
        console.log(`[checkUserLiveStatus] User ${userId} is live.`);
        socket.emit("userLiveStatusResponse", { userId, liveStatus: true });
      } else {
        console.log(`[checkUserLiveStatus] User ${userId} is not live.`);
        socket.emit("userLiveStatusResponse", { userId, liveStatus: false });
      }
    } catch (error) {
      console.error("[checkUserLiveStatus] Error:", error);
    }
  });

  socket.on("countLiveJoin", async (data) => {
    const dataOfaddView = JSON.parse(data);
    console.log("[countLiveJoin] Received data:", dataOfaddView);

    const { userId, liveUserObjId, liveHistoryId, agoraUid, liveType, host2LiveId, entryRide, entryRideType } = dataOfaddView;

    if (!userId || !liveUserObjId || !liveHistoryId) {
      console.log("[countLiveJoin] Missing userId or liveHistoryId or liveUserObjId");
    }

    const [user, liveUser, pkLiveUser, existLiveView] = await Promise.all([
      User.findById(userId)
        .select("_id name userName image isProfilePicBanned gender age countryFlagImage country uniqueId isVerified fcmToken activeAvtarFrame isBlock isPushNotificationEnabled")
        .lean(),
      LiveStreamer.findOne({ _id: liveUserObjId }).select("userId earnedCoins view").lean(),
      LiveStreamer.findOne({ _id: liveUserObjId, isPkMode: true }).select("pkEndTime pkConfig.host1LiveId pkConfig.host2LiveId").lean(),
      LiveStreamerView.findOne({ userId, liveStreamerId: liveUserObjId }).lean(),
    ]);

    if (!user) {
      console.log("[countLiveJoin] User not found");
      return;
    }

    if (!liveUser) {
      console.log("[countLiveJoin] LiveStreamer not found");
      return;
    }

    if (!socket.rooms.has(liveUserObjId)) {
      socket.join(liveUserObjId);
      console.log(`[countLiveJoin] User ${userId} joined room: ${liveUserObjId}`);
    } else {
      console.log(`[countLiveJoin] User ${userId} is already in room: ${liveUserObjId}`);
    }

    const avtarFramePromise = user?.activeAvtarFrame ? AvtarFrame.findById(user.activeAvtarFrame).select("type image").lean() : Promise.resolve(null);

    const [avtarFrame] = await Promise.all([avtarFramePromise]);
    const avtarFrameImage = avtarFrame?.image || "";
    const avtarFrameType = avtarFrame?.type || 0;

    //If PK mode active, emit PK rank update
    if (pkLiveUser) {
      const duration = pkLiveUser.pkEndTime ? Math.round((new Date(pkLiveUser?.pkEndTime).getTime() - new Date().getTime()) / 1000) : 0;

      const [rankedLiveUser, topGifterHost1, topGifterHost2] = await Promise.all([
        LiveStreamer.aggregate([{ $match: { _id: pkLiveUser._id } }, { $addFields: { duration } }]),
        TopGifter.findOne({ liveHistoryId: liveHistoryId }).select("gifters").populate("gifters.userId", "name image isProfilePicBanned").limit(5).lean(),
        TopGifter.findOne({ liveHistoryId: pkLiveUser.pkConfig.host2LiveId }).select("gifters").populate("gifters.userId", "name image isProfilePicBanned").limit(5).lean(),
      ]);

      if (rankedLiveUser.length > 0) {
        io.in(liveUserObjId).emit("pkRankUpdate", rankedLiveUser[0]);
      }

      //📡 Emit updated Top Gifters
      const topGiftersHost1 = topGifterHost1?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];
      const topGiftersHost2 = topGifterHost2?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];

      const eventData = {
        topGiftersHost1,
        topGiftersHost2,
      };

      io.in(liveUserObjId).emit("updateHostGifterStats", eventData);
    }

    if (!existLiveView) {
      console.log("[countLiveJoin] Creating new LiveView entry");

      const { _id, activeAvtarFrame, ...safeUserFields } = user;

      await LiveStreamerView.create({
        liveType,
        userId,
        liveUserId: liveUser.userId,
        liveStreamerId: liveUser._id,
        agoraUid: agoraUid || "",
        liveHistoryId: liveHistoryId || null,
        avtarFrame: avtarFrameImage,
        avtarFrameType: avtarFrameType,
        ...safeUserFields,
      });
    }

    const matchStage =
      // liveHistoryId && liveHistoryId !== "" ?
      // { $match: { liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId) } } :
      { $match: { liveStreamerId: new mongoose.Types.ObjectId(liveUserObjId) } };

    const [totalViews, viewersList, seatedUsers, topGifterStats, updatedLiveUser] = await Promise.all([
      LiveStreamerView.countDocuments({ liveStreamerId: liveUserObjId }),
      LiveStreamerView.aggregate([
        {
          $match: {
            liveStreamerId: new mongoose.Types.ObjectId(liveUserObjId),
          },
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "liveUserId", // live stream host
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: new mongoose.Types.ObjectId(userId),
                }, // viewer
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: "followData",
          },
        },
        {
          $addFields: {
            isFollow: { $gt: [{ $size: "$followData" }, 0] },
          },
        },
        {
          $project: {
            userId: 1,
            name: 1,
            userName: 1,
            image: 1,
            isProfilePicBanned: 1,
            avtarFrameType: 1,
            avtarFrame: 1,
            age: 1,
            gender: 1,
            countryFlagImage: 1,
            country: 1,
            uniqueId: 1,
            isVerified: 1,
            agoraUid: 1,
            isFollow: 1,
          },
        },
      ]),
      LiveStreamer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(liveUserObjId) } },
        { $unwind: "$seat" },
        { $match: { "seat.userId": { $ne: null } } },
        {
          $project: {
            _id: 1,
            "seat.userId": 1,
            "seat.name": 1,
            "seat.userName": 1,
            "seat.image": 1,
            "seat.isProfilePicBanned": 1,
            "seat.isVerified": 1,
          },
        },
      ]),
      TopGifter.aggregate([
        matchStage, // Conditionally matched
        {
          $unwind: "$gifters",
        },
        {
          $lookup: {
            from: "users",
            localField: "gifters.userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "gifterUser",
          },
        },
        {
          $unwind: "$gifterUser",
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "gifterUser._id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: new mongoose.Types.ObjectId(userId),
                },
              },
              { $limit: 1 },
              {
                $project: { _id: 1 },
              },
            ],
            as: "followData",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "gifterUser.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  type: 1,
                  image: 1,
                },
              },
            ],
            as: "activeAvtarFrameData",
          },
        },
        {
          $unwind: {
            path: "$activeAvtarFrameData",
            preserveNullAndEmptyArrays: true, // in case user has no active frame
          },
        },
        {
          $addFields: {
            "gifters.userId": {
              _id: "$gifterUser._id",
              name: "$gifterUser.name",
              image: "$gifterUser.image",
              isProfilePicBanned: "$gifterUser.isProfilePicBanned",
              activeAvtarFrameType: { $ifNull: ["$activeAvtarFrameData.type", 0] },
              activeAvtarFrameImage: { $ifNull: ["$activeAvtarFrameData.image", ""] },
            },
            "gifters.isFollow": {
              $gt: [{ $size: "$followData" }, 0],
            },
          },
        },
        {
          $group: {
            _id: "$_id",
            gifters: { $push: "$gifters" },
          },
        },
      ]),
      Number(liveType) === 1 || Number(liveType) === 3 || Number(liveType) === 4
        ? LiveStreamer.aggregate([
            {
              $match: {
                _id: new mongoose.Types.ObjectId(liveUserObjId),
              },
            },
            {
              $project: {
                requested: 1,
              },
            },
          ])
        : Promise.resolve(null),
    ]);

    console.log(`[countLiveJoin] Total viewers for ${liveUserObjId}:`, totalViews);

    const earnedCoins = liveUser?.earnedCoins;
    if (earnedCoins !== undefined) {
      io.in(liveUserObjId.toString()).emit("liveRoomCoinUpdate", earnedCoins);
      console.log(`[liveRoomCoinUpdate] emitted for room: ${liveUserObjId} with earnedCoins: ${earnedCoins}`);
    }

    const hostCoins = liveUser?.earnedCoins;
    if (hostCoins) {
      io.in(liveUserObjId.toString()).emit("hostCoinUpdated", {
        userId: liveUser._id,
        hostCoins: liveUser.hostCoins,
      });
    }

    const topGifters = topGifterStats?.[0]?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];
    const entryEffect = {
      entryRide,
      entryRideType,
    };

    io.in(liveUserObjId).emit("topLiveStreamGifter", topGifters);
    io.in(liveUserObjId).emit("countLiveJoin", totalViews);
    io.in(liveUserObjId).emit("userJoinedLive", data);
    io.in(liveUserObjId).emit("liveViewersList", viewersList);
    io.in(liveUserObjId).emit("seatedUsersUpdate", seatedUsers);
    io.in(liveUserObjId).emit("fireEntryEffect", entryEffect);

    if (updatedLiveUser) {
      io.in(liveUserObjId.toString()).emit("callJoinRequestsRefreshed", updatedLiveUser[0]?.requested || []);
    }

    await Promise.all([
      LiveStreamer.updateOne({ _id: liveUser._id }, { $set: { view: totalViews } }),
      ...(liveHistoryId !== ""
        ? [
            LiveStreamerHistory.updateOne(
              { _id: liveHistoryId },
              {
                $set: { viewerCount: totalViews },
              },
            ),
          ]
        : []),
    ]);
  });

  socket.on("reduceLiveJoiners", async (data) => {
    try {
      const dataOflessView = JSON.parse(data);
      console.log("[reduceLiveJoiners] Received data:", dataOflessView);

      const { userId, liveUserObjId, liveHistoryId } = dataOflessView;

      if (!userId || !liveHistoryId || !liveUserObjId) {
        console.log("[reduceLiveJoiners] Missing userId or liveHistoryId or liveUserObjId");
      }

      const [liveUser, existLiveView] = await Promise.all([
        LiveStreamer.findOne({ _id: liveUserObjId }).select("_id view").lean(),
        LiveStreamerView.findOne({ userId, liveStreamerId: liveUserObjId }).lean(),
      ]);

      if (!liveUser) {
        console.log("[reduceLiveJoiners] LiveStreamer not found");
        return;
      }

      if (existLiveView) {
        console.log("[reduceLiveJoiners] Removing user from LiveView");
        await LiveStreamerView.deleteOne({ _id: existLiveView._id });
      }

      const [totalViews, viewersList] = await Promise.all([
        LiveStreamerView.countDocuments({ liveStreamerId: liveUserObjId }),
        LiveStreamerView.find({ liveStreamerId: liveUserObjId }).select("userId name userName image isProfilePicBanned avtarFrame").lean(),
      ]);

      console.log(`[reduceLiveJoiners] Updated total viewers for ${liveUserObjId}:`, totalViews);

      io.in(liveUserObjId).emit("reduceLiveJoiners", totalViews);
      io.in(liveUserObjId).emit("liveViewersList", viewersList);

      await LiveStreamer.updateOne({ _id: liveUser._id }, { $set: { view: totalViews } });

      let emittingSocketCount = io.sockets.adapter.rooms.get(liveUserObjId)?.size || 0;
      console.log(`[reduceLiveJoiners] Emitting event to ${emittingSocketCount} sockets in room ${liveUserObjId}`);

      let socketCountBefore = io.sockets.adapter.rooms.get(liveUserObjId)?.size || 0;
      console.log(`[reduceLiveJoiners] Before leaving: ${socketCountBefore} sockets in room ${liveUserObjId}`);

      if (socket.rooms.has(liveUserObjId)) {
        socket.leave(liveUserObjId);
        console.log(`[reduceLiveJoiners] User ${userId} left room: ${liveUserObjId}`);
      } else {
        console.log(`[reduceLiveJoiners] User ${userId} was not in room: ${liveUserObjId}`);
      }

      let socketCountAfter = io.sockets.adapter.rooms.get(liveUserObjId)?.size || 0;
      console.log(`[reduceLiveJoiners] After leaving: ${socketCountAfter} sockets in room ${liveUserObjId}`);
    } catch (error) {
      console.error("[reduceLiveJoiners] Error:", error);
    }
  });

  socket.on("broadcastLiveComment", async (data) => {
    try {
      const dataOfComment = JSON.parse(data);
      console.log("[broadcastLiveComment] Parsed data:", dataOfComment);

      const { liveUserObjId, liveHistoryId, isBattleActive } = dataOfComment;

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[broadcastLiveComment] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[broadcastLiveComment] User is already in room: ${liveUserObjId}`);
      }

      if (isBattleActive) {
        const liveUser = await LiveStreamer.findOne({ liveHistoryId: liveHistoryId }).select("pkConfig.host1ObjId pkConfig.host2ObjId").lean();

        if (liveUser) {
          console.log(`[PK MODE] Broadcasting comment`);

          io.in(liveUser.pkConfig.host1ObjId.toString()).emit("broadcastLiveComment", data);
          io.in(liveUser.pkConfig.host2ObjId.toString()).emit("broadcastLiveComment", data);
        } else {
          console.log(`[PK MODE] No live user found`);
        }
      } else {
        io.in(liveUserObjId).emit("broadcastLiveComment", data);
      }

      const [liveHistory, commenter] = await Promise.all([
        LiveStreamerHistory.findById(liveHistoryId).select("_id").lean(),
        User.findById(dataOfComment.senderUserId)
          .select("_id name userName image isProfilePicBanned gender age countryFlagImage country uniqueId isVerified fcmToken activeAvtarFrame isBlock isPushNotificationEnabled")
          .lean(),
      ]);

      if (liveHistory) {
        await LiveStreamerHistory.updateOne(
          {
            _id: liveHistory._id,
          },
          {
            $inc: { commentCount: 1 },
          },
        );
      }

      if (commenter && liveUserObjId && liveHistoryId && dataOfComment.commentText) {
        const [avtarFrameData, liveStreamer] = await Promise.all([
          commenter.activeAvtarFrame ? AvtarFrame.findById(commenter.activeAvtarFrame).select("type image").lean() : Promise.resolve(null),
          LiveStreamer.findOne({ _id: liveUserObjId }).select("userId").lean(),
        ]);

        const { _id, activeAvtarFrame, ...safeCommenterFields } = commenter;

        await LiveStreamComment.create({
          ...safeCommenterFields,
          userId: commenter._id,
          liveUserId: liveStreamer?.userId || null,
          liveStreamerId: liveUserObjId,
          liveHistoryId: liveHistoryId || null,
          avtarFrame: avtarFrameData?.image || "",
          avtarFrameType: avtarFrameData?.type || 0,
          comment: dataOfComment.commentText,
        });

        console.log(`[broadcastLiveComment] Comment saved for liveStreamerId: ${liveUserObjId}`);
      }

      const socketCount = (await io.in(liveUserObjId).fetchSockets())?.length || 0;
      console.log(`[broadcastLiveComment] Active sockets in room ${liveUserObjId}:`, socketCount);
    } catch (error) {
      console.error("[broadcastLiveComment] Error:", error);
    }
  });

  socket.on("fetchLiveComments", async (data) => {
    try {
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;
      console.log("[fetchLiveComments] Received data:", parsedData);

      const { userId, liveUserObjId, limit = 20, lastCommentId } = parsedData;

      if (!liveUserObjId) {
        console.log("[fetchLiveComments] Missing liveUserObjId");
        return socket.emit("fetchLiveComments", { status: false, message: "Missing liveUserObjId" });
      }

      if (!mongoose.Types.ObjectId.isValid(liveUserObjId)) {
        return socket.emit("fetchLiveComments", { status: false, message: "Invalid liveUserObjId" });
      }

      const liveStreamerObjId = new mongoose.Types.ObjectId(liveUserObjId);

      const matchStage = { liveStreamerId: liveStreamerObjId };
      if (lastCommentId) {
        if (!mongoose.Types.ObjectId.isValid(lastCommentId)) {
          return socket.emit("fetchLiveComments", { status: false, message: "Invalid lastCommentId" });
        }
        matchStage._id = { $lt: new mongoose.Types.ObjectId(lastCommentId) };
      }

      const pageLimit = Math.max(1, Math.min(Number(limit), 50));

      const comments = await LiveStreamComment.aggregate([
        { $match: matchStage },
        { $sort: { _id: -1 } },
        { $limit: pageLimit },
        {
          $project: {
            _id: 1,
            userId: 1,
            liveUserId: 1,
            liveStreamerId: 1,
            liveHistoryId: 1,
            liveType: 1,
            comment: 1,
            name: 1,
            userName: 1,
            image: 1,
            isProfilePicBanned: 1,
            age: 1,
            gender: 1,
            countryFlagImage: 1,
            country: 1,
            uniqueId: 1,
            isVerified: 1,
            avtarFrameType: 1,
            avtarFrame: 1,
            isBlock: 1,
            createdAt: 1,
          },
        },
      ]);

      io.in(`globalRoom:${userId}`.toString()).emit("fetchLiveComments", comments);

      const socketCount = (await io.in(`globalRoom:${userId}`.toString()).fetchSockets())?.length || 0;
      console.log(`[fetchLiveComments] Active sockets in room ${liveStreamerObjId}:`, socketCount);
    } catch (error) {
      console.error("[fetchLiveComments] Error:", error);
      socket.emit("fetchLiveComments", { status: false, message: "Internal server error" });
    }
  });

  socket.on("liveFollowCountUpdate", async (data) => {
    try {
      const { liveHistoryId, incrementBy = 1 } = JSON.parse(data);
      console.log("[liveFollowCountUpdate] Data received:", { liveHistoryId, incrementBy });

      const [liveHistory] = await Promise.all([LiveStreamerHistory.findById(liveHistoryId).select("_id").lean()]);

      if (!liveHistory) {
        console.log("[liveFollowCountUpdate] No LiveStreamerHistory found for ID:", liveHistoryId);
        return;
      }

      await LiveStreamerHistory.updateOne({ _id: liveHistory._id }, { $inc: { increasedFans: incrementBy } });
    } catch (error) {
      console.error("[liveFollowCountUpdate] Error:", error);
    }
  });

  socket.on("giftToLiveStream", async (data) => {
    try {
      const giftData = JSON.parse(data);
      console.log("Gift Data Received:", giftData);

      const { liveUserId, liveUserObjId, liveHistoryId, senderUserId, receiverUserId, giftId, giftCount, giftCategoryId } = giftData;

      const receiverUsers = Array.isArray(receiverUserId) ? receiverUserId.map((id) => id.trim()) : [];
      console.log("Processing gifts for receivers:", receiverUsers);

      const [senderUser, receiverUsersDocs, gift, giftCategory, liveHistory] = await Promise.all([
        User.findById(senderUserId).lean().select("_id name image coin"),
        User.find({ _id: { $in: receiverUsers } })
          .select("_id name")
          .lean(),
        Gift.findById(giftId).lean().select("_id coin title image"),
        GiftCategory.findById(giftCategoryId).lean().select("_id name"),
        LiveStreamerHistory.findById(liveHistoryId).lean().select("_id"),
      ]);

      if (!senderUser) {
        console.log("Sender user not found");
        io.in(`globalRoom:${senderUserId}`).emit("gift", { error: "Sender user not found" });
        return;
      }

      if (!giftCategory) {
        console.log("GiftCategory not found");
        io.in(`globalRoom:${senderUserId}`).emit("gift", { error: "GiftCategory not found" });
        return;
      }

      if (!liveHistory) {
        console.log("LiveStreamerHistory not found");
        io.in(`globalRoom:${senderUserId}`).emit("gift", { error: "LiveStreamerHistory not found" });
        return;
      }

      const foundReceiverIds = receiverUsersDocs.map((u) => u._id.toString());
      const missingReceivers = receiverUsers.filter((id) => !foundReceiverIds.includes(id));

      if (missingReceivers.length > 0) {
        const message = `Receiver user(s) not found: ${missingReceivers.join(", ")}`;
        console.log(message);
        io.in("globalRoom:" + giftData.senderUserId).emit("gift", message);
        return;
      }

      const coinPerGift = Math.abs(gift.coin);
      const totalCoin = coinPerGift * giftCount;
      const overallGiftCoinCost = totalCoin * receiverUsers.length;

      if (senderUser.coin < overallGiftCoinCost) {
        console.log("Insufficient coins");
        io.in(`globalRoom:${senderUserId}`).emit("gift", { error: "You don't have enough coins" });
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[giftToLiveStream] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[giftToLiveStream] User is already in room: ${liveUserObjId}`);
      }

      if (overallGiftCoinCost > settingJSON.coinBroadcastThreshold) {
        io.emit("proHighValueGift", data); //emit to all connected sockets regardless of room
      }

      io.in(liveUserObjId).emit("fetchLiveGifts", giftData);

      const [existing] = await Promise.all([
        TopGifter.findOneAndUpdate(
          {
            liveHistoryId: liveHistoryId,
            "gifters.userId": senderUser._id,
          },
          {
            $inc: {
              "gifters.$.totalCoins": Math.abs(totalCoin),
            },
          },
          { new: true },
        ).lean(),
        User.updateOne(
          { _id: senderUser._id, coin: { $gte: overallGiftCoinCost } },
          {
            $inc: {
              coin: -Math.abs(overallGiftCoinCost),
              spentCoins: Math.abs(overallGiftCoinCost),
            },
          },
        ),
      ]);

      if (!existing) {
        await TopGifter.findOneAndUpdate(
          { liveHistoryId: liveHistoryId },
          {
            $push: {
              gifters: {
                userId: senderUser._id,
                totalCoins: Math.abs(totalCoin),
              },
            },
          },
          { upsert: true, new: true },
        );
      }

      const topGifterData = await TopGifter.aggregate([
        { $match: { liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId) } },
        { $unwind: "$gifters" },
        {
          $lookup: {
            from: "users",
            localField: "gifters.userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "gifterUser",
          },
        },
        { $unwind: "$gifterUser" },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "gifterUser._id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: new mongoose.Types.ObjectId(senderUserId),
                },
              },
              { $limit: 1 },
              {
                $project: { _id: 1 },
              },
            ],
            as: "followData",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "gifterUser.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  type: 1,
                  image: 1,
                },
              },
            ],
            as: "activeAvtarFrameData",
          },
        },
        {
          $unwind: {
            path: "$activeAvtarFrameData",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            "gifters.userId": {
              _id: "$gifterUser._id",
              name: "$gifterUser.name",
              image: "$gifterUser.image",
              isProfilePicBanned: "$gifterUser.isProfilePicBanned",
              activeAvtarFrameType: { $ifNull: ["$activeAvtarFrameData.type", 0] },
              activeAvtarFrameImage: { $ifNull: ["$activeAvtarFrameData.image", ""] },
            },
            "gifters.isFollow": {
              $gt: [{ $size: "$followData" }, 0],
            },
          },
        },
        {
          $group: {
            _id: "$_id",
            gifters: { $push: "$gifters" },
          },
        },
      ]);

      const topGifters = topGifterData?.[0]?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];
      io.in(liveUserObjId).emit("broadcastTopGifter", topGifters);

      const adminRate = Math.abs(settingJSON.adminRate ?? 10);
      let adminCoin = Math.round((totalCoin * adminRate) / 100);

      let estimatedReceiverCoin = 0;
      if (giftCategory?.name.toLowerCase() === "lucky") {
        const receiverSharePercent = Math.abs(settingJSON.luckyGiftReceiverSharePercent || 10);
        const receiverCoinPerUser = Math.round((totalCoin * receiverSharePercent) / 100);
        estimatedReceiverCoin = receiverCoinPerUser * receiverUsers.length;
      } else {
        const receiverCoinPerUser = totalCoin - adminCoin;
        estimatedReceiverCoin = receiverCoinPerUser * receiverUsers.length;
      }

      const [liveStreamer] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId),
          },
          {
            $inc: { earnedCoins: estimatedReceiverCoin },
          },
          {
            new: true,
          },
        )
          .select("earnedCoins")
          .lean(),
        LiveStreamerHistory.updateOne(
          { _id: new mongoose.Types.ObjectId(liveHistoryId) },
          {
            $inc: {
              earnedCoins: estimatedReceiverCoin,
              receivedGifts: giftCount * receiverUsers.length,
            },
          },
        ),
      ]);

      const earnedCoins = liveStreamer?.earnedCoins;
      if (earnedCoins !== undefined) {
        io.in(liveUserObjId.toString()).emit("liveRoomCoinUpdate", earnedCoins);
        console.log(`[liveRoomCoinUpdate] emitted for room: ${liveUserObjId} with earnedCoins: ${earnedCoins}`);
      }

      for (const receiverUserId of receiverUsers) {
        const [uniqueId, receiverUser] = await Promise.all([generateHistoryUniqueId(), User.findById(receiverUserId).select("_id role agencyId isBlock isHostBlocked").lean()]);

        if (!receiverUser) {
          console.log("Receiver user not found:", receiverUserId);
          continue;
        }

        let receiverCoin = totalCoin - adminCoin;

        let isSenderRewardEnabled = false;
        let adminCoinForLucky = 0;
        let receiverCoinForLucky = 0;
        let luckyUserWinCoin = 0;
        let totalLuckyCoin = 0;
        let luckyHistoryId, mainSetting;
        let luckyGiftEventId = null;

        if (giftCategory && giftCategory.name.toLowerCase() === "lucky") {
          console.log(`[Lucky Gift Triggered] Sender: ${senderUser._id}, Receiver: ${receiverUserId}`);
          console.log(`[Gift Info] ${gift.coin} × ${giftCount} | Total: ${totalCoin} coins`);

          const adminTaxPercent = Number(settingJSON.luckyGiftAdminTaxPercent);
          const receiverSharePercent = Number(settingJSON.luckyGiftReceiverSharePercent);
          luckyGiftEventId = new mongoose.Types.ObjectId();

          adminCoinForLucky = Math.round(totalCoin * ((isNaN(adminTaxPercent) ? 10 : adminTaxPercent) / 100));
          receiverCoinForLucky = Math.round(totalCoin * ((isNaN(receiverSharePercent) ? 10 : receiverSharePercent) / 100));
          totalLuckyCoin = totalCoin - (adminCoinForLucky + receiverCoinForLucky);

          console.log(`• Admin Tax (%${adminTaxPercent}): ${adminCoinForLucky}`);
          console.log(`• Receiver Share (%${receiverSharePercent}): ${receiverCoinForLucky}`);
          console.log(`• Lucky Pool Reserve: ${totalLuckyCoin}`);

          await Setting.updateOne({ _id: settingJSON._id }, { $inc: { luckyGiftTargetCoin: totalLuckyCoin } });

          const { multiplier, luckyValue } = getLuckyGiftValue(totalCoin);
          console.log(`Lucky Gift: multiplier=${multiplier}, luckyValue=${luckyValue}`);

          [luckyHistoryId, mainSetting] = await Promise.all([generateHistoryUniqueId(), Setting.findOne().select("luckyGiftTargetCoin").lean()]);

          console.log(`[Lucky Pool Status] Available: ${mainSetting.luckyGiftTargetCoin}`);

          receiverCoin = receiverCoinForLucky;
          adminCoin = adminCoinForLucky;

          if (luckyValue > 0 && luckyValue <= mainSetting.luckyGiftTargetCoin) {
            console.log(`[Lucky Reward Granted] Coin Returned to Sender: ${luckyValue}`);

            isSenderRewardEnabled = true;
            luckyUserWinCoin = luckyValue;

            console.log(`User Lucky gift bonus applied: ${luckyUserWinCoin} coins`);

            if (isSenderRewardEnabled) {
              io.to("globalRoom:" + giftData.senderUserId.toString()).emit("luckyGiftWin", luckyUserWinCoin);

              await Promise.all([
                Setting.updateOne({ _id: settingJSON._id }, { $set: { luckyGiftTargetCoin: 0 } }),
                User.updateOne(
                  { _id: senderUser._id },
                  {
                    $inc: { coin: luckyUserWinCoin },
                  },
                ),
                luckyUserWinCoin > 0
                  ? History.create({
                      uniqueId: luckyHistoryId,
                      type: 15,
                      liveHistoryId: giftData.liveHistoryId,
                      liveType: 2,
                      otherUserId: senderUser._id,
                      giftId: giftData.giftId,
                      giftTitle: gift.title,
                      giftCoin: gift.coin,
                      giftImage: gift.image,
                      giftReceivedCount: giftCount,
                      luckyGiftMultiplier: multiplier,
                      coin: luckyUserWinCoin,
                      luckyGiftEventId,
                      date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
                    })
                  : Promise.resolve(),
              ]);
            }

            isSenderRewardEnabled = false;
          } else {
            console.log("Lucky gift bonus criteria not met.");

            isSenderRewardEnabled = false;
          }
        }

        const isHost = Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId && !receiverUser.isBlock && !receiverUser.isHostBlocked;

        // Base update fields for every receiver
        const updateFields = {
          $inc: {
            receivedCoins: receiverCoin,
            receivedGifts: giftCount,
            coin: receiverCoin,
          },
        };

        // For non-hosts → increment coin
        // if (!isHost) {
        //   console.log("For non-hosts → increment coin");

        //   updateFields.$inc.coin = receiverCoin;
        // }

        // For hosts → increment host-related fields only
        if (isHost) {
          console.log("For hosts → increment host-related fields only");

          updateFields.$inc.earnedHostCoins = receiverCoin;
        }

        await Promise.all([
          User.updateOne({ _id: receiverUser._id }, updateFields),
          History.create({
            uniqueId: uniqueId,
            type: 6,
            liveHistoryId: liveHistoryId,
            liveType: 1,
            userId: senderUser._id,
            otherUserId: receiverUser._id,
            giftCategoryId: giftCategory._id,
            giftId: giftId,
            giftReceivedCount: giftCount,
            giftCoin: gift.coin,
            giftTitle: gift.title,
            giftImage: gift.image,
            senderCoin: totalCoin,
            receiverCoin: receiverCoin,
            adminCoin: adminCoin,
            luckyGiftReserve: totalLuckyCoin,
            hostAgencyId: isHost ? receiverUser.agencyId : null,
            luckyGiftEventId,
            date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
          }),
          liveHistoryId
            ? LiveStreamer.updateMany(
                {
                  liveHistoryId: liveHistoryId,
                  "requested.userId": receiverUser._id,
                },
                {
                  $inc: {
                    "requested.$[elem].coin": receiverCoin,
                  },
                },
                {
                  arrayFilters: [{ "elem.userId": receiverUser._id }],
                },
              )
            : Promise.resolve(null),
        ]);

        if (liveUserId && receiverUser && receiverUser?._id?.toString() === liveUserId?.toString()) {
          const updatedHostCoins = await LiveStreamer.findOneAndUpdate(
            {
              liveHistoryId: liveHistoryId,
              userId: receiverUser._id,
            },
            {
              $inc: { hostCoins: receiverCoin },
            },
            {
              new: true,
              fields: { hostCoins: 1 },
            },
          ).lean();

          if (updatedHostCoins) {
            io.in(liveUserObjId.toString()).emit("hostCoinUpdated", {
              userId: receiverUser._id,
              hostCoins: updatedHostCoins.hostCoins,
            });
          }
        }

        if (Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId) {
          const [uniqueCommissionId, agency] = await Promise.all([generateHistoryUniqueId(), Agency.findOne({ _id: receiverUser.agencyId, isActive: true }).select("_id commissionRate ").lean()]);
          //console.log("[giftToLiveStream] Agency fetched:", agency);

          if (agency) {
            const commissionRate = agency.commissionRate || 0;
            const commission = Math.round((totalCoin * commissionRate) / 100);
            const dateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

            console.log(`[giftToLiveStream] Commission calculation:
            - Gift Coin: ${gift.coin}
            - Gift Count: ${giftCount}
            - Base Coins (Gift Coin × Count): ${totalCoin}
            - Agency Commission Rate: ${commissionRate}%
            - Commission Earned: ${commission} coins
          `);

            const updatePromises = [];
            const agencyEarningUpdate = buildAgencyEarningUpdate(commission, receiverCoin);

            if (commission > 0) {
              updatePromises.push(
                History.create({
                  uniqueId: uniqueCommissionId,
                  type: 9,
                  coin: commission,
                  agencyId: agency._id,
                  userId: senderUser._id,
                  otherUserId: receiverUser._id,
                  baseType: 6,
                  baseCoins: totalCoin,
                  commissionRate: commissionRate,
                  date: dateStr,
                }),
              );
              agencyEarningUpdate && updatePromises.push(Agency.updateOne({ _id: agency._id }, agencyEarningUpdate));
            }

            await Promise.all(updatePromises);

            console.log("[giftToLiveStream] Host and agency updates completed successfully.");
          } else {
            console.log("[giftToLiveStream] No active agency found for receiver.");
          }
        }
      }

      const [updatedLiveUser] = await Promise.all([
        liveHistoryId
          ? LiveStreamer.aggregate([
              {
                $match: {
                  _id: new mongoose.Types.ObjectId(liveUserObjId),
                },
              },
              {
                $project: {
                  requested: 1,
                },
              },
            ])
          : Promise.resolve(null),
      ]);

      if (updatedLiveUser) {
        io.in(liveUserObjId.toString()).emit("callJoinRequestsRefreshed", updatedLiveUser[0]?.requested || []);
      }
    } catch (error) {
      console.error("Error in giftToLiveStream:", error);
      io.in(liveUserObjId.toString()).emit("gift", { error: "An error occurred while processing the gift." });
    }
  });

  socket.on("makeAdminUser", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("makeAdminUser data:", parsedData);

      const { liveUserObjId, liveHistoryId, adminUserId } = parsedData;

      if (!mongoose.Types.ObjectId.isValid(adminUserId)) {
        return socket.emit("adminActionFailed", {
          message: "Invalid admin user id",
        });
      }

      const adminUser = await User.findOne({
        _id: adminUserId,
        isBlock: false,
      })
        .select("_id")
        .lean();

      if (!adminUser) {
        return socket.emit("adminActionFailed", {
          message: "User not found or not eligible",
        });
      }

      const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
        {
          _id: liveUserObjId,
          liveHistoryId: liveHistoryId,
          "admins.adminUserId": { $ne: adminUserId }, // prevent duplicates
        },
        {
          $push: {
            admins: {
              adminUserId: adminUserId,
            },
          },
        },
        { new: true },
      ).populate({
        path: "admins.adminUserId",
        select: "_id name userName image isProfilePicBanned uniqueId isVerified",
      });

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
      }

      io.in(liveUserObjId).emit("adminUserAdded", updatedLiveUser?.admins);
      io.in("globalRoom:" + adminUserId.toString()).emit("notifyAdminAssigned", "You are now an admin");
    } catch (error) {
      console.error("Error in makeAdminUser:", error);
    }
  });

  socket.on("removeAdminUser", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("removeAdminUser data:", parsedData);

      const { liveUserObjId, liveHistoryId, adminUserId } = parsedData;

      if (!mongoose.Types.ObjectId.isValid(adminUserId)) {
        return socket.emit("adminActionFailed", {
          message: "Invalid admin user id",
        });
      }

      const adminUser = await User.findOne({
        _id: adminUserId,
        isBlock: false,
      })
        .select("_id")
        .lean();

      if (!adminUser) {
        return socket.emit("adminActionFailed", {
          message: "User not found or not eligible",
        });
      }

      const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
        {
          _id: liveUserObjId,
          liveHistoryId: liveHistoryId,
        },
        {
          $pull: {
            admins: {
              adminUserId: adminUserId,
            },
          },
        },
        { new: true },
      ).populate({
        path: "admins.adminUserId",
        select: "_id name userName image isProfilePicBanned uniqueId isVerified",
      });

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
      }

      io.in(liveUserObjId).emit("adminUserRemoved", updatedLiveUser?.admins);
      io.in("globalRoom:" + adminUserId.toString()).emit("notifyAdminRemoved", "Admin access removed");
    } catch (error) {
      console.error("Error in removeAdminUser:", error);
    }
  });

  socket.on("endLiveStream", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received endLiveStream event with data:", parsedData);

      const { userId, liveHistoryId, liveUserObjId } = parsedData;

      io.in(liveUserObjId).emit("endLiveStream", parsedData);

      const [user, liveUser, liveHistory] = await Promise.all([
        User.findOne({ liveHistoryId }).select("_id isLive isBusy liveHistoryId name").lean(),
        LiveStreamer.findOne({ userId, liveHistoryId }).select("_id userId liveHistoryId isAudio roomImage").lean(),
        LiveStreamerHistory.findById(liveHistoryId).select("_id startTime").lean(),
      ]);

      if (!user) {
        console.log("⚠️ User not found.");
        return;
      }

      if (!liveUser) {
        console.log(`⚠️ No LiveUser found with userId: ${userId} and liveHistoryId: ${liveHistoryId}`);
        return;
      }

      if (!liveHistory) {
        console.log("⚠️ LiveHistory not found.");
        return;
      }

      if (user.isLive && user.liveHistoryId && user.liveHistoryId !== null) {
        if (liveUser && !liveUser.isAudio) {
          const sockets = await io.in(liveUserObjId).fetchSockets();
          console.log(`🔄 Active sockets in room (${liveUserObjId}): ${sockets.length}`);

          if (sockets.length) {
            io.socketsLeave(liveUserObjId);
            console.log(`✅ All sockets removed from room: ${liveUserObjId}`);
          } else {
            console.log("⚠️ No active sockets found to remove.");
          }

          if (liveUser && liveUser.roomImage) {
            const roomImage = liveUser?.roomImage;
            if (roomImage) {
              deleteFile(roomImage);
              console.log(`✅ Room image deleted`);
            }
          }

          await LiveStreamer.deleteOne({ userId, liveHistoryId });
          console.log(`✅ LiveStreamer entry deleted for userId: ${userId}`);
        } else {
          console.log("🔊 liveUser.isAudio is true, skipping LiveStreamer deletion.");

          await LiveStreamer.updateOne(
            { userId, liveHistoryId },
            {
              $set: {
                liveHistoryId: null,
                isHostActiveInRoom: false,
                // agoraUid: 0,
                // channel: "",
                // token: "",
              },
            },
          );

          console.log(`✅ LiveStreamer updated for userId: ${userId}`);
        }

        const endTime = moment().tz("Asia/Kolkata").format();
        const start = moment.tz(liveHistory.startTime, "Asia/Kolkata");
        const end = moment.tz(endTime, "Asia/Kolkata");
        const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
        const durationInMinutes = Math.floor(moment.duration(end.diff(start)).asMinutes());

        await Promise.all([
          User.updateOne(
            { _id: user._id },
            {
              $set: {
                isLive: false,
                isBusy: false,
                liveHistoryId: null,
                liveStreamerId: null,
              },
            },
          ),
          LiveStreamerHistory.updateOne({ _id: liveHistory._id }, { $set: { endTime, duration } }),
          liveUser && !liveUser.isAudio ? LiveStreamerView.deleteMany({ liveStreamerId: liveUserObjId }) : Promise.resolve(),
          liveUser && !liveUser.isAudio ? LiveStreamComment.deleteMany({ liveStreamerId: liveUserObjId }) : Promise.resolve(),
          liveUser && !liveUser.isAudio ? TopGifter.deleteMany({ liveHistoryId: liveHistory._id }) : Promise.resolve(),
          clearLiveChatReferences([liveUserObjId], [liveHistory._id]),
        ]);

        console.log(`✅ User ${user.name} is no longer live.`);
        console.log("✅ Related liveViews deleted.");
      }
    } catch (error) {
      console.error("❌ Error in endLiveStream:", error);
    }
  });

  //pk
  socket.on("pkRequest", async (data) => {
    try {
      const parseData = JSON.parse(data);
      console.info("[PK_REQUEST] Received data:", parseData);

      if (parseData.InstantCutRequestByHost) {
        console.info("[PK_REQUEST] Instant Cut Request By Host:", parseData.InstantCutRequestByHost);

        io.in("globalRoom:" + parseData.host2Id).emit("pkRequestReceived", data);
      } else {
        console.info("[PK_REQUEST] Request accepted by host");

        io.in("globalRoom:" + parseData.host2Id.toString()).emit("pkRequestReceived", data);
      }

      const senderId = parseData.host1Id || parseData.HOST_1_ID;
      const receiverId = parseData.host2Id || parseData.HOST_2_ID;

      if (senderId && receiverId && senderId.toString() !== receiverId.toString()) {
        const [receiverUser, senderUser, isBlocked] = await Promise.all([
          User.findById(receiverId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
          User.findById(senderId).select("_id name userName image isProfilePicBanned isVerified").lean(),
          Block.exists({
            $or: [
              { userId: senderId, toUserId: receiverId },
              { userId: receiverId, toUserId: senderId },
            ],
          }),
        ]);

        if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
          const senderName = parseData.host1Name?.trim() || parseData.HOST_1_NAME?.trim() || senderUser?.name?.trim() || senderUser?.userName?.trim() || "A host";
          const isInstantCut = !!parseData.InstantCutRequestByHost;
          const payload = {
            token: receiverUser.fcmToken,
            notification: isInstantCut
              ? {
                  title: "⚔️🔔 PK End Request!",
                  body: `🎯 ${senderName} wants to end the PK battle now! Tap to respond 🔥🏆`,
                }
              : {
                  title: `⚔️✨ PK Challenge from ${senderName}!`,
                  body: `🎥 ${senderName} challenged you to a PK battle! Tap to accept or decline 🔥🏆`,
                },
            data: {
              type: isInstantCut ? "PK_INSTANT_CUT_REQUEST" : "PK_REQUEST",
              host1Id: String(senderId),
              host2Id: String(receiverId),
              host1Name: String(parseData.host1Name || parseData.HOST_1_NAME || senderUser?.name || ""),
              host1Image: String(parseData.host1Image || parseData.HOST_1_IMAGE || senderUser?.image || ""),
              isProfilePicBanned: String(senderUser?.isProfilePicBanned ?? false),
              isVerified: String(senderUser?.isVerified ?? false),
            },
          };

          const adminPromise = await admin;
          adminPromise
            .messaging()
            .send(payload)
            .then((response) => {
              console.log("[pkRequest] Notification sent:", response);
            })
            .catch((error) => {
              console.error("[pkRequest] Error sending notification:", error);
            });
        }
      }
    } catch (error) {
      console.error("Error creating PK request:", error);
    }
  });

  socket.on("pkAnswer", async (data) => {
    const parseData = JSON.parse(data);
    console.log("Received pkAnswer event with data:", parseData);

    const [user1, user2] = await Promise.all([
      User.findById(parseData.HOST_1_ID)
        .select("_id name userName coin image isProfilePicBanned isVerified gender age countryFlagImage country uniqueId isPushNotificationEnabled isBlock fcmToken")
        .lean(),
      User.findById(parseData.HOST_2_ID)
        .select("_id name userName coin image isProfilePicBanned isVerified gender age countryFlagImage country uniqueId isPushNotificationEnabled isBlock fcmToken")
        .lean(),
    ]);

    if (!user1) {
      console.log("Host 1 is Not Found");
      io.in("globalRoom:" + parseData.HOST_1_ID).emit("pkAnswer", "Host 1 is Not Found");
    }

    if (!user2) {
      console.log("Host 2 is Not Found");
      io.in("globalRoom:" + parseData.HOST_2_ID).emit("pkAnswer", "Host 2 is Not Found");
    }

    if (parseData.isAccept) {
      console.log("PK Accepted for", parseData.HOST_1_ID, "and", parseData.HOST_2_ID);

      const pkId = Math.floor(Math.random() * 10000000) + 99999999;

      let pkTime = settingJSON.pkEndTime ? settingJSON.pkEndTime : 300;
      const endTime = new Date(Date.now() + pkTime * 1000);

      var duration = Math.round((endTime - new Date().getTime()) / 1000);
      if (duration < 0) duration = 0;

      const host1Details = {
        ...user1,
        wealthLevelImage: parseData.HOST_1_WEALTHLEVEL_IMAGE,
        avtarFrameType: parseData.HOST_1_AVTAR_FRAME_TYPE,
        avtarFrame: parseData.HOST_1_AVTAR_FRAME,
      };
      const host2Details = {
        ...user2,
        wealthLevelImage: parseData.HOST_2_WEALTHLEVEL_IMAGE,
        avtarFrameType: parseData.HOST_2_AVTAR_FRAME_TYPE,
        avtarFrame: parseData.HOST_2_AVTAR_FRAME,
      };

      const [liveUser1, liveUser2] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            userId: parseData.HOST_1_ID,
            liveType: { $nin: [2, 3, 4] },
          },
          {
            $set: {
              isPkMode: true,
              pkEndTime: endTime,
              pkId: pkId,
              "pkConfig.host1Id": parseData.HOST_1_ID,
              "pkConfig.host1Name": parseData.HOST_1_NAME,
              "pkConfig.host1Image": parseData.HOST_1_IMAGE,
              "pkConfig.host1UniqueId": parseData.HOST_1_UNIQUEID,
              "pkConfig.host1ObjId": parseData.HOST_1_LIVEUSER_OBJ_ID,
              "pkConfig.host1LiveId": parseData.HOST_1_LIVEID,
              "pkConfig.host1Channel": parseData.HOST_1_CHANNEL,
              "pkConfig.host1AgoraUID": parseData.HOST_1_AGORA_ID,

              "pkConfig.host2Id": parseData.HOST_2_ID,
              "pkConfig.host2Name": parseData.HOST_2_NAME,
              "pkConfig.host2userName": parseData.HOST_2_USERNAME,
              "pkConfig.host2Image": parseData.HOST_2_IMAGE,
              "pkConfig.host2UniqueId": parseData.HOST_2_UNIQUEID,
              "pkConfig.host2ObjId": parseData.HOST_2_LIVEUSER_OBJ_ID,
              "pkConfig.host2LiveId": parseData.HOST_2_LIVEID,
              "pkConfig.host2Channel": parseData.HOST_2_CHANNEL,
              "pkConfig.host2AgoraUID": parseData.HOST_2_AGORA_ID,

              "pkConfig.host1Details": host1Details,
              "pkConfig.host2Details": host2Details,
            },
          },
          { new: true, lean: true },
        ),
        LiveStreamer.findOneAndUpdate(
          {
            userId: parseData.HOST_2_ID,
            liveType: { $nin: [2, 3, 4] },
          },
          {
            $set: {
              isPkMode: true,
              pkEndTime: endTime,
              pkId: pkId,
              "pkConfig.host1Id": parseData.HOST_2_ID,
              "pkConfig.host1Name": parseData.HOST_2_NAME,
              "pkConfig.host1Image": parseData.HOST_2_IMAGE,
              "pkConfig.host1UniqueId": parseData.HOST_2_UNIQUEID,
              "pkConfig.host1ObjId": parseData.HOST_2_LIVEUSER_OBJ_ID,
              "pkConfig.host1LiveId": parseData.HOST_2_LIVEID,
              "pkConfig.host1Channel": parseData.HOST_2_CHANNEL,
              "pkConfig.host1AgoraUID": parseData.HOST_2_AGORA_ID,

              "pkConfig.host2Id": parseData.HOST_1_ID,
              "pkConfig.host2Name": parseData.HOST_1_NAME,
              "pkConfig.host2userName": parseData.HOST_1_USERNAME,
              "pkConfig.host2Image": parseData.HOST_1_IMAGE,
              "pkConfig.host2UniqueId": parseData.HOST_1_UNIQUEID,
              "pkConfig.host2ObjId": parseData.HOST_1_LIVEUSER_OBJ_ID,
              "pkConfig.host2LiveId": parseData.HOST_1_LIVEID,
              "pkConfig.host2Channel": parseData.HOST_1_CHANNEL,
              "pkConfig.host2AgoraUID": parseData.HOST_1_AGORA_ID,

              "pkConfig.host1Details": host2Details,
              "pkConfig.host2Details": host1Details,
            },
          },
          { new: true, lean: true },
        ),
      ]);

      if (!liveUser1 || !liveUser2) {
        socket.emit("singleLiveUserResponse", "PK Mode initiation failed: One or both hosts are either not live or using an unsupported liveType.");

        console.log("PK Mode initiation failed: One or both hosts are either not live or using an unsupported liveType.");
        return;
      }

      const [responseForUser1, responseForUser2] = await Promise.all([
        LiveStreamer.aggregate([
          { $match: { _id: liveUser2?._id } },
          { $addFields: { duration } },
          { $project: { userId: 1, name: 1, token: 1, channel: 1, coin: 1, duration: 1, isPkMode: 1, pkConfig: 1, liveHistoryId: 1, view: 1 } },
        ]),
        LiveStreamer.aggregate([
          { $match: { _id: liveUser1?._id } },
          { $addFields: { duration } },
          { $project: { userId: 1, name: 1, token: 1, channel: 1, coin: 1, duration: 1, isPkMode: 1, pkConfig: 1, liveHistoryId: 1, view: 1 } },
        ]),
      ]);

      io.in(parseData.HOST_1_LIVEUSER_OBJ_ID).emit("pkAnswer", { data, response: responseForUser2[0] });
      io.in(parseData.HOST_2_LIVEUSER_OBJ_ID).emit("pkAnswer", { data, response: responseForUser1[0] });

      await Promise.all([
        liveUser1?.liveHistoryId
          ? LiveStreamerHistory.updateOne(
              { _id: liveUser1.liveHistoryId },
              {
                $set: {
                  isPkMode: true,
                  pkId: pkId,
                  pkEndTime: endTime,
                },
              },
            )
          : Promise.resolve(),
        liveUser2?.liveHistoryId
          ? LiveStreamerHistory.updateOne(
              { _id: liveUser2.liveHistoryId },
              {
                $set: {
                  isPkMode: true,
                  pkId: pkId,
                  pkEndTime: endTime,
                },
              },
            )
          : Promise.resolve(),
      ]);

      if (user1 && user2) {
        const isBlocked = await Block.exists({
          $or: [
            { userId: parseData.HOST_1_ID, toUserId: parseData.HOST_2_ID },
            { userId: parseData.HOST_2_ID, toUserId: parseData.HOST_1_ID },
          ],
        });

        if (!isBlocked && user1.isPushNotificationEnabled && !user1.isBlock && user1.fcmToken !== null) {
          const host2Name = parseData.HOST_2_NAME?.trim() || user2?.name?.trim() || user2?.userName?.trim() || "The host";
          const payload = {
            token: user1.fcmToken,
            notification: {
              title: "⚔️ PK Accepted!",
              body: `🏆 ${host2Name} accepted your PK challenge! The battle starts now 🔥🎬`,
            },
            data: {
              type: "PK_ACCEPTED",
              host1Id: String(parseData.HOST_1_ID),
              host2Id: String(parseData.HOST_2_ID),
              pkId: String(pkId),
              host1LiveUserObjId: String(parseData.HOST_1_LIVEUSER_OBJ_ID || ""),
              host2LiveUserObjId: String(parseData.HOST_2_LIVEUSER_OBJ_ID || ""),
              host2Name: String(host2Name),
              host2Image: String(parseData.HOST_2_IMAGE || user2?.image || ""),
            },
          };

          const adminPromise = await admin;
          adminPromise
            .messaging()
            .send(payload)
            .then((response) => {
              console.log("[pkAnswer] PK accepted notification sent:", response);
            })
            .catch((error) => {
              console.error("[pkAnswer] Error sending PK accepted notification:", error);
            });
        }
      }
    } else {
      console.log("PK Rejected for", parseData.HOST_1_ID);

      io.in(parseData.HOST_1_LIVEUSER_OBJ_ID).emit("pkAnswer", { data, response: {} });
      io.in(parseData.HOST_2_LIVEUSER_OBJ_ID).emit("pkAnswer", { data, response: {} });

      if (user1 && user2) {
        const isBlocked = await Block.exists({
          $or: [
            { userId: parseData.HOST_1_ID, toUserId: parseData.HOST_2_ID },
            { userId: parseData.HOST_2_ID, toUserId: parseData.HOST_1_ID },
          ],
        });

        const answererId = id?.toString();
        const host1IdStr = String(parseData.HOST_1_ID);
        const host2IdStr = String(parseData.HOST_2_ID);
        const isHost1Answerer = answererId === host1IdStr;
        const notifyUser = isHost1Answerer ? user2 : user1;
        const declinerUser = isHost1Answerer ? user1 : user2;
        const declinerName = (isHost1Answerer ? parseData.HOST_1_NAME : parseData.HOST_2_NAME)?.trim() || declinerUser?.name?.trim() || declinerUser?.userName?.trim() || "The host";
        const declinerImage = (isHost1Answerer ? parseData.HOST_1_IMAGE : parseData.HOST_2_IMAGE) || declinerUser?.image || "";

        if (!isBlocked && notifyUser.isPushNotificationEnabled && !notifyUser.isBlock && notifyUser.fcmToken !== null) {
          const payload = {
            token: notifyUser.fcmToken,
            notification: {
              title: "😔⚔️ PK Declined",
              body: `🎥 ${declinerName} declined your PK challenge. Try another host! 🔄💪`,
            },
            data: {
              type: "PK_REJECTED",
              host1Id: host1IdStr,
              host2Id: host2IdStr,
              host1LiveUserObjId: String(parseData.HOST_1_LIVEUSER_OBJ_ID || ""),
              host2LiveUserObjId: String(parseData.HOST_2_LIVEUSER_OBJ_ID || ""),
              host2Name: String(declinerName),
              host2Image: String(declinerImage),
            },
          };

          const adminPromise = await admin;
          adminPromise
            .messaging()
            .send(payload)
            .then((response) => {
              console.log("[pkAnswer] PK rejected notification sent:", response);
            })
            .catch((error) => {
              console.error("[pkAnswer] Error sending PK rejected notification:", error);
            });
        }
      }
    }
  });

  socket.on("pkGift", async (data) => {
    const giftData = JSON.parse(data);
    console.log("Received pkGift event with data:", giftData);

    const [uniqueId, giftCategory, gift, senderUser, receiverUser, receiverPkLiveUser] = await Promise.all([
      generateHistoryUniqueId(),
      GiftCategory.findById(giftData.giftCategoryId).lean().select("_id name"),
      Gift.findById(giftData.giftId).select("coin title image").lean(),
      User.findById(giftData.senderUserId).select("coin").lean(),
      User.findById(giftData.receiverUserId).select("_id coin role agencyId isBlock isHostBlocked").lean(),
      LiveStreamer.findOne({ userId: giftData.receiverUserId, isPkMode: true }).select("liveHistoryId pkConfig pkEndTime").lean(),
    ]);

    if (!giftCategory) {
      console.log("GiftCategory not found");
      io.to(`globalRoom:${giftData.senderUserId}`).emit("pkGift", "GiftCategory not found!");
      return;
    }

    if (!gift) {
      console.log("Gift not found");
      io.to(`globalRoom:${giftData.senderUserId}`).emit("pkGift", "Gift not found!");
      return;
    }

    if (!senderUser) {
      console.log("Sender user not found");
      io.to(`globalRoom:${giftData.senderUserId}`).emit("pkGift", "Sender user not found!");
      return;
    }

    if (!receiverUser) {
      console.log("Receiver user not found");
      io.to(`globalRoom:${giftData.receiverUserId}`).emit("pkGift", "Receiver user not found!");
      return;
    }

    const giftCount = giftData.giftCount;
    const coinPerGift = Math.abs(gift.coin);
    const totalCoin = coinPerGift * giftCount;

    if (senderUser.coin < totalCoin) {
      console.log("Sender user does not have sufficient coins.");
      io.to(`globalRoom:${giftData.senderUserId}`).emit("pkGift", "You don't have sufficient coins!");
      return;
    }

    if (receiverPkLiveUser) {
      console.log("PK Live user found, updating ranks...");

      if (totalCoin > settingJSON.coinBroadcastThreshold) {
        io.emit("proHighValueGift", data); //emit to all connected sockets regardless of room
      }

      const adminRate = Math.abs(settingJSON.adminRate ?? 10);
      let adminCoin = Math.round((totalCoin * adminRate) / 100);
      let receiverCoin = totalCoin - adminCoin;

      const [liveUser1, liveUser2, existing] = await Promise.all([
        LiveStreamer.findOne({ userId: receiverPkLiveUser.pkConfig.host1Id, isPkMode: true }).select("pkConfig pkEndTime").lean(), //same as receiverPkLiveUser
        LiveStreamer.findOne({ userId: receiverPkLiveUser.pkConfig.host2Id, isPkMode: true }).select("pkConfig").lean(),
        TopGifter.findOneAndUpdate(
          {
            liveHistoryId: receiverPkLiveUser.liveHistoryId,
            "gifters.userId": senderUser._id,
          },
          {
            $inc: {
              "gifters.$.totalCoins": Math.abs(totalCoin),
            },
          },
          { new: true },
        ),
      ]);

      const updatePromises = [];

      if (liveUser1) {
        updatePromises.push(
          LiveStreamer.updateOne(
            { _id: liveUser1._id },
            {
              $inc: {
                "pkConfig.localRank": totalCoin,
                "pkConfig.localGiftCount": giftCount,
                "pkConfig.host1Details.coin": totalCoin,
              },
            },
          ),
        );
      }

      if (liveUser2) {
        updatePromises.push(
          LiveStreamer.updateOne(
            { _id: liveUser2._id },
            {
              $inc: {
                "pkConfig.remoteRank": totalCoin,
                "pkConfig.remoteGiftCount": giftCount,
                "pkConfig.host2Details.coin": totalCoin,
              },
            },
          ),
        );
      }

      await Promise.all(updatePromises);

      var duration = Math.round((new Date(liveUser1?.pkEndTime).getTime() - new Date().getTime()) / 1000);
      if (duration < 0) duration = 0;

      const [responseForUser1, responseForUser2] = await Promise.all([
        LiveStreamer.aggregate([
          { $match: { _id: liveUser2?._id } },
          { $addFields: { duration } },
          {
            $project: {
              _id: 1,
              userId: 1,
              duration: 1,
              pkConfig: 1,
            },
          },
        ]),
        LiveStreamer.aggregate([
          { $match: { _id: liveUser1?._id } },
          { $addFields: { duration } },
          {
            $project: {
              _id: 1,
              userId: 1,
              duration: 1,
              pkConfig: 1,
            },
          },
        ]),
      ]);

      const liveUser1Listen = {
        giftData: giftData,
        response: responseForUser2[0],
      };

      if (liveUser1) {
        io.in(liveUser1._id.toString()).emit("pkGift", liveUser1Listen);
      }

      const liveUser2Listen = {
        giftData: giftData,
        response: responseForUser1[0],
      };

      if (liveUser2) {
        io.in(liveUser2._id.toString()).emit("pkGift", liveUser2Listen);
      }

      const roomHost1 = io.sockets.adapter.rooms.get(liveUser1._id.toString());
      console.log("[pkGift] ROOM liveUser1: ", liveUser1._id.toString(), "Users:", roomHost1);

      const roomHost2 = io.sockets.adapter.rooms.get(liveUser2._id.toString());
      console.log("[pkGift] ROOM liveUser2: ", liveUser2._id.toString(), "Users:", roomHost2);

      if (!existing) {
        await TopGifter.findOneAndUpdate(
          { liveHistoryId: receiverPkLiveUser.liveHistoryId },
          {
            $push: {
              gifters: {
                userId: senderUser._id,
                totalCoins: Math.abs(totalCoin),
              },
            },
          },
          { upsert: true, new: true },
        );
      }

      const topGifterData = await TopGifter.findOne({ liveHistoryId: receiverPkLiveUser.liveHistoryId }).select("gifters").populate("gifters.userId", "name image isProfilePicBanned").limit(5).lean();

      const liveHistoryId = receiverPkLiveUser?.liveHistoryId?.toString();
      const topGifters = topGifterData?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];

      const eventData = {
        liveHistoryId: liveHistoryId,
        topGifters: topGifters,
      };

      if (liveUser1) {
        io.in(liveUser1._id.toString()).emit("topGiftersUpdate", eventData);
      }

      if (liveUser2) {
        io.in(liveUser2._id.toString()).emit("topGiftersUpdate", eventData);
      }

      let isSenderRewardEnabled = false;
      let adminCoinForLucky = 0;
      let receiverCoinForLucky = 0;
      let luckyUserWinCoin = 0;
      let totalLuckyCoin = 0;
      let luckyHistoryId, mainSetting;
      let luckyGiftEventId = null;

      if (giftCategory && giftCategory.name.toLowerCase() === "lucky") {
        console.log(`[Lucky Gift Triggered] Sender: ${senderUser._id}, Receiver: ${receiverUser._id}`);
        console.log(`[Gift Info] ${gift.coin} × ${giftCount} | Total: ${totalCoin} coins`);

        const adminTaxPercent = Number(settingJSON.luckyGiftAdminTaxPercent);
        const receiverSharePercent = Number(settingJSON.luckyGiftReceiverSharePercent);
        luckyGiftEventId = new mongoose.Types.ObjectId();

        adminCoinForLucky = Math.round(totalCoin * ((isNaN(adminTaxPercent) ? 10 : adminTaxPercent) / 100));
        receiverCoinForLucky = Math.round(totalCoin * ((isNaN(receiverSharePercent) ? 10 : receiverSharePercent) / 100));
        totalLuckyCoin = totalCoin - (adminCoinForLucky + receiverCoinForLucky);

        console.log(`• Admin Tax (%${adminTaxPercent}): ${adminCoinForLucky}`);
        console.log(`• Receiver Share (%${receiverSharePercent}): ${receiverCoinForLucky}`);
        console.log(`• Lucky Pool Reserve: ${totalLuckyCoin}`);

        await Setting.updateOne({ _id: settingJSON._id }, { $inc: { luckyGiftTargetCoin: totalLuckyCoin } });

        const { multiplier, luckyValue } = getLuckyGiftValue(totalCoin);
        console.log(`Lucky Gift: multiplier=${multiplier}, luckyValue=${luckyValue}`);

        [luckyHistoryId, mainSetting] = await Promise.all([generateHistoryUniqueId(), Setting.findOne().select("luckyGiftTargetCoin").lean()]);

        console.log(`[Lucky Pool Status] Available: ${mainSetting.luckyGiftTargetCoin}`);

        receiverCoin = receiverCoinForLucky;
        adminCoin = adminCoinForLucky;

        if (luckyValue > 0 && luckyValue <= mainSetting.luckyGiftTargetCoin) {
          console.log(`[Lucky Reward Granted] Coin Returned to Sender: ${luckyValue}`);

          isSenderRewardEnabled = true;
          luckyUserWinCoin = luckyValue;

          console.log(`User Lucky gift bonus applied: ${luckyUserWinCoin} coins`);

          if (isSenderRewardEnabled) {
            io.to("globalRoom:" + giftData.senderUserId.toString()).emit("luckyGiftWin", luckyUserWinCoin);

            await Promise.all([
              Setting.updateOne({ _id: settingJSON._id }, { $set: { luckyGiftTargetCoin: 0 } }),
              User.updateOne(
                { _id: senderUser._id },
                {
                  $inc: { coin: luckyUserWinCoin },
                },
              ),
              luckyUserWinCoin > 0
                ? History.create({
                    uniqueId: luckyHistoryId,
                    type: 15,
                    liveHistoryId: liveHistoryId,
                    liveType: 3,
                    otherUserId: senderUser._id,
                    giftId: giftData.giftId,
                    giftReceivedCount: giftCount,
                    giftCoin: gift.coin,
                    giftTitle: gift.title,
                    giftImage: gift.image,
                    luckyGiftMultiplier: multiplier,
                    coin: luckyUserWinCoin,
                    luckyGiftEventId,
                    date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
                  })
                : Promise.resolve(),
            ]);
          }

          isSenderRewardEnabled = false;
        } else {
          console.log("Lucky gift bonus criteria not met.");

          isSenderRewardEnabled = false;
        }
      }

      const isHost = Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId && !receiverUser.isBlock && !receiverUser.isHostBlocked;

      // Base update fields for every receiver
      const updateFields = {
        $inc: {
          receivedCoins: receiverCoin,
          receivedGifts: giftCount,
          coin: receiverCoin,
        },
      };

      // For non-hosts → increment coin
      // if (!isHost) {
      //   console.log("For non-hosts → increment coin");

      //   updateFields.$inc.coin = receiverCoin;
      // }

      // For hosts → increment host-related fields only
      if (isHost) {
        console.log("For hosts → increment host-related fields only");

        updateFields.$inc.earnedHostCoins = receiverCoin;
      }

      const [updatedLiveRoom] = await Promise.all([
        LiveStreamer.findOneAndUpdate({ liveHistoryId: receiverPkLiveUser.liveHistoryId }, { $inc: { earnedCoins: receiverCoin } }, { new: true })
          .select("_id earnedCoins")
          .lean(),
        User.findOneAndUpdate(
          { _id: senderUser._id, coin: { $gte: totalCoin } },
          {
            $inc: {
              coin: -totalCoin,
              spentCoins: totalCoin,
            },
          },
          { new: true },
        ),
        User.updateOne({ _id: receiverUser._id }, updateFields),
        History.create({
          uniqueId: uniqueId,
          type: 6,
          liveHistoryId: receiverPkLiveUser?.liveHistoryId,
          liveType: 3,
          userId: senderUser._id,
          otherUserId: receiverUser._id,
          giftCategoryId: giftCategory._id,
          giftId: giftData.giftId,
          giftReceivedCount: giftCount,
          giftCoin: gift.coin,
          giftTitle: gift.title,
          giftImage: gift.image,
          senderCoin: totalCoin,
          receiverCoin: receiverCoin,
          adminCoin: adminCoin,
          luckyGiftReserve: totalLuckyCoin,
          hostAgencyId: isHost ? receiverUser.agencyId : null,
          luckyGiftEventId,
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
        LiveStreamerHistory.updateOne(
          { _id: receiverPkLiveUser.liveHistoryId },
          {
            $inc: {
              receivedGifts: giftCount,
              earnedCoins: receiverCoin,
            },
          },
        ),
      ]);

      const earnedCoins = updatedLiveRoom?.earnedCoins;
      if (earnedCoins !== undefined) {
        io.in(receiverPkLiveUser._id.toString()).emit("liveRoomCoinUpdate", earnedCoins);
        console.log(`[liveRoomCoinUpdate] emitted for room: ${receiverPkLiveUser._id} with earnedCoins: ${earnedCoins}`);
      }

      if (Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId) {
        const [uniqueCommissionId, agency] = await Promise.all([generateHistoryUniqueId(), Agency.findOne({ _id: receiverUser.agencyId, isActive: true }).select("_id commissionRate ").lean()]);
        //console.log("[pkGift] Agency fetched:", agency);

        if (agency) {
          const commissionRate = agency.commissionRate || 0;
          const commission = Math.round((totalCoin * commissionRate) / 100);
          const dateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

          console.log(`[pkGift] Commission calculation:
            - Gift Coin: ${gift.coin}
            - Gift Count: ${giftCount}
            - Base Coins (Gift Coin × Count): ${totalCoin}
            - Agency Commission Rate: ${commissionRate}%
            - Commission Earned: ${commission} coins
          `);

          const updatePromises = [];
          const agencyEarningUpdate = buildAgencyEarningUpdate(commission, receiverCoin);

          if (commission > 0) {
            updatePromises.push(
              History.create({
                uniqueId: uniqueCommissionId,
                type: 9,
                coin: commission,
                agencyId: agency._id,
                userId: senderUser._id,
                otherUserId: receiverUser._id,
                baseType: 6,
                baseCoins: totalCoin,
                commissionRate: commissionRate,
                date: dateStr,
              }),
            );
            agencyEarningUpdate && updatePromises.push(Agency.updateOne({ _id: agency._id }, agencyEarningUpdate));
          }

          await Promise.all(updatePromises);

          console.log("[pkGift] Host and agency updates completed successfully.");
        } else {
          console.log("[pkGift] No active agency found for receiver.");
        }
      }
    } else {
      console.log("PK mode is not active for receiver.");

      io.in("globalRoom:" + giftData.senderUserId).emit("pkGift", "Something Went Wrong!");
      return;
    }
  });

  socket.on("pkEnd", async (data) => {
    const parsedData = JSON.parse(data);
    console.log("[pkEnd] Event Triggered - Parsed Data:", parsedData);

    try {
      const [user, liveUser, liveHistory] = await Promise.all([
        User.findOne({ liveHistoryId: parsedData?.liveHistoryId }).select("_id isLive isBusy liveHistoryId").lean(),
        LiveStreamer.findOne({
          isPkMode: true,
          isAudio: false,
          userId: parsedData?.userId,
          liveHistoryId: parsedData?.liveHistoryId,
        })
          .select("_id isPkMode pkConfig pkEndTime pkId")
          .lean(),
        LiveStreamerHistory.findById(parsedData?.liveHistoryId).select("_id startTime endTime duration"),
      ]);

      if (!user) {
        console.error("[pkEnd] User not found.");
        return;
      }

      if (!liveUser) {
        console.log(`[pkEnd] No LiveUser found for userId: ${parsedData?.userId}, liveHistoryId: ${parsedData?.liveHistoryId}`);
        return;
      }

      if (liveUser) {
        console.log("[pkEnd] PK Mode Active - Ending PK...");

        const roomHost1 = io.sockets.adapter.rooms.get(liveUser.pkConfig.host1ObjId);
        console.log("[pkEnd] ROOM host1ObjId:", liveUser.pkConfig.host1ObjId, "Users:", roomHost1);

        const roomHost2 = io.sockets.adapter.rooms.get(liveUser.pkConfig.host2ObjId);
        console.log("[pkEnd] ROOM host2ObjId:", liveUser.pkConfig.host2ObjId, "Users:", roomHost2);

        let winnerHost1 = 0;
        let winnerHost2 = 0;

        if (liveUser.pkConfig.localRank > liveUser.pkConfig.remoteRank) {
          winnerHost1 = 2;
          winnerHost2 = 1;
        } else if (liveUser.pkConfig.localRank < liveUser.pkConfig.remoteRank) {
          winnerHost1 = 1;
          winnerHost2 = 2;
        }

        await Promise.all([
          LiveStreamer.findOneAndUpdate({ _id: liveUser._id, isAudio: false }, { "pkConfig.isWinner": winnerHost1 }, { new: true, lean: true }),
          LiveStreamer.findOneAndUpdate({ userId: liveUser.pkConfig.host2Id, isAudio: false }, { "pkConfig.isWinner": winnerHost2 }, { new: true, lean: true }),
        ]);

        const [responseForUser1, responseForUser2] = await Promise.all([
          LiveStreamer.aggregate([
            {
              $match: {
                userId: new mongoose.Types.ObjectId(liveUser.pkConfig.host2Id),
                isAudio: false,
              },
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                name: 1,
                userName: 1,
                image: 1,
                token: 1,
                channel: 1,
                duration: 1,
                isPkMode: 1,
                pkConfig: 1,
                liveHistoryId: 1,
                view: 1,
              },
            },
          ]),
          LiveStreamer.aggregate([
            {
              $match: {
                userId: new mongoose.Types.ObjectId(liveUser.pkConfig.host1Id), //same as liveUser._id
                isAudio: false,
              },
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                name: 1,
                userName: 1,
                image: 1,
                token: 1,
                channel: 1,
                duration: 1,
                isPkMode: 1,
                pkConfig: 1,
                liveHistoryId: 1,
                view: 1,
              },
            },
          ]),
        ]);

        io.in(liveUser.pkConfig.host1ObjId).emit("pkEnd", {
          isManualMode: parsedData?.isManualMode,
          pkEndUserId: parsedData?.pkEndUserId,
          data: responseForUser2[0],
          winner: responseForUser2[0]?.pkConfig.isWinner == 2 ? responseForUser2[0]?.pkConfig.host1Details : responseForUser2[0]?.pkConfig.host2Details,
        });

        io.in(liveUser.pkConfig.host2ObjId).emit("pkEnd", {
          isManualMode: parsedData?.isManualMode,
          pkEndUserId: parsedData?.pkEndUserId,
          data: responseForUser1[0],
          winner: responseForUser1[0]?.pkConfig.isWinner == 2 ? responseForUser1[0]?.pkConfig.host1Details : responseForUser1[0]?.pkConfig.host2Details,
        });

        if (parsedData.isManualMode) {
          console.log("[pkEnd] Manual Mode Enabled - Updating History");

          if (user.isLive && user.liveHistoryId && user.liveHistoryId !== null && liveHistory) {
            console.log("[pkEnd] Cleaning Up Live Data");

            liveHistory.endTime = moment().tz("Asia/Kolkata").format();

            const start = moment.tz(liveHistory.startTime, "Asia/Kolkata");
            const end = moment.tz(liveHistory.endTime, "Asia/Kolkata");
            const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
            const durationInMinutes = Math.floor(moment.duration(end.diff(start)).asMinutes());

            liveHistory.duration = duration;

            await Promise.all([
              liveHistory?.save(),
              User.updateOne(
                { _id: user._id },
                {
                  $set: {
                    isLive: false,
                    isBusy: false,
                    liveHistoryId: null,
                    liveStreamerId: null,
                  },
                },
              ),
              LiveStreamer.deleteOne({ isPkMode: true, userId: user._id, liveHistoryId: liveHistory._id }),
              LiveStreamerView.deleteMany({ liveStreamerId: liveUser._id }),
            ]);
          }

          const sockets = await io.in(parsedData?.liveHistoryId).fetchSockets();
          console.log(`[pkEnd] Connected Sockets in Room ${parsedData?.liveHistoryId}: ${sockets.length}`);

          if (sockets.length) io.socketsLeave(parsedData?.liveHistoryId);
        }

        await Promise.all([
          LiveStreamer.updateMany(
            { pkId: liveUser.pkId },
            {
              $set: {
                isPkMode: false,
                pkId: null,
                pkEndTime: null,
                "pkConfig.host1Id": null,
                "pkConfig.host1Name": "",
                "pkConfig.host1Image": "",
                "pkConfig.host1UniqueId": "",
                "pkConfig.host1LiveId": "",
                "pkConfig.host1Channel": "",
                "pkConfig.host1AgoraUID": 0,

                "pkConfig.host2Id": null,
                "pkConfig.host2Name": "",
                "pkConfig.host2userName": "",
                "pkConfig.host2Image": "",
                "pkConfig.host2UniqueId": "",
                "pkConfig.host2LiveId": "",
                "pkConfig.host2Channel": "",
                "pkConfig.host2AgoraUID": 0,

                "pkConfig.localRank": 0,
                "pkConfig.localGiftCount": 0,
                "pkConfig.remoteRank": 0,
                "pkConfig.remoteGiftCount": 0,
                "pkConfig.isWinner": 0,

                "pkConfig.host1Details.userId": null,
                "pkConfig.host1Details.name": "",
                "pkConfig.host1Details.userName": "",
                "pkConfig.host1Details.image": "",
                "pkConfig.host1Details.isProfilePicBanned": false,
                "pkConfig.host1Details.isVerified": false,
                "pkConfig.host1Details.gender": "",
                "pkConfig.host1Details.age": 0,
                "pkConfig.host1Details.countryFlagImage": "",
                "pkConfig.host1Details.country": "",
                "pkConfig.host1Details.uniqueId": "",
                "pkConfig.host1Details.coin": 0,

                "pkConfig.host2Details.userId": null,
                "pkConfig.host2Details.name": "",
                "pkConfig.host2Details.userName": "",
                "pkConfig.host2Details.image": "",
                "pkConfig.host1Details.isProfilePicBanned": false,
                "pkConfig.host1Details.isVerified": false,
                "pkConfig.host2Details.gender": "",
                "pkConfig.host2Details.age": 0,
                "pkConfig.host2Details.countryFlagImage": "",
                "pkConfig.host2Details.country": "",
                "pkConfig.host2Details.uniqueId": "",
                "pkConfig.host2Details.coin": 0,
              },
            },
            { new: true },
          ),
          TopGifter.deleteMany({ liveHistoryId: liveUser.pkConfig.host1LiveId }),
          TopGifter.deleteMany({ liveHistoryId: liveUser.pkConfig.host2LiveId }),
        ]);
      }
    } catch (error) {
      console.error("Error in pkEnd:", error);
    }
  });

  //audio-room
  socket.on("hostJoinAudioRoom", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("🎧 Received hostJoinAudioRoom event with data:", parsedData);

      const { userId, liveHistoryId, liveUserObjId } = parsedData;

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[hostJoinAudioRoom] ✅ Host joined room: ${liveUserObjId}`);
      } else {
        console.log(`[hostJoinAudioRoom] ⚠️ Host already in room: ${liveUserObjId}`);
      }

      const [liveUserObj, historyUpdate, filteredViewers] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId),
            userId: new mongoose.Types.ObjectId(userId),
            liveType: 2,
            isAudio: true,
          },
          {
            isHostActiveInRoom: true,
          },
          { new: true },
        ),
        LiveStreamerHistory.findByIdAndUpdate(liveHistoryId, { startTime: moment().tz("Asia/Kolkata").format() }, { new: true }),
        LiveStreamerView.find({ liveHistoryId }),
      ]);

      if (!liveUserObj) {
        console.warn("⚠️ Host not found in LiveStreamer DB.");
      }

      if (!historyUpdate) {
        console.warn("⚠️ No LiveStreamerHistory entry found for ID:", liveHistoryId);
      }

      console.log(`👥 Total viewers to notify: ${filteredViewers.length}`);

      if (filteredViewers.length > 0) {
        for (const viewer of filteredViewers) {
          if (viewer.isPushNotificationEnabled && !viewer.isBlock && viewer.fcmToken !== null) {
            const payload = {
              token: viewer.fcmToken,
              notification: {
                title: "🎙️ Host Joined the Room",
                body: "The host has just joined the audio room! Tune in now 🎶",
              },
              data: {
                type: "AUDIO_HOST_JOINED",
              },
            };

            try {
              const adminInstance = await admin;
              const response = adminInstance.messaging().send(payload);
              console.log(`✅ Notification sent to ${viewer.fcmToken}:`, response);
            } catch (err) {
              console.error(`❌ Error sending to ${viewer.fcmToken}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ Error in hostJoinAudioRoom handler:", err);
    }
  });

  socket.on("hostLeaveAudioRoom", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("📤 Received hostLeaveAudioRoom event with data:", parsedData);

      const { userId, liveHistoryId, liveUserObjId } = parsedData;

      if (socket.rooms.has(liveUserObjId)) {
        socket.leave(liveUserObjId);
        console.log(`[hostLeaveAudioRoom] 👋 Host left room: ${liveUserObjId}`);
      } else {
        console.warn(`[hostLeaveAudioRoom] ⚠️ Socket was not in room: ${liveUserObjId}`);
      }

      const [user, liveHistory] = await Promise.all([User.findOne({ liveHistoryId }).select("_id isLive isBusy liveHistoryId name role agencyId").lean(), LiveStreamerHistory.findById(liveHistoryId)]);

      if (!liveHistory || !liveHistory.startTime) {
        console.warn("⚠️ Missing liveHistory or startTime for ID:", liveHistoryId);
        return;
      }

      if (!user) {
        console.log("⚠️ User not found. Operation aborted.");
        return;
      }

      const endTime = moment().tz("Asia/Kolkata").format();

      const start = moment.tz(liveHistory.startTime, "Asia/Kolkata");
      const end = moment.tz(endTime, "Asia/Kolkata");
      const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
      const durationInMinutes = Math.floor(moment.duration(end.diff(start)).asMinutes());

      const [updatedUser, liveUserUpdate, historyUpdate] = await Promise.all([
        User.updateOne(
          { _id: user._id },
          {
            $set: {
              isLive: false,
              isBusy: false,
              liveHistoryId: null,
              liveStreamerId: null,
            },
          },
        ),
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId),
            userId: new mongoose.Types.ObjectId(userId),
            liveType: 2,
            isAudio: true,
          },
          {
            liveHistoryId: null,
            isHostActiveInRoom: false,
          },
          { new: true },
        ),
        LiveStreamerHistory.updateOne(
          {
            _id: liveHistory._id,
          },
          { $set: { endTime, duration } },
        ),
        clearLiveChatReferences([liveUserObjId], [liveHistory._id]),
      ]);

      if (!liveUserUpdate) {
        console.log("⚠️ Host not found in LiveStreamer DB. Skipping update.");
      }

      if (!historyUpdate) {
        console.log("❌ Failed to update LiveStreamerHistory.");
        return;
      }

      io.in(liveUserObjId.toString()).emit("seatUpdate", liveUserUpdate);
    } catch (err) {
      console.error("❌ Error in hostLeaveAudioRoom handler:", err);
    }
  });

  socket.on("requestToJoinAudioRoom", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received requestToJoinAudioRoom data:", parsedData);

      const { userId, liveHistoryId, liveUserObjId, position } = parsedData;

      const [liveUser, joinedUserExist] = await Promise.all([
        LiveStreamer.findOne({
          _id: new mongoose.Types.ObjectId(liveUserObjId),
          liveType: 2,
        }),
        LiveStreamer.findOne({
          _id: new mongoose.Types.ObjectId(liveUserObjId),
          liveType: 2,
          "seat.userId": new mongoose.Types.ObjectId(userId),
          "seat.position": { $ne: position },
        }), // Check if the user is already joined on a different position
      ]);

      if (!liveUser) {
        console.error("LiveUser not found for the provided ID.");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[requestToJoinAudioRoom] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[requestToJoinAudioRoom] User is already in room: ${liveUserObjId}`);
      }

      let updatedLiveUser;

      if (joinedUserExist) {
        console.log("User exists in a different position. Resetting previous seat:", joinedUserExist);

        // Reset the previous seat details
        updatedLiveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: joinedUserExist._id,
            liveType: 2,
            "seat.userId": new mongoose.Types.ObjectId(userId),
          },
          {
            $set: {
              "seat.$.userId": null,
              "seat.$.name": "",
              "seat.$.userName": "",
              "seat.$.image": "",
              "seat.$.isProfilePicBanned": false,
              "seat.$.gender": "",
              "seat.$.age": 0,
              "seat.$.country": "",
              "seat.$.countryFlagImage": "",
              "seat.$.avtarFrameType": 0,
              "seat.$.avtarFrame": "",
              "seat.$.uniqueId": "",
              "seat.$.isVerified": false,
              "seat.$.agoraUid": 0,
              "seat.$.mute": 0,
              "seat.$.lock": false,
              "seat.$.reserved": false,
              "seat.$.invite": false,
            },
          },
          { new: true },
        ).lean();
      } else {
        console.log("Assigning user to the requested position.");

        // Update the seat at the requested position
        updatedLiveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: liveUser._id,
            liveType: 2,
            "seat.position": position,
          },
          {
            $set: {
              "seat.$.userId": new mongoose.Types.ObjectId(userId),
              "seat.$.name": "",
              "seat.$.userName": "",
              "seat.$.image": "",
              "seat.$.isProfilePicBanned": false,
              "seat.$.gender": "",
              "seat.$.age": 0,
              "seat.$.country": "",
              "seat.$.countryFlagImage": "",
              "seat.$.avtarFrameType": 0,
              "seat.$.avtarFrame": "",
              "seat.$.uniqueId": "",
              "seat.$.isVerified": false,
              "seat.$.agoraUid": 0,
              "seat.$.mute": 0,
              "seat.$.lock": true,
              "seat.$.reserved": false,
              "seat.$.invite": true,
            },
          },
          { new: true },
        ).lean();
      }

      const inviteToJoinRoomInfo = {
        seatInfo: updatedLiveUser.seat[position],
        data: data,
      };

      const currentRoom = io.sockets.adapter.rooms.get(liveUserObjId.toString());
      console.log("Current room state in requestToJoinAudioRoom:", currentRoom);

      io.in(liveUserObjId).emit("seatUpdate", updatedLiveUser);
      io.in("globalRoom:" + userId.toString()).emit("inviteToJoinRoom", inviteToJoinRoomInfo);

      const hostId = liveUser.userId?.toString();
      if (hostId && hostId !== userId.toString() && updatedLiveUser) {
        const [hostUser, requesterUser, isBlocked] = await Promise.all([
          User.findById(liveUser.userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
          User.findById(userId).select("_id name userName image isProfilePicBanned isVerified").lean(),
          Block.exists({
            $or: [
              { userId: liveUser.userId, toUserId: new mongoose.Types.ObjectId(userId) },
              { userId: new mongoose.Types.ObjectId(userId), toUserId: liveUser.userId },
            ],
          }),
        ]);

        if (hostUser && !isBlocked && hostUser.isPushNotificationEnabled && !hostUser.isBlock && hostUser.fcmToken !== null) {
          const requesterName = requesterUser?.name?.trim() || requesterUser?.userName?.trim() || "Someone";
          const payload = {
            token: hostUser.fcmToken,
            notification: {
              title: requesterName ? `🎙️✨ Join Request from ${requesterName}!` : "🎙️✨ New Audio Room Join Request!",
              body: requesterName ? `👋 ${requesterName} wants to join your audio room! Tap to accept or decline 🎶🔥` : "👋 Someone wants to join your audio room! Tap to review the request 🎶🔥",
            },
            data: {
              type: "AUDIO_JOIN_REQUEST",
              liveUserObjId: String(liveUserObjId),
              liveHistoryId: String(liveHistoryId),
              userId: String(userId),
              position: String(position),
              name: String(requesterUser?.name || ""),
              userName: String(requesterUser?.userName || ""),
              image: String(requesterUser?.image || ""),
              isProfilePicBanned: String(requesterUser?.isProfilePicBanned ?? false),
              isVerified: String(requesterUser?.isVerified ?? false),
            },
          };

          const adminPromise = await admin;
          adminPromise
            .messaging()
            .send(payload)
            .then((response) => {
              console.log("[requestToJoinAudioRoom] Host notification sent:", response);
            })
            .catch((error) => {
              console.error("[requestToJoinAudioRoom] Error sending host notification:", error);
            });
        }
      }
    } catch (error) {
      console.error("Error handling requestToJoinAudioRoom event:", error);
    }
  });

  socket.on("audioRoomInviteRevoked", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received audioRoomInviteRevoked data:", parsedData);

      const { userId, liveHistoryId, liveUserObjId, position } = parsedData;

      if (!userId || !liveHistoryId || !liveUserObjId || position === undefined) {
        return socket.emit("error", { message: "Invalid data for audioRoomInviteRevoked" });
      }

      const [liveUser] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            _id: liveUserObjId,
            "seat.userId": new mongoose.Types.ObjectId(userId),
            "seat.position": position,
          },
          {
            $set: {
              "seat.$.userId": null,
              "seat.$.name": "",
              "seat.$.userName": "",
              "seat.$.image": "",
              "seat.$.isProfilePicBanned": false,
              "seat.$.gender": "",
              "seat.$.age": 0,
              "seat.$.country": "",
              "seat.$.countryFlagImage": "",
              "seat.$.avtarFrameType": 0,
              "seat.$.avtarFrame": "",
              "seat.$.uniqueId": "",
              "seat.$.isVerified": false,
              "seat.$.agoraUid": 0,
              "seat.$.mute": 0,
              "seat.$.lock": false,
              "seat.$.reserved": false,
              "seat.$.invite": false,
            },
          },
          { new: true },
        ),
      ]);

      if (!liveUser) {
        console.error("Failed to update liveUser for audioRoomInviteRevoked");
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[audioRoomInviteRevoked] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[audioRoomInviteRevoked] User is already in room: ${liveUserObjId}`);
      }

      io.in(liveUserObjId).emit("seatUpdate", liveUser);

      const adapterSockets = io.sockets.adapter.rooms.get(liveUserObjId);
      console.log("Current sockets in audioRoomInviteRevoked room:", adapterSockets);

      if (liveUser) {
        const hostId = liveUser.userId;
        if (hostId && hostId.toString() !== userId.toString()) {
          const [receiverUser, hostUser, isBlocked] = await Promise.all([
            User.findById(userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
            Block.exists({
              $or: [
                { userId: hostId, toUserId: new mongoose.Types.ObjectId(userId) },
                { userId: new mongoose.Types.ObjectId(userId), toUserId: hostId },
              ],
            }),
          ]);

          if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: "😔❌ Request Declined",
                body: hostName ? `🎙️ ${hostName} declined your audio room request. Try again later! 🔄💪` : "🎙️ Your audio room request was declined. Try again later! 🔄💪",
              },
              data: {
                type: "AUDIO_INVITE_REVOKED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                userId: String(userId),
                position: String(position),
                hostId: String(hostId),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[audioRoomInviteRevoked] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[audioRoomInviteRevoked] Error sending notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error in audioRoomInviteRevoked event:", error);
      socket.emit("error", { message: "An error occurred while processing audioRoomInviteRevoked" });
    }
  });

  socket.on("participantAdded", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received participantAdded data:", parsedData);

      const {
        userId,
        liveHistoryId,
        liveUserObjId,
        position,
        name,
        userName,
        image,
        isProfilePicBanned,
        gender,
        age,
        countryFlagImage,
        country,
        avtarFrameType,
        avtarFrame,
        uniqueId,
        isVerified,
        coin,
        agoraUid,
        mute,
      } = parsedData;

      const [liveUser, existingSeat] = await Promise.all([
        LiveStreamer.findOne({ _id: liveUserObjId }),
        LiveStreamer.findOne({
          _id: liveUserObjId,
          liveType: 2,
          "seat.userId": new mongoose.Types.ObjectId(userId),
        }).lean(), // Check if the user is already assigned to a seat
      ]);

      if (!liveUser) {
        console.error("LiveUser not found!");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[participantAdded] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[participantAdded] User is already in room: ${liveUserObjId}`);
      }

      let updatedLiveUser;

      if (!existingSeat) {
        // If the user is not assigned to any seat, assign them to the requested position
        console.log("User is not assigned to any seat. Assigning to new position...");

        updatedLiveUser = await LiveStreamer.findOneAndUpdate(
          { _id: liveUserObjId, "seat.position": position },
          {
            $set: {
              "seat.$.userId": userId,
              "seat.$.name": name,
              "seat.$.userName": userName,
              "seat.$.image": image,
              "seat.$.isProfilePicBanned": isProfilePicBanned,
              "seat.$.gender": gender,
              "seat.$.age": age,
              "seat.$.country": country,
              "seat.$.countryFlagImage": countryFlagImage,
              "seat.$.avtarFrameType": avtarFrameType,
              "seat.$.avtarFrame": avtarFrame,
              "seat.$.uniqueId": uniqueId,
              "seat.$.isVerified": isVerified,
              "seat.$.coin": coin,
              "seat.$.agoraUid": agoraUid,
              "seat.$.mute": mute || 0,
              "seat.$.lock": false,
              "seat.$.reserved": true,
              "seat.$.invite": false,
            },
          },
          { new: true },
        );

        console.log("User assigned to the seat successfully!");
      } else {
        // If the user is already assigned to a seat, clear their existing seat first
        console.log("User is already assigned to a seat. Resetting their current seat...");

        updatedLiveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: liveUserObjId,
            "seat.userId": new mongoose.Types.ObjectId(userId),
          },
          {
            $set: {
              "seat.$.userId": null,
              "seat.$.name": "",
              "seat.$.userName": "",
              "seat.$.image": "",
              "seat.$.isProfilePicBanned": false,
              "seat.$.gender": "",
              "seat.$.age": 0,
              "seat.$.country": "",
              "seat.$.countryFlagImage": "",
              "seat.$.avtarFrameType": 0,
              "seat.$.avtarFrame": "",
              "seat.$.uniqueId": "",
              "seat.$.isVerified": false,
              "seat.$.coin": 0,
              "seat.$.agoraUid": 0,
              "seat.$.mute": 0,
              "seat.$.lock": false,
              "seat.$.reserved": false,
              "seat.$.invite": false,
            },
          },
          { new: true },
        );

        // Assign the user to the requested seat
        console.log("Assigning user to the new seat...");

        updatedLiveUser = await LiveStreamer.findOneAndUpdate(
          { _id: liveUserObjId, "seat.position": position },
          {
            $set: {
              "seat.$.userId": userId,
              "seat.$.name": name,
              "seat.$.userName": userName,
              "seat.$.image": image,
              "seat.$.isProfilePicBanned": isProfilePicBanned,
              "seat.$.gender": gender,
              "seat.$.age": age,
              "seat.$.countryFlagImage": countryFlagImage,
              "seat.$.country": country,
              "seat.$.avtarFrameType": avtarFrameType,
              "seat.$.avtarFrame": avtarFrame,
              "seat.$.uniqueId": uniqueId,
              "seat.$.isVerified": isVerified,
              "seat.$.coin": coin,
              "seat.$.agoraUid": agoraUid,
              "seat.$.mute": mute || 0,
              "seat.$.lock": false,
              "seat.$.reserved": true,
              "seat.$.invite": false,
            },
          },
          { new: true },
        );

        console.log("User successfully assigned to the new seat!");
      }

      io.in(liveUserObjId).emit("seatUpdate", updatedLiveUser);

      const [seatedUsers] = await Promise.all([
        LiveStreamer.aggregate([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(liveUserObjId),
            },
          },
          { $unwind: "$seat" },
          { $match: { "seat.userId": { $ne: null } } },
          {
            $project: {
              _id: 1,
              "seat.userId": 1,
              "seat.name": 1,
              "seat.userName": 1,
              "seat.image": 1,
              "seat.isProfilePicBanned": 1,
              "seat.isVerified": 1,
            },
          },
        ]),
      ]);

      io.in(liveUserObjId).emit("seatedUsersUpdate", seatedUsers);

      console.log("seatUpdate and seatedUsersUpdate emitted successfully.");

      if (updatedLiveUser) {
        const hostId = liveUser.userId;
        if (hostId && hostId.toString() !== userId.toString()) {
          const [receiverUser, hostUser, isBlocked] = await Promise.all([
            User.findById(userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
            Block.exists({
              $or: [
                { userId: hostId, toUserId: new mongoose.Types.ObjectId(userId) },
                { userId: new mongoose.Types.ObjectId(userId), toUserId: hostId },
              ],
            }),
          ]);

          if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: `🎙️✨ ${hostName} accepted you!`,
                body: `🎙️ ${hostName} accepted you into the audio room! Tap to join the conversation 🎶🔥`,
              },
              data: {
                type: "AUDIO_PARTICIPANT_ADDED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                userId: String(userId),
                position: String(position),
                hostId: String(hostId),
                name: String(name || ""),
                userName: String(userName || ""),
                image: String(image || ""),
                isProfilePicBanned: String(isProfilePicBanned ?? false),
                isVerified: String(isVerified ?? false),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[participantAdded] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[participantAdded] Error sending notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error updating participantAdded:", error);
    }
  });

  socket.on("participantRemoved", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received data in participantRemoved: ", parsedData);

      if (!socket.rooms.has(parsedData.liveUserObjId)) {
        socket.join(parsedData.liveUserObjId.toString());
        console.log(`[participantRemoved] joined room: ${parsedData.liveUserObjId}`);
      } else {
        console.log(`[participantRemoved] User is already in room: ${parsedData.liveUserObjId}`);
      }

      let liveUser;
      if (parsedData.position !== -1) {
        liveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            "seat.userId": new mongoose.Types.ObjectId(parsedData.userId),
            "seat.position": parsedData.position,
          },
          {
            $set: {
              "seat.$.userId": null,
              "seat.$.name": "",
              "seat.$.userName": "",
              "seat.$.image": "",
              "seat.$.isProfilePicBanned": false,
              "seat.$.gender": "",
              "seat.$.age": 0,
              "seat.$.country": "",
              "seat.$.countryFlagImage": "",
              "seat.$.avtarFrameType": 0,
              "seat.$.avtarFrame": "",
              "seat.$.uniqueId": "",
              "seat.$.agoraUid": 0,
              "seat.$.isVerified": false,
              "seat.$.mute": parsedData?.mute || 0,
              "seat.$.lock": false,
              "seat.$.reserved": false,
              "seat.$.invite": false,
            },
          },
          { new: true },
        );

        if (liveUser) {
          console.log("LiveUser updated successfully");
        } else {
          console.log("LiveUser update failed or no matching document found");
        }
      }

      io.in(parsedData.liveUserObjId).emit("seatUpdate", liveUser);
      io.in(parsedData.liveUserObjId).emit("participantRemoved", liveUser);

      const [seatedUsers] = await Promise.all([
        LiveStreamer.aggregate([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            },
          },
          { $unwind: "$seat" },
          { $match: { "seat.userId": { $ne: null } } },
          {
            $project: {
              _id: 1,
              "seat.userId": 1,
              "seat.name": 1,
              "seat.userName": 1,
              "seat.image": 1,
              "seat.isProfilePicBanned": 1,
              "seat.isVerified": 1,
            },
          },
        ]),
      ]);

      io.in(parsedData.liveUserObjId).emit("seatedUsersUpdate", seatedUsers);

      const emitSockets = io.sockets.adapter.rooms.get(parsedData.liveUserObjId);
      console.log("Before sockets Notified live room participantRemoved: ", emitSockets);

      const liveStreamerDoc = liveUser || (await LiveStreamer.findById(parsedData.liveUserObjId).select("userId").lean());
      const hostId = liveStreamerDoc?.userId;
      if (hostId && parsedData.userId && hostId.toString() !== parsedData.userId.toString()) {
        const [receiverUser, hostUser, isBlocked] = await Promise.all([
          User.findById(parsedData.userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
          User.findById(hostId).select("_id name userName").lean(),
          Block.exists({
            $or: [
              { userId: hostId, toUserId: new mongoose.Types.ObjectId(parsedData.userId) },
              { userId: new mongoose.Types.ObjectId(parsedData.userId), toUserId: hostId },
            ],
          }),
        ]);

        if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
          const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
          const payload = {
            token: receiverUser.fcmToken,
            notification: {
              title: "👋😔 Removed from Audio Room",
              body: `🎙️ ${hostName} removed you from the audio room. Thanks for joining! 🙏✨`,
            },
            data: {
              type: "AUDIO_PARTICIPANT_REMOVED",
              liveUserObjId: String(parsedData.liveUserObjId),
              liveHistoryId: String(parsedData.liveHistoryId || ""),
              userId: String(parsedData.userId),
              position: String(parsedData.position),
              hostId: String(hostId),
            },
          };

          const adminPromise = await admin;
          adminPromise
            .messaging()
            .send(payload)
            .then((response) => {
              console.log("[participantRemoved] Notification sent:", response);
            })
            .catch((error) => {
              console.error("[participantRemoved] Error sending notification:", error);
            });
        }
      }
    } catch (error) {
      console.error("Error handling participantRemoved event: ", error);
    }
  });

  socket.on("seatLocked", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in allSeatLock:", parsedData);

      const [liveUser] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            "seat.position": parsedData.position,
          },
          {
            $set: {
              "seat.$.lock": parsedData.lock,
            },
          },
          {
            new: true,
          },
        ),
      ]);

      if (!liveUser) {
        console.error("Live user not found or update failed");
        return;
      }

      if (!socket.rooms.has(parsedData.liveUserObjId)) {
        socket.join(parsedData.liveUserObjId.toString());
        console.log(`[seatLocked] joined room: ${parsedData.liveUserObjId}`);
      } else {
        console.log(`[seatLocked] User is already in room: ${parsedData.liveUserObjId}`);
      }

      io.in(parsedData.liveUserObjId).emit("seatUpdate", liveUser);

      const roomSockets = io.sockets.adapter.rooms.get(parsedData.liveUserObjId);
      console.log("Sockets in liveUserObjId room:", roomSockets);
    } catch (error) {
      console.error("Error in allSeatLock event:", error);
    }
  });

  socket.on("seatMuted", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received data in seatMuted:", parsedData);

      let liveUser;
      if (parsedData.userId) {
        liveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            "seat.userId": new mongoose.Types.ObjectId(parsedData.userId),
          },
          {
            $set: {
              "seat.$.mute": Number(parsedData.mute),
            },
          },
          { new: true },
        );
      }

      if (parsedData.position !== -1) {
        liveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            "seat.position": parsedData.position,
          },
          {
            $set: {
              "seat.$.mute": Number(parsedData.mute),
            },
          },
          { new: true },
        );
      }

      if (liveUser) {
        console.log("LiveUser updated successfully");

        if (!socket.rooms.has(parsedData.liveUserObjId)) {
          socket.join(parsedData.liveUserObjId.toString());
          console.log(`[seatMuted] joined room: ${parsedData.liveUserObjId}`);
        } else {
          console.log(`[seatMuted] User is already in room: ${parsedData.liveUserObjId}`);
        }

        io.in(parsedData.liveUserObjId).emit("seatUpdate", liveUser);
      } else {
        console.log("LiveUser update failed or no matching document found");
      }
    } catch (error) {
      console.error("Error in seatMuted event:", error);
    }
  });

  socket.on("hostSeatMuted", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received data in hostSeatMuted:", parsedData);

      const liveUser = await LiveStreamer.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
        },
        {
          $set: {
            hostIsMuted: Number(parsedData.hostIsMuted),
          },
        },
        { new: true },
      );

      if (liveUser) {
        console.log("LiveUser updated successfully in hostIsMuted");

        if (!socket.rooms.has(parsedData.liveUserObjId)) {
          socket.join(parsedData.liveUserObjId.toString());
          console.log(`[hostSeatMuted] joined room: ${parsedData.liveUserObjId}`);
        } else {
          console.log(`[hostSeatMuted] User is already in room: ${parsedData.liveUserObjId}`);
        }

        io.in(parsedData.liveUserObjId).emit("seatUpdate", liveUser);
      } else {
        console.log("LiveUser update failed or no matching document found");
      }
    } catch (error) {
      console.error("Error in hostSeatMuted event:", error);
    }
  });

  socket.on("participantSpeaking", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Received data in participantSpeaking: ", parsedData);

      const [liveUser] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
            "seat.userId": new mongoose.Types.ObjectId(parsedData.userId),
            "seat.position": parsedData.position,
          },
          {
            $set: {
              "seat.$.speaking": parsedData.speaking,
            },
          },
          {
            new: true,
          },
        ),
      ]);

      if (!socket.rooms.has(parsedData.liveUserObjId)) {
        socket.join(parsedData.liveUserObjId.toString());
        console.log(`[participantSpeaking] joined room: ${parsedData.liveUserObjId}`);
      } else {
        console.log(`[participantSpeaking] User is already in room: ${parsedData.liveUserObjId}`);
      }

      if (liveUser) {
        io.in(parsedData.liveStreamingId).emit("seatUpdate", liveUser);

        console.log("[participantSpeaking] Emitted to room");
      } else {
        console.log("liveUser not found.");
      }

      const roomSockets = io.sockets.adapter.rooms.get(parsedData.liveStreamingId);
      console.log("Current room sockets in participantSpeaking: ", roomSockets);
    } catch (error) {
      console.error("Error in participantSpeaking event:", error);
    }
  });

  socket.on("seatCountModified", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("update Seat Configuration data:", parsedData);

      const { liveUserObjId, liveHistoryId, seatCount } = parsedData;

      if (!liveUserObjId || !liveHistoryId || typeof seatCount !== "number") {
        console.error("Invalid data received:", data);
        socket.emit("seatUpdate", "Invalid data provided.");
        return;
      }

      const [liveUser] = await Promise.all([
        LiveStreamer.findOne({
          _id: liveUserObjId,
          liveHistoryId: liveHistoryId,
          liveType: 2,
        }),
      ]);

      if (!liveUser) {
        console.error("Live user not found for ID:", liveHistoryId);
        socket.emit("seatUpdate", "Live user not found.");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[seatCountModified] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[seatCountModified] User is already in room: ${liveUserObjId}`);
      }

      const validSeatCounts = [8, 12, 15];
      if (!validSeatCounts.includes(seatCount)) {
        console.error("Invalid seat count:", seatCount);
        socket.emit("seatUpdate", "Seat count must be 8, 12, or 15.");
        return;
      }

      if (liveUser.seat.length > seatCount) {
        const excessSeats = liveUser.seat.slice(seatCount);
        excessSeats.forEach((seat) => {
          if (seat.userId) {
            io.in(liveUserObjId.toString()).emit("lessParticipants", seat.userId);
          }
        });

        liveUser.seat = liveUser.seat.slice(0, seatCount);
      } else if (liveUser.seat.length < seatCount) {
        const seatsToAdd = seatCount - liveUser.seat.length;
        const currentLength = liveUser.seat.length;

        const newSeats = defaultSeats.slice(0, seatsToAdd).map((seat, index) => ({
          ...seat,
          position: currentLength + index, // update position to continue from current length
        }));

        liveUser.seat.push(...newSeats);
      }

      await liveUser.save();

      io.in(liveUserObjId).emit("seatUpdate", liveUser);

      console.log("Updated seat array for live user:", liveUser.seat.length);
    } catch (error) {
      console.error("Error in seat update:", error.message);
      socket.emit("seatUpdateError", "An error occurred while updating seats.");
    }
  });

  socket.on("addToBlockedList", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("addToBlockedList data:  ", parsedData);

      const { liveUserObjId, liveHistoryId, blockedUserId } = parsedData;

      const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
        {
          _id: liveUserObjId,
          liveHistoryId: liveHistoryId,
        },
        {
          $push: {
            blockedUsers: {
              blockedUserId: blockedUserId,
            },
          },
        },
        { new: true },
      ).populate({
        path: "blockedUsers.blockedUserId",
        select: "_id name userName image isProfilePicBanned uniqueId isVerified",
      });

      console.log("Updated Live User addToBlockedList: ", updatedLiveUser?.blockedUsers);

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[addToBlockedList] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[addToBlockedList] User is already in room: ${liveUserObjId}`);
      }

      io.in("globalRoom:" + blockedUserId.toString()).emit("notifyBlockedUser", "Success");
      io.in(liveUserObjId).emit("addToBlockedList", updatedLiveUser?.blockedUsers);

      const roomSockets = io.sockets.adapter.rooms.get(liveUserObjId);
      console.log("Current room sockets in notifyBlockedUser: ", roomSockets);

      if (updatedLiveUser) {
        const hostId = updatedLiveUser.userId;
        if (hostId && blockedUserId && hostId.toString() !== blockedUserId.toString()) {
          const [receiverUser, hostUser] = await Promise.all([
            User.findById(blockedUserId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
          ]);

          if (receiverUser && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: "🚫⛔ You've Been Blocked",
                body: `🎙️ ${hostName} blocked you from this live room. You can no longer join! 🙅‍♂️`,
              },
              data: {
                type: "LIVE_USER_BLOCKED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                blockedUserId: String(blockedUserId),
                hostId: String(hostId),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[addToBlockedList] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[addToBlockedList] Error sending notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error handling addToBlockedList event: ", error);
    }
  });

  socket.on("removeFromBlockedList", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("removeFromBlockedList data:  ", parsedData);

      const { liveUserObjId, liveHistoryId, unblockedUserId } = parsedData;

      const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
        {
          _id: liveUserObjId,
          liveHistoryId: liveHistoryId,
        },
        {
          $pull: {
            blockedUsers: {
              blockedUserId: unblockedUserId,
            },
          },
        },
        { new: true },
      ).populate({
        path: "blockedUsers.blockedUserId",
        select: "_id name userName image isProfilePicBanned uniqueId isVerified",
      });

      console.log("Updated Live User removeFromBlockedList: ", updatedLiveUser?.blockedUsers);

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[removeFromBlockedList] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[removeFromBlockedList] User is already in room: ${liveUserObjId}`);
      }

      io.in(liveUserObjId).emit("removeFromBlockedList", updatedLiveUser?.blockedUsers);

      const roomSockets = io.sockets.adapter.rooms.get(liveUserObjId);
      console.log("Current room sockets in removeFromBlockedList: ", roomSockets);

      if (updatedLiveUser) {
        const hostId = updatedLiveUser.userId;
        if (hostId && unblockedUserId && hostId.toString() !== unblockedUserId.toString()) {
          const [receiverUser, hostUser] = await Promise.all([
            User.findById(unblockedUserId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
          ]);

          if (receiverUser && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: "✅🔓 You've Been Unblocked",
                body: `🎙️ ${hostName} unblocked you from the live room. You're welcome to join again! 🎶✨`,
              },
              data: {
                type: "LIVE_USER_UNBLOCKED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                unblockedUserId: String(unblockedUserId),
                hostId: String(hostId),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[removeFromBlockedList] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[removeFromBlockedList] Error sending notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error handling removeFromBlockedList event: ", error);
    }
  });

  socket.on("giftInAudioRoom", async (data) => {
    const giftData = JSON.parse(data);
    console.log("Received giftInAudioRoom event:", giftData);

    try {
      const receiverUsers = Array.isArray(giftData?.receiverUserId) ? giftData.receiverUserId.map((id) => id.trim()) : [];
      console.log("Processing gifts for receivers:", receiverUsers);

      const [senderUser, receiverUsersDocs, giftExist, giftCategory, liveHistory] = await Promise.all([
        User.findById(giftData.senderUserId).select("_id coin").lean(),
        User.find({ _id: { $in: receiverUsers } })
          .select("_id name")
          .lean(),
        Gift.findById(giftData.giftId).select("_id coin title image").lean(),
        GiftCategory.findById(giftData.giftCategoryId).lean().select("_id name"),
        giftData.liveHistoryId && giftData.liveHistoryId !== "" ? LiveStreamerHistory.findById(giftData.liveHistoryId).lean().select("_id") : Promise.resolve(null),
      ]);

      if (!senderUser || !giftExist) {
        const message = !senderUser ? "Sender user not found" : "Gift not found";
        console.log(message);
        io.in("globalRoom:" + giftData.senderUserId).emit("giftInAudioRoom", message);
        return;
      }

      if (!giftCategory || (giftData.liveHistoryId && giftData.liveHistoryId !== "" && !liveHistory)) {
        const message = !giftCategory ? "GiftCategory not found" : "LiveStreamerHistory not found";
        console.log(message);
        io.in("globalRoom:" + giftData.senderUserId).emit("giftInAudioRoom", message);
        return;
      }

      const foundReceiverIds = receiverUsersDocs.map((u) => u._id.toString());
      const missingReceivers = receiverUsers.filter((id) => !foundReceiverIds.includes(id));

      if (missingReceivers.length > 0) {
        const message = `Receiver user(s) not found: ${missingReceivers.join(", ")}`;
        console.log(message);
        io.in("globalRoom:" + giftData.senderUserId).emit("giftInAudioRoom", message);
        return;
      }

      const giftCount = Number(giftData.giftCount);
      const giftCoin = Math.abs(giftExist.coin);
      const totalCoinCostPerReceiver = giftCoin * giftCount;
      const overallGiftCoinCost = totalCoinCostPerReceiver * receiverUsers.length;

      if (senderUser.coin < overallGiftCoinCost) {
        console.log(`Insufficient coins. Sender (${senderUser._id}) has ${senderUser.coin}, required ${overallGiftCoinCost}`);
        io.in("globalRoom:" + giftData.senderUserId).emit("giftInAudioRoom", "You don't have sufficient coins");
        return;
      }

      if (!socket.rooms.has(giftData.liveUserObjId)) {
        socket.join(giftData.liveUserObjId);
        console.log(`[giftInAudioRoom] User ${socket.id} joined room: ${giftData.liveUserObjId}`);
      } else {
        console.log(`[giftInAudioRoom] User ${socket.id} is already in room: ${giftData.liveUserObjId}`);
      }

      if (overallGiftCoinCost > settingJSON.coinBroadcastThreshold) {
        io.emit("proHighValueGift", data); //emit to all connected sockets regardless of room
      }

      io.in(giftData.liveUserObjId).emit("giftInAudioRoom", { giftData });

      const [existing] = await Promise.all([
        TopGifter.findOneAndUpdate(
          {
            liveStreamerId: giftData.liveUserObjId,
            "gifters.userId": senderUser._id,
          },
          {
            $inc: {
              "gifters.$.totalCoins": Math.abs(overallGiftCoinCost),
            },
          },
          { new: true },
        ).lean(),
        User.updateOne(
          { _id: senderUser._id, coin: { $gte: overallGiftCoinCost } },
          {
            $inc: {
              coin: -Math.abs(overallGiftCoinCost),
              spentCoins: Math.abs(overallGiftCoinCost),
            },
          },
        ),
      ]);

      if (!existing) {
        await TopGifter.findOneAndUpdate(
          { liveStreamerId: giftData.liveUserObjId },
          {
            $push: {
              gifters: {
                userId: senderUser._id,
                totalCoins: Math.abs(overallGiftCoinCost),
              },
            },
          },
          { upsert: true, new: true },
        );
      }

      const topGifterData = await TopGifter.aggregate([
        {
          $match: {
            liveStreamerId: new mongoose.Types.ObjectId(giftData?.liveUserObjId),
          },
        },
        { $unwind: "$gifters" },
        {
          $lookup: {
            from: "users",
            localField: "gifters.userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "gifterUser",
          },
        },
        { $unwind: "$gifterUser" },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "gifterUser._id",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  fromUserId: new mongoose.Types.ObjectId(giftData?.senderUserId),
                },
              },
              { $limit: 1 },
              {
                $project: { _id: 1 },
              },
            ],
            as: "followData",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "gifterUser.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  type: 1,
                  image: 1,
                },
              },
            ],
            as: "activeAvtarFrameData",
          },
        },
        {
          $unwind: { path: "$activeAvtarFrameData", preserveNullAndEmptyArrays: true },
        },
        {
          $addFields: {
            "gifters.userId": {
              _id: "$gifterUser._id",
              name: "$gifterUser.name",
              image: "$gifterUser.image",
              isProfilePicBanned: "$gifterUser.isProfilePicBanned",
              activeAvtarFrameType: { $ifNull: ["$activeAvtarFrameData.type", 0] },
              activeAvtarFrameImage: { $ifNull: ["$activeAvtarFrameData.image", ""] },
            },
            "gifters.isFollow": {
              $gt: [{ $size: "$followData" }, 0],
            },
          },
        },
        {
          $group: {
            _id: "$_id",
            gifters: { $push: "$gifters" },
          },
        },
      ]);

      const topGifters = topGifterData?.[0]?.gifters?.sort((a, b) => b.totalCoins - a.totalCoins)?.slice(0, 5) || [];
      io.in(giftData.liveUserObjId).emit("broadcastTopGifter", topGifters);

      const adminRate = Math.abs(settingJSON.adminRate ?? 10);
      let adminCoin = Math.round((totalCoinCostPerReceiver * adminRate) / 100);

      let estimatedReceiverCoin = 0;
      if (giftCategory?.name.toLowerCase() === "lucky") {
        const receiverSharePercent = Math.abs(settingJSON.luckyGiftReceiverSharePercent || 10);
        const receiverCoinPerUser = Math.round((totalCoinCostPerReceiver * receiverSharePercent) / 100);
        estimatedReceiverCoin = receiverCoinPerUser * receiverUsers.length;
      } else {
        const receiverCoinPerUser = totalCoinCostPerReceiver - adminCoin;
        estimatedReceiverCoin = receiverCoinPerUser * receiverUsers.length;
      }

      const [liveStreamer] = await Promise.all([
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(giftData.liveUserObjId),
          },
          {
            $inc: { earnedCoins: estimatedReceiverCoin },
          },
          {
            new: true,
          },
        )
          .select("earnedCoins")
          .lean(),
        ...(giftData.liveHistoryId && giftData.liveHistoryId !== ""
          ? [
              LiveStreamerHistory.updateOne(
                { _id: new mongoose.Types.ObjectId(giftData.liveHistoryId) },
                {
                  $inc: {
                    earnedCoins: estimatedReceiverCoin,
                    receivedGifts: giftCount * receiverUsers.length,
                  },
                },
              ),
            ]
          : []),
      ]);

      const earnedCoins = liveStreamer?.earnedCoins;
      if (earnedCoins !== undefined) {
        let emittingSocketCount = io.sockets.adapter.rooms.get(giftData?.liveUserObjId.toString())?.size || 0;
        console.log(`[liveRoomCoinUpdate] Emitting event to ${emittingSocketCount} sockets in room ${giftData.liveUserObjId.toString()}`);

        io.in(giftData.liveUserObjId.toString()).emit("liveRoomCoinUpdate", earnedCoins);
        console.log(`[liveRoomCoinUpdate] emitted for room: ${giftData.liveUserObjId} with earnedCoins: ${earnedCoins}`);
      }

      for (const receiverUserId of receiverUsers) {
        const [uniqueId, receiverUser] = await Promise.all([generateHistoryUniqueId(), User.findById(receiverUserId).select("_id role agencyId").lean()]);

        if (!receiverUser) {
          console.log("Receiver user not found:", receiverUserId);
          continue;
        }

        let receiverCoin = totalCoinCostPerReceiver - adminCoin;

        let isSenderRewardEnabled = false;
        let adminCoinForLucky = 0;
        let receiverCoinForLucky = 0;
        let luckyUserWinCoin = 0;
        let totalLuckyCoin = 0;
        let luckyHistoryId, mainSetting;
        let luckyGiftEventId = null;

        if (giftCategory && giftCategory.name.toLowerCase() === "lucky") {
          console.log(`[Lucky Gift Triggered] Sender: ${senderUser._id}, Receiver: ${receiverUserId}`);
          console.log(`[Gift Info] ${giftExist.coin} × ${giftCount} | Total: ${totalCoinCostPerReceiver} coins`);

          const adminTaxPercent = Number(settingJSON.luckyGiftAdminTaxPercent);
          const receiverSharePercent = Number(settingJSON.luckyGiftReceiverSharePercent);
          luckyGiftEventId = new mongoose.Types.ObjectId();

          adminCoinForLucky = Math.round(totalCoinCostPerReceiver * ((isNaN(adminTaxPercent) ? 10 : adminTaxPercent) / 100));
          receiverCoinForLucky = Math.round(totalCoinCostPerReceiver * ((isNaN(receiverSharePercent) ? 10 : receiverSharePercent) / 100));
          totalLuckyCoin = totalCoinCostPerReceiver - (adminCoinForLucky + receiverCoinForLucky);

          console.log(`• Admin Tax (%${adminTaxPercent}): ${adminCoinForLucky}`);
          console.log(`• Receiver Share (%${receiverSharePercent}): ${receiverCoinForLucky}`);
          console.log(`• Lucky Pool Reserve: ${totalLuckyCoin}`);

          await Setting.updateOne({ _id: settingJSON._id }, { $inc: { luckyGiftTargetCoin: totalLuckyCoin } });

          const { multiplier, luckyValue } = getLuckyGiftValue(totalCoinCostPerReceiver);
          console.log(`Lucky Gift: multiplier=${multiplier}, luckyValue=${luckyValue}`);

          [luckyHistoryId, mainSetting] = await Promise.all([generateHistoryUniqueId(), Setting.findOne().select("luckyGiftTargetCoin").lean()]);

          console.log(`[Lucky Pool Status] Available: ${mainSetting.luckyGiftTargetCoin}`);

          receiverCoin = receiverCoinForLucky;
          adminCoin = adminCoinForLucky;

          if (luckyValue > 0 && luckyValue <= mainSetting.luckyGiftTargetCoin) {
            console.log(`[Lucky Reward Granted] Coin Returned to Sender: ${luckyValue}`);

            isSenderRewardEnabled = true;
            luckyUserWinCoin = luckyValue;

            console.log(`User Lucky gift bonus applied: ${luckyUserWinCoin} coins`);

            if (isSenderRewardEnabled) {
              io.to("globalRoom:" + giftData.senderUserId.toString()).emit("luckyGiftWin", luckyUserWinCoin);

              await Promise.all([
                Setting.updateOne({ _id: settingJSON._id }, { $set: { luckyGiftTargetCoin: 0 } }),
                User.updateOne(
                  { _id: senderUser._id },
                  {
                    $inc: { coin: luckyUserWinCoin },
                  },
                ),
                luckyUserWinCoin > 0
                  ? History.create({
                      uniqueId: luckyHistoryId,
                      type: 15,
                      liveHistoryId: giftData.liveHistoryId,
                      liveType: 2,
                      otherUserId: senderUser._id,
                      giftId: giftData.giftId,
                      giftTitle: giftExist.title,
                      giftCoin: giftExist.coin,
                      giftImage: giftExist.image,
                      giftReceivedCount: giftCount,
                      luckyGiftMultiplier: multiplier,
                      coin: luckyUserWinCoin,
                      luckyGiftEventId,
                      date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
                    })
                  : Promise.resolve(),
              ]);
            }

            isSenderRewardEnabled = false;
          } else {
            console.log("Lucky gift bonus criteria not met.");

            isSenderRewardEnabled = false;
          }
        }

        const isHost = Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId && !receiverUser.isBlock && !receiverUser.isHostBlocked;

        // Update Host Target Progress
        if (isHost) {
          hostTargetEngine.updateCoinProgress(receiverUser._id, receiverCoin);
        }

        // Base update fields for every receiver
        const updateFields = {
          $inc: {
            receivedCoins: receiverCoin,
            receivedGifts: giftCount,
            coin: receiverCoin,
          },
        };

        // For non-hosts → increment coin
        // if (!isHost) {
        //   console.log("For non-hosts → increment coin");

        //   updateFields.$inc.coin = receiverCoin;
        // }

        // For hosts → increment host-related fields only
        if (isHost) {
          console.log("For hosts → increment host-related fields only");

          updateFields.$inc.earnedHostCoins = receiverCoin;
        }

        await Promise.all([
          User.updateOne({ _id: receiverUser._id }, updateFields),
          History.create({
            uniqueId,
            type: 6,
            liveHistoryId: giftData.liveHistoryId || null,
            liveType: 2,
            userId: senderUser._id,
            otherUserId: receiverUser._id,
            senderCoin: totalCoinCostPerReceiver,
            receiverCoin: receiverCoin,
            adminCoin: adminCoin,
            luckyGiftReserve: totalLuckyCoin,
            giftCategoryId: giftCategory?._id || null,
            giftId: giftData.giftId,
            giftTitle: giftExist.title,
            giftCoin: giftExist.coin,
            giftImage: giftExist.image,
            giftReceivedCount: giftCount,
            hostAgencyId: isHost ? receiverUser.agencyId : null,
            luckyGiftEventId,
            date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
          }),
        ]);

        if (Array.isArray(receiverUser.role) && receiverUser.role.includes(2) && receiverUser.agencyId) {
          const [uniqueCommissionId, agency] = await Promise.all([generateHistoryUniqueId(), Agency.findOne({ _id: receiverUser.agencyId, isActive: true }).select("_id commissionRate ").lean()]);
          //console.log("[giftInAudioRoom] Agency fetched:", agency);

          if (agency) {
            const commissionRate = agency.commissionRate || 0;
            const commission = Math.round((totalCoinCostPerReceiver * commissionRate) / 100);
            const dateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

            console.log(`[giftInAudioRoom] Commission calculation:
              - Gift Coin: ${giftExist.coin}
              - Gift Count: ${giftCount}
              - Base Coins (Gift Coin × Count): ${totalCoinCostPerReceiver}
              - Agency Commission Rate: ${commissionRate}%
              - Commission Earned: ${commission} coins
            `);

            const updatePromises = [];
            const agencyEarningUpdate = buildAgencyEarningUpdate(commission, receiverCoin);

            if (commission > 0) {
              updatePromises.push(
                History.create({
                  uniqueId: uniqueCommissionId,
                  type: 9,
                  coin: commission,
                  agencyId: agency._id,
                  userId: senderUser._id,
                  otherUserId: receiverUser._id,
                  baseType: 6,
                  baseCoins: totalCoinCostPerReceiver,
                  commissionRate: commissionRate,
                  date: dateStr,
                }),
              );
              agencyEarningUpdate && updatePromises.push(Agency.updateOne({ _id: agency._id }, agencyEarningUpdate));
            }

            await Promise.all(updatePromises);

            console.log("[giftInAudioRoom] Host and agency updates completed successfully.");
          } else {
            console.log("[giftInAudioRoom] No active agency found for receiver.");
          }
        }
      }

      console.log("Gift processing completed successfully.");
    } catch (error) {
      console.error("Error in giftInAudioRoom:", error);
    }
  });

  socket.on("broadcastReaction", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("[broadcastReaction] Received Data:", parsedData);

      const { liveHistoryId, liveUserObjId } = parsedData;
      if (!liveHistoryId || !liveUserObjId) {
        console.log("[broadcastReaction] Missing liveHistoryId or liveUserObjId");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[broadcastReaction] User ${socket.id} joined room: ${liveUserObjId}`);
      } else {
        console.log(`[broadcastReaction] User ${socket.id} is already in room: ${liveUserObjId}`);
      }

      io.in(liveUserObjId).emit("broadcastReaction", parsedData);

      let emittingSocketCount = io.sockets.adapter.rooms.get(liveUserObjId)?.size || 0;
      console.log(`[broadcastReaction] Emitting event to ${emittingSocketCount} sockets in room ${liveUserObjId}`);
    } catch (error) {
      console.log("[broadcastReaction] Error processing event:", error);
    }
  });

  socket.on("updateLiveTheme", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("[updateLiveTheme] Received Data:", parsedData);

      const { liveHistoryId, liveUserObjId, bgTheme, activeTheme } = parsedData;

      if (!liveHistoryId || !liveUserObjId || !bgTheme) {
        console.warn("[updateLiveTheme] Missing required fields: liveHistoryId or bgTheme or liveUserObjId");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log(`[updateLiveTheme] User ${socket.id} joined room: ${liveUserObjId}`);
      } else {
        console.log(`[updateLiveTheme] User ${socket.id} is already in room: ${liveUserObjId}`);
      }

      io.in(liveUserObjId).emit("themeUpdated", parsedData);

      const socketCount = io.sockets.adapter.rooms.get(liveUserObjId)?.size || 0;
      console.log(`[updateLiveTheme] Emitting event to ${socketCount} sockets in room ${liveUserObjId}`);

      const liveUser = await LiveStreamer.findOne({
        _id: liveUserObjId,
        liveHistoryId,
      });

      if (liveUser) {
        liveUser.bgTheme = bgTheme;

        await liveUser.save();
        await User.updateOne(
          { _id: liveUser?.userId },
          {
            $set: {
              activeTheme: activeTheme || null,
            },
          },
        );

        console.log(`[updateLiveTheme] Updated bgTheme for liveHistoryId ${liveHistoryId}`);
      } else {
        console.warn(`[updateLiveTheme] No LiveStreamer found with liveHistoryId ${liveHistoryId}`);
      }
    } catch (error) {
      console.error("[updateLiveTheme] Error processing event:", error);
    }
  });

  //call-join
  socket.on("liveTypeModified", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in liveTypeModified:", parsedData);

      const { liveHistoryId, liveUserObjId, liveType } = parsedData;

      const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(liveUserObjId),
          liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId),
        },
        { $set: { liveType: Number(liveType) } },
        { new: true },
      ).lean();

      if (!updatedLiveUser) {
        console.error("LiveUser not found");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[liveTypeModified] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[liveTypeModified] already in room: ${liveUserObjId}`);
      }

      console.log("Updated liveType for user:", updatedLiveUser);

      io.in(liveUserObjId.toString()).emit("liveTypeModified", data);

      if (liveType == 3) {
        const updatedLiveUser = await LiveStreamer.aggregate([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(liveUserObjId),
              liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId),
            },
          },
          {
            $project: {
              requested: 1,
              invite: {
                $filter: {
                  input: "$requested",
                  as: "req",
                  cond: { $eq: ["$$req.isInvited", true] },
                },
              },
            },
          },
        ]);

        io.in(liveUserObjId).emit("callJoinRequestsRefreshed", updatedLiveUser[0]?.requested || []);
      }

      // if (liveType != 3 && updatedLiveUser.requested?.some((r) => r.userId !== null)) {
      //   console.log("Reset requested array if liveType !== 3 and any userId exists");

      //   await LiveStreamer.updateOne(
      //     {
      //       _id: new mongoose.Types.ObjectId(liveUserObjId),
      //       liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId),
      //     },
      //     {
      //       $set: {
      //         requested: requestedDefault,
      //       },
      //     },
      //   );
      //   console.log("Requested array reset due to liveType change.");
      // }
    } catch (error) {
      console.error("Error in liveTypeModified:", error);
    }
  });

  socket.on("callJoinRequestSent", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("callJoinRequestSent data received:", parsedData);

      const {
        userId,
        liveType,
        liveHistoryId,
        liveUserObjId,
        name,
        userName,
        image,
        isProfilePicBanned,
        gender,
        age,
        countryFlagImage,
        country,
        avtarFrameType,
        avtarFrame,
        uniqueId,
        isVerified,
        agoraUid,
        isMute,
        isCameraEnabled,
        isSendrequestByHost,
        position,
      } = parsedData;

      const [liveUser, userExists] = await Promise.all([
        LiveStreamer.findOne({
          $and: [{ _id: new mongoose.Types.ObjectId(liveUserObjId) }, { liveType: Number(liveType) }],
        }),
        LiveStreamer.findOne({
          _id: new mongoose.Types.ObjectId(liveUserObjId),
          liveType: Number(liveType),
          "requested.userId": new mongoose.Types.ObjectId(userId),
          "requested.position": { $ne: position },
        }),
      ]);

      if (!liveUser) {
        console.error("LiveUser not found for the provided ID.");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[callJoinRequestSent] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[callJoinRequestSent] User is already in room: ${liveUserObjId}`);
      }

      if (userExists) {
        console.log("User already exists in call join request list. Updating...");

        await LiveStreamer.findOneAndUpdate(
          {
            _id: liveUser._id,
            liveType: Number(liveType),
            "requested.userId": new mongoose.Types.ObjectId(userId),
          },
          {
            $set: {
              "requested.$.userId": userId,
              "requested.$.name": name,
              "requested.$.userName": userName,
              "requested.$.image": image,
              "requested.$.isProfilePicBanned": isProfilePicBanned,
              "requested.$.gender": gender,
              "requested.$.age": age,
              "requested.$.countryFlagImage": countryFlagImage,
              "requested.$.country": country,
              "requested.$.avtarFrameType": avtarFrameType,
              "requested.$.avtarFrame": avtarFrame,
              "requested.$.uniqueId": uniqueId,
              "requested.$.isVerified": isVerified,
              "requested.$.agoraUid": agoraUid,
              "requested.$.isMute": isMute,
              "requested.$.isCameraEnabled": isCameraEnabled,
              "requested.$.isSendrequestByHost": isSendrequestByHost,
              "requested.$.isRequested": true,
              "requested.$.isAccepted": false,
              "requested.$.isInvited": false,
            },
          },
          { new: true },
        ).lean();
      } else {
        console.log("Adding new user to call join request list.");

        await LiveStreamer.findOneAndUpdate(
          {
            _id: liveUser._id,
            liveType: Number(liveType),
            "requested.position": position,
          },
          {
            $set: {
              "requested.$.userId": new mongoose.Types.ObjectId(userId),
              "requested.$.name": name,
              "requested.$.userName": userName,
              "requested.$.image": image,
              "requested.$.isProfilePicBanned": isProfilePicBanned,
              "requested.$.gender": gender,
              "requested.$.age": age,
              "requested.$.countryFlagImage": countryFlagImage,
              "requested.$.country": country,
              "requested.$.avtarFrameType": avtarFrameType,
              "requested.$.avtarFrame": avtarFrame,
              "requested.$.uniqueId": uniqueId,
              "requested.$.isVerified": isVerified,
              "requested.$.agoraUid": agoraUid,
              "requested.$.isRequested": true,
              "requested.$.isAccepted": false,
              "requested.$.isInvited": false,
              "requested.$.isMute": isMute,
              "requested.$.isCameraEnabled": isCameraEnabled,
              "requested.$.isSendrequestByHost": isSendrequestByHost,
            },
          },
          { new: true },
        ).lean();
      }

      const [updatedLiveUser, updatedUserRequest] = await Promise.all([
        LiveStreamer.aggregate([
          { $match: { _id: liveUser._id } },
          {
            $project: {
              requested: 1,
              invite: {
                $filter: {
                  input: "$requested",
                  as: "req",
                  cond: { $eq: ["$$req.isInvited", true] },
                },
              },
            },
          },
        ]),
        LiveStreamer.aggregate([
          { $match: { _id: liveUser._id } },
          {
            $project: {
              requested: {
                $filter: {
                  input: "$requested",
                  as: "req",
                  cond: {
                    $and: [{ $eq: ["$$req.userId", new mongoose.Types.ObjectId(userId)] }, { $eq: ["$$req.position", position] }],
                  },
                },
              },
            },
          },
        ]),
      ]);

      io.in(liveUserObjId).emit("callJoinRequestsRefreshed", updatedLiveUser[0]?.requested || []);

      const updatedEntry = updatedUserRequest?.[0]?.requested?.[0];
      console.log("updatedUserRequest?.[0]?.requested?.[0]: ", updatedUserRequest?.[0]?.requested?.[0]);

      if (updatedEntry) {
        io.in(`globalRoom:${userId.toString()}`).emit("callJoinRequestUpdated", updatedEntry);

        console.log(`Emitted callJoinRequestUpdated to globalRoom:${userId}`);
      } else {
        console.warn(`No updated requested entry found for userId: ${userId}`);
      }

      if (updatedEntry && !isSendrequestByHost) {
        const hostId = liveUser.userId;
        if (hostId && hostId.toString() !== userId.toString()) {
          const [hostUser, requesterUser, isBlocked] = await Promise.all([
            User.findById(hostId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(userId).select("_id name userName image isProfilePicBanned isVerified").lean(),
            Block.exists({
              $or: [
                { userId: hostId, toUserId: new mongoose.Types.ObjectId(userId) },
                { userId: new mongoose.Types.ObjectId(userId), toUserId: hostId },
              ],
            }),
          ]);

          if (hostUser && !isBlocked && hostUser.isPushNotificationEnabled && !hostUser.isBlock && hostUser.fcmToken !== null) {
            const requesterName = name?.trim() || userName?.trim() || requesterUser?.name?.trim() || requesterUser?.userName?.trim() || "Someone";
            const payload = {
              token: hostUser.fcmToken,
              notification: {
                title: `🎥✨ Join Request from ${requesterName}!`,
                body: `👋 ${requesterName} wants to join your live! Tap to accept or decline 🔥📹`,
              },
              data: {
                type: "CALL_JOIN_REQUEST",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                liveType: String(liveType),
                userId: String(userId),
                position: String(position),
                name: String(name || ""),
                userName: String(userName || ""),
                image: String(image || ""),
                isProfilePicBanned: String(isProfilePicBanned ?? false),
                isVerified: String(isVerified ?? false),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[callJoinRequestSent] Host notification sent:", response);
              })
              .catch((error) => {
                console.error("[callJoinRequestSent] Error sending host notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error handling callJoinRequestSent:", error);
    }
  });

  socket.on("callJoinRequestRemoved", async (data) => {
    try {
      console.log("callJoinRequestRemoved event received:", data);

      const { userId, liveHistoryId, liveUserObjId, position } = JSON.parse(data);

      const updatedResult = await LiveStreamer.updateOne(
        {
          _id: liveUserObjId,
          "requested.userId": new mongoose.Types.ObjectId(userId),
          "requested.position": position,
        },
        {
          $set: {
            "requested.$.userId": null,
            "requested.$.name": "",
            "requested.$.userName": "",
            "requested.$.image": "",
            "requested.$.isProfilePicBanned": false,
            "requested.$.gender": "",
            "requested.$.age": 0,
            "requested.$.avtarFrameType": 0,
            "requested.$.avtarFrame": "",
            "requested.$.countryFlagImage": "",
            "requested.$.country": "",
            "requested.$.uniqueId": "",
            "requested.$.isVerified": false,
            "requested.$.agoraUid": "",
            "requested.$.isMute": false,
            "requested.$.isRequested": false,
            "requested.$.isAccepted": false,
            "requested.$.isInvited": false,
            "requested.$.isCameraEnabled": false,
            "requested.$.isSendrequestByHost": false,
            "requested.$.coin": 0,
          },
        },
      );

      if (!updatedResult) {
        console.warn("Live user not found or no changes made");
        return;
      }

      const updatedLiveUser = await LiveStreamer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(liveUserObjId), liveType: { $in: [1, 3, 4] } } },
        {
          $project: {
            requested: 1,
            invite: {
              $filter: {
                input: "$requested",
                as: "req",
                cond: { $eq: ["$$req.isInvited", true] },
              },
            },
          },
        },
      ]);

      io.in(liveUserObjId).emit("callJoinRequestsRefreshed", updatedLiveUser[0]?.requested || []);

      const adapterSockets = io.sockets.adapter.rooms.get(liveUserObjId);
      console.log("Current sockets in room callJoinRequestRemoved:", adapterSockets);

      if (updatedResult?.modifiedCount > 0 && userId) {
        const liveStreamerDoc = await LiveStreamer.findById(liveUserObjId).select("userId liveType").lean();
        const hostId = liveStreamerDoc?.userId;
        if (hostId && hostId.toString() !== userId.toString()) {
          const [receiverUser, hostUser, isBlocked] = await Promise.all([
            User.findById(userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
            Block.exists({
              $or: [
                { userId: hostId, toUserId: new mongoose.Types.ObjectId(userId) },
                { userId: new mongoose.Types.ObjectId(userId), toUserId: hostId },
              ],
            }),
          ]);

          if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: "😔❌ Request Declined",
                body: `🎥 ${hostName} declined your join request. Try again later! 🔄💪`,
              },
              data: {
                type: "CALL_JOIN_REQUEST_REMOVED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                liveType: String(liveStreamerDoc?.liveType ?? ""),
                userId: String(userId),
                position: String(position),
                hostId: String(hostId),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[callJoinRequestRemoved] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[callJoinRequestRemoved] Error sending notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error handling callJoinRequestRemoved:", error);
    }
  });

  socket.on("callParticipantAdded", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("callParticipantAdded event triggered:", parsedData);

      const {
        userId,
        liveHistoryId,
        liveUserObjId,
        name,
        userName,
        image,
        isProfilePicBanned,
        gender,
        age,
        countryFlagImage,
        country,
        avtarFrameType,
        avtarFrame,
        uniqueId,
        isVerified,
        agoraUid,
        isMute,
        isCameraEnabled,
        isSendrequestByHost,
        position,
      } = parsedData;

      const userObjectId = new mongoose.Types.ObjectId(userId);
      const liveUserObjectId = new mongoose.Types.ObjectId(liveUserObjId);

      const liveUser = await LiveStreamer.findOne({ _id: liveUserObjectId, isAudio: false, liveType: { $in: [3, 4] } }, { _id: 1, userId: 1, requested: 1 }).lean();

      if (!liveUser) {
        console.error("LiveUser not found for the provided ID.");
        return;
      }

      // Step 1: Clear all previous slots with the same userId
      const clearResult = await LiveStreamer.updateOne(
        { _id: liveUser._id },
        {
          $set: {
            "requested.$[elem].userId": null,
            "requested.$[elem].name": "",
            "requested.$[elem].userName": "",
            "requested.$[elem].image": "",
            "requested.$[elem].isProfilePicBanned": false,
            "requested.$[elem].gender": "",
            "requested.$[elem].age": 0,
            "requested.$[elem].country": "",
            "requested.$[elem].countryFlagImage": "",
            "requested.$[elem].avtarFrameType": 0,
            "requested.$[elem].avtarFrame": "",
            "requested.$[elem].uniqueId": "",
            "requested.$[elem].isVerified": false,
            "requested.$[elem].agoraUid": 0,
            "requested.$[elem].coin": 0,
            "requested.$[elem].isRequested": false,
            "requested.$[elem].isAccepted": false,
            "requested.$[elem].isInvited": false,
            "requested.$[elem].isMute": false,
            "requested.$[elem].isCameraEnabled": false,
            "requested.$[elem].isSendrequestByHost": false,
          },
        },
        {
          arrayFilters: [{ "elem.userId": userObjectId }],
        },
      );

      console.log("Cleared all previous slots of user:", clearResult);

      // Step 2: Assign the user to the new requested position
      const assignResult = await LiveStreamer.updateOne(
        { _id: liveUser._id, "requested.position": position },
        {
          $set: {
            "requested.$.userId": userObjectId,
            "requested.$.name": name,
            "requested.$.userName": userName,
            "requested.$.image": image,
            "requested.$.isProfilePicBanned": isProfilePicBanned,
            "requested.$.gender": gender,
            "requested.$.age": age,
            "requested.$.country": country,
            "requested.$.countryFlagImage": countryFlagImage,
            "requested.$.avtarFrameType": avtarFrameType,
            "requested.$.avtarFrame": avtarFrame,
            "requested.$.uniqueId": uniqueId,
            "requested.$.isVerified": isVerified,
            "requested.$.agoraUid": agoraUid,
            "requested.$.isRequested": false,
            "requested.$.isAccepted": true,
            "requested.$.isInvited": false,
            "requested.$.isMute": isMute,
            "requested.$.isCameraEnabled": isCameraEnabled,
            "requested.$.isSendrequestByHost": isSendrequestByHost,
          },
        },
      );

      console.log("Assigned to new position:", assignResult);

      // Step 3: Emit updated participant list and full requested array
      const updatedLiveUser = await LiveStreamer.aggregate([
        { $match: { _id: liveUser._id } },
        {
          $project: {
            requested: 1,
            participants: {
              $filter: {
                input: "$requested",
                as: "item",
                cond: { $eq: ["$$item.isAccepted", true] },
              },
            },
          },
        },
      ]);

      if (updatedLiveUser.length) {
        const { participants, requested } = updatedLiveUser[0];

        console.log("Updated requested list:", requested);

        io.in(liveUserObjId).emit("callJoinRequestsRefreshed", requested);
        io.in(liveUserObjId).emit("callParticipantListUpdated", participants);
      }

      if (assignResult?.modifiedCount > 0) {
        const hostId = liveUser.userId;
        if (hostId && hostId.toString() !== userId.toString()) {
          const [receiverUser, hostUser, isBlocked] = await Promise.all([
            User.findById(userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
            Block.exists({
              $or: [
                { userId: hostId, toUserId: userObjectId },
                { userId: userObjectId, toUserId: hostId },
              ],
            }),
          ]);

          if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: `🎥✨ ${hostName} accepted you!`,
                body: `🎥 ${hostName} accepted you into the live! Tap to join now 🔥📹`,
              },
              data: {
                type: "CALL_PARTICIPANT_ADDED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId),
                userId: String(userId),
                position: String(position),
                hostId: String(hostId),
                name: String(name || ""),
                userName: String(userName || ""),
                image: String(image || ""),
                isProfilePicBanned: String(isProfilePicBanned ?? false),
                isVerified: String(isVerified ?? false),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[callParticipantAdded] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[callParticipantAdded] Error sending notification:", error);
              });
          }
        }
      }

      console.log("callParticipantAdded processed successfully.");
    } catch (error) {
      console.error("Error in callParticipantAdded:", error);
    }
  });

  socket.on("callParticipantRemoved", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data in callParticipantRemoved:", parsedData);

      const { userId, liveHistoryId, liveUserObjId, position } = parsedData;

      if (position !== -1) {
        const liveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            "requested.userId": new mongoose.Types.ObjectId(userId),
            "requested.position": parsedData.position,
          },
          {
            $set: {
              "requested.$.userId": null,
              "requested.$.name": "",
              "requested.$.userName": "",
              "requested.$.image": "",
              "requested.$.isProfilePicBanned": false,
              "requested.$.gender": "",
              "requested.$.age": 0,
              "requested.$.avtarFrameType": 0,
              "requested.$.avtarFrame": "",
              "requested.$.countryFlagImage": "",
              "requested.$.country": "",
              "requested.$.uniqueId": "",
              "requested.$.isVerified": false,
              "requested.$.agoraUid": "",
              "requested.$.isMute": false,
              "requested.$.isRequested": false,
              "requested.$.isAccepted": false,
              "requested.$.isInvited": false,
              "requested.$.isCameraEnabled": false,
              "requested.$.isSendrequestByHost": false,
              "requested.$.coin": 0,
            },
          },
          { new: true },
        );

        if (liveUser) {
          console.log("LiveUser updated successfully");
        } else {
          console.log("LiveUser update failed or no matching document found");
        }
      }

      const [updatedLiveUser] = await LiveStreamer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(liveUserObjId) } },
        {
          $project: {
            requested: 1,
            participants: {
              $filter: {
                input: "$requested",
                as: "req",
                cond: { $eq: ["$$req.isAccepted", true] },
              },
            },
          },
        },
      ]);

      io.in(liveUserObjId).emit("callJoinRequestsRefreshed", updatedLiveUser?.requested || []);
      io.in(liveUserObjId).emit("callParticipantListUpdated", updatedLiveUser?.participants || []);

      if (parsedData.userId) {
        const liveStreamerDoc = await LiveStreamer.findById(liveUserObjId).select("userId liveType").lean();
        const hostId = liveStreamerDoc?.userId;
        if (hostId && hostId.toString() !== parsedData.userId.toString()) {
          const [receiverUser, hostUser, isBlocked] = await Promise.all([
            User.findById(parsedData.userId).select("_id name userName isPushNotificationEnabled isBlock fcmToken").lean(),
            User.findById(hostId).select("_id name userName").lean(),
            Block.exists({
              $or: [
                { userId: hostId, toUserId: new mongoose.Types.ObjectId(parsedData.userId) },
                { userId: new mongoose.Types.ObjectId(parsedData.userId), toUserId: hostId },
              ],
            }),
          ]);

          if (receiverUser && !isBlocked && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken !== null) {
            const hostName = hostUser?.name?.trim() || hostUser?.userName?.trim() || "The host";
            const payload = {
              token: receiverUser.fcmToken,
              notification: {
                title: "👋😔 Removed from Live",
                body: `🎥 ${hostName} removed you from the live. Thanks for joining! 🙏✨`,
              },
              data: {
                type: "CALL_PARTICIPANT_REMOVED",
                liveUserObjId: String(liveUserObjId),
                liveHistoryId: String(liveHistoryId || ""),
                liveType: String(liveStreamerDoc?.liveType ?? ""),
                userId: String(parsedData.userId),
                position: String(parsedData.position),
                hostId: String(hostId),
              },
            };

            const adminPromise = await admin;
            adminPromise
              .messaging()
              .send(payload)
              .then((response) => {
                console.log("[callParticipantRemoved] Notification sent:", response);
              })
              .catch((error) => {
                console.error("[callParticipantRemoved] Error sending notification:", error);
              });
          }
        }
      }
    } catch (error) {
      console.error("Error in callParticipantRemoved:", error);
    }
  });

  socket.on("callParticipantMuteUpdated", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in callParticipantMuteUpdated:", parsedData);

      const { userId, liveHistoryId, liveUserObjId, isMute } = parsedData;

      const [liveUser, updatedLiveUser] = await Promise.all([
        LiveStreamer.findOne({
          _id: new mongoose.Types.ObjectId(liveUserObjId),
          liveType: { $in: [3, 4] },
        }).lean(),
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            "requested.userId": new mongoose.Types.ObjectId(userId),
          },
          { $set: { "requested.$.isMute": isMute } },
          { new: true },
        ),
      ]);

      if (!liveUser) {
        console.error("LiveUser not found for the provided ID.");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[callParticipantMuteUpdated] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[callParticipantMuteUpdated] User is already in room: ${liveUserObjId}`);
      }

      console.log("Current room state:", io.sockets.adapter.rooms.get(liveUserObjId.toString()));

      if (updatedLiveUser) {
        const [aggregatedLiveUser] = await LiveStreamer.aggregate([
          {
            $match: { _id: liveUser._id },
          },
          {
            $project: {
              requested: 1,
              participants: {
                $filter: {
                  input: "$requested",
                  as: "req",
                  cond: { $eq: ["$$req.isAccepted", true] },
                },
              },
            },
          },
        ]);

        if (aggregatedLiveUser) {
          io.in(liveUserObjId.toString()).emit("callJoinRequestsRefreshed", aggregatedLiveUser.requested);
          io.in(liveUserObjId.toString()).emit("callParticipantListUpdated", aggregatedLiveUser.participants);
        }
      }
    } catch (error) {
      console.error("Error in callParticipantMuteUpdated:", error);
    }
  });

  socket.on("callParticipantCameraUpdated", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in callParticipantCameraUpdated:", parsedData);

      const { userId, liveHistoryId, liveUserObjId, isCameraEnabled } = parsedData;

      const [liveUser, updatedLiveUser] = await Promise.all([
        LiveStreamer.findOne({
          _id: new mongoose.Types.ObjectId(liveUserObjId),
          liveType: { $in: [3, 4] },
        }).lean(),
        LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            "requested.userId": new mongoose.Types.ObjectId(userId),
          },
          { $set: { "requested.$.isCameraEnabled": isCameraEnabled } },
          { new: true },
        ),
      ]);

      if (!liveUser) {
        console.error("LiveUser not found for the provided ID.");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[callParticipantCameraUpdated] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[callParticipantCameraUpdated] User is already in room: ${liveUserObjId}`);
      }

      console.log("Current room state:", io.sockets.adapter.rooms.get(liveUserObjId.toString()));

      if (updatedLiveUser) {
        const [aggregatedLiveUser] = await LiveStreamer.aggregate([
          {
            $match: { _id: liveUser._id },
          },
          {
            $project: {
              requested: 1,
            },
          },
        ]);

        if (aggregatedLiveUser) {
          io.in(liveUserObjId.toString()).emit("callJoinRequestsRefreshed", aggregatedLiveUser.requested);
        }
      }
    } catch (error) {
      console.error("Error in callParticipantCameraUpdated:", error);
    }
  });

  socket.on("callHostCameraUpdated", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in callHostCameraUpdated:", parsedData);

      const { liveUserObjId, liveHistoryId, isHostCameraEnabled } = parsedData;

      // Update and return the full document
      const updatedHost = await LiveStreamer.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(liveUserObjId) }, { $set: { isHostCameraEnabled: isHostCameraEnabled } }, { new: true }).lean();

      if (!updatedHost) {
        console.error("LiveUser not found or not of type host.");
        return;
      }

      const roomId = liveUserObjId.toString();

      if (!socket.rooms.has(roomId)) {
        socket.join(roomId);
        console.log(`[callHostCameraUpdated] joined room: ${roomId}`);
      } else {
        console.log(`[callHostCameraUpdated] User is already in room: ${roomId}`);
      }

      console.log("Current room state:", io.sockets.adapter.rooms.get(roomId));

      io.in(roomId).emit("callHostCameraUpdated", data);
    } catch (error) {
      console.error("Error in callHostCameraUpdated:", error);
    }
  });

  socket.on("callHostMuteUpdated", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in callHostMuteUpdated:", parsedData);

      const { liveUserObjId, liveHistoryId, isHostMuteEnabled } = parsedData;

      const updatedHost = await LiveStreamer.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(liveUserObjId) }, { $set: { isHostMuteEnabled: isHostMuteEnabled } }, { new: true }).lean();

      if (!updatedHost) {
        console.error("LiveUser not found or not of type host.");
        return;
      }

      const roomId = liveUserObjId.toString();

      if (!socket.rooms.has(roomId)) {
        socket.join(roomId);
        console.log(`[callHostMuteUpdated] joined room: ${roomId}`);
      } else {
        console.log(`[callHostMuteUpdated] User is already in room: ${roomId}`);
      }

      console.log("Current room state:", io.sockets.adapter.rooms.get(roomId));

      io.in(roomId).emit("callHostMuteUpdated", data);
    } catch (error) {
      console.error("Error in callHostMuteUpdated:", error);
    }
  });

  socket.on("callHostRequestAcceptTypeUpdated", async (data) => {
    try {
      const { liveUserObjId, hostAcceptedViaRequest } = JSON.parse(data);
      console.log("Data received in callHostRequestAcceptTypeUpdated:", data);

      const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(liveUserObjId) },
        {
          $set: {
            "requested.$[].hostAcceptedViaRequest": hostAcceptedViaRequest, // update all items
          },
        },
        { new: true, projection: { requested: 1 }, lean: true },
      );

      if (!updatedLiveUser) {
        console.error("LiveUser not found.");
        return;
      }

      const roomId = liveUserObjId.toString();
      if (!socket.rooms.has(roomId)) {
        socket.join(roomId);
        console.log(`[callHostRequestAcceptTypeUpdated] joined room: ${roomId}`);
      } else {
        console.log(`[callHostRequestAcceptTypeUpdated] already in room: ${roomId}`);
      }

      console.log("Current room state:", io.sockets.adapter.rooms.get(roomId));
      io.in(roomId).emit("callJoinRequestsRefreshed", updatedLiveUser.requested || []);
    } catch (error) {
      console.error("Error in callHostRequestAcceptTypeUpdated:", error);
    }
  });

  socket.on("callRequestedCountUpdated", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Update Requested Configuration data:", parsedData);

      const { liveUserObjId, liveHistoryId, requestedCount } = parsedData;

      if (!liveUserObjId || !liveHistoryId || typeof requestedCount !== "number") {
        console.error("Invalid data received:", data);
        socket.emit("callRequestedCountUpdated", "Invalid data provided.");
        return;
      }

      if (requestedCount < 1 || requestedCount > 9) {
        console.error("Invalid requested count:", requestedCount);
        socket.emit("callRequestedCountUpdated", "Requested count must be between 1 and 9.");
        return;
      }

      const liveUser = await LiveStreamer.findOne({ _id: liveUserObjId, liveHistoryId: liveHistoryId }).select("requested");

      if (!liveUser) {
        console.error("Live user not found for ID:", liveUserObjId);
        socket.emit("callRequestedCountUpdated", "Live user not found.");
        return;
      }

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId.toString());
        console.log(`[callRequestedCountUpdated] joined room: ${liveUserObjId}`);
      } else {
        console.log(`[callRequestedCountUpdated] User is already in room: ${liveUserObjId}`);
      }

      const currentLength = liveUser.requested.length;

      if (currentLength > requestedCount) {
        // Remove excess entries
        liveUser.requested = liveUser.requested.slice(0, requestedCount);
      } else if (liveUser.requested.length < requestedCount) {
        const entriesToAdd = requestedCount - liveUser.requested.length;
        const currentLength = liveUser.requested.length;

        const newEntries = requestedDefault.slice(0, entriesToAdd).map((entry, index) => ({
          ...entry,
          position: currentLength + index, // continue position from current length
        }));

        liveUser.requested.push(...newEntries);
      }

      await liveUser.save();

      io.in(liveUserObjId).emit("callJoinRequestsRefreshed", liveUser.requested);
      io.in(liveUserObjId).emit("callParticipantListUpdated", liveUser.requested);

      // console.log("Updated requested array for live user:", liveUser.requested);
    } catch (error) {
      console.error("Error in requested update:", error.message);
      socket.emit("callRequestedCountUpdated", "An error occurred while updating requested entries.");
    }
  });

  socket.on("disconnect", async (reason) => {
    console.log(`Socket disconnected: ${id} - ${socket.id} - Reason: ${reason}`);

    if (globalRoom) {
      const sockets = await io.in(globalRoom).fetchSockets();
      console.log("🔄 Checking active sockets in room:", sockets.length);

      if (sockets?.length == 0) {
        const userId = new mongoose.Types.ObjectId(id);
        console.log(`🔍 Fetching user data for userId: ${userId}`);

        const user = await User.findById(userId).select("_id isLive liveHistoryId liveStreamerId callId name").lean();

        if (user) {
          //Remove the disconnected userId from the seat array
          try {
            const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
              { "seat.userId": userId },
              {
                $set: {
                  "seat.$.userId": null,
                  "seat.$.name": "",
                  "seat.$.userName": "",
                  "seat.$.image": "",
                  "seat.$.isProfilePicBanned": false,
                  "seat.$.gender": "",
                  "seat.$.age": 0,
                  "seat.$.countryFlagImage": "",
                  "seat.$.country": "",
                  "seat.$.avtarFrameType": 0,
                  "seat.$.avtarFrame": "",
                  "seat.$.uniqueId": "",
                  "seat.$.isVerified": false,
                  "seat.$.coin": 0,
                  "seat.$.speaking": false,
                  "seat.$.mute": 0,
                  "seat.$.lock": false,
                  "seat.$.reserved": false,
                  "seat.$.invite": false,
                  "seat.$.agoraUid": 0,
                },
              },
              {
                new: true, // return the updated document
                projection: { _id: 1, seat: 1 }, // only return necessary fields
              },
            );

            if (updatedLiveUser) {
              io.in(updatedLiveUser._id.toString()).emit("seatUpdate", updatedLiveUser);

              const emittingSocketCount = io.sockets.adapter.rooms.get(updatedLiveUser._id.toString())?.size || 0;

              console.log(`✅ Disconnected user ${userId} removed from seat in room ${updatedLiveUser._id}`);
              console.log(`[seatUpdate] Emitting to ${emittingSocketCount} sockets.`);
            } else {
              console.warn(`⚠️ No matching LiveStreamer found for userId: ${userId}`);
            }
          } catch (error) {
            console.error(`❌ Error while updating seat for disconnected user ${userId}:`, error);
          }

          // Remove the disconnected userId from the requested array
          try {
            const updatedLiveUser = await LiveStreamer.findOneAndUpdate(
              { "requested.userId": userId },
              {
                $set: {
                  "requested.$.userId": null,
                  "requested.$.name": "",
                  "requested.$.userName": "",
                  "requested.$.image": "",
                  "requested.$.isProfilePicBanned": false,
                  "requested.$.gender": "",
                  "requested.$.age": 0,
                  "requested.$.countryFlagImage": "",
                  "requested.$.country": "",
                  "requested.$.avtarFrameType": 0,
                  "requested.$.avtarFrame": "",
                  "requested.$.uniqueId": "",
                  "requested.$.isVerified": false,
                  "requested.$.agoraUid": "",
                  "requested.$.isMute": 0,
                  "requested.$.isRequested": false,
                  "requested.$.isAccepted": false,
                  "requested.$.isInvited": false,
                  "requested.$.isCameraEnabled": true,
                  "requested.$.hostAcceptedViaRequest": false,
                  "requested.$.isSendrequestByHost": false,
                  "requested.$.position": 0,
                  "requested.$.coin": 0,
                },
              },
              {
                new: true,
                projection: { _id: 1, requested: 1 },
              },
            );

            if (updatedLiveUser) {
              io.in(updatedLiveUser._id.toString()).emit("callJoinRequestsRefreshed", updatedLiveUser);

              const emittingSocketCount = io.sockets.adapter.rooms.get(updatedLiveUser._id.toString())?.size || 0;

              console.log(`✅ Disconnected user ${userId} removed from requested in room ${updatedLiveUser._id}`);
              console.log(`[callJoinRequestsRefreshed] Emitting to ${emittingSocketCount} sockets.`);
            } else {
              console.warn(`⚠️ No matching LiveStreamer found for requested userId: ${userId}`);
            }
          } catch (error) {
            console.error(`❌ Error while updating requested array for disconnected user ${userId}:`, error);
          }

          //Check if the user was a viewer in a live room
          try {
            const viewerEntry = await LiveStreamerView.findOne({ userId }).lean();

            if (viewerEntry) {
              const { liveStreamerId } = viewerEntry;
              console.log(`[Disconnected user] Viewer found: removing user ${userId} from LiveStreamerView of ${liveStreamerId}`);

              await LiveStreamerView.deleteOne({ _id: viewerEntry._id });

              const [updatedViewCount, viewersList] = await Promise.all([
                LiveStreamerView.countDocuments({ liveStreamerId }),
                LiveStreamerView.find({ liveStreamerId }).select("userId name userName image isProfilePicBanned avtarFrame").lean(),
              ]);

              io.in(liveStreamerId.toString()).emit("reduceLiveJoiners", updatedViewCount);
              io.in(liveStreamerId.toString()).emit("liveViewersList", viewersList);

              await LiveStreamer.updateOne({ _id: liveStreamerId }, { $set: { view: updatedViewCount } });

              const socketCount = io.sockets.adapter.rooms.get(liveStreamerId.toString())?.size || 0;
              console.log(`[Disconnected user] Emitted updated viewer count (${updatedViewCount}) to ${socketCount} sockets`);
            } else {
              console.log(`[Disconnected user] User ${userId} was not a viewer in any room`);
            }
          } catch (err) {
            console.error("❌ Error while reducing live joiners:", err);
          }

          if (user.isLive && user.liveHistoryId && user.liveHistoryId !== null) {
            const [liveHistory, liveUser] = await Promise.all([
              LiveStreamerHistory.findById(user.liveHistoryId).select("_id startTime endTime duration").lean(),
              LiveStreamer.findOne({ _id: user.liveStreamerId, userId }).select("_id isAudio roomImage").lean(),
            ]);

            if (liveUser) {
              if (liveUser.isAudio) {
                // Emit for audio live
                io.in(user.liveStreamerId.toString()).emit("audioStreamUserLeft", `User ${user.name} left the audio live room.`);
                console.log(`🔊 Audio Live: Emitted audioStreamUserLeft event for ${user.name}`);
              } else {
                // Emit for video live
                io.in(user.liveStreamerId.toString()).emit("videoStreamUserLeft", `User ${user.name} left the video live room.`);
                console.log(`📹 Video Live: Emitted videoStreamUserLeft event for ${user.name}`);
              }
            }

            if (liveUser && !liveUser.isAudio) {
              const sockets = await io.in(user.liveStreamerId.toString()).fetchSockets();
              console.log(`🔄 Active sockets in room (${user.liveStreamerId.toString()}): ${sockets.length}`);

              if (sockets.length) {
                io.socketsLeave(user.liveStreamerId.toString());
                console.log(`✅ All sockets removed from room: ${user.liveStreamerId.toString()}`);
              } else {
                console.log("⚠️ No active sockets found to remove.");
              }

              if (liveUser && liveUser.roomImage) {
                const roomImage = liveUser?.roomImage;
                if (roomImage) {
                  deleteFile(roomImage);
                  console.log(`✅ Room image deleted: ${liveUser.roomImage}`);
                }
              }

              await LiveStreamer.deleteOne({ userId, liveHistoryId: user.liveHistoryId });
              console.log(`✅ LiveStreamer entry deleted for userId: ${userId}`);
            } else {
              console.log("🔊 liveUser.isAudio is true, skipping LiveStreamer deletion.");

              await LiveStreamer.updateOne(
                { userId, liveHistoryId: user.liveHistoryId },
                {
                  $set: {
                    liveHistoryId: null,
                    isHostActiveInRoom: false,
                    // agoraUid: 0,
                    // channel: "",
                    // token: "",
                  },
                },
              );

              console.log(`✅ LiveStreamer updated for userId: ${userId}`);
            }

            const endTime = moment().tz("Asia/Kolkata").format();

            const start = moment.tz(liveHistory.startTime, "Asia/Kolkata");
            const end = moment.tz(endTime, "Asia/Kolkata");
            const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
            const durationInMinutes = Math.floor(moment.duration(end.diff(start)).asMinutes());

            await Promise.all([
              LiveStreamerHistory.updateOne({ _id: liveHistory?._id }, { $set: { endTime, duration } }),
              User.updateOne(
                { _id: user._id },
                {
                  $set: {
                    isOnline: false,
                    isLive: false,
                    isBusy: false,
                    liveHistoryId: null,
                    liveStreamerId: null,
                  },
                },
              ),
              liveUser && !liveUser.isAudio ? LiveStreamerView.deleteMany({ liveStreamerId: user.liveStreamerId }) : Promise.resolve(),
              liveUser && !liveUser.isAudio ? LiveStreamComment.deleteMany({ liveStreamerId: user.liveStreamerId }) : Promise.resolve(),
              liveUser && !liveUser.isAudio ? TopGifter.deleteMany({ liveHistoryId: user.liveHistoryId }) : Promise.resolve(),
              clearLiveChatReferences([user.liveStreamerId], [user.liveHistoryId]),
              hostTargetEngine.updateLiveProgress(user._id, durationInMinutes),
            ]);

            console.log(`✅ User ${user?.name} is no longer live.`);
            console.log("✅ Related liveViews deleted.");
          }

          if (user.callId && user.callId !== null) {
            const callId = new mongoose.Types.ObjectId(user.callId);
            console.log(`📞 User was in an active call. Ending Call ID: ${callId}`);

            io.socketsLeave(user.callId.toString());

            const [callHistory] = await Promise.all([
              History.findById(callId).select("_id callStartTime"),
              Privatecall.deleteOne({ $or: [{ caller: id }, { receiver: id }] }),
              User.updateOne(
                { _id: userId },
                {
                  $set: {
                    isOnline: false,
                    isBusy: false,
                    callId: null,
                  },
                },
              ),
            ]);

            if (callHistory) {
              //callHistory.callConnect = false;
              callHistory.callEndTime = moment().tz("Asia/Kolkata").format();

              const start = moment.tz(callHistory.callStartTime, "Asia/Kolkata");
              const end = moment.tz(callHistory.callEndTime, "Asia/Kolkata");
              const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
              callHistory.duration = duration;

              await Promise.all([
                callHistory?.save(),
                Chat.findOneAndUpdate(
                  { callId: callHistory._id },
                  {
                    $set: {
                      callDuration: duration,
                      messageType: 3,
                      callType: 1, // 1 = Received Call
                      isRead: true,
                    },
                  },
                  { new: true },
                ),
              ]);
            }
          }

          await User.updateOne(
            { _id: userId },
            {
              $set: {
                isOnline: false,
                isBusy: false,
                isLive: false,
                liveHistoryId: null,
                liveStreamerId: null,
                callId: null,
              },
            },
          );
        }
      }
    }
  });
});
