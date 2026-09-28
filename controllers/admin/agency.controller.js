const Agency = require("../../models/agency.model");
const HostApplication = require("../../models/hostApplication.model");

//import model
const User = require("../../models/user.model");
const History = require("../../models/history.model");

//mongoose
const mongoose = require("mongoose");

//fs
const fs = require("fs");

//generateAgencyCode
const generateAgencyCode = require("../../util/generateAgencyCode");

//private key
const admin = require("../../util/privateKey");

const { deleteFile } = require("../../util/deletefile");

const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

const { HOST_APPLICATION_TYPE, HISTORY_TYPE } = require("../../types/constant");

//create agency
exports.registerUserAsAgency = async (req, res) => {
  try {
    const { userId, agencyName, contactEmail, commissionRate, mobileNumber, description, countryFlagImage, country } = req.body || {};

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid or missing userId!" });
    }

    if (!agencyName || !contactEmail || !commissionRate || !mobileNumber || !description || !countryFlagImage || !country || !req.file) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "All fields are required!" });
    }

    const minRate = Number(settingJSON?.agencyRate);
    if (Number.isNaN(minRate)) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid agencyRate in app settings." });
    }

    const parsedRate = typeof commissionRate === "string" && String(commissionRate).trim() === "" ? NaN : Number(commissionRate);
    if (Number.isNaN(parsedRate)) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid commission rate." });
    }

    if (parsedRate < minRate) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({
        status: false,
        message: `Commission rate must be at least ${minRate}% (minimum from app settings agencyRate).`,
      });
    }

    if (parsedRate > 100) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Commission rate cannot exceed 100%." });
    }

 

    const [agencyCode, user, existingAgency, existingUserAgency] = await Promise.all([
      generateAgencyCode(),
      User.findOne({ _id: userId, isBlock: false, isFake: false }).select("_id role agencyOwnerId name fcmToken isBlock isPushNotificationEnabled").lean(),
      Agency.findOne({
        $or: [{ contactEmail: contactEmail.trim() }, { agencyName: agencyName.trim() }],
      })
        .select("_id contactEmail")
        .lean(),
      Agency.findOne({ userId: userId }).select("_id").lean(),
    ]);

    if (!user) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "User not found!" });
    }

   
    if (Array.isArray(user.role) && user.role.includes(3)) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "User is already registered as an agency!" });
    }

    if (user.agencyOwnerId !== null) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "User is already part of another agency!" });
    }

    if (existingAgency) {
      if (req.file) deleteFile(req.file);
      const conflictField = existingAgency.contactEmail === contactEmail ? "email" : "agency name";
      return res.status(200).json({
        status: false,
        message: `Agency already exists with this ${conflictField}!`,
      });
    }

    if (existingUserAgency) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "User already became an agency!" });
    }

    const newAgency = new Agency({
      userId,
      agencyCode,
      agencyName,
      image: req.file.path,
      contactEmail,
      commissionRate: parsedRate,
      mobileNumber,
      description,
      countryFlagImage,
      country,
    });

    res.status(200).json({
      status: true,
      message: "Agency registered successfully!",
      data: newAgency,
    });

    await Promise.all([
      newAgency.save(),
      User.updateOne(
        { _id: userId },
        {
          $addToSet: { role: 3 }, // adds 3 only if not already present
          $set: { agencyOwnerId: newAgency._id },
        },
      ),
    ]);

    if (user?.fcmToken && !user?.isBlock && user?.isPushNotificationEnabled) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "✅ Agency Registration Successful",
          body: `Dear ${user?.name || ""}, your agency "${agencyName}" has been successfully registered.`,
        },
        data: {
          type: "AGENCY_REGISTER",
          agencyId: String(newAgency._id),
          userId: String(user._id),
          agencyName: agencyName,
        },
      };

      const adminInstance = await admin;
      adminInstance
        .messaging()
        .send(payload)
        .then((response) => {
          console.log("Agency registration notification sent:", response);
        })
        .catch((error) => {
          console.log("Agency notification error:", error);
        });
    }
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error("Error registering agency:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

//update agency
exports.updateAgencyProfile = async (req, res, next) => {
  try {
    const { agencyId } = req.query;
    const { agencyName, contactEmail, commissionRate, mobileNumber, description, countryFlagImage, country } = req.body;

    if (!agencyId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    const agency = await Agency.findById(agencyId);
    if (!agency) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    if (commissionRate !== undefined && commissionRate !== null && commissionRate !== "") {
      const minRate = Number(settingJSON?.agencyRate);
      if (Number.isNaN(minRate)) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "Invalid agencyRate in app settings." });
      }
      const parsedRate = typeof commissionRate === "string" && String(commissionRate).trim() === "" ? NaN : Number(commissionRate);
      if (Number.isNaN(parsedRate)) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "Invalid commission rate." });
      }
      if (parsedRate < minRate) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({
          status: false,
          message: `Commission rate must be at least ${minRate}% (minimum from app settings agencyRate).`,
        });
      }
      if (parsedRate > 100) {
        if (req.file) deleteFile(req.file);
        return res.status(200).json({ status: false, message: "Commission rate cannot exceed 100%." });
      }
      agency.commissionRate = parsedRate;
    }

    agency.agencyName = agencyName || agency.agencyName;
    agency.contactEmail = contactEmail || agency.contactEmail;
    agency.mobileNumber = mobileNumber || agency.mobileNumber;
    agency.description = description || agency.description;
    agency.countryFlagImage = countryFlagImage || agency.countryFlagImage;
    agency.country = country || agency.country;

    if (req.file) {
      if (agency.image) {
        deleteFile(agency.image);
      }
      agency.image = req.file.path;
    }

    await agency.save();

    return res.status(200).json({
      status: true,
      message: `Agency has been updated successfully.`,
      data: agency,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating Agency." });
  }
};

