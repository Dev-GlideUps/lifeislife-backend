const Subadmin = require("../../models/subadmin.model");
const Role = require("../../models/role.model");
const Admin = require("../../models/admin.model");
const User = require("../../models/user.model");

const mongoose = require("mongoose");

const firebaseAdminPromise = require("../../util/privateKey");

const { sendEmail } = require("../../util/emailService");
const { subAdminCreatedTemplate, subAdminUpdatedTemplate } = require("../../util/emailTemplates");

// Cryptr
const Cryptr = require("cryptr");
const cryptr = new Cryptr("myTotallySecretKey");

// Create Subadmin
exports.createSubadmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(200).json({
        status: false,
        message: "All fields (name, email, password, role) are required.",
      });
    }

    const [roleExists, emailExists, firebaseAdmin, admin, user] = await Promise.all([
      Role.findById(role),
      Subadmin.findOne({ email }),
      firebaseAdminPromise,
      Admin.exists({ email }),
      User.exists({ email }),
    ]);

    if (!roleExists) {
      return res.status(200).json({ status: false, message: "Invalid role selected." });
    }

    if (admin || user || emailExists) {
      return res.status(200).json({ status: false, message: "Email already in use." });
    }

    let firebaseUser;
    try {
      firebaseUser = await firebaseAdmin.auth().createUser({
        email: email.toLowerCase().trim(),
        password,
        disabled: false,
      });
    } catch (firebaseError) {
      console.error("Firebase user creation failed:", firebaseError);
      return res.status(200).json({
        status: false,
        message: firebaseError.message || "Failed to create Firebase user",
      });
    }

    const subadmin = new Subadmin({
      authId: firebaseUser?.uid,
      name,
      email,
      password: cryptr.encrypt(password),
      role,
    });

    await subadmin.save();

    res.status(200).json({
      status: true,
      message: "Subadmin created successfully.",
    });

    await sendEmail({
      to: subadmin.email,
      subject: "Your Sub Admin Account Has Been Created",
      html: subAdminCreatedTemplate(subadmin.name),
    });
  } catch (err) {
    console.error("Create Subadmin Error:", err);
    return res.status(500).json({ status: false, message: "Server error." });
  }
};

// Update Subadmin
exports.updateSubadmin = async (req, res) => {
  try {
    const { subadminId, name, email, password, roleId, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(subadminId)) {
      return res.status(200).json({ status: false, message: "Invalid Subadmin ID." });
    }

    const [subadmin, firebaseAdmin] = await Promise.all([Subadmin.findById(subadminId), firebaseAdminPromise]);

    if (!subadmin) {
      return res.status(200).json({ status: false, message: "Subadmin not found." });
    }

    if (email && email !== subadmin.email) {
      const normalizedEmail = email.toLowerCase().trim();

      const [emailExists, adminExists, userExists] = await Promise.all([
        Subadmin.findOne({ email: normalizedEmail, _id: { $ne: subadminId } }),
        Admin.exists({ email: normalizedEmail }),
        User.exists({ email: normalizedEmail }),
      ]);

      if (emailExists || adminExists || userExists) {
        return res.status(200).json({
          status: false,
          message: "Email already in use.",
        });
      }

      subadmin.email = email.toLowerCase().trim();

      if (subadmin.authId) {
        await firebaseAdmin.auth().updateUser(subadmin.authId, { email: normalizedEmail });
      }
    }

    if (password) {
      subadmin.password = cryptr.encrypt(password);

      if (subadmin.authId) {
        await firebaseAdmin.auth().updateUser(subadmin.authId, { password });
      }
    }

    if (name) subadmin.name = name;
    if (typeof isActive === "boolean") subadmin.isActive = isActive;
    if (roleId && mongoose.Types.ObjectId.isValid(roleId)) subadmin.role = roleId;

    const updated = await subadmin.save();

    res.status(200).json({
      status: true,
      message: "Subadmin updated successfully.",
    });

    await sendEmail({
      to: updated.email,
      subject: "Your Sub Admin Account Was Updated",
      html: subAdminUpdatedTemplate(updated.name),
    });
  } catch (error) {
    console.error("Update Subadmin Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Toggle Subadmin Active Status
exports.updateSubadminActiveState = async (req, res) => {
  try {
    const { subadminId } = req.query;

    if (!subadminId) {
      return res.status(200).json({ status: false, message: "Subadmin ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(subadminId)) {
      return res.status(200).json({ status: false, message: "Invalid Subadmin ID." });
    }

    const subadmin = await Subadmin.findById(subadminId);
    if (!subadmin) {
      return res.status(200).json({ status: false, message: "Subadmin not found." });
    }

    subadmin.isActive = !subadmin.isActive;
    await subadmin.save();

    return res.status(200).json({
      status: true,
      message: `Subadmin has been ${subadmin.isActive ? "activated" : "deactivated"} successfully.`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: "An error occurred while updating subadmin active status." });
  }
};

// Delete Subadmin
exports.deleteSubadmin = async (req, res) => {
  try {
    const { subadminId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(subadminId)) {
      return res.status(200).json({ status: false, message: "Invalid Subadmin ID." });
    }

    const subadmin = await Subadmin.findById(subadminId);
    if (!subadmin) {
      return res.status(200).json({ status: false, message: "Subadmin not found." });
    }

    res.status(200).json({
      status: true,
      message: "Subadmin deleted successfully.",
    });

    await Subadmin.findByIdAndDelete(subadminId);

    if (subadmin.authId) {
      try {
        const firebaseAdmin = await firebaseAdminPromise;
        await firebaseAdmin.auth().deleteUser(subadmin.authId);
        console.log(`✅ Firebase subadmin deleted: ${subadmin.authId}`);
      } catch (err) {
        console.error(`❌ Failed to delete Firebase subadmin ${subadmin.authId}:`, err.message);
      }
    }
  } catch (error) {
    console.error("Delete Subadmin Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Get All Subadmins
exports.getSubadminList = async (req, res) => {
  try {
    const page = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search } = req.query;

    const filter = {};

    if (search && search.trim() !== "") {
      filter.$or = [{ name: { $regex: search.trim(), $options: "i" } }, { email: { $regex: search.trim(), $options: "i" } }];
    }

    const [subadminList, total] = await Promise.all([
      Subadmin.find(filter).select("-password").populate("role", "name permissions isActive").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Subadmin.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: true,
      message: "Subadmin list retrieved successfully.",
      total,
      data: subadminList,
    });
  } catch (err) {
    console.error("Get Subadmin List Error:", err);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Login Subadmin
exports.loginSubadmin = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    console.log("req.body loginSubadmin: ", req.body);

    const subadmin = await Subadmin.findOne({ email }).select("_id name email password role flag").populate("role");
    console.log("subadmin: ", subadmin);

    if (!subadmin) {
      return res.status(200).json({ status: false, message: "Subadmin not found" });
    }

    if (!subadmin.password) {
      return res.status(200).json({ status: false, message: "Password not found!" });
    }

    if (cryptr.decrypt(subadmin.password) !== password) {
      return res.status(200).json({ status: false, message: "Oops! Password doesn't match!" });
    }

    const ip = req.ip.replace(/^::ffff:/, "");

    subadmin.lastLoginIp = ip;
    subadmin.lastLoginAt = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    await subadmin.save();

    return res.status(200).json({
      status: true,
      message: "Login successful",
      subadmin: {
        _id: subadmin._id,
        name: subadmin.name,
        email: subadmin.email,
        flag: subadmin.flag,
        role: subadmin.role?.name,
        permissions: subadmin.role?.permissions,
      },
    });
  } catch (error) {
    console.error("Login Subadmin error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
