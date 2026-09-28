const AgencyCommission = require("../../models/agencyCommission.model");

//create agency commission record
exports.createAgencyCommission = async (req, res) => {
  try {
    const { totalEarnings, commissionRate } = req.body || {};

    const newCommission = new AgencyCommission({ totalEarnings, commissionRate });
    await newCommission.save();

    return res.status(200).json({
      status: true,
      message: "Agency commission record created successfully.",
      data: newCommission,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Error creating commission record.", error: error.message });
  }
};

//update an agency commission record
exports.updateAgencyCommission = async (req, res) => {
  try {
    const { agencyCommissionId, totalEarnings, commissionRate } = req.body || {};

    const updatedCommission = await AgencyCommission.findByIdAndUpdate(agencyCommissionId, { totalEarnings, commissionRate }, { new: true });

    if (!updatedCommission) {
      return res.status(200).json({ status: false, message: "Agency commission not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Agency commission updated successfully.",
      data: updatedCommission,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Error updating commission.", error: error.message });
  }
};

//delete an agency commission record
exports.deleteAgencyCommission = async (req, res) => {
  try {
    const { agencyCommissionId } = req.query || {};

    const deletedCommission = await AgencyCommission.findByIdAndDelete(agencyCommissionId);
    if (!deletedCommission) {
      return res.status(200).json({ status: false, message: "Agency commission not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Agency commission deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Error deleting commission.", error: error.message });
  }
};

//fetch all agency commission records
exports.fetchAllAgencyCommissions = async (req, res) => {
  try {
    const commissions = await AgencyCommission.find().sort({ totalEarnings: 1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Agency commissions retrieved successfully.",
      data: commissions,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Error fetching commissions.", error: error.message });
  }
};
