const Comment = require("../../models/comment.model");
const Post = require("../../models/post.model");
const Video = require("../../models/video.model");

//mongoose
const mongoose = require("mongoose");

//get post or video's comment
exports.getComments = async (req, res) => {
  try {
    const { postId, videoId } = req.query;

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!postId && !videoId) {
      return res.status(200).json({ status: false, message: "Either postId or videoId is required" });
    }

    let matchQuery = {};

    if (postId) matchQuery.postId = new mongoose.Types.ObjectId(postId);
    if (videoId) matchQuery.videoId = new mongoose.Types.ObjectId(videoId);

    const contentExists = postId ? await Post.exists({ _id: postId }) : await Video.exists({ _id: videoId });

    if (!contentExists) {
      return res.status(200).json({
        status: false,
        message: postId ? "Post not found" : "Video not found",
      });
    }

    const result = await Comment.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [
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
                      name: 1,
                      userName: 1,
                      image: 1,
                    },
                  },
                ],
                as: "user",
              },
            },
            {
              $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1,
                commentText: 1,
                createdAt: 1,
                name: "$user.name",
                userName: "$user.userName",
                image: "$user.image",
                time: {
                  $let: {
                    vars: {
                      timeDiff: {
                        $subtract: [{ $toLong: "$$NOW" }, { $toLong: "$createdAt" }],
                      },
                    },
                    in: {
                      $switch: {
                        branches: [
                          {
                            case: { $gte: ["$$timeDiff", 31536000000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 31536000000],
                                    },
                                  },
                                },
                                " years ago",
                              ],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 2592000000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 2592000000],
                                    },
                                  },
                                },
                                " months ago",
                              ],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 604800000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 604800000],
                                    },
                                  },
                                },
                                " weeks ago",
                              ],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 86400000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 86400000],
                                    },
                                  },
                                },
                                " days ago",
                              ],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 3600000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 3600000],
                                    },
                                  },
                                },
                                " hours ago",
                              ],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 60000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 60000],
                                    },
                                  },
                                },
                                " minutes ago",
                              ],
                            },
                          },
                          {
                            case: { $gte: ["$$timeDiff", 1000] },
                            then: {
                              $concat: [
                                {
                                  $toString: {
                                    $floor: {
                                      $divide: ["$$timeDiff", 1000],
                                    },
                                  },
                                },
                                " seconds ago",
                              ],
                            },
                          },
                        ],
                        default: "Just now",
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.totalCount[0]?.count || 0;
    const comments = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Retrieved comments successfully",
      total,
      data: comments,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete post or video's comment
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.query;

    if (!commentId) {
      return res.status(200).json({ status: false, message: "Comment ID is required" });
    }

    const comment = await Comment.findById(commentId).select("_id").lean();
    if (!comment) {
      return res.status(200).json({ status: false, message: "Comment not found" });
    }

    res.status(200).json({
      status: true,
      message: "Comment deleted successfully",
    });

    await Comment.findByIdAndDelete(commentId);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
