const express = require("express");
const { getAdminDashboardOverview } = require("../controllers/adminController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/dashboard/overview", protect, authorizeRoles("admin"), getAdminDashboardOverview);

module.exports = router;
