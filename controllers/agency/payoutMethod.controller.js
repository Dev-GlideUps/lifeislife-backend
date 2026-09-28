const PayoutMethod = require("../../models/payoutMethod.model");

//get payment methods
exports.fetchAvailablePayoutMethods = async (req, res, next) => {
  try {
    const methods = await PayoutMethod.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved payment methods for the admin.",
      data: methods,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
