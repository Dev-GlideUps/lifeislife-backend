const ReportReason = require("../../models/reportReason.model");

//get reportReason (when report by user)
exports.fetchViolationReason = async (req, res) => {
  try {
    const reportReason = await ReportReason.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrive reportReason Successfully",
      data: reportReason,
    });
  } catch {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};
