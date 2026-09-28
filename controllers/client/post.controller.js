const Post = require("../../models/post.model");

//import model
const User = require("../../models/user.model");
const LikeHistory = require("../../models/likeHistory.model");
const Comment = require("../../models/comment.model");
const HashTag = require("../../models/hashTag.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");
const Report = require("../../models/report.model");
const Notification = require("../../models/notification.model");

//deleteFiles
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//generateUniqueVideoOrPostId
const generateVideoOrPostUniqueId = require("../../util/generateVideoOrPostUniqueId");

//private key
const admin = require("../../util/privateKey");

//axios
const axios = require("axios");

//mongoose
const mongoose = require("mongoose");

//fs
const fs = require("fs");

//upload post by user
exports.publishPost = async (req, res, next) => {
  try {
    const { mentionedUserIds, caption, hashTagId } = req.body;
    const { postImage } = req.files || {};

    if (!req.user || !req.user.userId) {
      if (postImage) deleteFiles(postImage);
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    if (!postImage || postImage.length === 0) {
      return res.status(200).json({ status: false, message: "No files uploaded." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const mentionedUsersArray = mentionedUserIds ? (Array.isArray(mentionedUserIds) ? mentionedUserIds : mentionedUserIds.split(",").map((id) => id.trim())) : [];
    const hashTagsArray = hashTagId ? (Array.isArray(hashTagId) ? hashTagId : hashTagId.split(",").map((tag) => tag.trim())) : [];

    const [uniquePostId, user, mentionedUsers, existingHashTags] = await Promise.all([
      generateVideoOrPostUniqueId(),
      User.findOne({ _id: userId, isFake: false }).select("_id fcmToken isBlock isPushNotificationEnabled").lean(),
      mentionedUsersArray.length > 0
        ? User.find({ _id: { $in: mentionedUsersArray }, isFake: false })
            .select("_id")
            .lean()
        : [],
      hashTagsArray.length > 0
        ? HashTag.find({ _id: { $in: hashTagsArray } })
            .select("_id")
            .lean()
        : [],
    ]);

    if (existingHashTags.length !== hashTagsArray.length) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({
        status: false,
        message: "One or more hashtags do not exist",
      });
    }

    if (mentionedUsers.length !== mentionedUsersArray.length) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({
        status: false,
        message: "One or more mentioned users do not exist.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Post uploaded successfully.",
    });

    const postImageData = postImage.map((file) => ({
      url: file.path,
      isBanned: false,
    }));

    const post = await new Post({
      uniquePostId,
      userId: user._id,
      caption: caption || "",
      mainPostImage: postImageData[0]?.url || "",
      postImage: postImageData,
      hashTagId: hashTagsArray,
      mentionedUserIds: mentionedUsers.map((u) => u._id),
    }).save();

    if (hashTagsArray) {
      await Promise.all(
        hashTagsArray.map(async (hashTagId) => {
          const hashTag = await HashTag.findById(hashTagId);
          if (hashTag) {
            const hashTagUsageHistory = new HashTagUsageHistory({
              hashTagCreator: user._id,
              hashTagId: hashTag._id,
              postId: post._id,
            });
            await hashTagUsageHistory.save();
          }
        }),
      );
    }

    if (postImage && settingJSON.postBanned) {
      const posts = req.files.postImage.map((file) => ({
        url: `${process.env.baseURL}${file.path}`,
        isBanned: false,
      }));

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
      console.log("Image moderation result checks: ", checks);

      if (checks.length > 0 && posts.length > 0) {
        await Promise.all(
          posts.map(async (postImage) => {
            try {
              const response = await axios.get("https://api.sightengine.com/1.0/check.json", {
                params: {
                  url: postImage.url,
                  models: checks.join(","),
                  api_user: settingJSON?.sightengineUser,
                  api_secret: settingJSON?.sightengineApiSecret,
                },
              });

              const result = response.data;
              console.log("Image moderation result for", postImage.url, ":", result);

              let isBanned = false;

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

              const extractRelativeUrl = (url) => {
                const baseURL = process.env.baseURL;

                if (url.startsWith(baseURL)) {
                  return url.replace(baseURL, "");
                }
                return url;
              };

              const normalizedModeratedUrl = extractRelativeUrl(postImage.url);
              console.log("Normalized URL (from moderation):", normalizedModeratedUrl);

              const updatedResult = await Post.updateOne({ _id: post._id, "postImage.url": normalizedModeratedUrl }, { $set: { "postImage.$.isBanned": isBanned } });

              console.log(`Image ${postImage.url} isBanned: ${isBanned}`);
              console.log("Image moderation update result: ", updatedResult);
            } catch (error) {
              console.log(`Error processing image ${postImage.url}:`, error.response?.data || error.message);
            }
          }),
        );

        const updatedPost = await Post.findById(post._id);

        const bannedImages = updatedPost.postImage.filter((img) => img.isBanned);

        if (bannedImages.length > 0 && !user.isBlock && user.isPushNotificationEnabled && user.fcmToken !== null) {
          const title = bannedImages.length > 1 ? "🚫 Issues with Submitted Images 🚫" : "🚫 Issue with Submitted Image 🚫";

          const body =
            bannedImages.length > 1
              ? `Several images (${bannedImages.length}) you submitted have been flagged. Please update them to proceed.`
              : `The image you submitted has been flagged. Please update it to proceed.`;

          const payload = {
            token: user?.fcmToken,
            notification: {
              title,
              body,
            },
            data: {
              type: "POST_IMAGE_BANNED",
              blockedCount: `${bannedImages.length}`,
              userId: String(user._id),
              postUserId: String(updatedPost.userId),
            },
          };

          try {
            const adminPromise = await admin;
            const response = await adminPromise.messaging().send(payload);
            console.log("Notification sent: ", response);
          } catch (error) {
            console.error("Error sending notification: ", error);
          }
        }
      } else {
        console.log("No checks selected or no image URL provided.");
      }
    }
  } catch (error) {
    console.error(error);
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error." });
  }
};

//update post by user
exports.editUserPost = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    if (!req.query.postId) {
      return res.status(200).json({ status: false, message: "Post ID is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const postId = new mongoose.Types.ObjectId(req.query.postId);

    const mentionedUserIdsArray = req.body.mentionedUserIds
      ? req.body.mentionedUserIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id) // remove empty strings
      : [];

    const [userPost, mentionedUsers] = await Promise.all([
      Post.findOne({ _id: postId, userId }).select("caption hashTagId mentionedUserIds"),
      mentionedUserIdsArray.length > 0
        ? User.find({ _id: { $in: mentionedUserIdsArray } })
            .select("_id")
            .lean()
        : [],
    ]);

    if (!userPost) {
      return res.status(200).json({ status: false, message: "No matching post found for this user." });
    }

    res.status(200).json({
      status: true,
      message: "Post updated successfully.",
    });

    let hashTagsArray = [];
    if (req.body.hashTagId) {
      hashTagsArray = req.body.hashTagId
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag);
    }

    await HashTagUsageHistory.deleteMany({ hashTagCreator: userId, postId });

    if (hashTagsArray.length > 0) {
      await Promise.all(
        hashTagsArray.map(async (hashTagId) => {
          const hashTag = await HashTag.findById(hashTagId).select("_id").lean();
          if (hashTag) {
            await new HashTagUsageHistory({
              hashTagCreator: userId,
              hashTagId: hashTag._id,
              postId: userPost._id,
            }).save();
          }
        }),
      );
    }

    userPost.hashTagId = hashTagsArray;

    if (req.body.caption !== undefined) {
      userPost.caption = req.body.caption.trim();
    }

    if (req.body.mentionedUserIds !== undefined) {
      userPost.mentionedUserIds = mentionedUsers.length > 0 ? mentionedUsers.map((u) => u._id) : [];
    }

    await userPost.save();
  } catch (error) {
    console.error("Error updating post:", error);
    return res.status(500).json({
      status: false,
      message: "An unexpected error occurred while updating the post. Please try again later.",
    });
  }
};

//get user's posts
exports.getUserPosts = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    if (!req.query.toUserId) {
      return res.status(200).json({ status: false, message: "Missing required parameters: toUserId is needed." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId); // Logged-in userId
    const userIdOfPost = new mongoose.Types.ObjectId(req.query.toUserId); // userId of the post owner

    const posts = await Post.aggregate([
      {
        $match: { userId: userIdOfPost },
      },
      ...(userId.equals(userIdOfPost)
        ? [] // No `isBanned` filtering if the user is viewing their own posts
        : [
            {
              $addFields: {
                postImage: {
                  $filter: {
                    input: "$postImage",
                    as: "image",
                    cond: { $eq: ["$$image.isBanned", false] },
                  },
                },
              },
            },
            {
              $match: { postImage: { $ne: [] } },
            },
          ]),
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
                gender: 1,
                age: 1,
                country: 1,
                countryFlagImage: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                uniqueId: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          pipeline: [
            {
              $match: {
                fromUserId: userId,
              },
            },
            { $limit: 1 },
          ],
          as: "isFollow",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          as: "mentionedUsers",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "mentionedUsers.activeAvtarFrame",
          foreignField: "_id",
          as: "mentionedUsersAvtarFrames",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "mentionedUsers.wealthLevel",
          foreignField: "_id",
          as: "mentionedUsersWealthLevels",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      {
        $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "hashtags",
          localField: "hashTagId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
          as: "hashTag",
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "postId",
          pipeline: [{ $count: "count" }],
          as: "totalCommentsCount",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          pipeline: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                isLike: { $max: { $cond: [{ $eq: ["$userId", userId] }, 1, 0] } },
              },
            },
          ],
          as: "likeData",
        },
      },
      {
        $project: {
          postId: "$_id",
          caption: 1,
          shareCount: 1,
          postImage: 1,
          isFake: 1,
          createdAt: 1,
          hashTagId: "$hashTag._id",
          hashTag: "$hashTag.hashTag",
          userId: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          gender: "$user.gender",
          age: "$user.age",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          userImage: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          isVerified: "$user.isVerified",
          userIsFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isLike: { $eq: [{ $arrayElemAt: ["$likeData.isLike", 0] }, 1] },
          isFollow: { $ne: [{ $arrayElemAt: ["$isFollow", 0] }, null] },
          totalLikes: { $ifNull: [{ $arrayElemAt: ["$likeData.count", 0] }, 0] },
          totalComments: { $ifNull: [{ $arrayElemAt: ["$totalCommentsCount.count", 0] }, 0] },
          mentionedUsers: {
            $map: {
              input: "$mentionedUsers",
              as: "m",
              in: {
                $let: {
                  vars: {
                    frame: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersAvtarFrames",
                            as: "f",
                            cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                          },
                        },
                        0,
                      ],
                    },
                    wl: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersWealthLevels",
                            as: "w",
                            cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$m._id",
                    name: "$$m.name",
                    userName: "$$m.userName",
                    uniqueId: "$$m.uniqueId",
                    image: "$$m.image",
                    isProfilePicBanned: "$$m.isProfilePicBanned",
                    isVerified: "$$m.isVerified",
                    isFake: "$$m.isFake",
                    gender: "$$m.gender",
                    age: "$$m.age",
                    coin: "$$m.coin",
                    avtarFrame: { $ifNull: ["$$frame.image", ""] },
                    avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                    wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                  },
                },
              },
            },
          },
          time: {
            $let: {
              vars: { timeDiff: { $subtract: [new Date(), "$createdAt"] } },
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
    ]);

    return res.status(200).json({
      status: true,
      message: "User posts retrieved successfully.",
      post: posts,
    });
  } catch (error) {
    console.error("Error retrieving user posts:", error);
    return res.status(500).json({ status: false, message: "An error occurred while retrieving user posts. Please try again later." });
  }
};

