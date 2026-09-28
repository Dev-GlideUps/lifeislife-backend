const Theme = require("../../models/theme.model");

//get theme
exports.getThemeList = async (req, res, next) => {
  try {
    const themes = await Theme.find({ isDelete: false, isActive: true }).select("name image coin validity validityType").sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved themes successfully.",
      data: themes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
