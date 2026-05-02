const express = require("express");
const validateApiKey = require("../middleware/apiKeyMiddleware");
const { proxyRequest } = require("../controllers/gatewayController");

const router = express.Router();

// End users call this route with x-api-key header and endpoint payload.
router.all("/:apiId/proxy", validateApiKey, proxyRequest);

module.exports = router;
