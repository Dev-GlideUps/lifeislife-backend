const HashTag = require("../../models/hashTag.model");

//import model
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");

//mongoose
const mongoose = require("mongoose");

//day.js
const dayjs = require("dayjs");

//retrive hashTag (when add the video/post by user)
exports.getHashtags = async (req, res) => {
  try {
    const hashTags = await HashTag.find().select("hashTag").sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Hashtags retrieved successfully.",
      data: hashTags,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get most used hashTag
exports.getTopTrendingHashtags = async (req, res, next) => {
  try {
    const hashTags = await HashTag.aggregate([
      {
        $lookup: {
          from: "hashtagusagehistories",
          localField: "_id",
          foreignField: "hashTagId",
          as: "usageHistory",
        },
      },
      {
        $addFields: {
          usageCount: { $size: "$usageHistory" },
        },
      },
      {
        $project: {
          usageHistory: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
      {
        $sort: { usageCount: -1 },
      },
      {
        $limit: 20,
      },
    ]);

    return res.status(200).json({
      status: true,
      message: hashTags.length > 0 ? "Popular hashtags retrieved successfully." : "No hashtags found.",
      hashtags: hashTags,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get hashTag wise post
exports.retrieveHashtagPosts = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { hashTagId, start = 1, limit = 50 } = req.query || {};

    if (!hashTagId) {
      return res.status(200).json({ status: false, message: "hashTagId must be required." });
    }

    const skip = (parseInt(start) - 1) * parseInt(limit);
    const pageLimit = parseInt(limit);

    let now = dayjs();
    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const hashTagObjectId = new mongoose.Types.ObjectId(hashTagId);

    const [hashTag, posts] = await Promise.all([
      HashTag.findById(hashTagObjectId).select("_id hashTag").lean(),
      HashTagUsageHistory.aggregate([
        { $match: { hashTagId: hashTagObjectId, postId: { $ne: null } } },
        {
          $lookup: {
            from: "posts",
            localField: "postId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  caption: 1,
                  shareCount: 1,
                  postImage: 1,
                  isFake: 1,
                  createdAt: 1,
                  userId: 1,
                  mentionedUserIds: 1,
                  hashTagId: 1,
                },
              },
            ],
            as: "post",
          },
        },
        { $unwind: "$post" },
        { $sort: { "post.createdAt": -1 } },
        { $skip: skip },
        { $limit: pageLimit },
        {
          $addFields: {
            postImage: {
              $filter: {
                input: "$post.postImage",
                as: "img",
                cond: { $eq: ["$$img.isBanned", false] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "post.userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
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
            pipeline: [{ $match: { userId: userObjectId } }, { $limit: 1 }, { $project: { _id: 1 } }],
            as: "isBlocked",
          },
        },
        { $match: { isBlocked: { $size: 0 } } },
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
            from: "comments",
            localField: "post._id",
            foreignField: "postId",
            pipeline: [{ $project: { _id: 1 } }],
            as: "comments",
          },
        },
        {
          $lookup: {
            from: "hashtags",
            localField: "post.hashTagId",
            foreignField: "_id",
            pipeline: [{ $project: { hashTag: 1 } }],
            as: "hashTag",
          },
        },
        {
          $lookup: {
            from: "likehistories",
            localField: "post._id",
            foreignField: "postId",
            pipeline: [{ $project: { userId: 1 } }],
            as: "likes",
          },
        },
        {
          $lookup: {
            from: "followerfollowings",
            localField: "user._id",
            foreignField: "toUserId",
            pipeline: [{ $match: { fromUserId: userObjectId } }, { $limit: 1 }, { $project: { _id: 1 } }],
            as: "isFollow",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "post.mentionedUserIds",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  uniqueId: 1,
                  image: 1,
                  isProfilePicBanned: 1,
                  isVerified: 1,
                  isFake: 1,
                  gender: 1,
                  age: 1,
                  coin: 1,
                  activeAvtarFrame: 1,
                  wealthLevel: 1,
                },
              },
            ],
            as: "mentionedUsers",
          },
        },
        {
          $lookup: {
            from: "avtarframes",
            localField: "mentionedUsers.activeAvtarFrame",
            foreignField: "_id",
            pipeline: [{ $project: { image: 1, type: 1 } }],
            as: "mentionedUsersAvtarFrames",
          },
        },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "mentionedUsers.wealthLevel",
            foreignField: "_id",
            pipeline: [{ $project: { levelImage: 1 } }],
            as: "mentionedUsersWealthLevels",
          },
        },
        {
          $project: {
            postId: "$post._id",
            caption: "$post.caption",
            shareCount: "$post.shareCount",
            postImage: 1,
            isFake: "$post.isFake",
            createdAt: "$post.createdAt",
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
            isLike: { $in: [userObjectId, "$likes.userId"] },
            isFollow: { $gt: [{ $size: "$isFollow" }, 0] },
            totalLikes: { $size: "$likes" },
            totalComments: { $size: "$comments" },
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
                vars: {
                  timeDiff: { $subtract: [now.toDate(), "$post.createdAt"] },
                },
                in: {
                  $concat: [
                    {
                      $switch: {
                        branches: [
                          {
                            case: { $gte: ["$$timeDiff", 31536000000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 31536000000] } } }, " years ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 2592000000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 2592000000] } } }, " months ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 604800000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 604800000] } } }, " weeks ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 86400000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 86400000] } } }, " days ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 3600000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 3600000] } } }, " hours ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 60000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 60000] } } }, " minutes ago"] },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 1000] },
                            then: { $concat: [{ $toString: { $floor: { $divide: ["$$timeDiff", 1000] } } }, " seconds ago"] },
                          },
                          { case: true, then: "Just now" },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
    ]);

    if (!hashTag) {
      return res.status(200).json({ status: false, message: "HashTag does not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Successfully retrieved posts with hashtag details.",
      post: posts,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
