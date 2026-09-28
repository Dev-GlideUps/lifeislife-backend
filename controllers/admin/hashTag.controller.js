const HashTag = require("../../models/hashTag.model");

//import model
const Video = require("../../models/video.model");
const Post = require("../../models/post.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");

//mongoose
const mongoose = require("mongoose");

//craete hashTag
exports.addNewHashtag = async (req, res) => {
  try {
    if (!req.body.hashTag) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const hashTag = req.body.hashTag.trim();

    const alreadyExist = await HashTag.findOne({ hashTag: hashTag }).select("_id").lean();

    if (alreadyExist) {
      return res.status(200).json({
        status: false,
        message: "HashTag already exist.",
      });
    } else {
      const newHashTag = new HashTag();
      newHashTag.hashTag = hashTag;
      await newHashTag.save();

      return res.status(200).json({
        status: true,
        message: "HashTag created by the admin.",
        data: newHashTag,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update hashTag
exports.modifyHashtag = async (req, res) => {
  try {
    if (!req.body.hashTagId) {
      return res.status(200).json({ status: false, message: "hashTagId must be requried." });
    }

    const hashTagId = new mongoose.Types.ObjectId(req.body.hashTagId);

    const hashTag = await HashTag.findById(hashTagId);
    if (!hashTag) {
      return res.status(200).json({ status: false, message: "hashTag does not found." });
    }

    hashTag.hashTag = req.body.hashTag ? req.body.hashTag.trim() : hashTag.hashTag;
    await hashTag.save();

    return res.status(200).json({ status: true, message: "HashTag has been updated by the admin.", data: hashTag });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get hashTag statistics (total / usage in posts / usage in videos)
exports.fetchHashTagStatistics = async (req, res) => {
  try {
    const [hashTagResult, usageResult] = await Promise.all([
      HashTag.aggregate([
        {
          $group: {
            _id: null,
            totalHashTags: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            totalHashTags: 1,
          },
        },
      ]),
      HashTagUsageHistory.aggregate([
        {
          $group: {
            _id: null,
            totalUsage: { $sum: 1 },
            postUsage: {
              $sum: {
                $cond: [{ $ne: [{ $ifNull: ["$postId", null] }, null] }, 1, 0],
              },
            },
            videoUsage: {
              $sum: {
                $cond: [{ $ne: [{ $ifNull: ["$videoId", null] }, null] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalUsage: 1,
            postUsage: 1,
            videoUsage: 1,
          },
        },
      ]),
    ]);

    const data = {
      totalHashTags: hashTagResult[0]?.totalHashTags || 0,
      totalUsage: usageResult[0]?.totalUsage || 0,
      postUsage: usageResult[0]?.postUsage || 0,
      videoUsage: usageResult[0]?.videoUsage || 0,
    };

    return res.status(200).json({
      status: true,
      message: "HashTag statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get hashTags
exports.retrieveHashtags = async (req, res, next) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const search = req.query.search?.trim() || "";

    const result = await HashTag.aggregate([
      ...(search
        ? [
            {
              $match: {
                hashTag: { $regex: search, $options: "i" },
              },
            },
          ]
        : []),
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "hashtagusagehistories",
                localField: "_id",
                foreignField: "hashTagId",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      count: { $sum: 1 },
                    },
                  },
                ],
                as: "usageData",
              },
            },
            {
              $addFields: {
                usageCount: {
                  $ifNull: [{ $arrayElemAt: ["$usageData.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                usageData: 0,
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Hashtag successfully retrieved.",
      total,
      data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete hashTag
exports.removeHashtag = async (req, res, next) => {
  try {
    if (!req.query.hashTagId) {
      return res.status(200).json({ status: false, message: "hashTagId must be requried." });
    }

    const hashTagId = new mongoose.Types.ObjectId(req.query.hashTagId);

    const hashTag = await HashTag.findById(hashTagId).select("_id").lean();
    if (!hashTag) {
      return res.status(200).json({ status: false, message: "hashTag does not found." });
    }

    res.status(200).json({
      status: true,
      message: "HashTag has been deleted by the admin.",
    });

    await Promise.all([
      Video.updateMany({ hashTagId: { $in: [hashTag._id] } }, { $pull: { hashTagId: hashTag._id } }),
      Post.updateMany({ hashTagId: { $in: [hashTag._id] } }, { $pull: { hashTagId: hashTag._id } }),
      HashTagUsageHistory.deleteMany({ hashTagId: hashTag._id }),
      HashTag.deleteOne({ _id: hashTag._id }),
    ]);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get hashTags ( dropdown )
exports.listHashtags = async (req, res, next) => {
  try {
    const hashTag = await HashTag.find().select("hashTag").sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Hashtag fetched successfully.",
      data: hashTag,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
