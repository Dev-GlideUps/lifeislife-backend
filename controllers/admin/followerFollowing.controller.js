const FollowerFollowing = require("../../models/followerFollowing.model");

//mongoose
const mongoose = require("mongoose");

//import model
const User = require("../../models/user.model");

//get the friend list (users who follow each other)
exports.fetchUserFriends = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const [user, friendsData] = await Promise.all([
      User.findOne({ _id: userId }).select("_id").lean(),
      FollowerFollowing.aggregate([
        { $match: { fromUserId: userId } },
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
            as: "friendDetails",
          },
        },
        { $unwind: "$friendDetails" },
        {
          $lookup: {
            from: "wealthlevels",
            localField: "friendDetails.wealthLevel",
            foreignField: "_id",
            as: "wealthDetails",
          },
        },
        { $unwind: { path: "$wealthDetails", preserveNullAndEmptyArrays: true } },
        {
          $facet: {
            totalCount: [{ $count: "count" }], // Get total count before pagination
            paginatedResults: [
              {
                $project: {
                  _id: "$friendDetails._id",
                  name: "$friendDetails.name",
                  userName: "$friendDetails.userName",
                  age: "$friendDetails.age",
                  uniqueId: "$friendDetails.uniqueId",
                  wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                },
              },
              { $skip: (start - 1) * limit },
              { $limit: limit },
            ],
          },
        },
      ]),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const total = friendsData[0].totalCount.length > 0 ? friendsData[0].totalCount[0].count : 0;
    const friends = friendsData[0].paginatedResults;

    return res.status(200).json({
      status: true,
      message: "Friends list retrieved successfully",
      total,
      friends,
    });
  } catch (error) {
    console.error("Error fetching friends list:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get the following list (users whom I follow)
exports.fetchUserFollowing = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const [user, result] = await Promise.all([
      User.findOne({ _id: userId }).select("_id").lean(),
      FollowerFollowing.aggregate([
        {
          $facet: {
            total: [{ $match: { fromUserId: userId } }, { $count: "count" }],
            following: [
              { $match: { fromUserId: userId } },
              { $sort: { createdAt: -1 } },
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
                        userName: 1,
                        age: 1,
                        uniqueId: 1,
                        wealthLevel: 1,
                      },
                    },
                  ],
                  as: "followingDetails",
                },
              },
              {
                $unwind: {
                  path: "$followingDetails",
                  preserveNullAndEmptyArrays: false,
                },
              },
              {
                $lookup: {
                  from: "wealthlevels",
                  localField: "followingDetails.wealthLevel",
                  foreignField: "_id",
                  pipeline: [
                    {
                      $project: {
                        levelImage: 1,
                      },
                    },
                  ],
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
                  _id: "$followingDetails._id",
                  name: "$followingDetails.name",
                  userName: "$followingDetails.userName",
                  age: "$followingDetails.age",
                  uniqueId: "$followingDetails.uniqueId",
                  wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                },
              },
            ],
          },
        },
      ]),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const total = result[0]?.total[0]?.count || 0;
    const following = result[0]?.following || [];

    return res.status(200).json({
      status: true,
      message: "Following list retrieved successfully",
      total,
      following,
    });
  } catch (error) {
    console.error("Error fetching following list:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get the followers list (users who follow me)
exports.fetchUserFollowers = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    const userId = new mongoose.Types.ObjectId(req.query.userId);

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const [user, result] = await Promise.all([
      User.findOne({ _id: userId }).select("_id").lean(),
      FollowerFollowing.aggregate([
        {
          $facet: {
            total: [{ $match: { toUserId: userId } }, { $count: "count" }],
            followers: [
              { $match: { toUserId: userId } },
              { $sort: { createdAt: -1 } },
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
                        userName: 1,
                        age: 1,
                        uniqueId: 1,
                        wealthLevel: 1,
                      },
                    },
                  ],
                  as: "followerDetails",
                },
              },
              {
                $unwind: {
                  path: "$followerDetails",
                  preserveNullAndEmptyArrays: false,
                },
              },
              {
                $lookup: {
                  from: "wealthlevels",
                  localField: "followerDetails.wealthLevel",
                  foreignField: "_id",
                  pipeline: [
                    {
                      $project: {
                        levelImage: 1,
                      },
                    },
                  ],
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
                  _id: "$followerDetails._id",
                  name: "$followerDetails.name",
                  userName: "$followerDetails.userName",
                  age: "$followerDetails.age",
                  uniqueId: "$followerDetails.uniqueId",
                  wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                },
              },
            ],
          },
        },
      ]),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const total = result[0]?.total[0]?.count || 0;
    const followers = result[0]?.followers || [];

    return res.status(200).json({
      status: true,
      message: "Followers list retrieved successfully",
      total,
      followers,
    });
  } catch (error) {
    console.error("Error fetching followers list:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};
