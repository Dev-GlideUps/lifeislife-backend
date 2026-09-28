const express = require("express");
const router = express.Router();

const roleCtrl = require("../../controllers/admin/role.controller");

const checkAccessWithSecretKey = require("../../checkAccess");

router.use(checkAccessWithSecretKey());

/**
 * adminOnly — rejects any request from a staff (sub-admin) member.
 * Role & Staff management must be restricted to the super-admin only
 * to prevent privilege escalation attacks.
 */
const adminOnly = (req, res, next) => {
  if (req.admin) return next();
  return res.status(403).json({
    status: false,
    message: "Access denied. Only the super-admin can manage roles.",
  });
};

// Create Role
router.post("/registerRole", adminOnly, roleCtrl.registerRole);

// Update Role
router.patch("/modifyRole", adminOnly, roleCtrl.modifyRole);

// Get All Roles
router.get("/retrieveRoles", adminOnly, roleCtrl.retrieveRoles);

// Delete Role
router.delete("/deactivateRole", adminOnly, roleCtrl.deactivateRole);

// Get All Roles ( When Create Subadmin )
router.get("/getAvailableRoles", adminOnly, roleCtrl.getAvailableRoles);

// Toggle Role Active Status
router.patch("/updateRoleStatus", adminOnly, roleCtrl.updateRoleStatus);

module.exports = router;