//delete post of user
exports.removeUserPost = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    if (!req.query.postId) {
      return res.status(200).json({ status: false, message: "Missing required parameter: postId." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const postId = new mongoose.Types.ObjectId(req.query.postId);

    const post = await Post.findOne({ _id: postId, userId, isFake: false }).select("_id mainPostImage postImage");

    if (!post) {
      return res.status(200).json({ status: false, message: "post does not found for that user." });
    }

    res.status(200).json({ status: true, message: "Post successfully deleted." });

    if (post?.mainPostImage) {
      deleteFile(post?.mainPostImage); // Delete the main post image
    }

    if (post?.postImage?.length > 0) {
      for (var i = 0; i < post?.postImage?.length; i++) {
        deleteFile(post?.postImage[i]?.url); // Delete each post image
      }
    }

    await Promise.all([
      LikeHistory.deleteMany({ postId: post._id }),
      Comment.deleteMany({ postId: post._id }),
      HashTagUsageHistory.deleteMany({ postId: post._id }),
      Report.deleteMany({ postId: post._id }),
      Notification.deleteMany({ userId: userId }),
      post.deleteOne(),
    ]);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Sever Error" });
  }
};

//user share post
exports.incrementPostShareCount = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Please provide a valid token." });
    }

    if (!req.query.postId) {
      return res.status(200).json({ status: false, message: "Invalid request. postId is required." });
    }

    const postId = new mongoose.Types.ObjectId(req.query.postId);

    const [post] = await Promise.all([Post.findOne({ _id: postId }).select("_id shareCount")]);

    if (!post) {
      return res.status(200).json({ status: false, message: "Post not found." });
    }

    res.status(200).json({
      status: true,
      message: "Post has been shared successfully. Share count updated.",
    });

    post.shareCount += 1;
    await post.save();
  } catch (error) {
    console.error("Error updating share count:", error);
    return res.status(500).json({ status: false, message: "An error occurred while updating share count. Please try again." });
  }
};

