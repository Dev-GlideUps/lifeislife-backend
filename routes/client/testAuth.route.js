/**
 * Test Authentication Routes
 * ONLY FOR TESTING - Only works when isDummyData is true
 */

const express = require("express");
const router = express.Router();
const checkAccess = require("../../checkAccess");
const TestAuthController = require("../../controllers/client/testAuth.controller");

// POST /api/client/test/createTestUser - Create a test user and get token
router.post("/createTestUser", checkAccess(), TestAuthController.createTestUser);

// GET /api/client/test/verifyTestToken - Verify a test token
router.get("/verifyTestToken", checkAccess(), TestAuthController.verifyTestToken);

module.exports = router;
