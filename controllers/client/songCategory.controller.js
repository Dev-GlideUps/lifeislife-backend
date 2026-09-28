const SongCategory = require("../../models/songCategory.model");

//get songCategories
exports.listSongCategories = async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const categories = await SongCategory.find()
      .select("name image")
      .sort({ createdAt: -1 })
      .skip((start - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      status: true,
      message: "SongCategories retrieved!",
      categories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message });
  }
};
