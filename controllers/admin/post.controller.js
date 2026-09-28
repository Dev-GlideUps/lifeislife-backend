const Post = require("../../models/post.model");

//fs
const fs = require("fs");

//import model
const User = require("../../models/user.model");
const HashTag = require("../../models/hashTag.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");
const LikeHistory = require("../../models/likeHistory.model");
const Comment = require("../../models/comment.model");
const Notification = require("../../models/notification.model");
const Report = require("../../models/report.model");

//deleteFiles
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//mongoose
const mongoose = require("mongoose");

//generateUniqueVideoOrPostId
const generateVideoOrPostUniqueId = require("../../util/generateVideoOrPostUniqueId");

//upload post
exports.uploadAdminFakePost = async (req, res, next) => {
  try {
    if (!req.query.userId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "userId is required." });
    }

    if (!req.body.caption || !req.body.hashTagId || !req.files) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    if (req.query.userId && !mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const { hashTagId, mentionedUserIds } = req.body;

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const mentionedUserIdsArray = Array.isArray(mentionedUserIds) ? mentionedUserIds : typeof mentionedUserIds === "string" ? mentionedUserIds.split(",").map((id) => id.trim()) : [];
    const hashTagsArray = Array.isArray(hashTagId) ? hashTagId : typeof hashTagId === "string" ? hashTagId.split(",").map((tag) => tag.trim()) : [];

    const [uniquePostId, user, fullHashTags, mentionedUsers] = await Promise.all([
      generateVideoOrPostUniqueId(),
      User.findOne({ _id: userId, isFake: true }).select("_id name userName image").lean(),
      HashTag.find({ _id: { $in: hashTagsArray } }).lean(),
      mentionedUserIdsArray.length
        ? User.find({ _id: { $in: mentionedUserIdsArray }, isFake: true })
            .select("_id name userName image")
            .lean()
        : [],
    ]);

    if (!user) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const post = new Post({
      userId: user._id,
      caption: req.body.caption.trim(),
      isFake: true,
      hashTagId: hashTagsArray,
      mentionedUserIds: mentionedUsers.map((u) => u._id),
      uniquePostId: uniquePostId,
    });

    if (req.files.postImage) {
      const postImageData = req.files.postImage.map((file) => ({
        url: file.path,
        isBanned: false,
      }));

      post.mainPostImage = postImageData[0]?.url;
      post.postImage = postImageData;
    }

    res.status(200).json({
      status: true,
      message: "Fake post has been uploaded by the admin.",
      data: {
        ...post.toObject(),
        userId: user,
        hashTags: fullHashTags,
        mentionedUsers: mentionedUsers,
      },
    });

    let hashTagPromises;
    if (hashTagsArray.length) {
      hashTagPromises = hashTagsArray.map(async (hashTagId) => {
        const hashTag = await HashTag.findById(hashTagId).select("_id").lean();
        if (hashTag) {
          return HashTagUsageHistory.create({
            hashTagCreator: user._id,
            hashTagId: hashTagId,
            postId: post._id,
          });
        }
      });
    }

    await Promise.all([...hashTagPromises, post.save()]);
  } catch (error) {
    console.error(error);
    if (req.files) deleteFiles(req.files);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update post
exports.modifyPost = async (req, res, next) => {
  try {
    if (!req.query.userId || !req.query.postId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "userId and postId are required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId. Please provide a valid ObjectId." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const postId = new mongoose.Types.ObjectId(req.query.postId);
    const mentionedUserIdsArray = req.body.mentionedUserIds ? req.body.mentionedUserIds.split(",").map((id) => id.trim()) : [];

    const [user, fakePostOfUser, mentionedUsers] = await Promise.all([
      User.findOne({ _id: userId }).select("_id").lean(),
      Post.findOne({ _id: postId, userId: userId }).lean(),
      req.body.mentionedUserIds
        ? User.find({ _id: { $in: mentionedUserIdsArray } })
            .select("_id")
            .lean()
        : [],
    ]);

    if (!user) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (!fakePostOfUser) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Post not found for this user." });
    }

    if (req.files?.postImage?.length > 0) {
      if (Array.isArray(fakePostOfUser.postImage)) {
        fakePostOfUser.postImage.forEach(({ url }) => {
          deleteFile(url);
        });
      }

      const postImageData = req.files.postImage.map((file) => ({
        url: file.path,
        isBanned: false,
      }));

      fakePostOfUser.mainPostImage = postImageData[0]?.url;
      fakePostOfUser.postImage = postImageData;
    }

    let hashTagsArray = fakePostOfUser.hashTagId;
    if (req.body.hashTagId) {
      hashTagsArray = req.body.hashTagId.split(",").map((tag) => tag.trim());

      await HashTagUsageHistory.deleteMany({ hashTagCreator: userId, postId });

      if (hashTagsArray.length > 0) {
        await Promise.all(
          hashTagsArray.map(async (hashTagId) => {
            const hashTag = await HashTag.findById(hashTagId).select("_id").lean();
            if (hashTag) {
              await new HashTagUsageHistory({
                hashTagCreator: userId,
                hashTagId: hashTag._id,
                postId: fakePostOfUser._id,
              }).save();
            }
          }),
        );
      }
    }

    let mentionedUserIdList = fakePostOfUser.mentionedUserIds;
    if (req.body.mentionedUserIds) {
      mentionedUserIdList = mentionedUsers.map((u) => u._id);
    }

    const updateFields = {
      caption: req.body.caption || fakePostOfUser.caption,
      hashTagId: hashTagsArray,
      mentionedUserIds: mentionedUserIdList,
    };

    if (req.files?.postImage?.length > 0) {
      updateFields.mainPostImage = fakePostOfUser.mainPostImage;
      updateFields.postImage = fakePostOfUser.postImage;
    }

    const updatedPost = await Post.findOneAndUpdate({ _id: postId, userId }, { $set: updateFields }, { new: true })
      .populate("userId")
      .populate("hashTagId")
      .populate("mentionedUserIds", "_id name userName image")
      .lean();

    return res.status(200).json({
      status: true,
      message: "Fake post has been updated by the admin.",
      data: {
        ...updatedPost,
        userId: updatedPost.userId,
        hashTags: updatedPost.hashTagId,
        mentionedUsers: updatedPost.mentionedUserIds,
      },
    });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get post statistics (total / real / fake / banned)
exports.fetchPostStatistics = async (req, res) => {
  try {
    const result = await Post.aggregate([
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          realPosts: {
            $sum: {
              $cond: [{ $eq: ["$isFake", false] }, 1, 0],
            },
          },
          fakePosts: {
            $sum: {
              $cond: [{ $eq: ["$isFake", true] }, 1, 0],
            },
          },
          bannedPosts: {
            $sum: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: { $ifNull: ["$postImage", []] },
                          as: "img",
                          cond: { $eq: ["$$img.isBanned", true] },
                        },
                      },
                    },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalPosts: 1,
          realPosts: 1,
          fakePosts: 1,
          bannedPosts: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalPosts: 0,
      realPosts: 0,
      fakePosts: 0,
      bannedPosts: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Post statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get real or fake posts
exports.fetchUserPosts = async (req, res, next) => {
  try {
    const { type } = req.query;

    if (!type) {
      return res.status(200).json({ status: false, message: "type must be required." });
    }

    if (!["realPost", "fakePost"].includes(type)) {
      return res.status(200).json({ status: false, message: "Invalid type." });
    }

    const isFake = type === "fakePost";
    const search = req?.query?.search || "";

    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;

    if (start < 1 || limit < 1) {
      return res.status(200).json({ status: false, message: "Invalid pagination." });
    }

    const startDate = req?.query?.startDate || "All";
    const endDate = req?.query?.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: formatStartDate,
        $lte: formatEndDate,
      };
    }

    const matchQuery = { isFake, ...dateFilterQuery };

    const result = await Post.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, userName: 1, image: 1, uniqueId: 1 } }],
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "users",
          localField: "mentionedUserIds",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, userName: 1, image: 1, uniqueId: 1 } }],
          as: "mentionedUsers",
        },
      },
      ...(search && search.trim() !== ""
        ? [
            {
              $match: {
                $or: [
                  { "user.name": { $regex: search, $options: "i" } },
                  { "user.userName": { $regex: search, $options: "i" } },
                  { "user.uniqueId": { $regex: search, $options: "i" } },
                  { "mentionedUsers.name": { $regex: search, $options: "i" } },
                  { "mentionedUsers.userName": { $regex: search, $options: "i" } },
                  { "mentionedUsers.uniqueId": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "hashtags",
                localField: "hashTagId",
                foreignField: "_id",
                pipeline: [{ $project: { hashTag: 1 } }],
                as: "hashTags",
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
                    },
                  },
                ],
                as: "likes",
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "postId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "comments",
              },
            },
            {
              $addFields: {
                totalLikes: {
                  $ifNull: [{ $arrayElemAt: ["$likes.count", 0] }, 0],
                },
                totalComments: {
                  $ifNull: [{ $arrayElemAt: ["$comments.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                caption: 1,
                mainPostImage: 1,
                postImage: 1,
                shareCount: 1,
                isFake: 1,
                createdAt: 1,
                totalLikes: 1,
                totalComments: 1,
                userId: "$user._id",
                name: "$user.name",
                userName: "$user.userName",
                uniqueId: "$user.uniqueId",
                userImage: "$user.image",
                hashTags: 1,
                mentionedUsers: {
                  $map: {
                    input: "$mentionedUsers",
                    as: "user",
                    in: {
                      _id: "$$user._id",
                      name: "$$user.name",
                      userName: "$$user.userName",
                      uniqueId: "$$user.uniqueId",
                      image: "$$user.image",
                    },
                  },
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          data: 1,
          total: {
            $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0],
          },
        },
      },
    ]);

    const finalResult = result[0] || { data: [], total: 0 };

    return res.status(200).json({
      status: true,
      message: isFake ? "Retrieved fake posts of the users." : "Retrieved real posts of the users.",
      total: finalResult.total,
      data: finalResult.data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get user's posts
exports.listUserPosts = async (req, res, next) => {
  try {
    const { userId, start, limit } = req.query;

    if (!userId) {
      return res.status(200).json({ status: false, message: "userId is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid userId." });
    }

    const pageStart = parseInt(start) || 1;
    const pageLimit = parseInt(limit) || 20;

    if (pageStart < 1 || pageLimit < 1) {
      return res.status(200).json({ status: false, message: "Invalid pagination." });
    }

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: formatStartDate,
        $lte: formatEndDate,
      };
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const user = await User.findById(userObjectId).select("_id").lean();
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const result = await Post.aggregate([
      { $match: { userId: userObjectId, ...dateFilterQuery } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (pageStart - 1) * pageLimit },
            { $limit: pageLimit },
            {
              $lookup: {
                from: "users",
                localField: "mentionedUserIds",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, userName: 1, image: 1 } }],
                as: "mentionedUsers",
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
                    },
                  },
                ],
                as: "likes",
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "postId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "comments",
              },
            },
            {
              $addFields: {
                totalLikes: {
                  $ifNull: [{ $arrayElemAt: ["$likes.count", 0] }, 0],
                },
                totalComments: {
                  $ifNull: [{ $arrayElemAt: ["$comments.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                caption: 1,
                mainPostImage: 1,
                postImage: 1,
                shareCount: 1,
                isFake: 1,
                createdAt: 1,
                totalLikes: 1,
                totalComments: 1,
                mentionedUsers: {
                  $map: {
                    input: "$mentionedUsers",
                    as: "user",
                    in: {
                      _id: "$$user._id",
                      name: "$$user.name",
                      userName: "$$user.userName",
                      image: "$$user.image",
                    },
                  },
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          data: 1,
          total: {
            $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0],
          },
        },
      },
    ]);

    const finalResult = result[0] || { data: [], total: 0 };

    return res.status(200).json({
      status: true,
      message: "Retrieved posts of the user.",
      total: finalResult.total,
      data: finalResult.data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete post
exports.discardPost = async (req, res) => {
  try {
    if (!req.query.postId) {
      return res.status(200).json({ status: false, message: "postId must be requried." });
    }

    const postIds = req.query.postId;

    const post = await Post.findById(postIds);
    if (!post) {
      return res.status(200).json({ status: false, message: "No post found with the provided IDs." });
    }

    res.status(200).json({
      status: true,
      message: "Post has been deleted by the admin.",
    });

    if (post.mainPostImage) {
      deleteFile(post.mainPostImage);
    }

    if (post.postImage.length > 0) {
      for (var i = 0; i < post?.postImage?.length; i++) {
        deleteFile(post?.postImage[i]?.url);
      }
    }

    await Promise.all([
      LikeHistory.deleteMany({ postId: post._id }),
      Comment.deleteMany({ postId: post._id }),
      HashTagUsageHistory.deleteMany({ postId: post._id }),
      Report.deleteMany({ postId: post._id }),
      Notification.deleteMany({ $or: [{ otherUserId: post?.userId }, { userId: post?.userId }] }),
      post.deleteOne(),
    ]);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Sever Error" });
  }
};
