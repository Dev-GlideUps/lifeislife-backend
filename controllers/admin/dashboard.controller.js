const moment = require("moment-timezone");
const mongoose = require("mongoose");

const User = require("../../models/user.model");
const Video = require("../../models/video.model");
const Post = require("../../models/post.model");
const Report = require("../../models/report.model");
const History = require("../../models/history.model");
const CoinTrader = require("../../models/cointrader.model");
const CoinTraderHistory = require("../../models/coinTraderHistory.model");
const LikeHistory = require("../../models/likeHistory.model");
const Agency = require("../../models/agency.model");
const PayoutRequest = require("../../models/payoutRequest.model");
const LiveStreamer = require("../../models/liveStreamer.model");
const LiveStreamerHistory = require("../../models/liveStreamerHistory.model");
const Verification = require("../../models/verification.model");

const { HISTORY_TYPE, WITHDRAWAL_STATUS, VERIFICATION_STATUS, WITHDRAWAL_PERSON } = require("../../types/constant");

//get dashboard count
exports.dashboardMetrics = async (req, res) => {
  try {
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

    const tz = "Asia/Kolkata";
    const startOfToday = moment.tz(tz).startOf("day").toDate();
    const endOfToday = moment.tz(tz).endOf("day").toDate();
    const startOfYesterday = moment.tz(tz).subtract(1, "day").startOf("day").toDate();
    const endOfYesterday = moment.tz(tz).subtract(1, "day").endOf("day").toDate();
    const startOfMonth = moment.tz(tz).startOf("month").toDate();

    const [
      userStats,
      reportStats,
      totalVideos,
      totalPosts,
      revenueStats,
      coinTraderWalletStats,
      coinTraderTotalReceivedStats,
      withdrawalPanelStats,
      liveActivityStats,
      platformUserStats,
      pendingKycCount,
    ] = await Promise.all([
      User.aggregate([
        { $match: dateFilterQuery },
        {
          $facet: {
            totalUsers: [{ $match: { isBlock: false, role: { $in: [1] } } }, { $count: "count" }],
            totalBlockedUsers: [{ $match: { isBlock: true, role: { $in: [1] } } }, { $count: "count" }],
            totalVipUsers: [{ $match: { isVIP: true, role: { $in: [1] } } }, { $count: "count" }],
            totalHosts: [{ $match: { isBlock: false, agencyId: { $ne: null }, role: { $in: [2] } } }, { $count: "count" }],
            totalBlockedHosts: [{ $match: { isBlock: true, agencyId: { $ne: null }, role: { $in: [2] } } }, { $count: "count" }],
            totalAgencies: [{ $match: { isBlock: false, role: { $in: [3] } } }, { $count: "count" }],
            totalBlockedAgencies: [{ $match: { isBlock: true, role: { $in: [3] } } }, { $count: "count" }],
          },
        },
      ]),
      Report.aggregate([
        { $match: dateFilterQuery },
        {
          $facet: {
            totalReportedUsers: [{ $match: { type: 3, toUserId: { $ne: null } } }, { $count: "count" }],
            totalReportedPosts: [{ $match: { type: 2, postId: { $ne: null } } }, { $count: "count" }],
            totalReportedVideos: [{ $match: { type: 1, videoId: { $ne: null } } }, { $count: "count" }],
          },
        },
      ]),
      Video.countDocuments(dateFilterQuery),
      Post.countDocuments(dateFilterQuery),
      History.aggregate([
        {
          $facet: {
            todayGrossRevenue: [
              {
                $match: {
                  type: HISTORY_TYPE.COIN_PLAN_PURCHASE,
                  createdAt: { $gte: startOfToday, $lte: endOfToday },
                },
              },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ],
            yesterdayRevenue: [
              {
                $match: {
                  type: HISTORY_TYPE.COIN_PLAN_PURCHASE,
                  createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
                },
              },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ],
            thisMonthRevenue: [
              {
                $match: {
                  type: HISTORY_TYPE.COIN_PLAN_PURCHASE,
                  createdAt: { $gte: startOfMonth, $lte: endOfToday },
                },
              },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ],
            lifetimeRevenue: [{ $match: { type: HISTORY_TYPE.COIN_PLAN_PURCHASE } }, { $group: { _id: null, total: { $sum: "$amount" } } }],
            totalSold: [
              {
                $match: {
                  type: {
                    $in: [HISTORY_TYPE.COIN_PLAN_PURCHASE, HISTORY_TYPE.COIN_PURCHASE_FROM_COINTRADER],
                  },
                },
              },
              { $group: { _id: null, total: { $sum: "$coin" } } },
            ],
            giftsAndCalls: [
              {
                $match: {
                  type: {
                    $in: [HISTORY_TYPE.PRIVATE_VIDEO_CALL, HISTORY_TYPE.LIVE_GIFT, HISTORY_TYPE.PRIVATE_AUDIO_CALL, HISTORY_TYPE.CHAT_GIFT],
                  },
                },
              },
              { $group: { _id: null, total: { $sum: "$senderCoin" } } },
            ],
            withdrawn: [{ $match: { type: HISTORY_TYPE.WITHDRAWAL } }, { $group: { _id: null, total: { $sum: "$coin" } } }],
            ongoingCalls: [
              {
                $match: {
                  type: { $in: [HISTORY_TYPE.PRIVATE_VIDEO_CALL, HISTORY_TYPE.PRIVATE_AUDIO_CALL] },
                  callConnect: true,
                  $or: [{ callEndTime: "" }, { callEndTime: { $exists: false } }],
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]),
      CoinTrader.aggregate([{ $group: { _id: null, total: { $sum: "$coin" }, totalSpend: { $sum: "$spendCoin" } } }]),
      CoinTraderHistory.aggregate([{ $match: { isIncome: true } }, { $group: { _id: null, total: { $sum: "$coin" } } }]),
      PayoutRequest.aggregate([
        {
          $facet: {
            pending: [
              { $match: { status: WITHDRAWAL_STATUS.PENDING } },
              {
                $group: {
                  _id: null,
                  amount: { $sum: "$amount" },
                  requestCount: { $sum: 1 },
                },
              },
            ],
            approvedPaidAllTime: [{ $match: { status: WITHDRAWAL_STATUS.ACCEPTED } }, { $group: { _id: null, amount: { $sum: "$amount" } } }],
            rejectedThisMonth: [
              {
                $match: {
                  status: WITHDRAWAL_STATUS.DECLINED,
                  updatedAt: { $gte: startOfMonth, $lte: endOfToday },
                },
              },
              { $group: { _id: null, amount: { $sum: "$amount" } } },
            ],
            todayRequestCount: [{ $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } } }, { $count: "count" }],
            yesterdayRequestCount: [{ $match: { createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } } }, { $count: "count" }],
            monthlyVolume: [
              {
                $match: {
                  status: WITHDRAWAL_STATUS.ACCEPTED,
                  updatedAt: { $gte: startOfMonth, $lte: endOfToday },
                },
              },
              { $group: { _id: null, amount: { $sum: "$amount" } } },
            ],
          },
        },
      ]),
      LiveStreamer.aggregate([
        {
          $facet: {
            liveVideoStreams: [
              {
                $match: {
                  liveType: { $in: [1, 3, 4] },
                  isPkMode: { $ne: true },
                  isAudio: { $ne: true },
                },
              },
              { $count: "count" },
            ],
            audioRooms: [
              {
                $match: {
                  liveType: 2,
                  isAudio: true,
                  $or: [{ isHostActiveInRoom: true }, { seat: { $elemMatch: { userId: { $ne: null } } } }],
                },
              },
              { $count: "count" },
            ],
            pkBattles: [
              {
                $match: {
                  isPkMode: true,
                  liveType: { $nin: [2, 3, 4] },
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]),
      User.aggregate([
        {
          $facet: {
            onlineUsers: [{ $match: { isOnline: true, isBlock: false, isFake: false } }, { $count: "count" }],
            newUsersToday: [
              {
                $match: {
                  isBlock: false,
                  isFake: false,
                  createdAt: { $gte: startOfToday, $lte: endOfToday },
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]),
      Verification.countDocuments({ status: VERIFICATION_STATUS.PENDING }),
    ]);

    const rev = revenueStats[0] || {};
    const wd = withdrawalPanelStats[0] || {};
    const ls = liveActivityStats[0] || {};
    const pu = platformUserStats[0] || {};
    const todayWd = wd.todayRequestCount[0]?.count || 0;
    const yesterdayWd = wd.yesterdayRequestCount[0]?.count || 0;

    let withdrawalTodayVsYesterdayPercent = 0;
    if (yesterdayWd === 0) withdrawalTodayVsYesterdayPercent = todayWd > 0 ? 100 : 0;
    else withdrawalTodayVsYesterdayPercent = Math.round(((todayWd - yesterdayWd) / yesterdayWd) * 10000) / 100;

    const data = {
      totalVideos: totalVideos || 0,
      totalPosts: totalPosts || 0,

      todayGrossRevenue: rev.todayGrossRevenue[0]?.total || 0,
      yesterdayRevenue: rev.yesterdayRevenue[0]?.total || 0,
      thisMonthRevenue: rev.thisMonthRevenue[0]?.total || 0,
      lifetimeRevenue: rev.lifetimeRevenue[0]?.total || 0,

      totalSold: rev.totalSold[0]?.total || 0,
      giftsAndCalls: rev.giftsAndCalls[0]?.total || 0,
      withdrawn: rev.withdrawn[0]?.total || 0,

      coinTraderWallets: coinTraderWalletStats[0]?.total || 0,
      coinTraderTotalReceived: coinTraderTotalReceivedStats[0]?.total || 0,
      coinTraderTotalSpend: coinTraderWalletStats[0]?.totalSpend || 0,

      totalUsers: userStats[0]?.totalUsers[0]?.count || 0,
      totalBlockedUsers: userStats[0]?.totalBlockedUsers[0]?.count || 0,
      totalVipUsers: userStats[0]?.totalVipUsers[0]?.count || 0,

      totalHosts: userStats[0]?.totalHosts[0]?.count || 0,
      totalBlockedHosts: userStats[0]?.totalBlockedHosts[0]?.count || 0,

      totalAgencies: userStats[0]?.totalAgencies[0]?.count || 0,
      totalBlockedAgencies: userStats[0]?.totalBlockedAgencies[0]?.count || 0,

      totalReportedUsers: reportStats[0]?.totalReportedUsers[0]?.count || 0,
      totalReportedPosts: reportStats[0]?.totalReportedPosts[0]?.count || 0,
      totalReportedVideos: reportStats[0]?.totalReportedVideos[0]?.count || 0,

      withdrawalPanel: {
        pending: {
          amount: wd.pending[0]?.amount || 0,
          requestCount: wd.pending[0]?.requestCount || 0,
        },
        approvedPaid: {
          amount: wd.approvedPaidAllTime[0]?.amount || 0,
        },
        rejectedThisMonth: {
          amount: wd.rejectedThisMonth[0]?.amount || 0,
        },
        today: {
          requestCount: todayWd,
          yesterdayRequestCount: yesterdayWd,
          vsYesterdayPercent: withdrawalTodayVsYesterdayPercent,
        },
        monthly: {
          volumeAmount: wd.monthlyVolume[0]?.amount || 0,
        },
      },

      platformActivityHealth: {
        liveVideoStreams: ls.liveVideoStreams[0]?.count || 0,
        audioRooms: ls.audioRooms[0]?.count || 0,
        pkBattles: ls.pkBattles[0]?.count || 0,
        ongoingCalls: rev.ongoingCalls[0]?.count || 0,
        onlineUsers: pu.onlineUsers[0]?.count || 0,
        newUsersToday: pu.newUsersToday[0]?.count || 0,
        pendingKyc: pendingKycCount || 0,
      },
    };

    return res.status(200).json({
      status: true,
      message: "Get admin panel dashboard count.",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//get chat analytic
exports.fetchGraphStats = async (req, res) => {
  try {
    if (!req.query.type) {
      return res.status(200).json({ status: false, message: "type must be required!" });
    }

    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";
    const type = req.query.type.trim().toLowerCase();
    const regionId = (req.query.regionId || "All").toString().trim();
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

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

    let data;
    switch (type) {
      case "user":
        data = await User.aggregate([
          { $match: dateFilterQuery },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.status(200).json({ status: true, message: "Success", chartUser: data });

      case "post":
        data = await Post.aggregate([
          { $match: dateFilterQuery },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.status(200).json({ status: true, message: "Success", chartHost: data });

      case "video":
        data = await Video.aggregate([
          { $match: dateFilterQuery },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.status(200).json({ status: true, message: "Success", chartHost: data });

      case "report":
        data = await Report.aggregate([
          { $match: dateFilterQuery },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
              videoReports: {
                $sum: {
                  $cond: [{ $eq: ["$type", 1] }, 1, 0],
                },
              },
              postReports: {
                $sum: {
                  $cond: [{ $eq: ["$type", 2] }, 1, 0],
                },
              },
              userReports: {
                $sum: {
                  $cond: [{ $eq: ["$type", 3] }, 1, 0],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.status(200).json({ status: true, message: "Success", chartReport: data });

      case "coinflow":
        data = await History.aggregate([
          {
            $match: {
              ...dateFilterQuery,
              type: {
                $in: [
                  HISTORY_TYPE.COIN_PLAN_PURCHASE,
                  HISTORY_TYPE.COIN_PURCHASE_FROM_COINTRADER,
                  HISTORY_TYPE.PRIVATE_VIDEO_CALL,
                  HISTORY_TYPE.LIVE_GIFT,
                  HISTORY_TYPE.PRIVATE_AUDIO_CALL,
                  HISTORY_TYPE.CHAT_GIFT,
                  HISTORY_TYPE.WITHDRAWAL,
                ],
              },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              totalSold: {
                $sum: {
                  $cond: [
                    {
                      $in: ["$type", [HISTORY_TYPE.COIN_PLAN_PURCHASE, HISTORY_TYPE.COIN_PURCHASE_FROM_COINTRADER]],
                    },
                    "$coin",
                    0,
                  ],
                },
              },
              giftsAndCalls: {
                $sum: {
                  $cond: [
                    {
                      $in: ["$type", [HISTORY_TYPE.PRIVATE_VIDEO_CALL, HISTORY_TYPE.LIVE_GIFT, HISTORY_TYPE.PRIVATE_AUDIO_CALL, HISTORY_TYPE.CHAT_GIFT]],
                    },
                    "$senderCoin",
                    0,
                  ],
                },
              },
              withdrawn: {
                $sum: {
                  $cond: [{ $eq: ["$type", HISTORY_TYPE.WITHDRAWAL] }, "$coin", 0],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.status(200).json({ status: true, message: "Success", chartCoinFlow: data });

      case "revenuewithdrawal":
        const [revenueWithdrawalRevenue, revenueWithdrawalPayout] = await Promise.all([
          History.aggregate([
            {
              $match: {
                ...dateFilterQuery,
                type: HISTORY_TYPE.COIN_PLAN_PURCHASE,
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: "$amount" },
              },
            },
            { $sort: { _id: 1 } },
          ]),
          PayoutRequest.aggregate([
            {
              $match: {
                ...dateFilterQuery,
                status: WITHDRAWAL_STATUS.ACCEPTED,
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                withdrawal: { $sum: "$amount" },
              },
            },
            { $sort: { _id: 1 } },
          ]),
        ]);
        return res.status(200).json({
          status: true,
          message: "Success",
          chartRevenue: revenueWithdrawalRevenue,
          chartWithdrawal: revenueWithdrawalPayout,
        });

      case "withdrawaltrend":
        data = await PayoutRequest.aggregate([
          {
            $match: {
              ...dateFilterQuery,
              status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.ACCEPTED, WITHDRAWAL_STATUS.DECLINED] },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              pending: { $sum: { $cond: [{ $eq: ["$status", WITHDRAWAL_STATUS.PENDING] }, 1, 0] } },
              approved: { $sum: { $cond: [{ $eq: ["$status", WITHDRAWAL_STATUS.ACCEPTED] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ["$status", WITHDRAWAL_STATUS.DECLINED] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.status(200).json({ status: true, message: "Success", chartWithdrawalTrend: data });

      default:
        return res.status(200).json({ status: false, message: "Invalid type provided." });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get new user
exports.retrieveRecentUsers = async (req, res) => {
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

    const filter = { ...dateFilterQuery, isFake: false };

    const users = await User.aggregate([
      { $match: filter },
      {
        $project: {
          _id: 1,
          uniqueId: 1,
          name: 1,
          userName: 1,
          image: 1,
          email: 1,
          countryFlagImage: 1,
          country: 1,
          gender: 1,
          coin: 1,
          isOnline: 1,
          loginType: 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
    ]);

    return res.status(200).json({
      status: true,
      message: "Newly signed up users retrieved successfully!",
      data: users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get top spenders
exports.fetchTopContributors = async (req, res) => {
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

    const topSpenders = await History.aggregate([
      { $match: { ...dateFilterQuery, type: { $in: [5, 6] } } },
      {
        $group: {
          _id: "$userId",
          totalCoinsSpent: { $sum: "$senderCoin" },
        },
      },
      {
        $sort: { totalCoinsSpent: -1 },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          _id: 0,
          //userId: "$_id",
          totalCoinsSpent: 1,
          name: "$user.name",
          userName: "$user.userName",
          image: "$user.image",
          email: "$user.email",
          countryFlagImage: "$user.countryFlagImage",
          country: "$user.country",
          isVIP: "$user.isVIP",
        },
      },
    ]);

    res.status(200).json({
      status: true,
      message: "Top spenders fetched successfully",
      data: topSpenders,
    });
  } catch (error) {
    console.error("Top Spenders Error:", error);
    res.status(500).json({ status: false, message: "Something went wrong", error: error.message });
  }
};

//get top likers
exports.fetchTopLikers = async (req, res) => {
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

    const topLikers = await LikeHistory.aggregate([
      { $match: dateFilterQuery },
      {
        $group: {
          _id: "$userId",
          totalLikes: { $sum: 1 },
        },
      },
      { $sort: { totalLikes: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          "user._id": 1,
          "user.name": 1,
          "user.userName": 1,
          "user.image": 1,
          totalLikes: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Top likers fetched successfully.",
      topLikers,
    });
  } catch (error) {
    console.error("Error fetching top likers for admin:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get reported profiles
exports.fetchReportedProfiles = async (req, res) => {
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

    const reportedProfiles = await Report.find({
      type: 3, // 3 = user-user reports
      ...dateFilterQuery,
    })
      .select("userId toUserId reportReason status createdAt")
      .populate("userId", "name userName image gender countryFlagImage country") // reporter user info
      .populate("toUserId", "name userName image gender countryFlagImage country") // reported user info
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Reported profiles fetched successfully.",
      data: reportedProfiles,
    });
  } catch (error) {
    console.error("Error fetching reported profiles:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

//get blocked users
exports.fetchBlockedUsers = async (req, res) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery = {
        updatedAt: {
          $gte: startDateObj,
          $lte: endDateObj,
        },
      };
    }

    const blockedUsers = await User.find({
      isBlock: true,
      ...dateFilterQuery,
    })
      .select("name userName image gender countryFlagImage country createdAt")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Blocked users fetched successfully.",
      data: blockedUsers,
    });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//get top hosts
exports.getHighestEarningHosts = async (req, res) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilter = {};
    if (startDate !== "All" && endDate !== "All") {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.createdAt = { $gte: start, $lte: end };
    }

    const filterQuery = {
      ...dateFilter,
      type: { $in: [5, 6] },
      receiverCoin: { $gt: 0 },
      otherUserId: { $ne: null },
      hostAgencyId: { $ne: null },
    };

    const topHosts = await History.aggregate([
      { $match: filterQuery },
      {
        $group: {
          _id: "$otherUserId",
          totalCoins: { $sum: "$receiverCoin" },
        },
      },
      { $sort: { totalCoins: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                name: 1,
                userName: 1,
                image: 1,
                country: 1,
                countryFlagImage: 1,
                agencyId: 1,
              },
            },
          ],
          as: "hostDetails",
        },
      },
      {
        $unwind: { path: "$hostDetails", preserveNullAndEmptyArrays: false },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hostDetails.agencyId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                agencyCode: 1,
                agencyName: 1,
                image: 1,
                country: 1,
                countryFlagImage: 1,
              },
            },
          ],
          as: "agencyDetails",
        },
      },
      { $unwind: { path: "$agencyDetails", preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 0,
          totalCoins: 1,
          hostId: "$_id",
          name: "$hostDetails.name",
          userName: "$hostDetails.userName",
          hostImage: "$hostDetails.image",
          hostCountry: "$hostDetails.country",
          hostFlagImage: "$hostDetails.countryFlagImage",
          agencyCode: "$agencyDetails.agencyCode",
          agencyName: "$agencyDetails.agencyName",
          image: "$agencyDetails.image",
          countryFlagImage: "$agencyDetails.countryFlagImage",
          country: "$agencyDetails.country",
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Top performing hosts with agency info retrieved successfully ✅",
      data: topHosts,
    });
  } catch (error) {
    console.error("Error fetching top hosts:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get top agency
exports.getHighestPerformingAgencies = async (req, res) => {
  try {
    const startDate = req.query.startDate || "All";
    const endDate = req.query.endDate || "All";

    let dateFilterQuery = {};
    if (startDate !== "All" && endDate !== "All") {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      dateFilterQuery.createdAt = {
        $gte: startDateObj,
        $lte: endDateObj,
      };
    }

    const filter = {
      ...dateFilterQuery,
      type: 9, // ← This ensures only type 9 (agency earnings) are included
      coin: { $gt: 0 },
    };

    const topAgencies = await History.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$agencyId",
          totalCoins: { $sum: "$coin" },
        },
      },
      { $sort: { totalCoins: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "agencyId",
          pipeline: [{ $count: "count" }],
          as: "hostsCount",
        },
      },
      {
        $addFields: {
          hostsCount: { $ifNull: [{ $arrayElemAt: ["$hostsCount.count", 0] }, 0] },
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                agencyCode: 1,
                agencyName: 1,
                image: 1,
                contactEmail: 1,
                commissionRate: 1,
                countryFlagImage: 1,
                country: 1,
                createdAt: 1,
              },
            },
          ],
          as: "agencyDetails",
        },
      },
      { $unwind: { path: "$agencyDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          agencyCode: "$agencyDetails.agencyCode",
          agencyName: "$agencyDetails.agencyName",
          image: "$agencyDetails.image",
          contactEmail: "$agencyDetails.contactEmail",
          commissionRate: "$agencyDetails.commissionRate",
          countryFlagImage: "$agencyDetails.countryFlagImage",
          country: "$agencyDetails.country",
          totalEarnings: "$totalCoins",
          createdAt: "$agencyDetails.createdAt",
          hostsCount: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Top performing agencies retrieved successfully 🏆",
      data: topAgencies,
    });
  } catch (error) {
    console.error("Error fetching top performing agencies:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
