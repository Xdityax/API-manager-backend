const express = require("express");
const router = express.Router();

const {
	createApi,
	listApis,
	getApiCatalog,
	getConsumerOverview,
	createApiKeyForApi,
	getApiKeysForApi,
	getUsageSummary,
	getBillingSummary,
	getDashboardOverview
} = require("../controllers/apiControllers");
const { protect } = require("../middleware/authMiddleware");

router.get("/dashboard/overview", protect, getDashboardOverview);
router.get("/catalog", protect, getApiCatalog);
router.get("/consumer/overview", protect, getConsumerOverview);

// Create and list APIs
router.post("/", protect, createApi);
router.get("/", protect, listApis);

// API key lifecycle
router.post("/:apiId/keys", protect, createApiKeyForApi);
router.get("/:apiId/keys", protect, getApiKeysForApi);

// Usage and billing
router.get("/:apiId/usage-summary", protect, getUsageSummary);
router.get("/:apiId/billing-summary", protect, getBillingSummary);

module.exports = router;