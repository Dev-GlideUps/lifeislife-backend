const Ride = require("../../models/ride.model");

//fs
const fs = require("fs");

//deletefile
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//create ride
exports.addRide = async (req, res) => {
  try {
    const { name, type, coin, validity, validityType } = req.body;
    const image = req.files.image ? req.files.image[0].path : "";
    const svgaImage = req.files.svgaImage ? req.files.svgaImage[0].path : "";

    const parsedType = Number(type);
    const parsedValidityType = Number(validityType);
    const parsedCoin = Number(coin);
    const parsedValidity = Number(validity);

    if (!name || !coin || !validity || !validityType || !type) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    if (![1, 2, 3].includes(parsedValidityType)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid validity type. Choose 1 (Day), 2 (Month), or 3 (Year)." });
    }

    if (![1, 2, 3].includes(parsedType)) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Invalid type. Choose 1 (Image), 2 (GIF), or 3 (SVGA)." });
    }

    const ride = new Ride({
      name,
      type: parsedType,
      image,
      svgaImage,
      coin: parsedCoin,
      validity: parsedValidity,
      validityType: parsedValidityType,
    });

    await ride.save();

    return res.status(200).json({ status: true, message: "Ride has been added successfully.", data: ride });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//update ride
exports.modifyRide = async (req, res) => {
  try {
    if (!req.query.rideId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "rideId is required." });
    }

    const ride = await Ride.findById(req.query.rideId);
    if (!ride) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Ride not found." });
    }

    ride.name = req.body.name || ride.name;
    ride.coin = req.body.coin || ride.coin;
    ride.validity = req.body.validity || ride.validity;
    ride.type = req.body.type || ride.type;

    if (req.body.validityType) {
      const parsedValidityType = Number(req.body.validityType);
      if (![1, 2, 3].includes(parsedValidityType)) {
        if (req.files) deleteFiles(req.files);
        return res.status(200).json({ status: false, message: "Invalid validity type. Choose 1 (Day), 2 (Month), or 3 (Year)." });
      }
      ride.validityType = parsedValidityType;
    }

    if (req.files.image) {
      if (ride.image) {
        deleteFile(ride.image);
      }
      ride.image = req.files.image ? req.files.image[0].path : ride.image;
    }

    if (req.body.type === 3 && req.files.svgaImage) {
      if (ride.svgaImage) {
        deleteFile(ride.svgaImage);
      }
      ride.svgaImage = req.files.svgaImage ? req.files.svgaImage[0].path : ride.svgaImage;
    }

    await ride.save();
    return res.status(200).json({ status: true, message: "Ride has been updated successfully.", data: ride });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//toggling the isActive status of a Ride
exports.toggleRideStatus = async (req, res, next) => {
  try {
    const { rideId } = req.query;

    if (!rideId) {
      return res.status(200).json({ status: false, message: "Ride ID is required." });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(200).json({ status: false, message: "Ride not found." });
    }

    ride.isActive = !ride.isActive;
    await ride.save();

    return res.status(200).json({
      status: true,
      message: `Ride has been ${ride.isActive ? "activated" : "deactivated"} successfully.`,
      data: ride,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating ride status." });
  }
};

//toggling ride recommendation
exports.toggleRideRecommendation = async (req, res, next) => {
  try {
    const { rideId } = req.query;

    if (!rideId) {
      return res.status(200).json({ status: false, message: "Ride ID is required." });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(200).json({ status: false, message: "Ride not found." });
    }

    ride.isRecommended = !ride.isRecommended;
    await ride.save();

    return res.status(200).json({
      status: true,
      message: `Ride has been ${ride.isRecommended ? "recommended" : "not recommended"} successfully.`,
      data: ride,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating ride recommendation status." });
  }
};

//get all rides
exports.fetchRides = async (req, res) => {
  try {
    const rides = await Ride.find({ isDelete: false }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({ status: true, message: "Retrieved rides successfully.", data: rides });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//delete ride
exports.removeRide = async (req, res) => {
  try {
    const { rideId } = req.query;
    if (!rideId) {
      return res.status(200).json({ status: false, message: "rideId is required." });
    }

    const ride = await Ride.findById(rideId).lean();
    if (!ride) {
      return res.status(200).json({ status: false, message: "Ride not found." });
    }

    res.status(200).json({
      status: true,
      message: "Ride has been deleted successfully.",
    });

    //await Ride.updateOne({ _id: rideId }, { $set: { isDelete: true } });

    if (ride.image) {
      deleteFile(ride.image);
    }

    if (ride.svgaImage) {
      deleteFile(ride.svgaImage);
    }

    await Ride.deleteOne({ _id: rideId });
  } catch (error) {
    console.error("Error in removeRide:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//get rides dropdown
exports.fetchRideDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";

    const query = {
      isDelete: false,
      isActive: true,
    };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const rides = await Ride.find(query).sort({ createdAt: -1 }).limit(50).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved Rides successfully.",
      data: rides,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
