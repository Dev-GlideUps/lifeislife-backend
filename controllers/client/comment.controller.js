const Comment = require("../../models/comment.model");
const Post = require("../../models/post.model");
const Video = require("../../models/video.model");
const User = require("../../models/user.model");
const Notification = require("../../models/notification.model");

//private key
const admin = require("../../util/privateKey");

//mongoose
const mongoose = require("mongoose");

//day.js
const dayjs = require("dayjs");

//add comment of particular post or video
exports.addCommentToMedia = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { commentText, type, postId, videoId } = req.query;
    if (!commentText || !type) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    if (type !== "post" && type !== "video") {
      return res.status(200).json({ status: false, message: "Invalid type. Type must be 'post' or 'video'." });
    }

    let targetId = type === "post" ? postId : videoId;
    if (!targetId) {
      return res.status(200).json({ status: false, message: `${type}Id is required.` });
    }

    const userObjId = new mongoose.Types.ObjectId(req.user.userId);
    const targetObjId = new mongoose.Types.ObjectId(targetId);

    const [user, target, newComment] = await Promise.all([
      User.findOne({ _id: userObjId, isBlock: false }).select("_id name image").lean(),
      type === "post" ? Post.findById(targetObjId).select("_id userId mainPostImage").lean() : Video.findById(targetObjId).select("_id userId videoImage").lean(),
      Comment.create({
        userId: userObjId,
        [type === "post" ? "postId" : "videoId"]: targetObjId,
        commentText: commentText.trim(),
      }),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!target) {
      return res.status(200).json({ status: false, message: `${type} not found.` });
    }

    res.status(200).json({
      status: true,
      message: `Comment added on ${type}.`,
      comment: newComment,
    });

    const targetUser = await User.findById(target.userId).select("_id fcmToken").lean();
    if (!targetUser.isBlock && targetUser?.fcmToken !== null) {
      const notificationPayload =
        type === "post"
          ? {
              token: targetUser.fcmToken,
              notification: {
                title: user?.name ? `💬 ${user.name} commented on your post! 📢` : "📢 Your Post is Getting Attention! 💬",
                body: user?.name ? `🗨️ ${user.name} just shared their thoughts on your post. Tap to see what they said! 🚀` : "🚀 Someone just shared their thoughts on your post! Check it out now!",
              },
              data: {
                type: "POSTCOMMENT",
                image: String(user.image),
                commentId: String(newComment._id),
                postId: String(postId),
                postUserId: String(target.userId),
              },
            }
          : {
              token: targetUser.fcmToken,
              notification: {
                title: user?.name ? `💬 ${user.name} commented on your video! 🎥` : "🎥 Your Video is Creating Buzz! 💬",
                body: user?.name ? `🔥 ${user.name} just commented on your video. Tap to see their message! 👀` : "🔥 A new comment just landed on your video! See what they said!",
              },
              data: {
                type: "VIDEOCOMMENT",
                image: String(user.image),
                commentId: String(newComment._id),
                videoId: String(videoId),
                videoUserId: String(target.userId),
              },
            };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(notificationPayload)
        .then(async (response) => {
          console.log("Notification sent successfully: ", response);

          await Notification.create({
            userId: targetUser._id,
            title: type === "post" ? "📢 Your Post is Getting Attention! 💬" : "🎥 Your Video is Creating Buzz! 💬",
            message: type === "post" ? "🚀 Someone engaged with your post! Don't miss their comment!" : "🎥 Your video has a new comment! See what they said!",
            image: type === "post" ? target.mainPostImage : target.videoImage,
            date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
          });
        })
        .catch((error) => console.error("Error sending notification: ", error));
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//get comments for particular video or post
exports.fetchMediaComments = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const { type, postId, videoId } = req.query;
    if (!type || !["post", "video"].includes(type.trim().toLowerCase())) {
      return res.status(200).json({ status: false, message: "Invalid type. Must be 'post' or 'video'." });
    }

    const now = dayjs();
    const queryId = type === "post" ? postId : videoId;
    if (!queryId) {
      return res.status(200).json({ status: false, message: `${type}Id is required.` });
    }

    const model = type === "post" ? Post : Video;
    const matchField = type === "post" ? "postId" : "videoId";
    const objectId = new mongoose.Types.ObjectId(queryId);

    const [record, comments] = await Promise.all([
      model.findOne({ _id: objectId }).lean().select("_id"),
      Comment.aggregate([
        {
          $match: {
            [matchField]: objectId,
            recursiveCommentId: null,
          },
        },
        {
          $project: {
            userId: 1,
            commentText: 1,
            createdAt: 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  userName: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  isVerified: 1,
                  activeAvtarFrame: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $lookup: {
            from: "avtarframes",
            localField: "user.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "avtarframeDetails",
          },
        },
        {
          $unwind: {
            path: "$avtarframeDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            userId: "$user._id",
            name: "$user.name",
            userName: "$user.userName",
            userImage: "$user.image",
            isVerified: "$user.isVerified",
            isProfilePicBanned: "$user.isProfilePicBanned",
            avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
            avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
            commentText: 1,
            createdAt: 1,
            time: {
              $let: {
                vars: { timeDiff: { $subtract: [now.toDate(), "$createdAt"] } },
                in: {
                  $switch: {
                    branches: [
                      { case: { $gte: ["$$timeDiff", 31536000000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"] } },
                      { case: { $gte: ["$$timeDiff", 2592000000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"] } },
                      { case: { $gte: ["$$timeDiff", 604800000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"] } },
                      { case: { $gte: ["$$timeDiff", 86400000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"] } },
                      { case: { $gte: ["$$timeDiff", 3600000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"] } },
                      { case: { $gte: ["$$timeDiff", 60000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"] } },
                      { case: { $gte: ["$$timeDiff", 1000] }, then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"] } },
                      { case: true, then: "Just now" },
                    ],
                  },
                },
              },
            },
          },
        },
      ]),
    ]);

    if (!record) {
      return res.status(200).json({ status: false, message: `${type} not found.` });
    }

    return res.status(200).json({
      status: true,
      message: `Comments for the ${type}.`,
      comments,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
