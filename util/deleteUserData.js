//fs
const fs = require("fs");

//path
const path = require("path");

const { deleteFile } = require("./deletefile");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../util/privateKey");

//import model
const User = require("../models/user.model");
const History = require("../models/history.model");
const FollowerFollowing = require("../models/followerFollowing.model");
const FakeLiveStreamer = require("../models/fakeLiveStreamer.model");
const ProfileVisitor = require("../models/profileVisitor.model");
const CoinTrader = require("../models/cointrader.model");
const CoinTraderHistory = require("../models/coinTraderHistory.model");
const Comment = require("../models/comment.model");
const Help = require("../models/help.model");
const HostApplication = require("../models/hostApplication.model");
const LikeHistory = require("../models/likeHistory.model");
const LikeHistoryOfComment = require("../models/likeHistoryOfComment.model");
const LiveStreamer = require("../models/liveStreamer.model");
const LiveStreamerHistory = require("../models/liveStreamerHistory.model");
const LiveStreamerView = require("../models/liveStreamerView.model");
const LiveStreamComment = require("../models/liveStreamComment.model");
const Notification = require("../models/notification.model");
const PayoutRequest = require("../models/payoutRequest.model");
const Post = require("../models/post.model");
const PurchasedItem = require("../models/purchasedItem.model");
const Referral = require("../models/referral.model");
const Report = require("../models/report.model");
const SongFavorite = require("../models/songFavorite.model");
const TopGifter = require("../models/topGifter.model");
const Video = require("../models/video.model");
const WatchHistory = require("../models/watchHistory.model");
const Block = require("../models/block.model");
const Chat = require("../models/chat.model");
const ChatTopic = require("../models/chatTopic.model");
const HashTagUsageHistory = require("../models/hashTagUsageHistory.model");
const Verification = require("../models/verification.model");
const Agency = require("../models/agency.model");

