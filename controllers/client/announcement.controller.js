const mongoose = require("mongoose");

const Announcement = require("../../models/announcement.model");

// get announcements for logged-in user (active + all or user-wise)
exports.fetchAnnouncements = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    const match = {
      isActive: true,
      $or: [{ audienceType: "all" }, { audienceType: "user", userId }],
    };

    const result = await Announcement.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            { $skip: (start - 1) * limit },
            { $limit: limit },
            {
              $project: {
                title: 1,
                message: 1,
                mediaType: 1,
                media: 1,
                thumbnail: 1,
                redirectUrl: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const total = result?.[0]?.total?.[0]?.count || 0;
    const data = result?.[0]?.data || [];

    return res.status(200).json({
      status: true,
      message: "Announcements retrieved successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error("fetchAnnouncements error:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

