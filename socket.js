///import model
const User = require("./models/user.model");

//Tencent TRTC utility
const { buildTencentBlock, isTencentEnabled } = require("./util/tencentUserSig");
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
const FollowerFollowing = require("./models/followerFollowing.model");

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

//pk session lifecycle
const { PK_STATUS, getSessionForHost, buildPkPayload, computeDuration, createPkSession, setStartRequest, startPkRound, endPkRound, endPkSession } = require("./util/pkSession");
const { getPkAvailabilityFor, UNAVAILABLE_MESSAGE } = require("./util/pkAvailability");

// ==================== RECONNECTION GRACE PERIOD ====================
// Store pending disconnects with timeouts for hosts
// Key: `host:${userId}`, Value: { timeout, liveHistoryId, liveStreamerId, timestamp }
const pendingHostDisconnects = new Map();

// Grace period in milliseconds (30 seconds by default)
const HOST_RECONNECT_GRACE_PERIOD = 30 * 1000;

// Schedule a pending disconnect for a host
function schedulePendingHostDisconnect(userId, liveHistoryId, liveStreamerId, cleanupCallback) {
  const key = `host:${userId}`;

  // Cancel any existing pending disconnect
  cancelPendingHostDisconnect(userId);

  console.log(`⏳ [RECONNECT] Host ${userId} disconnected. Waiting ${HOST_RECONNECT_GRACE_PERIOD / 1000}s for reconnection...`);

  const timeout = setTimeout(async () => {
    try {
      console.log(`⌛ [RECONNECT] Grace period expired for host ${userId}. Ending live stream.`);
      pendingHostDisconnects.delete(key);
      await cleanupCallback();
    } catch (error) {
      console.error(`❌ [RECONNECT] Error during cleanup for host ${userId}:`, error);
    }
  }, HOST_RECONNECT_GRACE_PERIOD);

  pendingHostDisconnects.set(key, {
    timeout,
    liveHistoryId,
    liveStreamerId,
    timestamp: Date.now(),
  });
  console.log(`[schedulePendingHostDisconnect] Timer scheduled with key: ${key}, all keys: [${Array.from(pendingHostDisconnects.keys()).join(', ')}]`);
}

// Cancel a pending disconnect (called when host reconnects)
function cancelPendingHostDisconnect(userId) {
  const key = `host:${userId}`;
  const pending = pendingHostDisconnects.get(key);

  if (pending) {
    clearTimeout(pending.timeout);
    pendingHostDisconnects.delete(key);
    console.log(`✅ [RECONNECT] Host ${userId} reconnected! Cancelled pending disconnect.`);
    return true;
  }
  return false;
}

// Check if host has a pending disconnect
function hasPendingHostDisconnect(userId) {
  const key = `host:${userId}`;
  const exists = pendingHostDisconnects.has(key);
  console.log(`[hasPendingHostDisconnect] Checking key: ${key}, exists: ${exists}, all keys: [${Array.from(pendingHostDisconnects.keys()).join(', ')}]`);
  return exists;
}
// ==================== END RECONNECTION GRACE PERIOD ====================