//Helper function to delete all data associated with a userId
const deleteUserDataById = async (userId, user) => {
  const [chats, coinTraders, notifications, helpDocs, verificationDocs, posts, videos, fakeLiveStreamers] = await Promise.all([
    Chat.find({ senderId: userId }).select("image audio").lean(),
    CoinTrader.find({ userId }).select("_id").lean(),
    Notification.find({ userId }).select("_id image").lean(),
    Help.find({ userId }).select("_id image").lean(),
    Verification.find({ user: userId }).select("_id idProofUrl selfieUrl").lean(),
    Post.find({ userId }).select("_id postImage").lean(),
    Video.find({ userId }).select("_id videoUrl videoImage").lean(),
    FakeLiveStreamer.find({ userId }).select("_id thumbnail streamSource pkThumbnails pkStreamSources").lean(),
  ]);

  if (coinTraders.length > 0) {
    for (const trader of coinTraders) {
      await CoinTraderHistory.deleteMany({ coinTraderId: trader._id });
    }
  }

  if (chats.length > 0) {
    for (const chat of chats) {
      if (chat.image) {
        deleteFile(chat.image);
      }

      if (chat.audio) {
        deleteFile(chat.audio);
      }
    }
  }

  if (notifications.length > 0) {
    for (const notification of notifications) {
      if (notification.image) {
        deleteFile(notification.image);
      }
      await Notification.findByIdAndDelete(notification._id);
    }
  }

  if (helpDocs.length > 0) {
    for (const help of helpDocs) {
      if (help.image) {
        deleteFile(help.image);
      }
      await Help.findByIdAndDelete(help._id);
    }
  }

  if (verificationDocs.length > 0) {
    for (const verification of verificationDocs) {
      if (verification.idProofUrl) {
        deleteFile(verification.idProofUrl);
      }
      if (verification.selfieUrl) {
        deleteFile(verification.selfieUrl);
      }
      await Verification.findByIdAndDelete(verification._id);
    }
  }

  if (posts.length > 0) {
    for (const post of posts) {
      for (const { url } of post.postImage || []) {
        deleteFile(url);
      }
      await Post.findByIdAndDelete(post._id);
    }
  }

  if (videos.length > 0) {
    for (const video of videos) {
      deleteFile(video.videoUrl);
      deleteFile(video.videoImage);

      await Video.findByIdAndDelete(video._id);
    }
  }

  if (fakeLiveStreamers.length > 0) {
    for (const fakeLiveStreamer of fakeLiveStreamers) {
      if (fakeLiveStreamer.thumbnail) {
        deleteFile(fakeLiveStreamer.thumbnail);
      }

      if (fakeLiveStreamer.streamSource) {
        deleteFile(fakeLiveStreamer.streamSource);
      }

      if (Array.isArray(fakeLiveStreamer.pkThumbnails)) {
        for (const thumb of fakeLiveStreamer.pkThumbnails) {
          deleteFile(thumb);
        }
      }

      if (Array.isArray(fakeLiveStreamer.pkStreamSources)) {
        for (const source of fakeLiveStreamer.pkStreamSources) {
          deleteFile(source);
        }
      }

      await FakeLiveStreamer.findByIdAndDelete(fakeLiveStreamer._id);
    }
  }

  await Promise.all([
    ChatTopic.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
    Chat.deleteMany({ senderId: userId }),
    CoinTrader.deleteMany({ userId }),
    CoinTraderHistory.deleteMany({ userId }),
    Comment.deleteMany({ userId }),
    ProfileVisitor.deleteMany({ $or: [{ visitorId: userId }, { profileOwnerId: userId }] }),
    FollowerFollowing.deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] }),
    Block.deleteMany({ $or: [{ userId: userId }, { toUserId: userId }] }),
    History.deleteMany({ $or: [{ userId }, { otherUserId: userId }] }),
    HostApplication.deleteMany({ userId }),
    LikeHistory.deleteMany({ userId }),
    LikeHistoryOfComment.deleteMany({ userId }),
    LiveStreamer.deleteMany({ userId }),
    LiveStreamerHistory.deleteMany({ userId }),
    LiveStreamerView.deleteMany({ userId }),
    LiveStreamComment.deleteMany({ userId }),
    PayoutRequest.deleteMany({ userId }),
    PurchasedItem.deleteMany({ userId }),
    Report.deleteMany({ $or: [{ userId: userId }, { toUserId: userId }] }),
    SongFavorite.deleteMany({ userId }),
    Referral.deleteMany({ $or: [{ referralCodeUser: userId }, { referees: { $elemMatch: { userId } } }] }),
    TopGifter.deleteMany({ gifters: { $elemMatch: { userId } } }),
    WatchHistory.deleteMany({ userId }),
    HashTagUsageHistory.deleteMany({ hashTagCreator: userId }),
  ]);

  if (user.image) {
    const currentImage = user?.image;
    if (currentImage && currentImage.includes("storage")) {
      const imagePath = path.join(__dirname, currentImage);
      const isDefaultFolder = currentImage.startsWith("storage/defaultphoto");

      if (!isDefaultFolder && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log("Old image deleted:", imagePath);
      }
    }
  }

  try {
    const agency = await Agency.findOne({ userId: userId });
    if (agency) {
      console.log(`Deleting Agency and all related data for user ${userId}`);

      await Promise.all([
        User.updateMany(
          {
            agencyId: agency._id,
            role: 2,
          },
          {
            $set: { agencyId: null },
            $pull: { role: 2 },
          },
        ),
        History.deleteMany({
          $or: [{ agencyId: agency._id }, { hostAgencyId: agency._id }],
        }),
        HostApplication.deleteMany({ agencyId: agency._id }),
        LiveStreamerHistory.deleteMany({ agencyId: agency._id }),
        PayoutRequest.deleteMany({ agencyId: agency._id }),
      ]);

      if (agency?.image) {
        deleteFile(agency?.image);
      }

      await Agency.findByIdAndDelete(agency._id);

      console.log(`✅ Agency ${agency._id} deleted`);
    }
  } catch (err) {
    console.error("❌ Error deleting agency data:", err.message);
  }

  if (user.firebaseUid) {
    try {
      const adminInstance = await admin;
      await adminInstance.auth().deleteUser(user.firebaseUid);

      console.log(`✅ Firebase user deleted: ${user.firebaseUid}`);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        console.warn(`⚠️ Firebase user already deleted: ${user.firebaseUid}`);
      } else {
        console.error(`❌ Failed to delete Firebase user ${user.firebaseUid}:`, err.message);
      }
    }
  }

  await User.findByIdAndDelete(userId);
};

module.exports = deleteUserDataById;
