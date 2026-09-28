const AgencyCommission = require("../../models/agencyCommission.model");

//fetch agency commission records
exports.fetchCommissionStats = async (req, res) => {
  try {
    const commissions = await AgencyCommission.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Agency commissions retrieved successfully.",
      data: commissions,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Error fetching commissions.", error: error.message });
  }
};
