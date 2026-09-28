const express = require("express");
const router = express.Router();

const subadminCtrl = require("../../controllers/admin/subadmin.controller");

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

// Create Subadmin
router.post("/createSubadmin", adminOnly, subadminCtrl.createSubadmin);

// Update Subadmin
router.patch("/updateSubadmin", adminOnly, subadminCtrl.updateSubadmin);

// Toggle Subadmin Active Status
router.patch("/updateSubadminActiveState", adminOnly, subadminCtrl.updateSubadminActiveState);

// Get All Subadmins
router.get("/getSubadminList", adminOnly, subadminCtrl.getSubadminList);

// Delete Subadmin
router.delete("/deleteSubadmin", adminOnly, subadminCtrl.deleteSubadmin);

// Login Subadmin
router.post("/loginSubadmin", adminOnly, subadminCtrl.loginSubadmin);

module.exports = router;
