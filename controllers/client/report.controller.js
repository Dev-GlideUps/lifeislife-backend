const Report = require("../../models/report.model");

//import model
const User = require("../../models/user.model");
const Video = require("../../models/video.model");
const Post = require("../../models/post.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//report made by user
exports.userSubmittedReport = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { reportReason, type, videoId, postId, toUserId } = req.query;
    if (!reportReason || !type) {
      return res.status(200).json({ status: false, message: "Invalid request details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const videoObjectId = videoId ? new mongoose.Types.ObjectId(videoId) : null;
    const postObjectId = postId ? new mongoose.Types.ObjectId(postId) : null;
    const toUserObjectId = toUserId ? new mongoose.Types.ObjectId(toUserId) : null;

    const [user, video, post, toUser, existingReport] = await Promise.all([
      User.findOne({ _id: userObjectId, isBlock: false }).select("_id name fcmToken isPushNotificationEnabled").lean(),
      videoObjectId ? Video.findOne({ _id: videoObjectId }).lean() : null,
      postObjectId ? Post.findOne({ _id: postObjectId }).lean() : null,
      toUserObjectId ? User.findOne({ _id: toUserObjectId }).select("_id isBlock").lean() : null,
      Report.findOne({
        ...(videoId && { videoId: videoObjectId, userId: userObjectId, type: 1 }),
        ...(postId && { postId: postObjectId, userId: userObjectId, type: 2 }),
        ...(toUserId && { fromUserId: userObjectId, toUserId: toUserObjectId, type: 3 }),
      }).lean(),
    ]);

    if (!user) return res.status(200).json({ status: false, message: "User not found." });

    if (type == 1 && videoId && !video) {
      return res.status(200).json({ status: false, message: "Video not found." });
    }

    if (type == 2 && postId && !post) {
      return res.status(200).json({ status: false, message: "Post not found." });
    }

    if (type == 3 && toUserId && !toUser) {
      return res.status(200).json({ status: false, message: "Reported user not found." });
    }

    if (type == 3 && toUserId && toUser.isBlock) {
      return res.status(200).json({ status: false, message: "Reported user is blocked." });
    }

    // Prevent user from reporting their own account (type 3)
    if (type == 3 && toUserId && toUserObjectId.equals(userObjectId)) {
      return res.status(200).json({ status: false, message: "You cannot report your own account." });
    }

    if (existingReport) {
      return res.status(200).json({
        status: true,
        message: `A report has already been submitted by ${user.name}.`,
      });
    }

    res.status(200).json({
      status: true,
      message: `A report has been successfully submitted.`,
    });

    const newReport = new Report({
      userId: user._id,
      videoId: videoObjectId || null,
      postId: postObjectId || null,
      toUserId: toUserObjectId || null,
      reportReason: reportReason.trim(),
      type: type === "video" ? 1 : type === "post" ? 2 : 3,
    });
    await newReport.save();

    if (user && user.isPushNotificationEnabled && user.fcmToken) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "🚨 Report Submitted Successfully!",
          body: "Thank you for keeping our community safe! Our team will review your report shortly. 🛡️👀",
        },
        data: {
          type: "REPORT_SUBMISSION",
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
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};