//get posts
exports.getPostsList = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const start = parseInt(req.query.start || 1);
    const limit = parseInt(req.query.limit || 20);
    const skip = (start - 1) * limit;
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    let seed;
    if (start === 1) {
      const seedId = req.query.postId ? new mongoose.Types.ObjectId(req.query.postId) : userId;
      seed =
        seedId
          .toString()
          .split("")
          .reduce((a, c) => a + c.charCodeAt(0), 0) + Date.now();
    } else {
      if (!req.query.seed) {
        return res.status(200).json({
          status: false,
          message: "Seed is required for pagination beyond first page.",
        });
      }

      seed = Number(req.query.seed);

      if (!Number.isInteger(seed) || seed <= 0) {
        return res.status(200).json({
          status: false,
          message: "Invalid seed value.",
        });
      }
    }

    const isFakeMatch = settingJSON.isDummyData ? { $or: [{ isFake: false }, { isFake: true }] } : { isFake: false };

    const postFilterStages = [
      {
        $addFields: {
          postImage: {
            $filter: {
              input: "$postImage",
              as: "image",
              cond: { $eq: ["$$image.isBanned", false] },
            },
          },
        },
      },
      { $match: { postImage: { $ne: [] } } },
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
                gender: 1,
                age: 1,
                country: 1,
                countryFlagImage: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                uniqueId: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "blocks",
          localField: "user._id",
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
    ];

    const randomSortStages = [
      {
        $addFields: {
          randomSortField: {
            $mod: [
              {
                $abs: {
                  $multiply: [{ $toLong: { $toDate: "$_id" } }, seed],
                },
              },
              1234567,
            ],
          },
        },
      },
      {
        $sort: {
          randomSortField: 1,
          _id: 1,
        },
      },
    ];

    const enrichmentStages = [
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          as: "mentionedUsers",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "mentionedUsers.activeAvtarFrame",
          foreignField: "_id",
          as: "mentionedUsersAvtarFrames",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "mentionedUsers.wealthLevel",
          foreignField: "_id",
          as: "mentionedUsersWealthLevels",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "hashtags",
          localField: "hashTagId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
          as: "hashTag",
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "postId",
          as: "commentCountData",
          pipeline: [{ $count: "count" }],
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          as: "likeCountData",
          pipeline: [{ $count: "count" }],
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          pipeline: [
            {
              $match: {
                userId: userId,
              },
            },
          ],
          as: "likeHistory",
        },
      },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          as: "isFollow",
          pipeline: [
            {
              $match: {
                fromUserId: userId,
              },
            },
          ],
        },
      },
      {
        $project: {
          postId: "$_id",
          caption: 1,
          shareCount: 1,
          postImage: 1,
          isFake: 1,
          createdAt: 1,
          hashTagId: "$hashTag._id",
          hashTag: "$hashTag.hashTag",
          userId: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          gender: "$user.gender",
          age: "$user.age",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          userImage: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          isVerified: "$user.isVerified",
          userIsFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isLike: { $gt: [{ $size: "$likeHistory" }, 0] },
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          totalComments: { $ifNull: [{ $arrayElemAt: ["$commentCountData.count", 0] }, 0] },
          totalLikes: { $ifNull: [{ $arrayElemAt: ["$likeCountData.count", 0] }, 0] },
          mentionedUsers: {
            $map: {
              input: "$mentionedUsers",
              as: "m",
              in: {
                $let: {
                  vars: {
                    frame: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersAvtarFrames",
                            as: "f",
                            cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                          },
                        },
                        0,
                      ],
                    },
                    wl: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersWealthLevels",
                            as: "w",
                            cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$m._id",
                    name: "$$m.name",
                    userName: "$$m.userName",
                    uniqueId: "$$m.uniqueId",
                    image: "$$m.image",
                    isProfilePicBanned: "$$m.isProfilePicBanned",
                    isVerified: "$$m.isVerified",
                    isFake: "$$m.isFake",
                    gender: "$$m.gender",
                    age: "$$m.age",
                    coin: "$$m.coin",
                    avtarFrame: { $ifNull: ["$$frame.image", ""] },
                    avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                    wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                  },
                },
              },
            },
          },
          time: {
            $let: {
              vars: { timeDiff: { $subtract: [new Date(), "$createdAt"] } },
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
    ];

    const buildListPipeline = (listSkip, listLimit, excludePostId = null) => [
      { $match: isFakeMatch },
      ...(excludePostId ? [{ $match: { _id: { $ne: excludePostId } } }] : []),
      ...postFilterStages,
      ...randomSortStages,
      { $skip: listSkip },
      { $limit: listLimit },
      ...enrichmentStages,
    ];

    const buildSinglePostPipeline = (postId) => [{ $match: { _id: postId } }, ...postFilterStages, ...enrichmentStages];

    if (req.query.postId) {
      const postId = new mongoose.Types.ObjectId(req.query.postId);

      const post = await Post.findById(postId).select("_id").lean();
      if (!post) {
        return res.status(200).json({ status: false, message: "No post found with the provided ID." });
      }

      const listSkip = start === 1 ? 0 : skip - 1;
      const listLimit = start === 1 ? limit - 1 : limit;

      const [featuredPost, paginatedPosts] = await Promise.all([
        start === 1 ? Post.aggregate(buildSinglePostPipeline(postId)) : [],
        listLimit > 0 ? Post.aggregate(buildListPipeline(listSkip, listLimit, postId)) : [],
      ]);

      const allPosts = start === 1 ? [...featuredPost, ...paginatedPosts] : paginatedPosts;

      return res.status(200).json({
        status: true,
        message: "Retrieve the posts uploaded by users.",
        seed,
        post: allPosts,
      });
    }

    const paginatedPosts = await Post.aggregate(buildListPipeline(skip, limit));

    return res.status(200).json({
      status: true,
      message: "Retrieve the posts uploaded by users.",
      seed,
      post: paginatedPosts,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Sever Error" });
  }
};

//get follower's post
exports.retrieveFollowerPosts = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Access denied. Please authenticate with a valid token." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    const allPosts = await Post.aggregate([
      //{ $match: { isFake: false } },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          as: "isFollow",
          pipeline: [{ $match: { fromUserId: userId } }],
        },
      },
      { $match: { isFollow: { $ne: [] } } },
      {
        $addFields: {
          postImage: {
            $filter: {
              input: "$postImage",
              as: "image",
              cond: { $eq: ["$$image.isBanned", false] },
            },
          },
        },
      },
      { $match: { postImage: { $ne: [] } } },
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
                gender: 1,
                age: 1,
                country: 1,
                countryFlagImage: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                uniqueId: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "blocks",
          localField: "user._id",
          foreignField: "toUserId",
          as: "isBlocked",
          pipeline: [{ $match: { userId: userId } }],
        },
      },
      { $match: { isBlocked: { $eq: [] } } },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          as: "mentionedUsers",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "mentionedUsers.activeAvtarFrame",
          foreignField: "_id",
          as: "mentionedUsersAvtarFrames",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "mentionedUsers.wealthLevel",
          foreignField: "_id",
          as: "mentionedUsersWealthLevels",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "hashtags",
          localField: "hashTagId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
          as: "hashTag",
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "postId",
          as: "totalComments",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          as: "totalLikes",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          pipeline: [{ $match: { userId: userId } }],
          as: "likeHistory",
        },
      },
      {
        $project: {
          postId: "$_id",
          caption: 1,
          shareCount: 1,
          postImage: 1,
          isFake: 1,
          createdAt: 1,
          hashTagId: "$hashTag._id",
          hashTag: "$hashTag.hashTag",
          userId: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          gender: "$user.gender",
          age: "$user.age",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          userImage: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          isVerified: "$user.isVerified",
          userIsFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isLike: { $gt: [{ $size: "$likeHistory" }, 0] },
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          totalLikes: { $size: "$totalLikes" },
          totalComments: { $size: "$totalComments" },
          mentionedUsers: {
            $map: {
              input: "$mentionedUsers",
              as: "m",
              in: {
                $let: {
                  vars: {
                    frame: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersAvtarFrames",
                            as: "f",
                            cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                          },
                        },
                        0,
                      ],
                    },
                    wl: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersWealthLevels",
                            as: "w",
                            cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$m._id",
                    name: "$$m.name",
                    userName: "$$m.userName",
                    uniqueId: "$$m.uniqueId",
                    image: "$$m.image",
                    isProfilePicBanned: "$$m.isProfilePicBanned",
                    isVerified: "$$m.isVerified",
                    isFake: "$$m.isFake",
                    gender: "$$m.gender",
                    age: "$$m.age",
                    coin: "$$m.coin",
                    avtarFrame: { $ifNull: ["$$frame.image", ""] },
                    avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                    wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                  },
                },
              },
            },
          },
          time: {
            $let: {
              vars: { timeDiff: { $subtract: [new Date(), "$createdAt"] } },
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
    ]);

    return res.status(200).json({
      status: true,
      message: "Retrieve the posts uploaded by followed users.",
      post: allPosts,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get posts where the logged-in user is mentioned
exports.getMentionedPosts = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        status: false,
        message: "Access denied. Please authenticate with a valid token.",
      });
    }

    const mentionedUserId = req.query.toUserId ? new mongoose.Types.ObjectId(req.query.toUserId) : new mongoose.Types.ObjectId(req.user.userId);

    const posts = await Post.aggregate([
      {
        $match: { mentionedUserIds: mentionedUserId }, // filter posts where the user is mentioned
      },
      {
        $addFields: {
          postImage: {
            $filter: {
              input: "$postImage",
              as: "image",
              cond: { $eq: ["$$image.isBanned", false] },
            },
          },
        },
      },
      { $match: { postImage: { $ne: [] } } },
      { $sort: { createdAt: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "followerfollowings",
          localField: "userId",
          foreignField: "toUserId",
          as: "isFollow",
          pipeline: [
            {
              $match: {
                fromUserId: mentionedUserId,
              },
            },
          ],
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
                _id: 1,
                name: 1,
                userName: 1,
                gender: 1,
                age: 1,
                country: 1,
                countryFlagImage: 1,
                image: 1,
                isProfilePicBanned: 1,
                isVerified: 1,
                isFake: 1,
                uniqueId: 1,
                activeAvtarFrame: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "avtarframes",
          localField: "user.activeAvtarFrame",
          foreignField: "_id",
          as: "avtarframeDetails",
        },
      },
      { $unwind: { path: "$avtarframeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "hashtags",
          localField: "hashTagId",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, hashTag: 1 } }],
          as: "hashTag",
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "postId",
          as: "totalComments",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          as: "totalLikes",
        },
      },
      {
        $lookup: {
          from: "likehistories",
          localField: "_id",
          foreignField: "postId",
          pipeline: [
            {
              $match: {
                userId: mentionedUserId,
              },
            },
          ],
          as: "likeHistory",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          as: "mentionedUsers",
        },
      },
      {
        $lookup: {
          from: "avtarframes",
          localField: "mentionedUsers.activeAvtarFrame",
          foreignField: "_id",
          as: "mentionedUsersAvtarFrames",
        },
      },
      {
        $lookup: {
          from: "wealthlevels",
          localField: "mentionedUsers.wealthLevel",
          foreignField: "_id",
          as: "mentionedUsersWealthLevels",
        },
      },
      {
        $project: {
          postId: "$_id",
          caption: 1,
          shareCount: 1,
          postImage: 1,
          isFake: 1,
          createdAt: 1,
          hashTagId: "$hashTag._id",
          hashTag: "$hashTag.hashTag",
          userId: "$user._id",
          name: "$user.name",
          userName: "$user.userName",
          gender: "$user.gender",
          age: "$user.age",
          country: "$user.country",
          countryFlagImage: "$user.countryFlagImage",
          userImage: "$user.image",
          isProfilePicBanned: "$user.isProfilePicBanned",
          uniqueId: "$user.uniqueId",
          isVerified: "$user.isVerified",
          userIsFake: "$user.isFake",
          avtarFrame: { $ifNull: ["$avtarframeDetails.image", ""] },
          avtarFrameType: { $ifNull: ["$avtarframeDetails.type", 0] },
          isLike: { $gt: [{ $size: "$likeHistory" }, 0] },
          isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
          totalLikes: { $size: "$totalLikes" },
          totalComments: { $size: "$totalComments" },
          mentionedUsers: {
            $map: {
              input: "$mentionedUsers",
              as: "m",
              in: {
                $let: {
                  vars: {
                    frame: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersAvtarFrames",
                            as: "f",
                            cond: { $eq: ["$$f._id", "$$m.activeAvtarFrame"] },
                          },
                        },
                        0,
                      ],
                    },
                    wl: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$mentionedUsersWealthLevels",
                            as: "w",
                            cond: { $eq: ["$$w._id", "$$m.wealthLevel"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    _id: "$$m._id",
                    name: "$$m.name",
                    userName: "$$m.userName",
                    uniqueId: "$$m.uniqueId",
                    image: "$$m.image",
                    isProfilePicBanned: "$$m.isProfilePicBanned",
                    isVerified: "$$m.isVerified",
                    isFake: "$$m.isFake",
                    gender: "$$m.gender",
                    age: "$$m.age",
                    coin: "$$m.coin",
                    avtarFrame: { $ifNull: ["$$frame.image", ""] },
                    avtarFrameType: { $ifNull: ["$$frame.type", 0] },
                    wealthLevelImage: { $ifNull: ["$$wl.levelImage", ""] },
                  },
                },
              },
            },
          },
          time: {
            $let: {
              vars: { timeDiff: { $subtract: [new Date(), "$createdAt"] } },
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
    ]);

    return res.status(200).json({
      status: true,
      message: "Posts where you are mentioned retrieved successfully.",
      post: posts,
    });
  } catch (error) {
    console.error("Error retrieving mentioned posts:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while retrieving mentioned posts. Please try again later.",
    });
  }
};