//manage agency's active status
exports.modifyAgencyStatus = async (req, res, next) => {
  try {
    const { agencyId } = req.query;

    if (!agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    const agency = await Agency.findById(agencyId);
    if (!agency) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    agency.isActive = !agency.isActive;
    await agency.save();

    const newIsActive = agency.isActive;

    res.status(200).json({
      status: true,
      message: `Agency has been ${newIsActive ? "enabled" : "disabled"} successfully.`,
      data: agency,
    });

    const userObjectId = new mongoose.Types.ObjectId(agency.userId);

    await User.updateOne(
      { _id: userObjectId },
      newIsActive
        ? {
            $addToSet: { role: 3 },
            $set: { agencyOwnerId: agency._id },
          }
        : {
            $pull: { role: 3 },
            $set: { agencyOwnerId: null },
          },
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating Agency status." });
  }
};

//get agency dashboard stats
exports.fetchAgencyDashboardStats = async (req, res) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};

    if (startDate !== "All" && endDate !== "All") {
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

    const [totalAgencies, totalActiveAgencies, totalHosts, totalAgencyEarnings] = await Promise.all([
      Agency.countDocuments({
        ...dateFilterQuery,
      }),

      Agency.countDocuments({
        isActive: true,
        ...dateFilterQuery,
      }),

      User.countDocuments({
        isFake: false,
        role: { $in: [2] },
        agencyId: { $ne: null },
      }),

      History.aggregate([
        {
          $match: {
            type: 9,
            ...dateFilterQuery,
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: "$coin",
            },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      status: true,
      message: "Agency dashboard stats fetched successfully!",
      data: {
        totalAgencies,
        totalActiveAgencies,
        totalHosts,
        totalAgencyEarnings: totalAgencyEarnings?.[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("fetchAgencyDashboardStats Error =>", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get agencies
exports.fetchAgencyRecord = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const searchString = req.query.search || "";
    const country = req?.query?.country?.toLowerCase() || "";
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const statusQueryParam = req.query.status;

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);
      dateFilterQuery = {
        createdAt: { $gte: startDateObj, $lte: endDateObj },
      };
    }

    let statusQuery = {};
    if (statusQueryParam === "true") {
      statusQuery.isActive = true;
    } else if (statusQueryParam === "false") {
      statusQuery.isActive = false;
    } else if (statusQueryParam === "All" || statusQueryParam === undefined) {
      statusQuery = {};
    } else {
      return res.status(200).json({
        status: false,
        message: "Query parameter 'status' must be either 'true', 'false', or 'All'.",
      });
    }

    let matchQuery = {
      ...dateFilterQuery,
      ...statusQuery,
    };

    if (country && country.trim() !== "") {
      matchQuery.country = { $regex: country, $options: "i" };
    }

    const [result] = await Promise.all([
      Agency.aggregate([
        {
          $facet: {
            // Filtered total count (before pagination)
            filteredTotal: [
              { $match: matchQuery },
              {
                $lookup: {
                  from: "users",
                  localField: "userId",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, userName: 1, uniqueId: 1, image: 1 } }],
                  as: "userDetails",
                },
              },
              { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
              ...(searchString && searchString !== "All" && searchString.trim() !== ""
                ? [
                    {
                      $match: {
                        $or: [
                          { agencyName: { $regex: searchString, $options: "i" } },
                          { contactEmail: { $regex: searchString, $options: "i" } },
                          { country: { $regex: searchString, $options: "i" } },
                          { mobileNumber: { $regex: searchString, $options: "i" } },
                          { agencyCode: { $regex: searchString, $options: "i" } },
                          { "userDetails.name": { $regex: searchString, $options: "i" } },
                          { "userDetails.userName": { $regex: searchString, $options: "i" } },
                          { "userDetails.uniqueId": { $regex: searchString, $options: "i" } },
                        ],
                      },
                    },
                  ]
                : []),

              { $count: "count" },
            ],

            // Paginated data
            data: [
              { $match: matchQuery },
              {
                $lookup: {
                  from: "users",
                  localField: "userId",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, userName: 1, uniqueId: 1, image: 1 } }],
                  as: "userDetails",
                },
              },
              { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
              ...(searchString && searchString !== "All" && searchString.trim() !== ""
                ? [
                    {
                      $match: {
                        $or: [
                          { agencyName: { $regex: searchString, $options: "i" } },
                          { contactEmail: { $regex: searchString, $options: "i" } },
                          { country: { $regex: searchString, $options: "i" } },
                          { mobileNumber: { $regex: searchString, $options: "i" } },
                          { agencyCode: { $regex: searchString, $options: "i" } },
                          { "userDetails.name": { $regex: searchString, $options: "i" } },
                          { "userDetails.userName": { $regex: searchString, $options: "i" } },
                          { "userDetails.uniqueId": { $regex: searchString, $options: "i" } },
                        ],
                      },
                    },
                  ]
                : []),

              { $sort: { createdAt: -1 } },
              { $skip: (start - 1) * limit },
              { $limit: limit },
              {
                $lookup: {
                  from: "users",
                  localField: "_id",
                  foreignField: "agencyId",
                  pipeline: [
                    {
                      $group: {
                        _id: null,
                        totalHosts: { $sum: 1 },
                        totalSuspendedHosts: { $sum: { $cond: [{ $eq: ["$isHostBlocked", true] }, 1, 0] } },
                      },
                    },
                  ],
                  as: "hosts",
                },
              },
              {
                $lookup: {
                  from: "hostapplications",
                  localField: "_id",
                  foreignField: "agencyId",
                  pipeline: [
                    {
                      $group: {
                        _id: null,
                        totalPendingHosts: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } },
                      },
                    },
                  ],
                  as: "hostApplicationStats",
                },
              },
              // {
              //   $lookup: {
              //     from: "histories",
              //     localField: "_id",
              //     foreignField: "hostAgencyId",
              //     pipeline: [
              //       { $match: { otherUserId: { $ne: null } } },
              //       {
              //         $group: {
              //           _id: null,
              //           totalHostCoins: { $sum: "$receiverCoin" },
              //         },
              //       },
              //     ],
              //     as: "hostEarnings",
              //   },
              // },
              // {
              //   $lookup: {
              //     from: "histories",
              //     localField: "_id",
              //     foreignField: "agencyId",
              //     pipeline: [
              //       { $match: { type: 9 } },
              //       {
              //         $group: {
              //           _id: null,
              //           totalAgencyCoins: { $sum: "$coin" },
              //         },
              //       },
              //     ],
              //     as: "agencyEarnings",
              //   },
              // },
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  agencyCode: 1,
                  agencyName: 1,
                  image: 1,
                  countryFlagImage: 1,
                  country: 1,
                  mobileNumber: 1,
                  contactEmail: 1,
                  description: 1,
                  commissionRate: 1,
                  isActive: 1,
                  createdAt: 1,
                  name: "$userDetails.name",
                  userName: "$userDetails.userName",
                  userImage: "$userDetails.image",
                  hostsCount: { $ifNull: [{ $arrayElemAt: ["$hosts.totalHosts", 0] }, 0] },
                  totalSuspendedHosts: { $ifNull: [{ $arrayElemAt: ["$hosts.totalSuspendedHosts", 0] }, 0] },
                  totalPendingHosts: { $ifNull: [{ $arrayElemAt: ["$hostApplicationStats.totalPendingHosts", 0] }, 0] },
                  // hostCoins: { $ifNull: [{ $arrayElemAt: ["$hostEarnings.totalHostCoins", 0] }, 0] },
                  // totalEarnings: { $ifNull: [{ $arrayElemAt: ["$agencyEarnings.totalAgencyCoins", 0] }, 0] },
                  // netEarnings: { $subtract: [{ $ifNull: [{ $arrayElemAt: ["$agencyEarnings.totalAgencyCoins", 0] }, 0] }, { $ifNull: ["$totalWithdrawn", 0] }] },
                  hostCoins: { $ifNull: ["$hostCoins", 0] },
                  totalEarnings: { $ifNull: ["$totalEarnings", 0] },
                  netEarnings: { $ifNull: ["$netAvailableEarnings", 0] },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const total = result[0]?.filteredTotal[0]?.count || 0;
    const data = result[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Successfully retrieved agencies!",
      total,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get agency's hosts
exports.fetchAgencyHostList = async (req, res) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    const searchString = req.query.search || "";
    const country = req?.query?.country?.toLowerCase() || "";

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

    let searchQuery = {};
    if (searchString && searchString !== "All" && searchString !== "") {
      searchQuery = {
        $or: [
          { name: { $regex: searchString, $options: "i" } },
          { userName: { $regex: searchString, $options: "i" } },
          { email: { $regex: searchString, $options: "i" } },
          { uniqueId: { $regex: searchString, $options: "i" } },
        ],
      };
    }

    const matchQuery = {
      ...searchQuery,
      isFake: false,
      agencyId: agencyId,
      role: 2,
    };

    if (country && country.trim() !== "") {
      matchQuery.country = { $regex: country, $options: "i" };
    }

    const agency = await Agency.findOne({ _id: agencyId }).lean();
    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided ID." });
    }

    const result = await User.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          hostsData: [
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
              $project: {
                _id: 1,
                uniqueId: 1,
                name: 1,
                userName: 1,
                image: 1,
                countryFlagImage: 1,
                country: 1,
                age: 1,
                gender: 1,
                coin: 1,
                earnedHostCoins: 1,
                isBlock: 1,
                isHostBlocked: 1,
                isonline: 1,
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
              },
            },
          ],
        },
      },
    ]);

    const total = result[0].metadata.length > 0 ? result[0].metadata[0].total : 0;
    const hosts = result[0].hostsData;

    return res.status(200).json({
      status: true,
      message: "Host list retrieved successfully for the specified agency.",
      total,
      hosts,
    });
  } catch (error) {
    console.error("Error fetching agency wise hosts:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get agency's pending host applications
exports.fetchAgencyPendingHostList = async (req, res) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.query.agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid Agency ID." });
    }

    const searchString = req.query.search || "";
    const country = req?.query?.country?.toLowerCase() || "";

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

    const agency = await Agency.findOne({ _id: agencyId }).lean();

    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided ID." });
    }

    const userLookupPipeline = [{ $match: { isFake: false } }];

    if (searchString && searchString !== "All") {
      userLookupPipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchString, $options: "i" } },
            { userName: { $regex: searchString, $options: "i" } },
            { email: { $regex: searchString, $options: "i" } },
            { uniqueId: { $regex: searchString, $options: "i" } },
          ],
        },
      });
    }

    if (country && country.trim() !== "") {
      userLookupPipeline.push({
        $match: {
          country: { $regex: country, $options: "i" },
        },
      });
    }

    userLookupPipeline.push({
      $project: {
        uniqueId: 1,
        name: 1,
        userName: 1,
        image: 1,
        countryFlagImage: 1,
        country: 1,
        age: 1,
        gender: 1,
        createdAt: 1,
      },
    });

    const result = await HostApplication.aggregate([
      {
        $match: {
          agencyId: agencyId,
          status: HOST_APPLICATION_TYPE.PENDING,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: userLookupPipeline,
          as: "userData",
        },
      },
      {
        $unwind: { path: "$userData", preserveNullAndEmptyArrays: false },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          hostsData: [
            { $skip: (start - 1) * limit },
            { $limit: limit },
            // {
            //   $lookup: {
            //     from: "followerfollowings",
            //     localField: "userData._id",
            //     foreignField: "toUserId",
            //     pipeline: [{ $project: { _id: 0, fromUserId: 1 } }],
            //     as: "followersList",
            //   },
            // },
            // {
            //   $lookup: {
            //     from: "followerfollowings",
            //     localField: "userData._id",
            //     foreignField: "fromUserId",
            //     pipeline: [{ $project: { _id: 0, toUserId: 1 } }],
            //     as: "followingsList",
            //   },
            // },
            // {
            //   $lookup: {
            //     from: "posts",
            //     localField: "userData._id",
            //     foreignField: "userId",
            //     pipeline: [{ $count: "count" }],
            //     as: "postsData",
            //   },
            // },
            // {
            //   $lookup: {
            //     from: "videos",
            //     localField: "userData._id",
            //     foreignField: "userId",
            //     pipeline: [{ $count: "count" }],
            //     as: "videosData",
            //   },
            // },
            {
              $project: {
                _id: "$userData._id",
                uniqueId: "$userData.uniqueId",
                name: "$userData.name",
                userName: "$userData.userName",
                image: "$userData.image",
                countryFlagImage: "$userData.countryFlagImage",
                country: "$userData.country",
                age: "$userData.age",
                gender: "$userData.gender",
                // coin: "$userData.coin",
                // earnedHostCoins: "$userData.earnedHostCoins",
                // isBlock: "$userData.isBlock",
                // isHostBlocked: "$userData.isHostBlocked",
                // isonline: "$userData.isOnline",
                createdAt: "$userData.createdAt",
                // totalFollowers: { $size: "$followersList" },
                // totalFollowings: { $size: "$followingsList" },
                // totalFriends: { $size: { $setIntersection: ["$followersList.fromUserId", "$followingsList.toUserId"] } },
                // totalPosts: { $ifNull: [{ $arrayElemAt: ["$postsData.count", 0] }, 0] },
                // totalVideos: { $ifNull: [{ $arrayElemAt: ["$videosData.count", 0] }, 0] },
                applicationStatus: "$status",
                appliedAt: "$createdAt",
              },
            },
          ],
        },
      },
    ]);

    const total = result?.[0]?.metadata?.length > 0 ? result[0].metadata[0].total : 0;
    const hosts = result?.[0]?.hostsData || [];

    return res.status(200).json({
      status: true,
      message: "Pending host list retrieved successfully for the specified agency.",
      total,
      hosts,
    });
  } catch (error) {
    console.error("Error fetching agency wise pending hosts:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get agency's suspended hosts
exports.fetchAgencySuspendedHosts = async (req, res) => {
  try {
    if (!req.query.agencyId) {
      return res.status(200).json({ status: false, message: "Agency ID is required." });
    }

    const searchString = req.query.search || "";
    const country = req?.query?.country?.toLowerCase() || "";

    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const agencyId = new mongoose.Types.ObjectId(req.query.agencyId);

    const agency = await Agency.findById(agencyId).lean();
    if (!agency) {
      return res.status(200).json({ status: false, message: "No agency found with the provided ID." });
    }

    let searchQuery = {};

    if (searchString && searchString !== "All") {
      searchQuery = {
        $or: [
          { name: { $regex: searchString, $options: "i" } },
          { userName: { $regex: searchString, $options: "i" } },
          { email: { $regex: searchString, $options: "i" } },
          { uniqueId: { $regex: searchString, $options: "i" } },
        ],
      };
    }

    const matchQuery = {
      ...searchQuery,
      isFake: false,
      agencyId,
      role: 2,
      isHostBlocked: true, // only suspended hosts
    };

    if (country && country.trim()) {
      matchQuery.country = {
        $regex: country,
        $options: "i",
      };
    }

    const result = await User.aggregate([
      {
        $match: matchQuery,
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          hostsData: [
            {
              $sort: { createdAt: -1 },
            },
            {
              $skip: (start - 1) * limit,
            },
            {
              $limit: limit,
            },
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
                pipeline: [
                  {
                    $project: {
                      _id: 0,
                      fromUserId: 1,
                    },
                  },
                ],
                as: "followersList",
              },
            },
            {
              $lookup: {
                from: "followerfollowings",
                localField: "_id",
                foreignField: "fromUserId",
                pipeline: [
                  {
                    $project: {
                      _id: 0,
                      toUserId: 1,
                    },
                  },
                ],
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
              $project: {
                _id: 1,
                uniqueId: 1,
                name: 1,
                userName: 1,
                image: 1,
                countryFlagImage: 1,
                country: 1,
                age: 1,
                gender: 1,
                coin: 1,
                earnedHostCoins: 1,
                isBlock: 1,
                isHostBlocked: 1,
                isonline: "$isOnline",
                createdAt: 1,
                totalFollowers: {
                  $size: "$followersList",
                },
                totalFollowings: {
                  $size: "$followingsList",
                },
                totalFriends: {
                  $size: {
                    $setIntersection: ["$followersList.fromUserId", "$followingsList.toUserId"],
                  },
                },
                totalPosts: {
                  $ifNull: [
                    {
                      $arrayElemAt: ["$postsData.count", 0],
                    },
                    0,
                  ],
                },
                totalVideos: {
                  $ifNull: [
                    {
                      $arrayElemAt: ["$videosData.count", 0],
                    },
                    0,
                  ],
                },
                hostLevelName: { $ifNull: ["$hostLevel.name", ""] },
                hostLevel: { $ifNull: ["$hostLevel.level", ""] },
                hostLevelImage: { $ifNull: ["$hostLevel.image", ""] },
              },
            },
          ],
        },
      },
    ]);

    const total = result?.[0]?.metadata?.[0]?.total || 0;
    const hosts = result?.[0]?.hostsData || [];

    return res.status(200).json({
      status: true,
      message: "Agency suspended hosts retrieved successfully.",
      total,
      hosts,
    });
  } catch (error) {
    console.error("Error fetching agency suspended hosts:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//admin add / deduct agency earning
exports.adminAdjustAgencyEarning = async (req, res) => {
  try {
    let { agencyId, coin, action } = req.body || {};

    if (!agencyId || !coin || !action) {
      return res.status(200).json({
        status: false,
        message: "agencyId, coin, and action are required fields.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(agencyId)) {
      return res.status(200).json({ status: false, message: "Invalid agencyId." });
    }

    action = String(action).trim().toLowerCase();
    coin = Number(coin);

    if (!["add", "deduct"].includes(action)) {
      return res.status(200).json({
        status: false,
        message: "Invalid action. Must be 'add' or 'deduct'.",
      });
    }

    if (isNaN(coin) || coin <= 0) {
      return res.status(200).json({
        status: false,
        message: "Coin must be a positive number.",
      });
    }

    const agency = await Agency.findById(agencyId).select("totalEarnings netAvailableEarnings userId agencyName").lean();

    if (!agency) {
      return res.status(200).json({ status: false, message: "Agency not found." });
    }

    const totalEarnings = Number(agency.totalEarnings) || 0;
    const netAvailableEarnings = Number(agency.netAvailableEarnings) || 0;

    if (action === "deduct" && (netAvailableEarnings < coin || totalEarnings < coin)) {
      return res.status(200).json({
        status: false,
        message: "Insufficient agency earning balance to deduct coins.",
      });
    }

    const uniqueId = await generateHistoryUniqueId();
    const historyType = action === "add" ? HISTORY_TYPE.ADMIN_AGENCY_ADDED_EARNING : HISTORY_TYPE.ADMIN_AGENCY_DEDUCTED_EARNING;

    const updateQuery =
      action === "add"
        ? {
            $inc: {
              totalEarnings: coin,
              netAvailableEarnings: coin,
            },
          }
        : {
            $inc: {
              totalEarnings: -coin,
              netAvailableEarnings: -coin,
            },
          };

    const [updatedAgency] = await Promise.all([
      Agency.findOneAndUpdate({ _id: agencyId }, updateQuery, { new: true }).select("totalEarnings netAvailableEarnings userId agencyName").lean(),
      History.create({
        uniqueId,
        type: historyType,
        agencyId,
        coin,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    res.status(200).json({
      status: true,
      message: `Successfully ${action === "add" ? "added" : "deducted"} ${coin} coins to agency earnings.`,
      data: updatedAgency,
    });

    let notifyUser = null;
    if (agency.userId) {
      notifyUser = await User.findById(agency.userId).select("name fcmToken isPushNotificationEnabled isBlock").lean();
    }

    if (notifyUser?.isPushNotificationEnabled && !notifyUser?.isBlock && notifyUser?.fcmToken) {
      const agencyLabel = agency.agencyName || "your agency";
      const adminInstance = await admin;
      adminInstance
        .messaging()
        .send({
          token: notifyUser.fcmToken,
          notification: {
            title: action === "add" ? "✅ Agency Earnings — Added!" : "🔻 Agency Earnings — Deducted",
            body:
              action === "add"
                ? `💰 ${notifyUser.name || "Agency Owner"}, ${coin} 🪙 coins credited to "${agencyLabel}" earnings.`
                : `📉 ${notifyUser.name || "Agency Owner"}, ${coin} 🪙 coins debited from "${agencyLabel}" earnings.`,
          },
          data: {
            type: "ADMIN_AGENCY_EARNING_ADJUST",
            action: String(action),
            coin: String(coin),
            agencyId: String(agencyId),
          },
        })
        .catch((err) => console.log("Admin agency earning adjust FCM error:", err?.message || err));
    }
  } catch (error) {
    console.error("Admin agency earning adjust error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};
