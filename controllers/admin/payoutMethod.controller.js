const PayoutMethod = require("../../models/payoutMethod.model");

//fs
const fs = require("fs");

const { deleteFile } = require("../../util/deletefile");

//create payout method
exports.createPayoutMethod = async (req, res, next) => {
  try {
    const { name, details } = req.body || {};

    if (!name) {
      if (req.file) {
        deleteFile(req.file);
      }
      return res.status(200).json({ status: false, message: "Name is required." });
    }

    if (details && !Array.isArray(details)) {
      if (req.file) {
        deleteFile(req.file);
      }
      return res.status(200).json({ status: false, message: "Details must be an array of strings." });
    }

    const method = new PayoutMethod({
      name,
      image: req.file ? req.file.path : "",
      details: details || [],
    });

    await method.save();

    return res.status(200).json({
      status: true,
      message: "Payment method has been created by the admin.",
      data: method,
    });
  } catch (error) {
    if (req.file) {
      deleteFile(req.file);
    }
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update payout method
exports.editPayoutMethod = async (req, res, next) => {
  try {
    const { payoutMethodId, name, details } = req.body || {};

    if (!payoutMethodId) {
      if (req.file) {
        deleteFile(req.file);
      }
      return res.status(200).json({ status: false, message: "payoutMethodId is required." });
    }

    const method = await PayoutMethod.findById(payoutMethodId);
    if (!method) {
      if (req.file) {
        deleteFile(req.file);
      }
      return res.status(200).json({ status: false, message: "Payment method not found." });
    }

    if (req.file) {
      if (method.image) {
        deleteFile(method.image);
      }
      method.image = req.file.path;
    }

    method.name = name ?? method.name;
    method.details = Array.isArray(details) ? details : method.details;
    await method.save();

    return res.status(200).json({
      status: true,
      message: "Payment method has been updated by the admin.",
      data: method,
    });
  } catch (error) {
    if (req.file) {
      deleteFile(req.file);
    }
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//handle the isActive status of the payout method
exports.updatePayoutMethodStatus = async (req, res, next) => {
  try {
    const { payoutMethodId } = req.query;

    if (!payoutMethodId) {
      return res.status(200).json({ status: false, message: "payoutMethodId is required." });
    }

    const method = await PayoutMethod.findById(payoutMethodId);
    if (!method) {
      return res.status(200).json({ status: false, message: "Payment method not found." });
    }

    method.isActive = !method.isActive;
    await method.save();

    return res.status(200).json({
      status: true,
      message: "Payment method has been updated successfully.",
      data: method,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get payout methods
exports.retrievePayoutMethods = async (req, res, next) => {
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

//disable payout method
exports.removePayoutMethod = async (req, res, next) => {
  try {
    const { payoutMethodId } = req.query;

    if (!payoutMethodId) {
      return res.status(200).json({ status: false, message: "payoutMethodId is required." });
    }

    const method = await PayoutMethod.findById(payoutMethodId).select("_id image");
    if (!method) {
      return res.status(200).json({ status: false, message: "Payment method does not exist." });
    }

    res.status(200).json({
      status: true,
      message: "Payment method has been disabled by the admin.",
    });

    if (method.image) {
      deleteFile(method.image);
    }

    await PayoutMethod.findByIdAndDelete(payoutMethodId);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
