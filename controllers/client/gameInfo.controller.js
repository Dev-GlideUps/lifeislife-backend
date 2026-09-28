const GameInfo = require("../../models/gameInfo.model");

// get all third party game info
exports.getGameInfoList = async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (start - 1) * limit;

    const gameInfoList = await GameInfo.aggregate([
      {
        $facet: {
          data: [{ $sort: { gameId: 1 } }, { $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const data = gameInfoList[0]?.data || [];
    const total = gameInfoList[0]?.totalCount[0]?.count || 0;

    return res.status(200).json({
      status: true,
      message: "Game info retrieved successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
