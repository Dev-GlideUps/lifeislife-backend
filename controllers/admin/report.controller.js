const Report = require("../../models/report.model");

const { TYPE_OF_REPORT, STATUS_OF_REPORT } = require("../../types/constant");

//fs
const fs = require("fs");

//import model
const Notification = require("../../models/notification.model");
const Video = require("../../models/video.model");
const Post = require("../../models/post.model");
const Comment = require("../../models/comment.model");
const LikeHistory = require("../../models/likeHistory.model");
const HashTagUsageHistory = require("../../models/hashTagUsageHistory.model");
const WatchHistory = require("../../models/watchHistory.model");

const { deleteFile } = require("../../util/deletefile");

//get report statistics (total / pending / solved / by type)
exports.fetchReportStatistics = async (req, res) => {
  try {
    const result = await Report.aggregate([
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", STATUS_OF_REPORT.PENDING] }, 1, 0],
            },
          },
          solved: {
            $sum: {
              $cond: [{ $eq: ["$status", STATUS_OF_REPORT.SOLVED] }, 1, 0],
            },
          },
          videoReports: {
            $sum: {
              $cond: [{ $eq: ["$type", TYPE_OF_REPORT.VIDEO] }, 1, 0],
            },
          },
          postReports: {
            $sum: {
              $cond: [{ $eq: ["$type", TYPE_OF_REPORT.POST] }, 1, 0],
            },
          },
          userReports: {
            $sum: {
              $cond: [{ $eq: ["$type", TYPE_OF_REPORT.USERTOUSER] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalReports: 1,
          pending: 1,
          solved: 1,
          videoReports: 1,
          postReports: 1,
          userReports: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalReports: 0,
      pending: 0,
      solved: 0,
      videoReports: 0,
      postReports: 0,
      userReports: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Report statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get type wise reports
exports.fetchReports = async (req, res) => {
  try {
    const { type, status, startDate = "All", endDate = "All", start = 1, limit = 20 } = req.query;

    if (!type || !status) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const startInt = parseInt(start);
    const limitInt = parseInt(limit);
    const search = req?.query?.search || "";

    if (isNaN(startInt) || startInt < 1 || isNaN(limitInt) || limitInt < 1) {
      return res.status(200).json({ status: false, message: "start and limit must be valid positive integers." });
    }

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const formatStartDate = new Date(startDate);
      const formatEndDate = new Date(endDate);
      formatEndDate.setHours(23, 59, 59, 999);
      dateFilterQuery.createdAt = { $gte: formatStartDate, $lte: formatEndDate };
    }

    let statusQuery = {};
    if (status !== "All") {
      statusQuery.status = parseInt(status);
    }

    let matchQuery = { ...statusQuery, ...dateFilterQuery, type: parseInt(type) };

    let lookupArray = [];
    let projectionFields = {
      type: 1,
      status: 1,
      reportReason: 1,
      createdAt: 1,
    };

    let searchMatch = [];

    if (search && search.trim() !== "") {
      const regex = { $regex: search, $options: "i" };

      if (type == 1) {
        searchMatch = [
          {
            $match: {
              $or: [{ "user.name": regex }, { "user.userName": regex }, { "user.uniqueId": regex }, { "video.uniqueVideoId": regex }],
            },
          },
        ];
      } else if (type == 2) {
        searchMatch = [
          {
            $match: {
              $or: [{ "user.name": regex }, { "user.userName": regex }, { "user.uniqueId": regex }, { "post.uniquePostId": regex }],
            },
          },
        ];
      } else if (type == 3) {
        searchMatch = [
          {
            $match: {
              $or: [{ "user.name": regex }, { "user.userName": regex }, { "user.uniqueId": regex }, { "toUser.name": regex }, { "toUser.userName": regex }, { "toUser.uniqueId": regex }],
            },
          },
        ];
      }
    }

    if (type == 1) {
      lookupArray = [
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  image: 1,
                  uniqueId: 1,
                  isBlock: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        // { $match: { "user.isBlock": false } },
        {
          $lookup: {
            from: "videos",
            localField: "videoId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  videoImage: 1,
                  videoUrl: 1,
                  uniqueVideoId: 1,
                },
              },
            ],
            as: "video",
          },
        },
        { $unwind: { path: "$video", preserveNullAndEmptyArrays: true } },
      ];
      projectionFields = {
        ...projectionFields,
        userName: "$user.userName",
        name: "$user.name",
        image: "$user.image",
        uniqueId: "$user.uniqueId",
        videoImage: "$video.videoImage",
        videoUrl: "$video.videoUrl",
        uniqueVideoId: "$video.uniqueVideoId",
      };
    } else if (type == 2) {
      lookupArray = [
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  image: 1,
                  uniqueId: 1,
                  isBlock: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        // { $match: { "user.isBlock": false } },
        {
          $lookup: {
            from: "posts",
            localField: "postId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  mainPostImage: 1,
                  uniquePostId: 1,
                },
              },
            ],
            as: "post",
          },
        },
        { $unwind: { path: "$post", preserveNullAndEmptyArrays: true } },
      ];
      projectionFields = {
        ...projectionFields,
        userName: "$user.userName",
        name: "$user.name",
        image: "$user.image",
        uniqueId: "$user.uniqueId",
        postImage: "$post.mainPostImage",
        uniquePostId: "$post.uniquePostId",
      };
    } else if (type == 3) {
      lookupArray = [
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: 1,
                  userName: 1,
                  image: 1,
                  uniqueId: 1,
                  isBlock: 1,
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        // { $match: { "user.isBlock": false } },
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
                  uniqueId: 1,
                },
              },
            ],
            as: "toUser",
          },
        },
        { $unwind: { path: "$toUser", preserveNullAndEmptyArrays: true } },
      ];
      projectionFields = {
        ...projectionFields,
        userName: "$user.userName",
        name: "$user.name",
        image: "$user.image",
        uniqueId: "$user.uniqueId",
        toUserUserName: "$toUser.userName",
        toUserName: "$toUser.name",
        toUserImage: "$toUser.image",
        toUserUniqueId: "$toUser.uniqueId",
      };
    } else {
      return res.status(200).json({ status: false, message: "Invalid type." });
    }

    const result = await Report.aggregate([
      { $match: matchQuery },
      ...lookupArray,
      ...searchMatch,
      {
        $facet: {
          totalCount: [{ $count: "total" }],
          data: [{ $sort: { createdAt: -1 } }, { $skip: (startInt - 1) * limitInt }, { $limit: limitInt }, { $project: projectionFields }],
        },
      },
    ]);

    const total = result[0]?.totalCount[0]?.total || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: `Fetched reports of type ${type}.`,
      total,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//report solved
