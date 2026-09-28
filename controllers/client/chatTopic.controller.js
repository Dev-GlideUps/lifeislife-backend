const ChatTopic = require("../../models/chatTopic.model");

//import model
const User = require("../../models/user.model");

//mongoose
const mongoose = require("mongoose");

//get thumb list of chat between users
exports.fetchChatList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    if (isNaN(req.query.start) || req.query.start <= 0 || isNaN(req.query.limit) || req.query.limit <= 0) {
      return res.status(200).json({
        status: false,
        message: "'start' and 'limit' must be valid positive integers.",
      });
    }

    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type?.trim()?.toLowerCase() || "all"; // "all", "online", "unread"

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Setting does not exist." });
    }

    let queries = [
      ChatTopic.aggregate([
        {
          $match: {
            chatId: { $ne: null },
            $or: [{ senderId: userId }, { receiverId: userId }],
          },
        },
        {
          $addFields: {
            otherUserId: {
              $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"],
            },
          },
        },
        {
          $lookup: {
            from: "blocks",
            localField: "otherUserId",
            foreignField: "toUserId",
            pipeline: [
              {
                $match: {
                  userId: userId,
                },
              },
            ],
            as: "isBlocked",
          },
        },
        {
          $match: {
            isBlocked: { $eq: [] },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "otherUserId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  userName: 1,
                  image: 1,
                  isOnline: 1,
                  isVerified: 1,
                  isProfilePicBanned: 1,
                  isFake: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            as: "avtarFrame",
          },
        },
        {
          $unwind: {
            path: "$avtarFrame",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "chats",
            localField: "_id",
            foreignField: "chatTopicId",
            as: "chats",
          },
        },
        {
          $unwind: {
            path: "$chats",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: { "chats.createdAt": -1 },
        },
        {
          $group: {
            _id: "$_id",
            userId: { $first: "$user._id" },
            name: { $first: "$user.name" },
            userName: { $first: "$user.userName" },
            image: { $first: "$user.image" },
            isProfilePicBanned: { $first: "$user.isProfilePicBanned" },
            isOnline: { $first: "$user.isOnline" },
            isVerified: { $first: "$user.isVerified" },
            isFake: { $first: "$user.isFake" },
            chatTopicId: { $first: "$chats.chatTopicId" },
            senderId: { $first: "$chats.senderId" },
            message: { $first: "$chats.message" },
            lastChatMessageTime: { $first: "$chats.createdAt" },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $ne: ["$chats.senderId", userId] }, { $eq: ["$chats.isRead", false] }],
                  },
                  1,
                  0,
                ],
              },
            },
            avatarFrameType: { $first: "$avtarFrame.type" },
            avatarFrameImage: { $first: "$avtarFrame.image" },
          },
        },
        {
          $project: {
            userId: 1,
            name: 1,
            userName: 1,
            image: 1,
            isProfilePicBanned: 1,
            isOnline: 1,
            isVerified: 1,
            isFake: 1,
            chatTopicId: 1,
            senderId: 1,
            message: 1,
            lastChatMessageTime: 1,
            unreadCount: 1,
            avatarFrameType: { $ifNull: ["$avatarFrameType", 0] },
            avatarFrameImage: { $ifNull: ["$avatarFrameImage", ""] },
            time: {
              $let: {
                vars: {
                  messageDay: { $dateToString: { format: "%Y-%m-%d", date: "$lastChatMessageTime" } },
                  today: { $dateToString: { format: "%Y-%m-%d", date: new Date() } },
                  yesterday: {
                    $dateToString: { format: "%Y-%m-%d", date: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                  },
                  dayOfWeek: { $dayOfWeek: "$lastChatMessageTime" },
                },
                in: {
                  $cond: [
                    { $eq: ["$$messageDay", "$$today"] },
                    "Today",
                    {
                      $cond: [
                        { $eq: ["$$messageDay", "$$yesterday"] },
                        "Yesterday",
                        {
                          $switch: {
                            branches: [
                              { case: { $eq: ["$$dayOfWeek", 1] }, then: "Sunday" },
                              { case: { $eq: ["$$dayOfWeek", 2] }, then: "Monday" },
                              { case: { $eq: ["$$dayOfWeek", 3] }, then: "Tuesday" },
                              { case: { $eq: ["$$dayOfWeek", 4] }, then: "Wednesday" },
                              { case: { $eq: ["$$dayOfWeek", 5] }, then: "Thursday" },
                              { case: { $eq: ["$$dayOfWeek", 6] }, then: "Friday" },
                              { case: { $eq: ["$$dayOfWeek", 7] }, then: "Saturday" },
                            ],
                            default: "Unknown day",
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
    ];

    if (settingJSON.isDummyData) {
      queries.push(
        User.aggregate([
          { $match: { isFake: true } },
          {
            $project: {
              userId: "$_id",
              name: 1,
              userName: 1,
              image: 1,
              isProfilePicBanned: 1,
              isOnline: 1,
              isVerified: 1,
              isFake: 1,
              message: {
                $let: {
                  vars: {
                    randomIndex: { $floor: { $multiply: [{ $rand: {} }, 10] } },
                  },
                  in: {
                    $arrayElemAt: [
                      [
                        "What's up? 🤔",
                        "How’s your day going? 🌞",
                        "Let’s connect! 🚗",
                        "Hey there! 👋",
                        "Are you free to chat? 💬",
                        "Long time no see! 😊",
                        "Wanna talk for a bit? 🕐",
                        "Missing our chats! 📱",
                        "Hope you’re doing well! 🌼",
                        "Can I ask you something? ❓",
                      ],
                      "$$randomIndex",
                    ],
                  },
                },
              },
              unreadCount: { $floor: { $add: [1, { $multiply: [10, { $rand: {} }] }] } },
              chatTopicId: { $literal: "" },
              senderId: { $literal: "" },
              lastChatMessageTime: { $literal: "" },
              time: { $literal: "" },
              avatarFrameType: { $literal: 0 },
              avatarFrameImage: { $literal: "" },
            },
          },
          { $sample: { size: limit } },
        ]),
      );
    }

    const [chatList, fakeUserChatList] = await Promise.all(queries);

    let combinedData = settingJSON.isDummyData ? [...chatList, ...fakeUserChatList] : chatList;

    if (type === "online") {
      combinedData = combinedData.filter((item) => item.isOnline);
    } else if (type === "unread") {
      combinedData = combinedData.filter((item) => item.unreadCount > 0);
    }

    combinedData = combinedData.sort((a, b) => new Date(b.lastChatMessageTime) - new Date(a.lastChatMessageTime));
    const paginatedData = combinedData.slice((start - 1) * limit, start * limit);

    return res.status(200).json({
      status: true,
      message: "Success",
      data: paginatedData.length > 0 ? paginatedData : [],
    });
  } catch (error) {
    console.error("Error fetching chat list:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//search for chat participants by their name or username within existing chat topics
exports.findChatUserBySearch = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!req.query.searchString) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const searchString = req.query.searchString.trim();

    const chatUsers = await ChatTopic.aggregate([
      {
        $match: {
          chatId: { $ne: null },
          $or: [{ senderId: userId }, { receiverId: userId }],
        },
      },
      {
        $addFields: {
          otherUserId: {
            $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"],
          },
        },
      },
      {
        $lookup: {
          from: "blocks",
          localField: "otherUserId",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: {
                userId: userId,
              },
            },
          ],
          as: "isBlocked",
        },
      },
      {
        $match: {
          isBlocked: { $eq: [] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "otherUserId",
          foreignField: "_id",
          pipeline: [
            {
              $match: {
                isBlock: false,
                ...(searchString !== "All"
                  ? {
                      $or: [{ name: { $regex: searchString, $options: "i" } }, { userName: { $regex: searchString, $options: "i" } }, { uniqueId: { $regex: searchString, $options: "i" } }],
                    }
                  : {}),
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                userName: 1,
                uniqueId: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isOnline: 1,
                isFake: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: false } },
      { $limit: 50 },
      {
        $lookup: {
          from: "avtarframes",
          localField: "userDetails.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userDetails: 1,
          chatTopicId: "$_id",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$userDetails",
              {
                chatTopicId: "$chatTopicId",
                avtarFrame: "$avtarFrame",
                avtarFrameType: "$avtarFrameType",
              },
            ],
          },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: chatUsers.length ? "Success" : "No data found.",
      data: chatUsers,
    });
  } catch (error) {
    console.error("Error fetching chat users:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
