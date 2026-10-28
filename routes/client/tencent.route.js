const express = require("express");
const router = express.Router();
const checkAccess = require("../../checkAccess");
const validateUserToken = require("../../middleware/validateUserToken.middleware");

const TencentController = require("../../controllers/client/tencent.controller");

// POST /api/client/live/tencentUserSig - Generate UserSig for authenticated user
// Requires user authentication (supports both Firebase token and test tokens)
router.post("/tencentUserSig", validateUserToken, checkAccess(), TencentController.generateTencentUserSig);

// GET /api/client/live/tencentStatus - Get Tencent configuration status (no auth needed)
router.get("/tencentStatus", checkAccess(), TencentController.getTencentStatus);

module.exports = router;