exports.resolveReport = async (req, res) => {
  try {
    const { reportId } = req.query || {};

    if (!reportId) {
      return res.status(200).json({ status: false, message: "reportId is required." });
    }

    const report = await Report.findById(reportId).select("status").lean();

    if (!report) {
      return res.status(200).json({ status: false, message: "Report not found." });
    }

    if (report.status === 2) {
      return res.status(200).json({ status: false, message: "Report is already solved." });
    }

    const updatedReport = await Report.findByIdAndUpdate(reportId, { $set: { status: 2 } }, { new: true, select: "status createdAt reportReason type" }).lean();

    return res.status(200).json({
      status: true,
      message: "Report has been resolved by the admin.",
      data: updatedReport,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete report
exports.removeReport = async (req, res) => {
  try {
    const { reportId } = req.query;

    if (!reportId) {
      return res.status(200).json({ status: false, message: "reportId is required." });
    }

    const report = await Report.findById(reportId).select("videoId postId").lean();
    if (!report) {
      return res.status(200).json({ status: false, message: "Report not found." });
    }

    res.status(200).json({
      status: true,
      message: "Report has been deleted by the admin.",
    });

    if (report.videoId !== null) {
      const video = await Video.findById(report.videoId);

      if (video) {
        if (video.videoImage) {
          deleteFile(video.videoImage);
        }

        if (video.videoUrl) {
          deleteFile(video.videoUrl);
        }

        await Promise.all([
          LikeHistory.deleteMany({ videoId: video._id }),
          Comment.deleteMany({ videoId: video._id }),
          WatchHistory.deleteMany({ videoId: video._id }),
          HashTagUsageHistory.deleteMany({ videoId: video._id }),
          Notification.deleteMany({ otherUserId: video?.userId }),
        ]);

        await Video.deleteOne({ _id: video._id });
      }
    }

    if (report.postId !== null) {
      const post = await Post.findById(report?.postId);

      if (post) {
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
      }
    }

    await Report.deleteOne({ _id: report._id });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
