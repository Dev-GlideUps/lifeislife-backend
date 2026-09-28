const HostApplication = require("../../models/hostApplication.model");

const { HOST_APPLICATION_TYPE } = require("../../types/constant");

//get host application statistics (total / pending / approved / rejected)
exports.fetchHostApplicationStatistics = async (req, res) => {
  try {
    const result = await HostApplication.aggregate([
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", HOST_APPLICATION_TYPE.PENDING] }, 1, 0],
            },
          },
          approved: {
            $sum: {
              $cond: [{ $eq: ["$status", HOST_APPLICATION_TYPE.APPROVED] }, 1, 0],
            },
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ["$status", HOST_APPLICATION_TYPE.REJECTED] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalApplications: 1,
          pending: 1,
          approved: 1,
          rejected: 1,
        },
      },
    ]);

    const data = result[0] || {
      totalApplications: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    return res.status(200).json({
      status: true,
      message: "Host application statistics fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Error fetching host application statistics:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get host applications
exports.getHostApplicationsList = async (req, res) => {
  try {
    if (!req.query.status) {
      return res.status(200).json({ status: false, message: "Status parameter is required." });
    }

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const search = req.query.search || "";

    let matchQuery = {};
    if (req.query.status !== "All") {
      matchQuery.status = parseInt(req.query.status);
    }

    const result = await HostApplication.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                uniqueId: 1,
                name: 1,
                userName: 1,
                image: 1,
                countryFlagImage: 1,
                country: 1,
              },
            },
          ],
          as: "userId",
        },
      },
      {
        $unwind: { path: "$userId", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "agencyId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                agencyName: 1,
                image: 1,
                agencyCode: 1,
              },
            },
          ],
          as: "agencyId",
        },
      },
      {
        $unwind: { path: "$agencyId", preserveNullAndEmptyArrays: true },
      },
      ...(search && search.trim() !== ""
        ? [
            {
              $match: {
                $or: [
                  { "userId.name": { $regex: search, $options: "i" } },
                  { "userId.userName": { $regex: search, $options: "i" } },
                  { "userId.uniqueId": { $regex: search, $options: "i" } },
                  { "agencyId.agencyName": { $regex: search, $options: "i" } },
                  { "agencyId.agencyCode": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      {
        $facet: {
          total: [{ $count: "count" }],
          data: [{ $sort: { createdAt: -1 } }, { $skip: (start - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    const total = result[0]?.total[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Host applications fetched successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error("Error fetching host applications:", error);
    return res.status(500).json({ status: false, message: "An error occurred while fetching host applications.", error: error.message || "Internal Server Error" });
  }
};
