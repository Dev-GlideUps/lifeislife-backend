const Chat = require("../../models/chat.model");

//import models
const ChatTopic = require("../../models/chatTopic.model");
const User = require("../../models/user.model");

//private key
const admin = require("../../util/privateKey");

//deleteFiles
const { deleteFiles } = require("../../util/deletefile");

//mongoose
const mongoose = require("mongoose");

//axios
const axios = require("axios");

//send message ( image or audio )
exports.sendChatMessage = async (req, res) => {
  try {
    const { chatFiles } = req.files || {};

    if (!req.user || !req.user.userId) {
      if (chatFiles) deleteFiles(chatFiles);
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { receiverId, messageType } = req.query;
    if (!receiverId || !messageType) {
      if (chatFiles) deleteFiles(chatFiles);
      return res.status(200).json({ status: false, message: "Invalid details." });
    }

    const messageTypeNum = Number(messageType);
    const senderObjId = new mongoose.Types.ObjectId(req.user.userId);
    const receiverObjId = new mongoose.Types.ObjectId(receiverId);

    if (![2, 4].includes(messageTypeNum)) {
      if (chatFiles) deleteFiles(chatFiles);
      return res.status(200).json({ status: false, message: "Invalid messageType." });
    }

    if (messageTypeNum === 2 && (!req.files || !req.files.image || req.files.image.length === 0)) {
      if (chatFiles) deleteFiles(chatFiles);
      return res.status(200).json({ status: false, message: "Image file is required for messageType 2." });
    }

    if (messageTypeNum === 4 && (!req.files || !req.files.audio || req.files.audio.length === 0)) {
      if (chatFiles) deleteFiles(chatFiles);
      return res.status(200).json({ status: false, message: "Audio file is required for messageType 4." });
    }

    const [senderUser, receiverUser, chatTopic] = await Promise.all([
      User.findById(senderObjId).select("_id name image isProfilePicBanned isOnline isVerified fcmToken isBlock isPushNotificationEnabled").lean(),
      User.findById(receiverObjId).select("_id fcmToken isBlock isPushNotificationEnabled").lean(),
      ChatTopic.findOne({
        $or: [{ $and: [{ senderId: senderObjId }, { receiverId: receiverObjId }] }, { $and: [{ senderId: receiverObjId }, { receiverId: senderObjId }] }],
      })
        .select("_id")
        .lean(),
    ]);

    if (!senderUser || !receiverUser) {
      if (chatFiles) deleteFiles(chatFiles);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    let chatTopicId = chatTopic?._id;
    if (!chatTopic) {
      const newChatTopic = new ChatTopic({ senderId: senderObjId, receiverId: receiverObjId });
      await newChatTopic.save();
      chatTopicId = newChatTopic._id;
    }

    const chatData = {
      senderId: senderObjId,
      messageType: messageTypeNum,
      message: messageTypeNum === 4 ? "🎤 Audio" : "📸 Image",
      chatTopicId,
      date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    };

    if (messageTypeNum === 2 && req.files.image) chatData.image = req.files.image[0].path;
    if (messageTypeNum === 4 && req.files.audio) chatData.audio = req.files.audio[0].path;

    const chat = new Chat(chatData);
    await Promise.all([chat.save(), ChatTopic.updateOne({ _id: chatTopicId }, { chatId: chat._id })]);

    res.status(200).json({
      status: true,
      message: "Message sent successfully.",
      chat,
    });

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
          senderId: String(senderObjId),
          receiverId: String(receiverObjId),
          name: String(senderUser?.name),
          image: String(senderUser?.image),
          isProfilePicBanned: String(senderUser?.isProfilePicBanned),
          isVerified: String(senderUser?.isVerified),
          isOnline: String(senderUser?.isOnline),
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

    if (settingJSON.postBanned && settingJSON.sightengineUser && settingJSON.sightengineApiSecret) {
      if (req.files.image && messageType == 2) {
        const chatImage = `${process.env.baseURL}${req.files.image[0].path}`;

        const checks = [];
        if (settingJSON.postBanned.includes("1")) checks.push("nudity-2.1");
        if (settingJSON.postBanned.includes("2")) checks.push("offensive");
        if (settingJSON.postBanned.includes("3")) checks.push("violence");
        if (settingJSON.postBanned.includes("4")) checks.push("gore-2.0");
        if (settingJSON.postBanned.includes("5")) checks.push("weapon");
        if (settingJSON.postBanned.includes("6")) checks.push("tobacco");
        if (settingJSON.postBanned.includes("7")) checks.push("recreational_drug,medical");
        if (settingJSON.postBanned.includes("8")) checks.push("gambling");
        if (settingJSON.postBanned.includes("9")) checks.push("alcohol");
        if (settingJSON.postBanned.includes("10")) checks.push("money");
        if (settingJSON.postBanned.includes("11")) checks.push("self-harm");

        if (checks.length > 0 && chatImage) {
          try {
            const response = await axios.get("https://api.sightengine.com/1.0/check.json", {
              params: {
                url: chatImage,
                models: checks.join(","),
                api_user: settingJSON.sightengineUser,
                api_secret: settingJSON.sightengineApiSecret,
              },
            });

            let isBanned = false;
            const result = response.data;

            for (const check of checks) {
              if (
                check === "nudity-2.1" &&
                (result.nudity?.sexual_activity > 0.7 ||
                  result.nudity?.sexual_display > 0.7 ||
                  result.nudity?.erotica > 0.7 ||
                  result.nudity?.very_suggestive > 0.7 ||
                  result.nudity?.suggestive > 0.7 ||
                  result.nudity?.mildly_suggestive > 0.7)
              ) {
                isBanned = true;
              }

              if (check === "offensive" && result.offensive?.prob > 0.7) isBanned = true;
              if (check === "violence" && result.violence?.prob > 0.7) isBanned = true;
              if (check === "gore-2.0" && result.gore?.prob > 0.7) isBanned = true;
              if (check === "weapon" && result.weapon?.prob > 0.7) isBanned = true;
              if (check === "tobacco" && result.tobacco?.prob > 0.7) isBanned = true;
              if (check === "recreational_drug,medical" && result.drugs?.prob > 0.7) isBanned = true;
              if (check === "gambling" && result.gambling?.prob > 0.7) isBanned = true;
              if (check === "alcohol" && result.alcohol?.prob > 0.7) isBanned = true;
              if (check === "money" && result.money?.prob > 0.7) isBanned = true;
              if (check === "self-harm" && result.selfharm?.prob > 0.7) isBanned = true;
            }

            await Chat.updateOne({ _id: chat._id }, { isMediaBanned: isBanned });

            if (senderUser.isPushNotificationEnabled && !senderUser.isBlock && senderUser.fcmToken !== null && isBanned) {
              const payload = {
                token: senderUser.fcmToken,
                notification: {
                  title: "🚨 Policy Alert: Image Violation",
                  body: "⚠️ Your chat image violates our guidelines. Please update it to continue chatting smoothly. Thanks for understanding! 😊",
                },
                data: {
                  type: "CHAT_IMAGE_BANNED",
                },
              };

              try {
                const adminPromise = await admin;
                const response = await adminPromise.messaging().send(payload);
                console.log("Successfully sent notification: ", response);
              } catch (error) {
                console.error("Error sending notification: ", error);
              }
            }
          } catch (error) {
            console.log(`Error processing chat image`, error.message);
          }
        } else {
          console.log("No checks selected or no image URL provided.");
        }
      }
    }
  } catch (error) {
    if (chatFiles) deleteFiles(chatFiles);
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get old chat between users
exports.fetchChatHistory = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { receiverId, start = 1, limit = 20 } = req.query;
    if (!receiverId) {
      return res.status(200).json({ status: false, message: "Invalid details." });
    }

    const senderObjId = new mongoose.Types.ObjectId(req.user.userId);
    const receiverObjId = new mongoose.Types.ObjectId(receiverId);

    const [senderUser, receiverUser, chatTopic] = await Promise.all([
      User.findById(senderObjId).select("_id").lean(),
      User.findById(receiverObjId).select("_id audioCallRate videoCallRate isAudioCallEnabled isVideoCallEnabled").lean(),
      ChatTopic.findOne({
        $or: [{ $and: [{ senderId: senderObjId }, { receiverId: receiverObjId }] }, { $and: [{ senderId: receiverObjId }, { receiverId: senderObjId }] }],
      })
        .select("_id senderId receiverId chatId")
        .lean(),
    ]);

    if (!senderUser || !receiverUser) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!chatTopic) {
      const newChatTopic = new ChatTopic({ senderId: senderObjId, receiverId: receiverObjId });
      await newChatTopic.save();

      return res.status(200).json({
        status: true,
        message: "Chat history retrieved.",
        chatTopic: newChatTopic._id,
        chat: [],
        receiver: receiverUser,
      });
    }

    const [__, chatHistory] = await Promise.all([
      Chat.updateMany({ chatTopicId: chatTopic._id, isRead: false }, { isRead: true }),
      Chat.find({ chatTopicId: chatTopic._id })
        .sort({ createdAt: -1 })
        .skip((start - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      status: true,
      message: "Chat history retrieved.",
      chatTopic: chatTopic._id,
      chat: chatHistory,
      receiver: receiverUser,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
