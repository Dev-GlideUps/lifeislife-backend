const FollowerFollowing = require("../../models/followerFollowing.model");

//mongoose
const mongoose = require("mongoose");

//import model
const User = require("../../models/user.model");

//private key
const admin = require("../../util/privateKey");

//follow or unfollow the user
exports.followUnfollow = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!req.query.toUserId) {
      return res.status(200).json({ status: false, message: "⚠️ Invalid details provided." });
    }

    const fromUserId = new mongoose.Types.ObjectId(req.user.userId);
    const toUserId = new mongoose.Types.ObjectId(req.query.toUserId);

    const [fromUser, toUser, alreadyFollowing] = await Promise.all([
      User.findById(fromUserId).select("_id name image isBlock image").lean(),
      User.findById(toUserId).select("_id isBlock isPushNotificationEnabled fcmToken").lean(),
      FollowerFollowing.findOne({ fromUserId, toUserId }).select("_id").lean(),
    ]);

    if (!fromUser) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!toUser) {
      return res.status(200).json({ status: false, message: "Target user not found." });
    }

    if (toUser.isBlock) {
      return res.status(200).json({ status: false, message: "This user is blocked by the admin." });
    }

    if (fromUser._id.equals(toUser._id)) {
      return res.status(200).json({ status: false, message: "You can't follow yourself!" });
    }

    if (alreadyFollowing) {
      res.status(200).json({
        status: true,
        message: "You have unfollowed this user.",
        isFollow: false,
      });

      await FollowerFollowing.deleteOne({ fromUserId, toUserId });
    } else {
      res.status(200).json({
        status: true,
        message: "You are now following this user!",
        isFollow: true,
      });

      await new FollowerFollowing({ fromUserId, toUserId }).save();

      if (toUser.isPushNotificationEnabled && !toUser.isBlock && toUser.fcmToken !== null) {
        const payload = {
          token: toUser.fcmToken,
          notification: {
            title: fromUser?.name ? `✨ ${fromUser.name} started following you!` : "✨ New Follower Alert! 🚀",
            body: fromUser?.name ? `🤝 ${fromUser.name} is now following you. Connect and explore opportunities together! 👀` : "🥳 Someone just followed you! Check out your new connection now! 👀",
          },
          data: {
            type: "FOLLOW",
            image: String(fromUser?.image),
            fromUserId: String(fromUserId),
          },
        };

        const adminPromise = await admin;
        adminPromise
          .messaging()
          .send(payload)
          .then(async (response) => {
            console.log("✅ Notification sent successfully:", response);
          })
          .catch((error) => {
            console.error("❌ Error sending notification:", error);
          });
      }
    }
  } catch (error) {
    console.error("❌ Error in toggleFollowStatus:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//retrieves friends, following, and followers
exports.getSocialLists = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = mongoose.isValidObjectId(req.user.userId) ? new mongoose.Types.ObjectId(req.user.userId) : null;
    if (!userId) {
      return res.status(200).json({ status: false, message: "Invalid user ID." });
    }

    const start = Math.max(parseInt(req.query.start) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (start - 1) * limit;

    const friendsPromise = FollowerFollowing.aggregate([
      { $match: { fromUserId: userId } },
      { $project: { toUserId: 1, createdAt: 1 } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "toUserId",
          foreignField: "fromUserId",
          as: "mutualFollow",
        },
      },
      { $unwind: { path: "$mutualFollow", preserveNullAndEmptyArrays: true } },
      { $match: { "mutualFollow.toUserId": userId } },
      {
        $lookup: {
          from: "users",
          localField: "toUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                age: 1,
                isVerified: 1,
                country: 1,
                countryFlagImage: 1,
                coin: 1,
                uniqueId: 1,
                isOnline: 1,
                createdAt: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "friendDetails",
        },
      },
      { $unwind: { path: "$friendDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "friendDetails.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "friendDetails.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: "$friendDetails._id",
          name: "$friendDetails.name",
          userName: "$friendDetails.userName",
          image: "$friendDetails.image",
          isProfilePicBanned: "$friendDetails.isProfilePicBanned",
          age: "$friendDetails.age",
          isVerified: "$friendDetails.isVerified",
          country: "$friendDetails.country",
          countryFlagImage: "$friendDetails.countryFlagImage",
          coin: "$friendDetails.coin",
          uniqueId: "$friendDetails.uniqueId",
          isOnline: "$friendDetails.isOnline",
          date: "$friendDetails.createdAt",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isFollow: true,
        },
      },
    ]);

    const followingPromise = FollowerFollowing.aggregate([
      { $match: { fromUserId: userId } },
      { $project: { toUserId: 1, createdAt: 1 } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "toUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                age: 1,
                isVerified: 1,
                country: 1,
                countryFlagImage: 1,
                coin: 1,
                uniqueId: 1,
                isOnline: 1,
                createdAt: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "followingDetails",
        },
      },
      { $unwind: { path: "$followingDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "followingDetails.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "followingDetails.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "followingDetails._id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: { fromUserId: userId },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: "isFollowing",
        },
      },
      {
        $project: {
          _id: "$followingDetails._id",
          name: "$followingDetails.name",
          userName: "$followingDetails.userName",
          image: "$followingDetails.image",
          isProfilePicBanned: "$followingDetails.isProfilePicBanned",
          age: "$followingDetails.age",
          isVerified: "$followingDetails.isVerified",
          country: "$followingDetails.country",
          countryFlagImage: "$followingDetails.countryFlagImage",
          coin: "$followingDetails.coin",
          uniqueId: "$followingDetails.uniqueId",
          isOnline: "$followingDetails.isOnline",
          date: "$followingDetails.createdAt",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
        },
      },
    ]);

    const followersPromise = FollowerFollowing.aggregate([
      { $match: { toUserId: userId } },
      { $project: { fromUserId: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "fromUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                age: 1,
                isVerified: 1,
                country: 1,
                countryFlagImage: 1,
                coin: 1,
                uniqueId: 1,
                isOnline: 1,
                createdAt: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "followerDetails",
        },
      },
      { $unwind: { path: "$followerDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "followerDetails.wealthLevel",
          foreignField: "_id",
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "followerDetails.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "followerDetails._id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: { fromUserId: userId },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: "isFollowing",
        },
      },
      {
        $project: {
          _id: "$followerDetails._id",
          name: "$followerDetails.name",
          userName: "$followerDetails.userName",
          image: "$followerDetails.image",
          isProfilePicBanned: "$followerDetails.isProfilePicBanned",
          age: "$followerDetails.age",
          isVerified: "$followerDetails.isVerified",
          country: "$followerDetails.country",
          countryFlagImage: "$followerDetails.countryFlagImage",
          coin: "$followerDetails.coin",
          uniqueId: "$followerDetails.uniqueId",
          isOnline: "$followerDetails.isOnline",
          date: "$followerDetails.createdAt",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
        },
      },
    ]);

    const [friends, following, followers] = await Promise.all([friendsPromise, followingPromise, followersPromise]);

    return res.status(200).json({
      status: true,
      message: "Social lists retrieved successfully",
      friends,
      following,
      followers,
    });
  } catch (error) {
    console.error("Error fetching social lists:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

//retrieves tousers's friends, following, and followers
exports.fetchUserSocialConnections = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = mongoose.isValidObjectId(req.user.userId) ? new mongoose.Types.ObjectId(req.user.userId) : null;
    if (!userId) {
      return res.status(200).json({ status: false, message: "Invalid user ID." });
    }

    const { toUserId: toUserIdParam, start = 1, limit = 20 } = req.query;

    if (!toUserIdParam || !mongoose.isValidObjectId(toUserIdParam)) {
      return res.status(200).json({ status: false, message: "Invalid or missing userId" });
    }

    const toUserObjId = new mongoose.Types.ObjectId(toUserIdParam);
    const skip = (parseInt(start) - 1) * parseInt(limit);
    const pageLimit = parseInt(limit);

    const userExists = await User.findById(toUserObjId).select("_id isBlock");

    if (!userExists) {
      return res.status(200).json({ status: false, message: "User not found" });
    }

    if (userExists.isBlock) {
      return res.status(200).json({
        status: false,
        message: "User account has been blocked. Please contact support.",
      });
    }

    const commonUserLookups = [
      {
        $lookup: {
          from: "users",
          localField: "targetUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                age: 1,
                isVerified: 1,
                country: 1,
                countryFlagImage: 1,
                coin: 1,
                uniqueId: 1,
                isOnline: 1,
                createdAt: 1,
                wealthLevel: 1,
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
          from: "wealthlevels",
          localField: "user.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealth",
        },
      },
      { $unwind: { path: "$wealth", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          pipeline: [{ $project: { image: 1, type: 1 } }],
          as: "frame",
        },
      },
      { $unwind: { path: "$frame", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "followerfollowings",
          localField: "user._id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: { fromUserId: userId },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: "isFollowing",
        },
      },

      {
        $project: {
          _id: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          age: "$user.age",
          isVerified: "$user.isVerified",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          coin: "$user.coin",
          uniqueId: "$user.uniqueId",
          isOnline: "$user.isOnline",
          date: "$user.createdAt",
          wealthLevelImage: { $ifNull: ["$wealth.levelImage", ""] },
          avtarFrame: { $ifNull: ["$frame.image", ""] },
          avtarFrameType: { $ifNull: ["$frame.type", 0] },
          isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
        },
      },
    ];

    const friendsPipeline = [
      { $match: { fromUserId: toUserObjId } },
      { $project: { targetUserId: "$toUserId" } },
      { $skip: skip },
      { $limit: pageLimit },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "targetUserId",
          foreignField: "fromUserId",
          pipeline: [
            {
              $match: { toUserId: toUserObjId },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: "mutual",
        },
      },
      { $match: { mutual: { $ne: [] } } },

      ...commonUserLookups,
    ];

    const followingPipeline = [{ $match: { fromUserId: toUserObjId } }, { $project: { targetUserId: "$toUserId" } }, { $skip: skip }, { $limit: pageLimit }, ...commonUserLookups];

    const followersPipeline = [{ $match: { toUserId: toUserObjId } }, { $project: { targetUserId: "$fromUserId" } }, { $skip: skip }, { $limit: pageLimit }, ...commonUserLookups];

    const [friends, following, followers] = await Promise.all([
      FollowerFollowing.aggregate(friendsPipeline),
      FollowerFollowing.aggregate(followingPipeline),
      FollowerFollowing.aggregate(followersPipeline),
    ]);

    return res.status(200).json({
      status: true,
      message: "Social lists retrieved successfully",
      friends,
      following,
      followers,
    });
  } catch (err) {
    console.error("fetchUserSocialConnections Error:", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get the friend list (users who follow each other)
exports.getFriendsList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId); // Extracted from Firebase token

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const friends = await FollowerFollowing.aggregate([
      { $match: { fromUserId: userId } },
      { $project: { toUserId: 1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },

      {
        $lookup: {
          from: "followerfollowings",
          localField: "toUserId",
          foreignField: "fromUserId",
          as: "mutualFollow",
        },
      },
      { $unwind: "$mutualFollow" },
      { $match: { "mutualFollow.toUserId": userId } },
      {
        $lookup: {
          from: "users",
          localField: "toUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                isProfilePicBanned: 1,
                age: 1,
                isVerified: 1,
                country: 1,
                coin: 1,
                uniqueId: 1,
                wealthLevel: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "friendDetails",
        },
      },
      { $unwind: "$friendDetails" },
      {
        $lookup: {
          from: "avtarframes",
          localField: "friendDetails.activeAvtarFrame",
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
        $lookup: {
          from: "wealthlevels",
          localField: "friendDetails.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      {
        $unwind: {
          path: "$wealthDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          _id: "$friendDetails._id",
          name: "$friendDetails.name",
          userName: "$friendDetails.userName",
          image: "$friendDetails.image",
          isProfilePicBanned: "$friendDetails.isProfilePicBanned",
          age: "$friendDetails.age",
          isVerified: "$friendDetails.isVerified",
          country: "$friendDetails.country",
          coin: "$friendDetails.coin",
          uniqueId: "$friendDetails.uniqueId",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Friends list retrieved successfully",
      friends,
    });
  } catch (error) {
    console.error("Error fetching friends list:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get the following list (users whom I follow)
exports.getFollowingList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId); // Extracted from Firebase token

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const following = await FollowerFollowing.aggregate([
      { $match: { fromUserId: userId } },
      { $project: { toUserId: 1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "toUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                age: 1,
                uniqueId: 1,
                wealthLevel: 1,
              },
            },
          ],
          as: "followingDetails",
        },
      },
      { $unwind: { path: "$followingDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "followingDetails.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "followingDetails._id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: { fromUserId: userId },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: "isFollowing",
        },
      },
      {
        $project: {
          _id: "$followingDetails._id",
          name: "$followingDetails.name",
          age: "$followingDetails.age",
          uniqueId: "$followingDetails.uniqueId",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Following list retrieved successfully",
      following,
    });
  } catch (error) {
    console.error("Error fetching following list:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get the followers list (users who follow me)
exports.getFollowersList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId); // Extracted from Firebase token

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const followers = await FollowerFollowing.aggregate([
      { $match: { toUserId: userId } },
      { $project: { fromUserId: 1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "fromUserId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                age: 1,
                uniqueId: 1,
                wealthLevel: 1,
              },
            },
          ],
          as: "followerDetails",
        },
      },
      { $unwind: { path: "$followerDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "followerDetails.wealthLevel",
          foreignField: "_id",
          pipeline: [{ $project: { levelImage: 1 } }],
          as: "wealthDetails",
        },
      },
      { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "followerDetails._id",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: { fromUserId: userId },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: "isFollowing",
        },
      },
      {
        $project: {
          _id: "$followerDetails._id",
          name: "$followerDetails.name",
          age: "$followerDetails.age",
          uniqueId: "$followerDetails.uniqueId",
          wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
          isFollow: { $gt: [{ $size: "$isFollowing" }, 0] },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Followers list retrieved successfully",
      followers,
    });
  } catch (error) {
    console.error("Error fetching followers list:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};
