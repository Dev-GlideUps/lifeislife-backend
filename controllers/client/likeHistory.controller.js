const LikeHistory = require("../../models/likeHistory.model");
const Post = require("../../models/post.model");
const Video = require("../../models/video.model");
const User = require("../../models/user.model");
const Notification = require("../../models/notification.model");

//private key
const admin = require("../../util/privateKey");

//mongoose
const mongoose = require("mongoose");

//toggling like/dislike on a post
exports.togglePostLikeStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    if (!req.query.postId) {
      return res.status(200).json({ status: false, message: "Invalid details. 'postId' is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const postId = new mongoose.Types.ObjectId(req.query.postId);

    const [user, post, alreadyLikedPost] = await Promise.all([
      User.findOne({ _id: userId, isBlock: false }).select("_id name image").lean(),
      Post.findById(postId).select("_id userId mainPostImage").lean(),
      LikeHistory.findOne({ userId, postId }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!post) {
      return res.status(200).json({ status: false, message: "Post not found." });
    }

    if (alreadyLikedPost) {
      res.status(200).json({
        status: true,
        message: "The post has been unliked by the user.",
        isLike: false,
      });

      await LikeHistory.deleteOne({ userId: user._id, postId: post._id });
    } else {
      res.status(200).json({
        status: true,
        message: "The post has been liked by the user.",
        isLike: true,
      });

      const likeHistory = new LikeHistory({
        userId: user._id,
        postId: post._id,
        uploaderId: post.userId,
      });
      await likeHistory.save();

      const postUser = await User.findOne({ _id: post.userId, isBlock: false }).select("_id fcmToken isBlock isPushNotificationEnabled").lean();

      if (postUser && postUser.isPushNotificationEnabled && !postUser.isBlock && postUser.fcmToken) {
        const payload = {
          token: postUser.fcmToken,
          notification: {
            title: user?.name ? `❤️ ${user.name} liked your post! 🔥` : "❤️ Someone Loved Your Post! 🔥",
            body: user?.name ? `🎉 ${user.name} just liked your post. Tap to see who appreciated your content! 👀✨` : "🎉 Great news! Your post just got a like. Tap to see who appreciated it! 👀✨",
          },
          data: {
            type: "POSTLIKE",
            image: String(user.image),
            postId: String(post._id),
            userId: String(user._id),
            postUserId: String(post.userId),
          },
        };

        const adminPromise = await admin;
        adminPromise
          .messaging()
          .send(payload)
          .then(async (response) => {
            console.log("Notification sent successfully:", response);
          })
          .catch((error) => {
            console.error("Error sending notification:", error);
          });
      }
    }
  } catch (error) {
    console.error("Error in togglePostLikeStatus:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//toggling like/dislike on a video
exports.toggleVideoLikeStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    if (!req.query.videoId) {
      return res.status(200).json({ status: false, message: "Invalid details. 'videoId' is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const videoId = new mongoose.Types.ObjectId(req.query.videoId);

    const [user, video, alreadyLikedVideo] = await Promise.all([
      User.findOne({ _id: userId, isBlock: false }).select("_id name image fcmToken").lean(),
      Video.findById(videoId).select("_id userId thumbnail").lean(),
      LikeHistory.findOne({ userId, videoId }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!video) {
      return res.status(200).json({ status: false, message: "Video not found." });
    }

    if (alreadyLikedVideo) {
      res.status(200).json({
        status: true,
        message: "The video has been unliked by the user.",
        isLike: false,
      });

      await LikeHistory.deleteOne({ userId: user._id, videoId: video._id });
    } else {
      res.status(200).json({
        status: true,
        message: "The video has been liked by the user.",
        isLike: true,
      });

      const likeHistory = new LikeHistory({
        userId: user._id,
        videoId: video._id,
        uploaderId: video.userId,
      });
      await likeHistory.save();

      const videoUploader = await User.findOne({ _id: video.userId, isBlock: false }).select("_id fcmToken isPushNotificationEnabled isBlock").lean();

      if (videoUploader && videoUploader.isPushNotificationEnabled && !videoUploader.isBlock && videoUploader.fcmToken) {
        const payload = {
          token: videoUploader.fcmToken,
          notification: {
            title: user?.name ? `🎥 ${user.name} liked your video! 🔥` : "🎥 Someone Loved Your Video! 🔥",
            body: user?.name ? `👏 ${user.name} just liked your video. Tap to see who enjoyed it! 🎬✨` : "🎬 Awesome! Your video just got a like. Tap to see who enjoyed it! 🎬✨",
          },
          data: {
            type: "VIDEOLIKE",
            image: String(user.image),
            videoId: String(videoId),
            videoUserId: String(video.userId),
          },
        };

        const adminPromise = await admin;
        adminPromise
          .messaging()
          .send(payload)
          .then(async (response) => {
            console.log("Notification sent successfully:", response);
          })
          .catch((error) => {
            console.error("Error sending notification:", error);
          });
      }
    }
  } catch (error) {
    console.error("Error in toggleVideoLikeStatus:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
