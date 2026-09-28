const User = require("../../models/user.model");

const mongoose = require("mongoose");

//get host statistics
exports.fetchHostsStatistics = async (req, res) => {
  try {
    const startDate = req.query.startDate?.trim()?.toLowerCase() || "all";
    const endDate = req.query.endDate?.trim()?.toLowerCase() || "all";
    const countryParam = req?.query?.country?.toLowerCase() ?? "all";

    let dateFilterQuery = {};

    if (startDate !== "all" && endDate !== "all") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);

      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery = {
        createdAt: {
          $gte: startDateObj,
          $lte: endDateObj,
        },
      };
    }

    let countryQuery = {};

    if (countryParam !== "all" && countryParam !== "") {
      countryQuery.country = {
        $regex: `^${countryParam}$`,
        $options: "i",
      };
    }

    const matchQuery = {
      role: 2,
      isFake: false,
      agencyId: { $ne: null },
      ...dateFilterQuery,
      ...countryQuery,
    };

    const [totalHostCount, totalActiveHosts, totalMaleHosts, totalFemaleHosts, earningsResult, giftsResult] = await Promise.all([
      User.countDocuments(matchQuery),
      User.countDocuments({
        ...matchQuery,
        isHostBlocked: false,
      }),
      User.countDocuments({
        ...matchQuery,
        gender: "male",
      }),
      User.countDocuments({
        ...matchQuery,
        gender: "female",
      }),
      User.aggregate([
        {
          $match: matchQuery,
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $ifNull: ["$earnedHostCoins", 0],
              },
            },
          },
        },
      ]),
      User.aggregate([
        {
          $match: matchQuery,
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $ifNull: ["$receivedGifts", 0],
              },
            },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      status: true,
      message: "Host statistics fetched successfully",
      data: {
        totalHostCount,
        totalActiveHosts,
        totalMaleHosts,
        totalFemaleHosts,
        totalEarnings: earningsResult[0]?.total || 0,
        totalGifts: giftsResult[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//get hosts
exports.retrieveHosts = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const searchString = req.query.search ?? "";
    const startDate = req.query.startDate?.trim()?.toLowerCase() || "all";
    const endDate = req.query.endDate?.trim()?.toLowerCase() || "all";
    const type = req.query.type ? req.query.type?.trim()?.toLowerCase() : "all";
    const countryParam = req?.query?.country?.toLowerCase() ?? "all";

    const allowedTypes = ["active", "inactive", "all"];
    if (!allowedTypes.includes(type)) {
      return res.status(200).json({
        status: false,
        message: "Invalid type parameter. It must be 'active', 'inactive', or 'all'.",
      });
    }

    let dateFilterQuery = {};
    if (startDate !== "all" && endDate !== "all") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery = {
        createdAt: {
          $gte: startDateObj,
          $lte: endDateObj,
        },
      };
    }

    let searchQuery = {};
    if (searchString && searchString !== "") {
      searchQuery = {
        $or: [
          { name: { $regex: searchString, $options: "i" } },
          { userName: { $regex: searchString, $options: "i" } },
          { email: { $regex: searchString, $options: "i" } },
          { uniqueId: { $regex: searchString, $options: "i" } },
        ],
      };
    }

    let countryQuery = {};
    if (countryParam && countryParam !== "all" && countryParam !== "") {
      countryQuery.country = { $regex: `^${countryParam}$`, $options: "i" };
    }

    let typeFilter = {};
    if (type === "active") {
      typeFilter = { isBlock: false };
    } else if (type === "inactive") {
      typeFilter = { isBlock: true };
    }

    const baseMatch = {
      role: { $in: [2] }, // 2 means Host role
      ...dateFilterQuery,
    };

    const specificMatch = {
      ...searchQuery,
      ...typeFilter,
      ...countryQuery,
      isFake: false,
      agencyId: { $ne: null },
    };

    const result = await User.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          totalHostsCount: [{ $match: { role: { $in: [2] }, isFake: false, agencyId: { $ne: null } } }, { $count: "count" }],
          activeHostsCount: [{ $match: { isHostBlocked: false } }, { $count: "count" }],
          maleHostsCount: [{ $match: { gender: "male" } }, { $count: "count" }],
          femaleHostsCount: [{ $match: { gender: "female" } }, { $count: "count" }],
          totalEarnings: [
            { $match: specificMatch },
            {
              $group: {
                _id: null,
                total: { $sum: { $ifNull: ["$earnedHostCoins", 0] } },
              },
            },
          ],
          totalGifts: [
            { $match: specificMatch },
            {
              $group: {
                _id: null,
                total: { $sum: { $ifNull: ["$receivedGifts", 0] } },
              },
            },
          ],
          filteredTotal: [{ $match: specificMatch }, { $count: "count" }],
          hostsData: [
            { $match: specificMatch },
            { $sort: { createdAt: -1 } },
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "hostlevels",
                localField: "hostLevel",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      name: 1,
                      image: 1,
                      level: 1,
                    },
                  },
                ],
                as: "hostLevel",
              },
            },
            {
              $unwind: { path: "$hostLevel", preserveNullAndEmptyArrays: true },
            },
            {
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "toUserId",
                pipeline: [{ $project: { _id: 0, fromUserId: 1 } }],
                as: "followersList",
              },
            },
            {
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "fromUserId",
                pipeline: [{ $project: { _id: 0, toUserId: 1 } }],
                as: "followingsList",
              },
            },
            {
              $lookup: {
                from: "posts",
                localField: "_id",
                foreignField: "userId",
                pipeline: [{ $count: "count" }],
                as: "postsData",
              },
            },
            {
              $lookup: {
                from: "videos",
                localField: "_id",
                foreignField: "userId",
                pipeline: [{ $count: "count" }],
                as: "videosData",
              },
            },
            {
              $lookup: {
                from: "agencies",
                localField: "agencyId",
                foreignField: "_id",
                pipeline: [
                  {
                    $project: {
                      agencyCode: 1,
                      agencyName: 1,
                      image: 1,
                      contactEmail: 1,
                      commissionRate: 1,
                    },
                  },
                ],
                as: "agencyDetails",
              },
            },
            { $unwind: { path: "$agencyDetails", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                uniqueId: 1,
                name: 1,
                userName: 1,
                image: 1,
                countryFlagImage: 1,
                country: 1,
                gender: 1,
                coin: 1,
                age: 1,
                isBlock: 1,
                isHostBlocked: 1,
                isFake: 1,
                isonline: 1,
                loginType: 1,
                createdAt: 1,
                totalFollowers: { $size: "$followersList" },
                totalFollowings: { $size: "$followingsList" },
                totalFriends: {
                  $size: {
                    $setIntersection: ["$followersList.fromUserId", "$followingsList.toUserId"],
                  },
                }, // Mutual Friends Logic (A -> B AND B -> A)
                totalPosts: { $ifNull: [{ $arrayElemAt: ["$postsData.count", 0] }, 0] },
                totalVideos: { $ifNull: [{ $arrayElemAt: ["$videosData.count", 0] }, 0] },
                hostLevelName: { $ifNull: ["$hostLevel.name", ""] },
                hostLevel: { $ifNull: ["$hostLevel.level", ""] },
                hostLevelImage: { $ifNull: ["$hostLevel.image", ""] },
                agencyCode: "$agencyDetails.agencyCode",
                agencyName: "$agencyDetails.agencyName",
                agencyImage: "$agencyDetails.image",
                contactEmail: "$agencyDetails.contactEmail",
                commissionRate: "$agencyDetails.commissionRate",
              },
            },
          ],
        },
      },
    ]);

    const aggregatedData = result[0];

    const totalHostCount = aggregatedData.totalHostsCount[0]?.count || 0;
    const totalActiveHosts = aggregatedData.activeHostsCount[0]?.count || 0;
    const totalMaleHosts = aggregatedData.maleHostsCount[0]?.count || 0;
    const totalFemaleHosts = aggregatedData.femaleHostsCount[0]?.count || 0;
    const totalEarnings = aggregatedData.totalEarnings[0]?.total || 0;
    const totalGifts = aggregatedData.totalGifts[0]?.total || 0;
    const totalHosts = aggregatedData.filteredTotal[0]?.count || 0;
    const hosts = aggregatedData.hostsData || [];

    return res.status(200).json({
      status: true,
      message: "Hosts retrieved successfully",
      totalHostCount,
      totalActiveHosts,
      totalMaleHosts,
      totalFemaleHosts,
      totalEarnings,
      totalGifts,
      total: totalHosts,
      data: hosts,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//suspend or terminate inactive or fraudulent host
exports.blockOrUnblockHost = async (req, res) => {
  try {
    const { agencyId, userId } = req.query;

    if (!userId) {
      return res.status(200).json({ status: false, message: "User ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid user ID. Please provide a valid ObjectId." });
    }

    let agencyObjectId = null;
    if (agencyId) {
      if (!mongoose.Types.ObjectId.isValid(agencyId)) {
        return res.status(200).json({ status: false, message: "Invalid agencyId. Please provide a valid ObjectId." });
      }
      agencyObjectId = new mongoose.Types.ObjectId(agencyId);
    }

    const hostQuery = {
      _id: userId,
      role: { $in: [2] },
    };
    if (agencyObjectId) {
      hostQuery.agencyId = agencyObjectId;
    }

    const host = await User.findOne(hostQuery).select("_id isHostBlocked");

    if (!host) {
      return res.status(200).json({ status: false, message: "Host not found." });
    }

    host.isHostBlocked = !host.isHostBlocked;
    await host.save();

    res.status(200).json({
      status: true,
      message: `Host has been ${host.isHostBlocked ? "blocked" : "unblocked"} successfully.`,
      data: host,
    });

    const isBlocked = host.isHostBlocked;

    const eventData = {
      isHostBlocked: isBlocked,
      message: isBlocked ? "Your host account has been blocked by agency/admin." : "Your host account has been unblocked by agency/admin.",
    };

    if (global.io) {
      const room = `globalRoom:${host._id}`;
      const eventName = isBlocked ? "hostBlocked" : "hostUnblocked";
      global.io.to(room).emit(eventName, eventData);
    }
  } catch (error) {
    console.error("toggleHostBlockStatus error:", error);
    return res.status(500).json({ status: false, message: "An error occurred while updating host block status." });
  }
};
