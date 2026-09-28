const ProfileVisitor = require("../../models/profileVisitor.model");
const User = require("../../models/user.model");

const mongoose = require("mongoose");

//get the list of users who visited my profile
exports.fetchProfileVisitors = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "Please provide a valid user ID." });
    }

    const profileOwnerId = new mongoose.Types.ObjectId(req.query.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const user = await User.findById(profileOwnerId).select("_id").lean();
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const result = await ProfileVisitor.aggregate([
      { $match: { profileOwnerId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          visitors: [
            { $sort: { localVisitedAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "visitorId",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      name: 1,
                      userName: 1,
                      image: 1,
                      age: 1,
                      uniqueId: 1,
                      wealthLevel: 1,
                    },
                  },
                ],
                as: "visitorDetails",
              },
            },
            {
              $unwind: {
                path: "$visitorDetails",
                preserveNullAndEmptyArrays: false,
              },
            },
            {
              $lookup: {
                from: "wealthlevels",
                localField: "visitorDetails.wealthLevel",
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
                _id: "$visitorDetails._id",
                name: "$visitorDetails.name",
                userName: "$visitorDetails.userName",
                image: "$visitorDetails.image",
                age: "$visitorDetails.age",
                uniqueId: "$visitorDetails.uniqueId",
                wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                localVisitedAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const visitors = result[0]?.visitors || [];

    return res.status(200).json({
      status: true,
      message: "Profile visitors retrieved successfully.",
      total,
      visitors,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

//get the list of profiles visited by the authenticated user
exports.fetchVisitedProfiles = async (req, res) => {
  try {
    if (!req.query.userId) {
      return res.status(200).json({ status: false, message: "Please provide a valid user ID." });
    }

    const visitorId = new mongoose.Types.ObjectId(req.query.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const user = await User.findById(visitorId).select("_id").lean();
    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    const result = await ProfileVisitor.aggregate([
      { $match: { visitorId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          visitedProfiles: [
            { $sort: { localVisitedAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "profileOwnerId",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      name: 1,
                      userName: 1,
                      image: 1,
                      age: 1,
                      uniqueId: 1,
                      wealthLevel: 1,
                    },
                  },
                ],
                as: "profileOwnerDetails",
              },
            },
            {
              $unwind: {
                path: "$profileOwnerDetails",
                preserveNullAndEmptyArrays: false,
              },
            },
            {
              $lookup: {
                from: "wealthlevels",
                localField: "profileOwnerDetails.wealthLevel",
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
                _id: "$profileOwnerDetails._id",
                name: "$profileOwnerDetails.name",
                userName: "$profileOwnerDetails.userName",
                image: "$profileOwnerDetails.image",
                age: "$profileOwnerDetails.age",
                uniqueId: "$profileOwnerDetails.uniqueId",
                wealthLevelImage: { $ifNull: ["$wealthDetails.levelImage", ""] },
                localVisitedAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const visitedProfiles = result[0]?.visitedProfiles || [];

    return res.status(200).json({
      status: true,
      message: "Visited profiles retrieved successfully.",
      total,
      visitedProfiles,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
