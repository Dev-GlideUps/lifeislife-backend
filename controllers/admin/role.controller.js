const Role = require("../../models/role.model");
const Subadmin = require("../../models/subadmin.model");

const firebaseAdminPromise = require("../../util/privateKey");

const mongoose = require("mongoose");
const ALLOWED_ACTIONS = ["List", "Create", "Edit", "Update", "Delete"];

// Create Role
exports.registerRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;

    if (!name || !permissions) {
      return res.status(200).json({ message: "Name and permissions are required." });
    }

    for (const perm of permissions) {
      if (!perm.module || typeof perm.module !== "string") {
        return res.status(200).json({ status: false, message: `Invalid module name in permissions.` });
      }

      if (!Array.isArray(perm.actions)) {
        return res.status(200).json({ status: false, message: `Actions must be an array.` });
      }

      const invalidActions = perm.actions.filter((action) => !ALLOWED_ACTIONS.includes(action));
      if (invalidActions.length > 0) {
        return res.status(200).json({
          status: false,
          message: `Invalid actions for module "${perm.module}": ${invalidActions.join(", ")}`,
        });
      }
    }

    const role = new Role({ name, permissions });
    await role.save();

    return res.status(200).json({
      status: true,
      message: "Role created successfully.",
      data: role,
    });
  } catch (error) {
    console.error("Create Role Error:", error);
    return res.status(500).json({ status: false, message: "Server error." });
  }
};

// Update Role
exports.modifyRole = async (req, res) => {
  try {
    const { roleId, name, permissions } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(200).json({ status: false, message: "Invalid role ID." });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(200).json({ status: false, message: "Role not found." });
    }

    if (name) {
      const nameExists = await Role.findOne({ name, _id: { $ne: roleId } });
      if (nameExists) {
        return res.status(200).json({ status: false, message: "Another role with this name already exists." });
      }

      role.name = name;
    }

    if (permissions) {
      if (!Array.isArray(permissions)) {
        return res.status(200).json({ status: false, message: "Permissions must be an array." });
      }

      for (let i = 0; i < permissions.length; i++) {
        const perm = permissions[i];
        if (typeof perm.module !== "string" || !Array.isArray(perm.actions)) {
          return res.status(200).json({ status: false, message: `Invalid permission format at index ${i}` });
        }

        const invalidActions = perm.actions.filter((action) => !ALLOWED_ACTIONS.includes(action));
        if (invalidActions.length > 0) {
          return res.status(200).json({
            status: false,
            message: `Invalid actions for module "${perm.module}": ${invalidActions.join(", ")}`,
          });
        }
      }

      role.permissions = permissions;
    }

    await role.save();

    return res.status(200).json({
      status: true,
      message: "Role updated successfully.",
      data: role,
    });
  } catch (error) {
    console.error("Update Role Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Get All Roles
exports.retrieveRoles = async (req, res) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    let { search = "" } = req.query || {};
    search = search.trim();

    const filter = {};

    if (search) {
      filter.name = {
        $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        $options: "i",
      };
    }

    const [total, roles] = await Promise.all([
      Role.countDocuments(filter),
      Role.find(filter)
        .sort({ createdAt: -1 })
        .skip((start - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      status: true,
      message: "Roles fetched successfully.",
      total,
      data: roles,
    });
  } catch (error) {
    console.error("Get Roles Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Delete Role
exports.deactivateRole = async (req, res) => {
  try {
    const { roleId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(200).json({ status: false, message: "Invalid role ID." });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(200).json({ status: false, message: "Role not found." });
    }

    res.status(200).json({ status: true, message: "Role deleted successfully." });

    const subadminAuths = await Subadmin.find({ role: roleId }, "authId").lean();
    if (subadminAuths.length > 0) {
      try {
        const firebaseAdmin = await firebaseAdminPromise;
        await Promise.allSettled(subadminAuths.filter((s) => s.authId).map((s) => firebaseAdmin.auth().deleteUser(s.authId)));

        console.log(`✅ Deleted ${subadminAuths.length} subadmin from Firebase (role: ${roleId})`);
      } catch (err) {
        console.error("❌ Firebase batch delete error:", err.message);
      }

      await Subadmin.deleteMany({ role: roleId });
    }

    await Role.findByIdAndDelete(roleId);
    console.log(`✅ Role and related subadmin deleted successfully: ${roleId}`);
  } catch (error) {
    console.error("Delete Role Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Get All Roles ( When Create Subadmin )
exports.getAvailableRoles = async (req, res) => {
  try {
    let { search = "" } = req.query || {};
    search = search.trim();

    const filter = { isActive: true };

    if (search) {
      filter.name = {
        $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        $options: "i",
      };
    }

    const roles = await Role.find(filter).select("name createdAt").sort({ createdAt: -1 }).limit(50).lean();

    return res.status(200).json({
      status: true,
      message: "Roles fetched successfully.",
      data: roles,
    });
  } catch (error) {
    console.error("Get Roles Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error." });
  }
};

// Toggle Role Active Status
exports.updateRoleStatus = async (req, res) => {
  try {
    const { roleId } = req.query;

    if (!roleId) {
      return res.status(200).json({ status: false, message: "Role ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(200).json({ status: false, message: "Invalid role ID." });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(200).json({ status: false, message: "Role not found." });
    }

    role.isActive = !role.isActive;
    await role.save();

    return res.status(200).json({
      status: true,
      message: `Role has been ${role.isActive ? "activated" : "deactivated"} successfully.`,
      data: role,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "An error occurred while updating role active status.",
    });
  }
};