// Helper function to emit personalized liveViewersList to each socket in a room
async function emitPersonalizedViewersList(io, roomId, viewersList) {
  try {
    const roomSockets = await io.in(roomId.toString()).fetchSockets();
    const viewerUserIds = viewersList.map(v => v.userId);

    for (const roomSocket of roomSockets) {
      try {
        const globalRoom = roomSocket.handshake?.query?.globalRoom;
        const socketUserId = globalRoom?.split(":")[1];

        if (!socketUserId || !mongoose.Types.ObjectId.isValid(socketUserId)) {
          roomSocket.emit("liveViewersList", viewersList.map(v => ({ ...v, isFollow: false })));
          continue;
        }

        const followingRecords = await FollowerFollowing.find({
          fromUserId: new mongoose.Types.ObjectId(socketUserId),
          toUserId: { $in: viewerUserIds }
        }).select("toUserId").lean();

        const followingSet = new Set(followingRecords.map(f => f.toUserId.toString()));

        const personalizedList = viewersList.map(viewer => ({
          ...viewer,
          isFollow: followingSet.has(viewer.userId.toString())
        }));

        roomSocket.emit("liveViewersList", personalizedList);
      } catch (err) {
        console.error("[emitPersonalizedViewersList] Error for socket:", err);
        roomSocket.emit("liveViewersList", viewersList.map(v => ({ ...v, isFollow: false })));
      }
    }
  } catch (err) {
    console.error("[emitPersonalizedViewersList] Error fetching sockets:", err);
    io.in(roomId.toString()).emit("liveViewersList", viewersList.map(v => ({ ...v, isFollow: false })));
  }
}

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

        // Cancel pending disconnect when host's socket reconnects
        if (hasPendingHostDisconnect(id)) {
          console.log(`✅ [RECONNECT] Host ${id} socket reconnected. Cancelling pending disconnect.`);
          cancelPendingHostDisconnect(id);

          // Get user's live stream info to notify viewers
          const liveHost = await User.findById(id).select("_id name liveStreamerId isLive").lean();

          if (liveHost && liveHost.isLive && liveHost.liveStreamerId) {
            const liveRoomId = liveHost.liveStreamerId.toString();

            // Rejoin the host to the live room
            if (!socket.rooms.has(liveRoomId)) {
              socket.join(liveRoomId);
              console.log(`✅ [RECONNECT] Host ${id} rejoined live room: ${liveRoomId}`);
            }

            // Notify viewers that host reconnected
            io.in(liveRoomId).emit("hostReconnected", {
              userId: id,
              name: liveHost.name,
              message: `Host ${liveHost.name} has reconnected!`
            });

            // Get and emit the co-host list (requested array) for multi-live
            const liveStreamer = await LiveStreamer.findById(liveHost.liveStreamerId)
              .select("requested liveType")
              .lean();

            if (liveStreamer && [3, 4].includes(liveStreamer.liveType)) {
              io.in(liveRoomId).emit("callJoinRequestsRefreshed", liveStreamer.requested || []);
              console.log(`✅ [RECONNECT] Emitted callJoinRequestsRefreshed for room: ${liveRoomId}`);
            }

            console.log(`✅ [RECONNECT] Host ${liveHost.name} reconnected successfully`);
          }
        } else {
          // Check if user is a co-host in any multi-live session
          const coHostLive = await LiveStreamer.findOne({
            liveType: { $in: [3, 4] },
            "requested.userId": new mongoose.Types.ObjectId(id),
            "requested.isAccepted": true,
          }).select("_id requested liveType userId").lean();

          if (coHostLive) {
            const liveRoomId = coHostLive._id.toString();

            // Rejoin co-host to the live room
            if (!socket.rooms.has(liveRoomId)) {
              socket.join(liveRoomId);
              console.log(`✅ [RECONNECT] Co-host ${id} rejoined live room: ${liveRoomId}`);
            }

            // Emit co-host list to everyone in the room
            io.in(liveRoomId).emit("callJoinRequestsRefreshed", coHostLive.requested || []);
            console.log(`✅ [RECONNECT] Co-host ${id} reconnected, emitted callJoinRequestsRefreshed for room: ${liveRoomId}`);
          }
        }
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
      return socket.emit("chatBlocked", { status: false, message: "You cannot send messages to this user. You have been blocked.", isBlocked: true });
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

      // Check if either user has blocked the other
      const isBlocked = await Block.exists({
        $or: [
          { userId: senderUser._id, toUserId: receiverUser._id },
          { userId: receiverUser._id, toUserId: senderUser._id },
        ],
      });

      if (isBlocked) {
        console.log("❌ [chatGiftMessageSent] Blocked - cannot send gift");
        socket.emit("chatGiftBlocked", { status: false, message: "You cannot send gifts to this user.", isBlocked: true });
        return;
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

      const adminRate = Math.abs(settingJSON.adminRate ?? 0);
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

      // Base update fields for every receiver - gifts go to silverCoin (not coin/gold)
      const updateFields = {
        $inc: {
          receivedCoins: receiverCoin,
          receivedGifts: giftCount,
          silverCoin: receiverCoin,
        },
      };

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
          coinType: 2, // Silver transaction (chat gift received)
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

          // Add Tencent block for each user if enabled
          if (isTencentEnabled()) {
            try {
              const callRoomId = `call_${caller._id.toString()}_${receiver._id.toString()}_${Date.now()}`;

              // Caller's Tencent block
              const callerTencentBlock = buildTencentBlock(caller._id.toString(), callRoomId, "call");

              // Receiver's Tencent block (different userSig)
              const receiverTencentBlock = buildTencentBlock(receiver._id.toString(), callRoomId, "call");

              // Notify receiver with their own userSig
              const receiverCallData = { ...dataOfVideoCall, tencent: receiverTencentBlock };
              io.in("globalRoom:" + receiver._id.toString()).emit("incomingCall", receiverCallData);

              // Notify caller with their own userSig
              const callerCallData = { ...dataOfVideoCall, tencent: callerTencentBlock };
              io.in("globalRoom:" + caller._id.toString()).emit("callStarted", callerCallData);
            } catch (tencentError) {
              console.error("Error building Tencent call blocks:", tencentError);
              // Fallback to Agora
              io.in("globalRoom:" + receiver._id.toString()).emit("incomingCall", dataOfVideoCall);
              io.in("globalRoom:" + caller._id.toString()).emit("callStarted", dataOfVideoCall);
            }
          } else {
            io.in("globalRoom:" + receiver._id.toString()).emit("incomingCall", dataOfVideoCall); // Notify receiver
            io.in("globalRoom:" + caller._id.toString()).emit("callStarted", dataOfVideoCall); // Notify caller
          }

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
        const adminRate = Math.abs(settingJSON.adminRate ?? 0);
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

          // Base update fields for every receiver - call earnings go to silverCoin (not coin/gold)
          const updateFields = {
            $inc: {
              receivedCoins: receiverCoin,
              silverCoin: receiverCoin,
            },
          };

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
                  coinType: 2, // Silver transaction (call earnings)
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

      // First get liveUser to get liveHistoryId
      const liveUser = await LiveStreamer.findOne({ _id: parsedData.liveUserObjId }).select("userId earnedCoins view liveHistoryId").lean();

      const [topGifterStats, viewersList] = await Promise.all([
        liveUser?.liveHistoryId ? TopGifter.aggregate([
          { $match: { liveHistoryId: new mongoose.Types.ObjectId(liveUser.liveHistoryId) } },
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
        ]) : Promise.resolve([]),
        LiveStreamerView.aggregate([
          {
            $match: {
              liveStreamerId: new mongoose.Types.ObjectId(parsedData.liveUserObjId),
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
      // Send top gifters only to the joining socket, not whole room
      socket.emit("topLiveStreamGifter", topGifters);
      await emitPersonalizedViewersList(io, parsedData.liveUserObjId, viewersList);
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
            isHostMuteEnabled: { $eq: [{ $ifNull: ["$hostIsMuted", 0] }, 1] },
            isCameraEnabled: { $ifNull: ["$isHostCameraEnabled", true] },
            isHostOnBreak: { $ifNull: ["$isHostOnBreak", false] },
            seat: 1,
            isPkMode: 1,
            pkId: 1,
            pkStatus: 1,
            pkRound: 1,
            pkStartRequestedBy: 1,
            host1Wins: "$pkConfig.host1Wins",
            host2Wins: "$pkConfig.host2Wins",
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
            host2AvtarFrame: { $ifNull: ["$pkConfig.host2Details.avtarFrame", ""] },
            host2AvtarFrameType: { $ifNull: ["$pkConfig.host2Details.avtarFrameType", 0] },
            host2Channel: "$pkConfig.host2Channel",
            host2LiveId: "$pkConfig.host2LiveId",
            host2ObjId: "$pkConfig.host2ObjId",
            host2TencentRoomId: "$pkConfig.host2TencentRoomId",
            host2TencentUserId: "$pkConfig.host2TencentUserId",
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
            tencent: {
              roomId: { $ifNull: ["$tencentRoomId", ""] },
              userId: { $toString: "$userId" },
            },
          },
        },
      ];

      const [liveUserInfo] = await LiveStreamer.aggregate(pipeline);

      if (!liveUserInfo) {
        return socket.emit("singleLiveUserResponse", "Live user not found.");
      }

      // Debug: Log host mute and camera status
      console.log("[fetchSingleLiveUser] isHostMuteEnabled:", liveUserInfo.isHostMuteEnabled);
      console.log("[fetchSingleLiveUser] isCameraEnabled:", liveUserInfo.isCameraEnabled);
      console.log("[fetchSingleLiveUser] isHostOnBreak:", liveUserInfo.isHostOnBreak);

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

    // Validate required fields
    if (!userId || !liveUserObjId) {
      console.log("[countLiveJoin] Missing required fields - userId:", userId, "liveUserObjId:", liveUserObjId);
      return;
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(liveUserObjId)) {
      console.log("[countLiveJoin] Invalid ObjectId format - userId:", userId, "liveUserObjId:", liveUserObjId);
      return;
    }

    const [user, liveUser, pkLiveUser, existLiveView] = await Promise.all([
      User.findById(userId)
        .select("_id name userName image isProfilePicBanned gender age countryFlagImage country uniqueId isVerified fcmToken activeAvtarFrame isBlock isPushNotificationEnabled")
        .lean(),
      LiveStreamer.findOne({ _id: liveUserObjId }).select("userId earnedCoins view hostIsMuted isHostCameraEnabled kickedUsers liveType requested").lean(),
      LiveStreamer.findOne({ _id: liveUserObjId, isPkMode: true }).select("pkEndTime pkStatus pkId pkConfig.host1LiveId pkConfig.host2LiveId").lean(),
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

    // Check if this is the host rejoining (reconnection scenario)
    // For multi-live (liveType 3) and call-join (liveType 4), check both main host AND co-hosts in requested array
    const isMainHost = liveUser.userId?.toString() === userId.toString();
    const isCoHost = [3, 4].includes(liveUser.liveType) && liveUser.requested?.some(
      (req) => req.userId?.toString() === userId.toString() && req.isAccepted === true
    );
    const isHost = isMainHost || isCoHost;

    // Debug logging for reconnection
    console.log(`[countLiveJoin] 🔍 Reconnection check - userId: ${userId}, liveUser.userId: ${liveUser.userId}, isMainHost: ${isMainHost}, isCoHost: ${isCoHost}, isHost: ${isHost}`);
    console.log(`[countLiveJoin] 🔍 hasPendingHostDisconnect(${userId}): ${hasPendingHostDisconnect(userId)}`);

    if (isHost && hasPendingHostDisconnect(userId)) {
      console.log(`[countLiveJoin] ✅ Cancelling pending disconnect for host ${userId}`);
      cancelPendingHostDisconnect(userId);

      // Notify viewers that host reconnected
      io.in(liveUserObjId).emit("hostReconnected", {
        userId: userId,
        name: user.name,
        message: `Host ${user.name} has reconnected!`
      });
      console.log(`[countLiveJoin] ✅ Host ${userId} reconnected via countLiveJoin`);
    }

    // Check if user is blocked by the host
    const isBlockedByHost = await Block.exists({ userId: liveUser.userId, toUserId: new mongoose.Types.ObjectId(userId) });
    if (isBlockedByHost) {
      console.log(`[countLiveJoin] User ${userId} is blocked by host ${liveUser.userId}`);
      socket.emit("blockedFromLive", { message: "You are blocked from this live stream." });
      return;
    }

    // Check if user was kicked from THIS specific live session
    // Kicked users cannot rejoin the same live session, but can join new sessions by the same host
    const isKickedFromSession = liveUser.kickedUsers?.some(
      (kicked) => kicked.kickedUserId?.toString() === userId.toString()
    );
    if (isKickedFromSession) {
      console.log(`[countLiveJoin] User ${userId} was kicked from this live session`);
      socket.emit("kickedFromLive", {
        liveUserObjId: liveUserObjId,
        liveHistoryId: liveHistoryId,
        reason: "kicked",
        message: "You have been kicked from this live session and cannot rejoin."
      });
      return;
    }

    const isNewJoin = !socket.rooms.has(liveUserObjId);
    if (isNewJoin) {
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
      const duration = computeDuration(pkLiveUser); //0 while in the lobby

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
    } else if (!existLiveView.liveUserId) {
      // Fix: Update liveUserId if it's missing (for old records)
      console.log("[countLiveJoin] Updating existing LiveView entry with liveUserId");
      await LiveStreamerView.updateOne(
        { _id: existLiveView._id },
        { $set: { liveUserId: liveUser.userId } }
      );
    }

    const matchStage = liveHistoryId && liveHistoryId !== ""
      ? { $match: { liveHistoryId: new mongoose.Types.ObjectId(liveHistoryId) } }
      : { $match: { liveStreamerId: new mongoose.Types.ObjectId(liveUserObjId) } };

    const [totalViews, viewersList, seatedUsers, topGifterStats, updatedLiveUser] = await Promise.all([
      LiveStreamerView.countDocuments({ liveStreamerId: liveUserObjId }),
      LiveStreamerView.aggregate([
        {
          $match: {
            liveStreamerId: new mongoose.Types.ObjectId(liveUserObjId),
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

    // Send top gifters directly to the new viewer (not whole room)
    socket.emit("topLiveStreamGifter", topGifters);
    io.in(liveUserObjId).emit("countLiveJoin", totalViews);

    // Enhanced userJoinedLive with full user details for clickable system messages
    const userJoinedData = {
      ...dataOfaddView,
      isHost: isHost,
      user: {
        _id: user._id,
        userId: user._id,
        name: user.name,
        userName: user.userName,
        image: user.image,
        isProfilePicBanned: user.isProfilePicBanned,
        gender: user.gender,
        age: user.age,
        countryFlagImage: user.countryFlagImage,
        country: user.country,
        uniqueId: user.uniqueId,
        isVerified: user.isVerified,
        avtarFrame: avtarFrameImage,
        avtarFrameType: avtarFrameType,
      }
    };
    io.in(liveUserObjId).emit("userJoinedLive", userJoinedData);
    io.in(liveUserObjId).emit("seatedUsersUpdate", seatedUsers);
    io.in(liveUserObjId).emit("fireEntryEffect", entryEffect);

    // Emit singleLiveUserResponse with hostIsMuted and hostCamera to the joining viewer
    const objId = new mongoose.Types.ObjectId(liveUserObjId);
    const requestingUserId = new mongoose.Types.ObjectId(userId);

    const singleLiveUserPipeline = [
      { $match: { _id: objId } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, userName: 1, image: 1, isProfilePicBanned: 1, countryFlagImage: 1, country: 1, uniqueId: 1, coin: 1, isVerified: 1, isFake: 1, wealthLevel: 1, activeAvtarFrame: 1, isBlock: 1 } }],
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
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: requestingUserId } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "isFollow",
        },
      },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "pkConfig.host2Id",
          foreignField: "toUserId",
          pipeline: [{ $match: { fromUserId: requestingUserId } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "host2IsFollow",
        },
      },
      {
        $project: {
          _id: 1, token: 1, channel: 1, agoraUid: 1, liveHistoryId: 1, view: 1, liveType: 1, isAudio: 1, audioLiveType: 1, privateCode: 1, roomName: 1, roomWelcome: 1, roomImage: 1,
          isHostMuteEnabled: { $eq: [{ $ifNull: ["$hostIsMuted", 0] }, 1] },
          isCameraEnabled: { $ifNull: ["$isHostCameraEnabled", true] },
          isHostOnBreak: { $ifNull: ["$isHostOnBreak", false] },
          seat: 1, isPkMode: 1, pkId: 1, pkStatus: 1, pkRound: 1, pkStartRequestedBy: 1, host1Wins: "$pkConfig.host1Wins", host2Wins: "$pkConfig.host2Wins", userId: 1, bgTheme: 1,
          name: "$user.name", userName: "$user.userName", image: "$user.image", isProfilePicBanned: "$user.isProfilePicBanned",
          countryFlagImage: "$user.countryFlagImage", country: "$user.country", uniqueId: "$user.uniqueId", coin: "$user.coin", isVerified: "$user.isVerified", isFake: "$user.isFake",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          host2Id: "$pkConfig.host2Id", host2UniqueId: "$pkConfig.host2UniqueId", host2Name: "$pkConfig.host2Name", host2userName: "$pkConfig.host2userName", host2Image: "$pkConfig.host2Image",
          host2isProfilePicBanned: "$pkConfig.host2Details.isProfilePicBanned", host2Coin: "$pkConfig.host2Details.coin", host2wealthLevelImage: "$pkConfig.host2Details.wealthLevelImage",
          host2AvtarFrame: { $ifNull: ["$pkConfig.host2Details.avtarFrame", ""] }, host2AvtarFrameType: { $ifNull: ["$pkConfig.host2Details.avtarFrameType", 0] },
          host2Channel: "$pkConfig.host2Channel", host2LiveId: "$pkConfig.host2LiveId", host2ObjId: "$pkConfig.host2ObjId",
          host2TencentRoomId: "$pkConfig.host2TencentRoomId", host2TencentUserId: "$pkConfig.host2TencentUserId",
          localRank: "$pkConfig.localRank", localGiftCount: "$pkConfig.localGiftCount", remoteRank: "$pkConfig.remoteRank", remoteGiftCount: "$pkConfig.remoteGiftCount",
          host2IsFollow: { $gt: [{ $size: "$host2IsFollow" }, 0] },
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          viewers: { $ifNull: ["$viewers", []] },
          streamSource: { $ifNull: ["$streamSource", ""] },
          pkThumbnails: { $ifNull: ["$pkThumbnails", []] },
          pkStreamSources: { $ifNull: ["$pkStreamSources", []] },
          admins: { $map: { input: { $ifNull: ["$admins", []] }, as: "admin", in: "$$admin.adminUserId" } },
          tencent: { roomId: { $ifNull: ["$tencentRoomId", ""] }, userId: { $toString: "$userId" } },
        },
      },
    ];

    // Only emit singleLiveUserResponse for NEW viewers joining the room
    if (isNewJoin) {
      const [singleLiveUserInfo] = await LiveStreamer.aggregate(singleLiveUserPipeline);
      if (singleLiveUserInfo) {
        singleLiveUserInfo.isHost = isHost;
        socket.emit("singleLiveUserResponse", singleLiveUserInfo);
        console.log(`[countLiveJoin] Emitted singleLiveUserResponse to ${isHost ? 'HOST' : 'viewer'} ${userId}: isHost=${isHost}`);
      }
    }

    // Emit personalized liveViewersList to each socket
    await emitPersonalizedViewersList(io, liveUserObjId, viewersList);

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
        LiveStreamer.findOne({ _id: liveUserObjId }).select("_id view userId").lean(),
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
        LiveStreamerView.aggregate([
          { $match: { liveStreamerId: new mongoose.Types.ObjectId(liveUserObjId) } },
          {
            $project: {
              userId: 1,
              name: 1,
              userName: 1,
              image: 1,
              isProfilePicBanned: 1,
              avtarFrame: 1,
            },
          },
        ]),
      ]);

      console.log(`[reduceLiveJoiners] Updated total viewers for ${liveUserObjId}:`, totalViews);

      io.in(liveUserObjId).emit("reduceLiveJoiners", totalViews);
      await emitPersonalizedViewersList(io, liveUserObjId, viewersList);

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

      // Send notifications to mentioned users
      const { mentionedUserNames, senderName, senderUserId, senderImage } = dataOfComment;
      if (mentionedUserNames && mentionedUserNames.length > 0) {
        console.log(`[broadcastLiveComment] Mentioned users: ${mentionedUserNames.join(", ")}`);

        // Find mentioned users by userName
        const mentionedUsers = await User.find({
          userName: { $in: mentionedUserNames },
          _id: { $ne: senderUserId }, // Don't notify the sender
          isBlock: false,
        }).select("_id userName fcmToken isPushNotificationEnabled").lean();

        console.log(`[broadcastLiveComment] Found ${mentionedUsers.length} users to notify`);

        const notificationTitle = `${senderName} mentioned you!`;
        const notificationMessage = `${senderName} mentioned you in a live stream comment`;

        // Send push notification and save to DB for each mentioned user
        const adminPromise = await admin;
        for (const mentionedUser of mentionedUsers) {
          try {
            // Save notification to database
            const notification = new Notification();
            notification.userId = mentionedUser._id;
            notification.otherUserId = senderUserId;
            notification.title = notificationTitle;
            notification.message = notificationMessage;
            notification.image = senderImage || "";
            notification.date = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
            await notification.save();

            // Send FCM push notification if enabled
            if (mentionedUser.isPushNotificationEnabled && mentionedUser.fcmToken) {
              const payload = {
                token: mentionedUser.fcmToken,
                notification: {
                  title: notificationTitle,
                  body: notificationMessage,
                },
                data: {
                  type: "LIVE_MENTION",
                  liveUserObjId: String(liveUserObjId),
                  liveHistoryId: String(liveHistoryId),
                  senderUserId: String(senderUserId),
                  senderName: String(senderName || ""),
                },
              };

              adminPromise
                .messaging()
                .send(payload)
                .then((response) => {
                  console.log(`[broadcastLiveComment] Push sent to @${mentionedUser.userName}:`, response);
                })
                .catch((err) => {
                  console.error(`[broadcastLiveComment] Push error to @${mentionedUser.userName}:`, err.message);
                });
            }

            console.log(`[broadcastLiveComment] Notification saved for @${mentionedUser.userName}`);
          } catch (notifError) {
            console.error(`[broadcastLiveComment] Failed to notify @${mentionedUser.userName}:`, notifError.message);
          }
        }
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

      const adminRate = Math.abs(settingJSON.adminRate ?? 0);
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

        // Base update fields for every receiver - gifts go to silverCoin (not coin/gold)
        const updateFields = {
          $inc: {
            receivedCoins: receiverCoin,
            receivedGifts: giftCount,
            silverCoin: receiverCoin,
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
            coinType: 2, // Silver transaction (gift received)
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

      // Validate required fields
      if (!userId || !liveHistoryId || !liveUserObjId) {
        console.log("⚠️ [endLiveStream] Missing required fields");
        return;
      }

      // Cancel any pending disconnect since host is intentionally ending
      cancelPendingHostDisconnect(userId.toString());

      // Convert to ObjectId
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const liveHistoryObjectId = new mongoose.Types.ObjectId(liveHistoryId);

      const [user, liveUser, liveHistory] = await Promise.all([
        User.findOne({ _id: userObjectId, liveHistoryId: liveHistoryObjectId }).select("_id isLive isBusy liveHistoryId name").lean(),
        LiveStreamer.findOne({ userId: userObjectId, liveHistoryId: liveHistoryObjectId }).select("_id userId liveHistoryId isAudio roomImage isPkMode pkId").lean(),
        LiveStreamerHistory.findById(liveHistoryObjectId).select("_id startTime").lean(),
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

      // Delete LiveStreamer if it exists (don't check user.isLive as it may be false from disconnect)
      if (liveUser) {
        // Release the PK partner first so they return to a solo live
        if (liveUser.isPkMode && liveUser.pkId) {
          await endPkSession(liveUser.pkId, {
            reason: "host_left",
            endedBy: userId,
            legacyPkEnd: { isManualMode: true, pkEndUserId: userId },
          });
        }

        // Emit endLiveStream FIRST before removing sockets from room
        io.in(liveUserObjId).emit("endLiveStream", parsedData);
        console.log(`📢 Emitted endLiveStream to room: ${liveUserObjId}`);

        if (!liveUser.isAudio) {
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

          await LiveStreamer.deleteOne({ _id: liveUser._id });
          console.log(`✅ LiveStreamer entry deleted for userId: ${userId}`);
        } else {
          console.log("🔊 liveUser.isAudio is true, skipping LiveStreamer deletion.");

          await LiveStreamer.updateOne(
            { _id: liveUser._id },
            {
              $set: {
                liveHistoryId: null,
                isHostActiveInRoom: false,
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
          liveUser && !liveUser.isAudio ? LiveStreamerView.deleteMany({ liveStreamerId: liveUser._id }) : Promise.resolve(),
          liveUser && !liveUser.isAudio ? LiveStreamComment.deleteMany({ liveStreamerId: liveUser._id }) : Promise.resolve(),
          liveUser && !liveUser.isAudio ? TopGifter.deleteMany({ liveHistoryId: liveHistory._id }) : Promise.resolve(),
          clearLiveChatReferences([liveUser._id], [liveHistory._id]),
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

      const senderId = parseData.host1Id || parseData.HOST_1_ID;
      const receiverId = parseData.host2Id || parseData.HOST_2_ID;

      if (parseData.InstantCutRequestByHost) {
        console.info("[PK_REQUEST] Instant Cut Request By Host:", parseData.InstantCutRequestByHost);

        io.in("globalRoom:" + String(receiverId)).emit("pkRequestReceived", data);
      } else {
        //Refuse invitations that cannot be accepted (sender not in a video live / in PK, invitee offline, not live, in PK or blocked)
        const [targetRow, senderRow] = await Promise.all([getPkAvailabilityFor(receiverId, { requesterId: senderId }), getPkAvailabilityFor(senderId)]);

        if (!senderRow.isAvailable) {
          console.info("[PK_REQUEST] Sender not available:", senderRow.unavailableReason);
          socket.emit("pkError", { event: "pkRequest", message: "You must be in a video live and not in a PK session to send an invitation.", unavailableReason: senderRow.unavailableReason });
          return;
        }

        if (!targetRow.isAvailable) {
          console.info("[PK_REQUEST] Invitee not available:", targetRow.unavailableReason);
          socket.emit("pkError", { event: "pkRequest", message: UNAVAILABLE_MESSAGE[targetRow.unavailableReason] || "This host is not available for PK.", unavailableReason: targetRow.unavailableReason });
          return;
        }

        console.info("[PK_REQUEST] Forwarding invitation to host2");

        io.in("globalRoom:" + String(receiverId)).emit("pkRequestReceived", data);
      }

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

  //pk: the challenger withdraws a pending invitation so the invitee app can dismiss the dialog
  socket.on("pkCancelRequest", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      const host1Id = String(parsedData?.host1Id || parsedData?.HOST_1_ID || id);
      const host2Id = String(parsedData?.host2Id || parsedData?.HOST_2_ID || "");
      console.log("[pkCancelRequest] Received data:", parsedData, "from:", id);

      if (!mongoose.Types.ObjectId.isValid(host2Id)) {
        return socket.emit("pkError", { event: "pkCancelRequest", message: "host2Id must be needed." });
      }

      if (host1Id !== String(id)) {
        return socket.emit("pkError", { event: "pkCancelRequest", message: "Only the challenger can cancel the invitation." });
      }

      io.in("globalRoom:" + host2Id).emit("pkRequestCancelled", { host1Id, host2Id });

      const receiverUser = await User.findById(host2Id).select("_id isPushNotificationEnabled isBlock fcmToken").lean();

      if (receiverUser && receiverUser.isPushNotificationEnabled && !receiverUser.isBlock && receiverUser.fcmToken) {
        const adminPromise = await admin;
        adminPromise
          .messaging()
          .send({
            token: receiverUser.fcmToken,
            data: { type: "PK_REQUEST_CANCELLED", host1Id, host2Id }, //data-only: the app only needs to dismiss the dialog
          })
          .then((response) => console.log("[pkCancelRequest] Notification sent:", response))
          .catch((error) => console.error("[pkCancelRequest] Error sending notification:", error));
      }
    } catch (error) {
      console.error("Error in pkCancelRequest:", error);
    }
  });

  socket.on("pkAnswer", async (data) => {
    try {
      const parseData = JSON.parse(data);
      console.log("Received pkAnswer event with data:", parseData);

      const [user1, user2, liveStreamer1, liveStreamer2] = await Promise.all([
        User.findById(parseData.HOST_1_ID)
          .select("_id name userName coin image isProfilePicBanned isVerified gender age countryFlagImage country uniqueId isPushNotificationEnabled isBlock fcmToken")
          .lean(),
        User.findById(parseData.HOST_2_ID)
          .select("_id name userName coin image isProfilePicBanned isVerified gender age countryFlagImage country uniqueId isPushNotificationEnabled isBlock fcmToken")
          .lean(),
        LiveStreamer.findOne({ userId: parseData.HOST_1_ID }).select("tencentRoomId tencentUserId").lean(),
        LiveStreamer.findOne({ userId: parseData.HOST_2_ID }).select("tencentRoomId tencentUserId").lean(),
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

        const hostA = {
          id: parseData.HOST_1_ID,
          name: parseData.HOST_1_NAME,
          userName: parseData.HOST_1_USERNAME,
          image: parseData.HOST_1_IMAGE,
          uniqueId: parseData.HOST_1_UNIQUEID,
          liveObjId: parseData.HOST_1_LIVEUSER_OBJ_ID,
          liveHistoryId: parseData.HOST_1_LIVEID,
          channel: parseData.HOST_1_CHANNEL,
          agoraUid: parseData.HOST_1_AGORA_ID,
          tencentUserId: liveStreamer1?.tencentUserId || "",
          tencentRoomId: liveStreamer1?.tencentRoomId || "",
          details: host1Details,
        };

        const hostB = {
          id: parseData.HOST_2_ID,
          name: parseData.HOST_2_NAME,
          userName: parseData.HOST_2_USERNAME,
          image: parseData.HOST_2_IMAGE,
          uniqueId: parseData.HOST_2_UNIQUEID,
          liveObjId: parseData.HOST_2_LIVEUSER_OBJ_ID,
          liveHistoryId: parseData.HOST_2_LIVEID,
          channel: parseData.HOST_2_CHANNEL,
          agoraUid: parseData.HOST_2_AGORA_ID,
          tencentUserId: liveStreamer2?.tencentUserId || "",
          tencentRoomId: liveStreamer2?.tencentRoomId || "",
          details: host2Details,
        };

        //Both hosts enter the lobby (pkStatus "lobby", no timer). A round starts via pkStartRequest / pkStartAnswer.
        const session = await createPkSession({ pkId, hosts: [hostA, hostB] });

        if (!session) {
          socket.emit("singleLiveUserResponse", "PK Mode initiation failed: One or both hosts are either not live, already in a PK session, or using an unsupported liveType.");

          console.log("PK Mode initiation failed: One or both hosts are either not live, already in a PK session, or using an unsupported liveType.");
          return;
        }

        const [liveUser1, liveUser2] = session;
        const [responseForUser1, responseForUser2] = await Promise.all([buildPkPayload(liveUser1), buildPkPayload(liveUser2)]);

        //Each live room receives its own document (duration 0 while in the lobby)
        io.in(parseData.HOST_1_LIVEUSER_OBJ_ID).emit("pkAnswer", { data, response: responseForUser1 });
        io.in(parseData.HOST_2_LIVEUSER_OBJ_ID).emit("pkAnswer", { data, response: responseForUser2 });

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
                body: `🏆 ${host2Name} accepted your PK challenge! You are both in the PK lobby, press Start PK when ready 🔥🎬`,
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
    } catch (error) {
      console.error("Error in pkAnswer:", error);
    }
  });

  //pk: a host asks to start a round while in the lobby. The opponent must accept via pkStartAnswer.
  socket.on("pkStartRequest", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      const pkId = parsedData?.pkId;
      console.log("[pkStartRequest] Received data:", parsedData, "from:", id);

      const session = await getSessionForHost(pkId, id);
      if (!session) {
        return socket.emit("pkError", { event: "pkStartRequest", message: "You are not a host of this PK session." });
      }

      const { ownDoc, opponentDoc } = session;

      if (ownDoc.pkStatus !== PK_STATUS.LOBBY) {
        return socket.emit("pkError", { event: "pkStartRequest", message: "A round is already running." });
      }

      if (!opponentDoc) {
        await endPkSession(pkId, { reason: "partner_missing", endedBy: id });
        return socket.emit("pkError", { event: "pkStartRequest", message: "Your opponent is no longer live." });
      }

      const opponentId = opponentDoc.userId.toString();
      const pendingBy = ownDoc.pkStartRequestedBy ? ownDoc.pkStartRequestedBy.toString() : "";

      //Both hosts pressed Start: mutual consent, start right away
      if (pendingBy && pendingBy === opponentId) {
        const started = await startPkRound(pkId, { startedBy: id });
        if (!started) socket.emit("pkError", { event: "pkStartRequest", message: "Round could not be started." });
        return;
      }

      await setStartRequest(pkId, id);

      io.in("globalRoom:" + opponentId).emit("pkStartRequested", {
        pkId: String(pkId),
        requestedBy: id,
        name: ownDoc.pkConfig?.host1Name || "",
        image: ownDoc.pkConfig?.host1Image || "",
      });
    } catch (error) {
      console.error("Error in pkStartRequest:", error);
    }
  });

  //pk: the opponent accepts or rejects a pending start request
  socket.on("pkStartAnswer", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      const pkId = parsedData?.pkId;
      const isAccept = !!parsedData?.isAccept;
      console.log("[pkStartAnswer] Received data:", parsedData, "from:", id);

      const session = await getSessionForHost(pkId, id);
      if (!session) {
        return socket.emit("pkError", { event: "pkStartAnswer", message: "You are not a host of this PK session." });
      }

      const { ownDoc, opponentDoc } = session;

      if (ownDoc.pkStatus !== PK_STATUS.LOBBY) {
        return socket.emit("pkError", { event: "pkStartAnswer", message: "A round is already running." });
      }

      const pendingBy = ownDoc.pkStartRequestedBy ? ownDoc.pkStartRequestedBy.toString() : "";
      if (!opponentDoc || !pendingBy || pendingBy !== opponentDoc.userId.toString()) {
        return socket.emit("pkError", { event: "pkStartAnswer", message: "No pending start request from your opponent." });
      }

      if (!isAccept) {
        await setStartRequest(pkId, null);
        io.in("globalRoom:" + pendingBy).emit("pkStartRejected", { pkId: String(pkId), rejectedBy: id });
        return;
      }

      const started = await startPkRound(pkId, { startedBy: pendingBy });
      if (!started) socket.emit("pkError", { event: "pkStartAnswer", message: "Round could not be started." });
    } catch (error) {
      console.error("Error in pkStartAnswer:", error);
    }
  });

  //pk: end the current round only; both hosts return to the lobby of the same session
  socket.on("pkEndRound", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      const pkId = parsedData?.pkId;
      console.log("[pkEndRound] Received data:", parsedData, "from:", id);

      const session = await getSessionForHost(pkId, id);
      if (!session) {
        return socket.emit("pkError", { event: "pkEndRound", message: "You are not a host of this PK session." });
      }

      if (session.ownDoc.pkStatus !== PK_STATUS.ROUND) {
        return socket.emit("pkError", { event: "pkEndRound", message: "No round is running." });
      }

      const ended = await endPkRound(pkId, { reason: "manual", endedBy: id });
      if (!ended) socket.emit("pkError", { event: "pkEndRound", message: "Round already ended." });
    } catch (error) {
      console.error("Error in pkEndRound:", error);
    }
  });

  //pk: end the whole session (lobby or mid-round); both hosts return to their solo lives
  socket.on("pkEndSession", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      const pkId = parsedData?.pkId;
      console.log("[pkEndSession] Received data:", parsedData, "from:", id);

      const session = await getSessionForHost(pkId, id);
      if (!session) {
        return socket.emit("pkError", { event: "pkEndSession", message: "You are not a host of this PK session." });
      }

      const ended = await endPkSession(pkId, { reason: "manual", endedBy: id, legacyPkEnd: { isManualMode: false, pkEndUserId: id } });
      if (!ended) socket.emit("pkError", { event: "pkEndSession", message: "Session already ended." });
    } catch (error) {
      console.error("Error in pkEndSession:", error);
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
      LiveStreamer.findOne({ userId: giftData.receiverUserId, isPkMode: true }).select("liveHistoryId pkConfig pkEndTime pkId pkStatus").lean(),
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

      const adminRate = Math.abs(settingJSON.adminRate ?? 0);
      let adminCoin = Math.round((totalCoin * adminRate) / 100);
      let receiverCoin = totalCoin - adminCoin;

      const [liveUser1, liveUser2, existing] = await Promise.all([
        LiveStreamer.findOne({ userId: receiverPkLiveUser.pkConfig.host1Id, isPkMode: true, pkId: receiverPkLiveUser.pkId }).select("pkConfig pkEndTime pkStatus").lean(), //same as receiverPkLiveUser
        LiveStreamer.findOne({ userId: receiverPkLiveUser.pkConfig.host2Id, isPkMode: true, pkId: receiverPkLiveUser.pkId }).select("pkConfig pkEndTime pkStatus").lean(),
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

      //Scores only move while a round is running (lobby gifts still pay out below, but are not counted)
      const roundFilter = { pkId: receiverPkLiveUser.pkId, pkStatus: PK_STATUS.ROUND, pkEndTime: { $gt: new Date() } };

      const [rankResult1] = await Promise.all([
        liveUser1
          ? LiveStreamer.updateOne(
              { _id: liveUser1._id, ...roundFilter },
              {
                $inc: {
                  "pkConfig.localRank": totalCoin,
                  "pkConfig.localGiftCount": giftCount,
                  "pkConfig.host1Details.coin": totalCoin,
                },
              },
            )
          : Promise.resolve(null),
        liveUser2
          ? LiveStreamer.updateOne(
              { _id: liveUser2._id, ...roundFilter },
              {
                $inc: {
                  "pkConfig.remoteRank": totalCoin,
                  "pkConfig.remoteGiftCount": giftCount,
                  "pkConfig.host2Details.coin": totalCoin,
                },
              },
            )
          : Promise.resolve(null),
      ]);

      const counted = !!(rankResult1 && rankResult1.matchedCount > 0);
      console.log(`[pkGift] pkId=${receiverPkLiveUser.pkId} status=${receiverPkLiveUser.pkStatus} counted=${counted}`);

      const [responseForUser1, responseForUser2] = await Promise.all([buildPkPayload(liveUser1), buildPkPayload(liveUser2)]);

      //Each live room receives its own document
      if (liveUser1) {
        io.in(liveUser1._id.toString()).emit("pkGift", { giftData: giftData, response: responseForUser1, counted });
      }

      if (liveUser2) {
        io.in(liveUser2._id.toString()).emit("pkGift", { giftData: giftData, response: responseForUser2, counted });
      }

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

      // Base update fields for every receiver - gifts go to silverCoin (not coin/gold)
      const updateFields = {
        $inc: {
          receivedCoins: receiverCoin,
          receivedGifts: giftCount,
          silverCoin: receiverCoin,
        },
      };

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
          coinType: 2, // Silver transaction (gift received)
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

  //pk (legacy event): ends the whole session. The caller's live is no longer torn down here.
  socket.on("pkEnd", async (data) => {
    const parsedData = JSON.parse(data);
    console.log("[pkEnd] Event Triggered - Parsed Data:", parsedData);

    try {
      const liveUser = await LiveStreamer.findOne({
        isPkMode: true,
        isAudio: false,
        userId: parsedData?.userId,
        liveHistoryId: parsedData?.liveHistoryId,
      })
        .select("_id pkId")
        .lean();

      if (!liveUser) {
        console.log(`[pkEnd] No LiveUser found for userId: ${parsedData?.userId}, liveHistoryId: ${parsedData?.liveHistoryId}`);
        return;
      }

      const ended = await endPkSession(liveUser.pkId, {
        reason: "manual",
        endedBy: parsedData?.userId,
        legacyPkEnd: { isManualMode: parsedData?.isManualMode, pkEndUserId: parsedData?.pkEndUserId },
      });

      if (!ended) console.log("[pkEnd] endPkSession found no active session for pkId:", liveUser.pkId);
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

      const { liveUserObjId, userId, position, mute } = parsedData;

      let liveUser;
      // Update by userId if provided
      if (userId) {
        liveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            "seat.userId": new mongoose.Types.ObjectId(userId),
          },
          {
            $set: {
              "seat.$.mute": Number(mute),
            },
          },
          { new: true },
        );
      }

      // Update by position if userId update failed or not provided
      if (!liveUser && position !== undefined && position !== -1) {
        liveUser = await LiveStreamer.findOneAndUpdate(
          {
            _id: new mongoose.Types.ObjectId(liveUserObjId),
            "seat.position": position,
          },
          {
            $set: {
              "seat.$.mute": Number(mute),
            },
          },
          { new: true },
        );
      }

      if (liveUser) {
        console.log("LiveUser updated successfully in seatMuted");

        if (!socket.rooms.has(liveUserObjId)) {
          socket.join(liveUserObjId.toString());
          console.log(`[seatMuted] joined room: ${liveUserObjId}`);
        } else {
          console.log(`[seatMuted] User is already in room: ${liveUserObjId}`);
        }

        // Emit seatUpdate to entire room
        io.in(liveUserObjId).emit("seatUpdate", liveUser);

        // Directly notify the muted/unmuted user
        if (userId) {
          io.in("globalRoom:" + userId.toString()).emit("muteStatusChanged", {
            liveUserObjId: liveUserObjId,
            mute: Number(mute),
            mutedBy: "host"
          });
          console.log(`[seatMuted] Notified user ${userId} of mute status: ${mute}`);
        }
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
        console.log("[hostSeatMuted] LiveUser updated - hostIsMuted:", liveUser.hostIsMuted);

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
      console.log("\n========== [KICK USER] START ==========");
      console.log("[KICK USER] Received data:", JSON.stringify(parsedData, null, 2));

      const { liveUserObjId, liveHistoryId, blockedUserId } = parsedData;
      console.log("[KICK USER] liveUserObjId:", liveUserObjId);
      console.log("[KICK USER] liveHistoryId:", liveHistoryId);
      console.log("[KICK USER] blockedUserId:", blockedUserId);

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

      console.log("[KICK USER] LiveStreamer updated:", updatedLiveUser ? "YES" : "NO");
      console.log("[KICK USER] Blocked users count:", updatedLiveUser?.blockedUsers?.length || 0);

      if (!socket.rooms.has(liveUserObjId)) {
        socket.join(liveUserObjId);
        console.log("[KICK USER] Host socket joined room:", liveUserObjId);
      } else {
        console.log("[KICK USER] Host socket already in room:", liveUserObjId);
      }

      // Notify the blocked user
      const blockedUserGlobalRoom = "globalRoom:" + blockedUserId.toString();
      console.log("[KICK USER] Emitting 'notifyBlockedUser' to:", blockedUserGlobalRoom);
      io.in(blockedUserGlobalRoom).emit("notifyBlockedUser", "Success");

      // Force the blocked user's socket(s) to leave the live room
      console.log("[KICK USER] Fetching blocked user sockets from:", blockedUserGlobalRoom);
      const blockedUserSockets = await io.in(blockedUserGlobalRoom).fetchSockets();
      console.log("[KICK USER] Found blocked user sockets:", blockedUserSockets.length);

      const roomId = liveUserObjId.toString();
      for (const blockedSocket of blockedUserSockets) {
        console.log("[KICK USER] Checking socket:", blockedSocket.id);
        console.log("[KICK USER] Socket rooms:", Array.from(blockedSocket.rooms));

        // Check both formats since rooms might be joined with or without .toString()
        const isInRoom = blockedSocket.rooms.has(roomId) || blockedSocket.rooms.has(liveUserObjId);
        console.log("[KICK USER] Socket is in live room:", isInRoom);

        if (isInRoom) {
          blockedSocket.leave(roomId);
          blockedSocket.leave(liveUserObjId);
          console.log("[KICK USER] ✅ Forced socket", blockedSocket.id, "to LEAVE room:", roomId);
        } else {
          console.log("[KICK USER] Socket not in room, skipping leave");
        }
      }

      // Emit kicked event directly to the blocked user
      console.log("[KICK USER] Emitting 'kickedFromLive' to:", blockedUserGlobalRoom);
      io.in(blockedUserGlobalRoom).emit("kickedFromLive", {
        liveUserObjId: liveUserObjId,
        reason: "blocked"
      });
      console.log("[KICK USER] ✅ 'kickedFromLive' event emitted");

      io.in(liveUserObjId).emit("addToBlockedList", updatedLiveUser?.blockedUsers);
      console.log("[KICK USER] ✅ 'addToBlockedList' event emitted to live room");

      // Remove blocked user from viewer list and update count
      const blockedUserObjectId = new mongoose.Types.ObjectId(blockedUserId);
      const liveUserObjectId = new mongoose.Types.ObjectId(liveUserObjId);

      const existLiveView = await LiveStreamerView.findOne({
        userId: blockedUserObjectId,
        liveStreamerId: liveUserObjectId
      }).lean();

      console.log("[KICK USER] User in LiveStreamerView:", existLiveView ? "YES" : "NO");

      if (existLiveView) {
        await LiveStreamerView.deleteOne({ _id: existLiveView._id });
        console.log("[KICK USER] ✅ Removed user from LiveStreamerView");
      }

      const [totalViews, viewersList] = await Promise.all([
        LiveStreamerView.countDocuments({ liveStreamerId: liveUserObjectId }),
        LiveStreamerView.aggregate([
          { $match: { liveStreamerId: liveUserObjectId } },
          {
            $project: {
              userId: 1,
              name: 1,
              userName: 1,
              image: 1,
              isProfilePicBanned: 1,
              avtarFrame: 1,
            },
          },
        ]),
      ]);

      console.log("[KICK USER] Updated viewer count:", totalViews);
      console.log("[KICK USER] Viewers list count:", viewersList.length);

      await LiveStreamer.updateOne({ _id: liveUserObjectId }, { $set: { view: totalViews } });

      io.in(liveUserObjId).emit("reduceLiveJoiners", totalViews);
      await emitPersonalizedViewersList(io, liveUserObjId, viewersList);
      console.log("[KICK USER] ✅ 'reduceLiveJoiners' and 'liveViewersList' emitted");

      const roomSockets = io.sockets.adapter.rooms.get(liveUserObjId);
      console.log("[KICK USER] Sockets still in room:", roomSockets ? roomSockets.size : 0);
      console.log("========== [KICK USER] END ==========\n");

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

  // Kick viewer from live room (temporary kick, does NOT add to blocked list)
  socket.on("kickViewer", async (data) => {
    try {
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;
      console.log("\n========== [KICK VIEWER] START ==========");
      console.log("[KICK VIEWER] Received data:", JSON.stringify(parsedData, null, 2));

      const { liveHistoryId, liveUserObjId, kickedUserId } = parsedData;
      console.log("[KICK VIEWER] liveHistoryId:", liveHistoryId);
      console.log("[KICK VIEWER] liveUserObjId:", liveUserObjId);
      console.log("[KICK VIEWER] kickedUserId:", kickedUserId);

      if (!liveUserObjId || !kickedUserId) {
        console.log("[KICK VIEWER] ❌ Missing required fields");
        socket.emit("kickViewerError", { message: "Missing required fields" });
        return;
      }

      // Verify the live stream exists
      const liveStreamer = await LiveStreamer.findOne({
        _id: liveUserObjId,
        ...(liveHistoryId && { liveHistoryId: liveHistoryId })
      }).lean();

      if (!liveStreamer) {
        console.log("[KICK VIEWER] ❌ Live stream not found");
        socket.emit("kickViewerError", { message: "Live stream not found" });
        return;
      }
      console.log("[KICK VIEWER] Live stream found:", liveStreamer._id);

      // Force the kicked user's socket(s) to leave the live room
      const kickedUserGlobalRoom = "globalRoom:" + kickedUserId.toString();
      console.log("[KICK VIEWER] Fetching kicked user sockets from:", kickedUserGlobalRoom);
      const kickedUserSockets = await io.in(kickedUserGlobalRoom).fetchSockets();
      console.log("[KICK VIEWER] Found kicked user sockets:", kickedUserSockets.length);

      const roomId = liveUserObjId.toString();
      for (const kickedSocket of kickedUserSockets) {
        console.log("[KICK VIEWER] Checking socket:", kickedSocket.id);
        console.log("[KICK VIEWER] Socket rooms:", Array.from(kickedSocket.rooms));

        const isInRoom = kickedSocket.rooms.has(roomId) || kickedSocket.rooms.has(liveUserObjId);
        console.log("[KICK VIEWER] Socket is in live room:", isInRoom);

        if (isInRoom) {
          kickedSocket.leave(roomId);
          kickedSocket.leave(liveUserObjId);
          console.log("[KICK VIEWER] ✅ Forced socket", kickedSocket.id, "to LEAVE room:", roomId);
        } else {
          console.log("[KICK VIEWER] Socket not in room, skipping leave");
        }
      }

      // Emit kicked event directly to the kicked user
      console.log("[KICK VIEWER] Emitting 'kickedFromLive' to:", kickedUserGlobalRoom);
      io.in(kickedUserGlobalRoom).emit("kickedFromLive", {
        liveUserObjId: liveUserObjId,
        liveHistoryId: liveHistoryId,
        reason: "kicked"
      });
      console.log("[KICK VIEWER] ✅ 'kickedFromLive' event emitted");

      // Notify live room that a viewer was kicked
      io.in(liveUserObjId).emit("viewerKicked", {
        kickedUserId: kickedUserId,
        liveUserObjId: liveUserObjId
      });
      console.log("[KICK VIEWER] ✅ 'viewerKicked' event emitted to live room");

      // Remove kicked user from viewer list and update count
      const kickedUserObjectId = new mongoose.Types.ObjectId(kickedUserId);
      const liveUserObjectId = new mongoose.Types.ObjectId(liveUserObjId);

      const existLiveView = await LiveStreamerView.findOne({
        userId: kickedUserObjectId,
        liveStreamerId: liveUserObjectId
      }).lean();

      console.log("[KICK VIEWER] User in LiveStreamerView:", existLiveView ? "YES" : "NO");

      if (existLiveView) {
        await LiveStreamerView.deleteOne({ _id: existLiveView._id });
        console.log("[KICK VIEWER] ✅ Removed user from LiveStreamerView");
      }

      const [totalViews, viewersList] = await Promise.all([
        LiveStreamerView.countDocuments({ liveStreamerId: liveUserObjectId }),
        LiveStreamerView.aggregate([
          { $match: { liveStreamerId: liveUserObjectId } },
          {
            $project: {
              userId: 1,
              name: 1,
              userName: 1,
              image: 1,
              isProfilePicBanned: 1,
              avtarFrame: 1,
            },
          },
        ]),
      ]);

      console.log("[KICK VIEWER] Updated viewer count:", totalViews);
      console.log("[KICK VIEWER] Viewers list count:", viewersList.length);

      // Add kicked user to kickedUsers list (session-specific, not permanent block)
      // This prevents them from rejoining THIS live session only
      await LiveStreamer.updateOne(
        { _id: liveUserObjectId },
        {
          $set: { view: totalViews },
          $addToSet: { kickedUsers: { kickedUserId: kickedUserObjectId, kickedAt: new Date() } }
        }
      );
      console.log("[KICK VIEWER] ✅ Added user to kickedUsers list");

      io.in(liveUserObjId).emit("reduceLiveJoiners", totalViews);
      await emitPersonalizedViewersList(io, liveUserObjId, viewersList);
      console.log("[KICK VIEWER] ✅ 'reduceLiveJoiners' and 'liveViewersList' emitted");

      const roomSockets = io.sockets.adapter.rooms.get(liveUserObjId);
      console.log("[KICK VIEWER] Sockets still in room:", roomSockets ? roomSockets.size : 0);

      // Emit success to the host
      socket.emit("kickViewerSuccess", {
        kickedUserId: kickedUserId,
        liveUserObjId: liveUserObjId,
        viewerCount: totalViews
      });
      console.log("[KICK VIEWER] ✅ 'kickViewerSuccess' emitted to host");
      console.log("========== [KICK VIEWER] END ==========\n");

    } catch (error) {
      console.error("[KICK VIEWER] ❌ Error:", error);
      socket.emit("kickViewerError", { message: error.message });
    }
  });

  // Mute/Unmute viewer in live room
  socket.on("muteViewer", async (data) => {
    try {
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;
      console.log("\n========== [MUTE VIEWER] START ==========");
      console.log("[MUTE VIEWER] Received data:", JSON.stringify(parsedData, null, 2));

      const { liveHistoryId, liveUserObjId, mutedUserId, isMute } = parsedData;
      console.log("[MUTE VIEWER] liveHistoryId:", liveHistoryId);
      console.log("[MUTE VIEWER] liveUserObjId:", liveUserObjId);
      console.log("[MUTE VIEWER] mutedUserId:", mutedUserId);
      console.log("[MUTE VIEWER] isMute:", isMute);

      if (!liveUserObjId || !mutedUserId || typeof isMute === "undefined") {
        console.log("[MUTE VIEWER] ❌ Missing required fields");
        socket.emit("muteViewerError", { message: "Missing required fields" });
        return;
      }

      // Update mutedUsers array in LiveStreamer
      let updatedLiveStreamer;
      if (isMute) {
        // Add to mutedUsers if not already present
        updatedLiveStreamer = await LiveStreamer.findOneAndUpdate(
          {
            _id: liveUserObjId,
            ...(liveHistoryId && { liveHistoryId: liveHistoryId }),
            "mutedUsers.mutedUserId": { $ne: mutedUserId }
          },
          {
            $push: {
              mutedUsers: { mutedUserId: mutedUserId }
            }
          },
          { new: true }
        ).populate({
          path: "mutedUsers.mutedUserId",
          select: "_id name userName image"
        });

        // If user was already in list, just fetch the current state
        if (!updatedLiveStreamer) {
          updatedLiveStreamer = await LiveStreamer.findOne({
            _id: liveUserObjId,
            ...(liveHistoryId && { liveHistoryId: liveHistoryId })
          }).populate({
            path: "mutedUsers.mutedUserId",
            select: "_id name userName image"
          });
        }
        console.log("[MUTE VIEWER] ✅ User added to mutedUsers list");
      } else {
        // Remove from mutedUsers
        updatedLiveStreamer = await LiveStreamer.findOneAndUpdate(
          {
            _id: liveUserObjId,
            ...(liveHistoryId && { liveHistoryId: liveHistoryId })
          },
          {
            $pull: {
              mutedUsers: { mutedUserId: mutedUserId }
            }
          },
          { new: true }
        ).populate({
          path: "mutedUsers.mutedUserId",
          select: "_id name userName image"
        });
        console.log("[MUTE VIEWER] ✅ User removed from mutedUsers list");
      }

      if (!updatedLiveStreamer) {
        console.log("[MUTE VIEWER] ❌ Live stream not found");
        socket.emit("muteViewerError", { message: "Live stream not found" });
        return;
      }
      console.log("[MUTE VIEWER] Live stream found:", updatedLiveStreamer._id);
      console.log("[MUTE VIEWER] Muted users count:", updatedLiveStreamer.mutedUsers?.length || 0);

      // Emit mute status change to the muted user's globalRoom
      const mutedUserGlobalRoom = "globalRoom:" + mutedUserId.toString();
      console.log("[MUTE VIEWER] Emitting 'muteStatusChanged' to:", mutedUserGlobalRoom);

      io.in(mutedUserGlobalRoom).emit("muteStatusChanged", {
        liveUserObjId: liveUserObjId,
        liveHistoryId: liveHistoryId,
        mute: isMute ? 1 : 0,
        mutedBy: "host"
      });
      console.log("[MUTE VIEWER] ✅ 'muteStatusChanged' event emitted to user");

      // Notify live room about mute status change
      io.in(liveUserObjId).emit("viewerMuteStatusChanged", {
        mutedUserId: mutedUserId,
        liveUserObjId: liveUserObjId,
        isMute: isMute
      });
      console.log("[MUTE VIEWER] ✅ 'viewerMuteStatusChanged' event emitted to live room");

      // Emit notifyMutedInLive to the muted user
      const mutedUserGlobalRoomNotify = "globalRoom:" + mutedUserId.toString();
      io.in(mutedUserGlobalRoomNotify).emit("notifyMutedInLive", {
        liveUserObjId: liveUserObjId,
        liveHistoryId: liveHistoryId,
        isMute: isMute,
        mutedBy: "host"
      });
      console.log("[MUTE VIEWER] ✅ 'notifyMutedInLive' event emitted to user");

      // Emit mutedUsersUpdated to live room with populated muted users list
      const mutedUsersList = updatedLiveStreamer.mutedUsers || [];
      io.in(liveUserObjId).emit("mutedUsersUpdated", mutedUsersList);
      console.log("[MUTE VIEWER] ✅ 'mutedUsersUpdated' event emitted to live room:", JSON.stringify(mutedUsersList));

      // Emit success to the host
      socket.emit("muteViewerSuccess", {
        mutedUserId: mutedUserId,
        liveUserObjId: liveUserObjId,
        isMute: isMute
      });
      console.log("[MUTE VIEWER] ✅ 'muteViewerSuccess' emitted to host");
      console.log("========== [MUTE VIEWER] END ==========\n");

    } catch (error) {
      console.error("[MUTE VIEWER] ❌ Error:", error);
      socket.emit("muteViewerError", { message: error.message });
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

      const adminRate = Math.abs(settingJSON.adminRate ?? 0);
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

        // Base update fields for every receiver - gifts go to silverCoin (not coin/gold)
        const updateFields = {
          $inc: {
            receivedCoins: receiverCoin,
            receivedGifts: giftCount,
            silverCoin: receiverCoin,
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
            coinType: 2, // Silver transaction (gift received)
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

        // Directly notify the muted/unmuted user
        io.in("globalRoom:" + userId.toString()).emit("muteStatusChanged", {
          liveUserObjId: liveUserObjId,
          mute: isMute ? 1 : 0,
          isMute: isMute,
          mutedBy: "host"
        });
        console.log(`[callParticipantMuteUpdated] Notified user ${userId} of mute status: ${isMute}`);
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

      const { liveUserObjId, liveHistoryId, isCameraEnabled } = parsedData;

      // Update and return the full document
      const updatedHost = await LiveStreamer.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(liveUserObjId) }, { $set: { isHostCameraEnabled: isCameraEnabled } }, { new: true }).lean();

      if (!updatedHost) {
        console.error("LiveUser not found or not of type host.");
        return;
      }

      console.log(`[callHostCameraUpdated] DB updated: isCameraEnabled=${updatedHost.isHostCameraEnabled}`);

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

      // Convert boolean to number: true (muted) = 1, false (unmuted) = 2
      const hostIsMutedValue = isHostMuteEnabled ? 1 : 2;

      const updatedHost = await LiveStreamer.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(liveUserObjId) }, { $set: { hostIsMuted: hostIsMutedValue } }, { new: true }).lean();

      if (!updatedHost) {
        console.error("LiveUser not found or not of type host.");
        return;
      }

      console.log(`[callHostMuteUpdated] DB updated: isHostMuteEnabled=${isHostMuteEnabled} (hostIsMuted=${updatedHost.hostIsMuted})`);

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

  socket.on("callHostBreakUpdated", async (data) => {
    try {
      const parsedData = JSON.parse(data);
      console.log("Data received in callHostBreakUpdated:", parsedData);

      const { liveUserObjId, liveHistoryId, isHostOnBreak } = parsedData;

      const updatedHost = await LiveStreamer.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(liveUserObjId) }, { $set: { isHostOnBreak: isHostOnBreak } }, { new: true }).lean();

      if (!updatedHost) {
        console.error("LiveUser not found or not of type host.");
        return;
      }

      console.log(`[callHostBreakUpdated] DB updated: isHostOnBreak=${updatedHost.isHostOnBreak}`);

      const roomId = liveUserObjId.toString();

      if (!socket.rooms.has(roomId)) {
        socket.join(roomId);
        console.log(`[callHostBreakUpdated] joined room: ${roomId}`);
      } else {
        console.log(`[callHostBreakUpdated] User is already in room: ${roomId}`);
      }

      io.in(roomId).emit("callHostBreakUpdated", data);
    } catch (error) {
      console.error("Error in callHostBreakUpdated:", error);
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
                LiveStreamerView.aggregate([
                  { $match: { liveStreamerId: liveStreamerId } },
                  {
                    $project: {
                      userId: 1,
                      name: 1,
                      userName: 1,
                      image: 1,
                      isProfilePicBanned: 1,
                      avtarFrame: 1,
                    },
                  },
                ]),
              ]);

              io.in(liveStreamerId.toString()).emit("reduceLiveJoiners", updatedViewCount);
              await emitPersonalizedViewersList(io, liveStreamerId, viewersList);

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
              LiveStreamer.findOne({ _id: user.liveStreamerId, userId }).select("_id isAudio roomImage isPkMode").lean(),
            ]);

            // For VIDEO live streams, use reconnection grace period
            // For AUDIO live rooms, handle immediately (room persists without host)
            // For PK mode, skip grace period (PK has its own end logic)
            if (liveUser && !liveUser.isAudio && !liveUser.isPkMode) {
              // Notify viewers that host is reconnecting
              io.in(user.liveStreamerId.toString()).emit("hostDisconnected", {
                userId: userId.toString(),
                name: user.name,
                reconnecting: true,
                gracePeriod: HOST_RECONNECT_GRACE_PERIOD / 1000,
                message: `Host ${user.name} disconnected. Waiting for reconnection...`
              });
              console.log(`📹 Video Live: Host ${user.name} disconnected. Starting grace period.`);

              // Schedule pending disconnect with grace period
              const userCopy = { ...user };
              const liveHistoryCopy = liveHistory ? { ...liveHistory } : null;
              const liveUserCopy = { ...liveUser };

              const hostUserId = userId.toString();
              const hostLiveStreamerId = user.liveStreamerId.toString();
              const hostLiveHistoryId = user.liveHistoryId.toString();

              schedulePendingHostDisconnect(
                hostUserId,
                hostLiveHistoryId,
                hostLiveStreamerId,
                async () => {
                  // This runs after grace period expires if host doesn't reconnect
                  console.log(`⌛ [RECONNECT] Executing cleanup for host ${hostUserId}`);

                  // Emit endLiveStream FIRST before removing sockets (same format as manual end)
                  io.in(hostLiveStreamerId).emit("endLiveStream", {
                    userId: hostUserId,
                    liveHistoryId: hostLiveHistoryId,
                    liveUserObjId: hostLiveStreamerId
                  });
                  console.log(`📢 Emitted endLiveStream to room: ${hostLiveStreamerId} (grace period expired)`);

                  // Also notify about reconnect failure
                  io.in(hostLiveStreamerId).emit("hostReconnectFailed", {
                    userId: hostUserId,
                    message: "Host did not reconnect. Live stream ended."
                  });

                  const sockets = await io.in(hostLiveStreamerId).fetchSockets();
                  console.log(`🔄 Active sockets in room (${hostLiveStreamerId}): ${sockets.length}`);

                  if (sockets.length) {
                    io.socketsLeave(hostLiveStreamerId);
                    console.log(`✅ All sockets removed from room: ${hostLiveStreamerId}`);
                  }

                  if (liveUserCopy && liveUserCopy.roomImage) {
                    deleteFile(liveUserCopy.roomImage);
                    console.log(`✅ Room image deleted: ${liveUserCopy.roomImage}`);
                  }

                  await LiveStreamer.deleteOne({ _id: liveUserCopy._id });
                  console.log(`✅ LiveStreamer entry deleted for host: ${hostUserId}`);

                  const endTime = moment().tz("Asia/Kolkata").format();
                  const startTime = liveHistoryCopy?.startTime || endTime;
                  const start = moment.tz(startTime, "Asia/Kolkata");
                  const end = moment.tz(endTime, "Asia/Kolkata");
                  const duration = moment.utc(end.diff(start)).format("HH:mm:ss");
                  const durationInMinutes = Math.floor(moment.duration(end.diff(start)).asMinutes());

                  await Promise.all([
                    liveHistoryCopy?._id ? LiveStreamerHistory.updateOne({ _id: liveHistoryCopy._id }, { $set: { endTime, duration } }) : Promise.resolve(),
                    User.updateOne(
                      { _id: userCopy._id },
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
                    LiveStreamerView.deleteMany({ liveStreamerId: userCopy.liveStreamerId }),
                    LiveStreamComment.deleteMany({ liveStreamerId: userCopy.liveStreamerId }),
                    TopGifter.deleteMany({ liveHistoryId: userCopy.liveHistoryId }),
                    clearLiveChatReferences([userCopy.liveStreamerId], [userCopy.liveHistoryId]),
                    typeof hostTargetEngine !== 'undefined' ? hostTargetEngine.updateLiveProgress(userCopy._id, durationInMinutes) : Promise.resolve(),
                  ]);

                  console.log(`✅ User ${userCopy?.name} is no longer live (after grace period).`);
                }
              );
            } else if (liveUser && liveUser.isAudio) {
              // Audio live room - host can leave and rejoin, room persists
              io.in(user.liveStreamerId.toString()).emit("audioStreamUserLeft", `User ${user.name} left the audio live room.`);
              console.log(`🔊 Audio Live: Emitted audioStreamUserLeft event for ${user.name}`);

              await LiveStreamer.updateOne(
                { userId, liveHistoryId: user.liveHistoryId },
                {
                  $set: {
                    liveHistoryId: null,
                    isHostActiveInRoom: false,
                  },
                },
              );

              console.log(`✅ LiveStreamer updated for userId: ${userId}`);

              const endTime = moment().tz("Asia/Kolkata").format();
              const start = moment.tz(liveHistory?.startTime, "Asia/Kolkata");
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
                clearLiveChatReferences([user.liveStreamerId], [user.liveHistoryId]),
                hostTargetEngine.updateLiveProgress(user._id, durationInMinutes),
              ]);

              console.log(`✅ Audio host ${user?.name} disconnected. Room still available.`);
            }
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

          // Only fully reset user if there's no pending host disconnect (grace period active)
          // If grace period is active, only set isOnline to false - the cleanup callback will handle the rest
          if (hasPendingHostDisconnect(userId.toString())) {
            await User.updateOne(
              { _id: userId },
              {
                $set: {
                  isOnline: false,
                },
              },
            );
            console.log(`⏳ Grace period active for host ${userId}. Only setting isOnline: false.`);
          } else {
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
    }
  });
});
