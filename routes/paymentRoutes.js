const express = require("express");
const router = express.Router();

const {
    getPaymentDetails,
    createCheckoutSession,
    verifyCheckout
} = require("../controllers/paymentController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

router.get("/details", protect, authorizeRoles("consumer"), getPaymentDetails);
router.post("/checkout", protect, authorizeRoles("consumer"), createCheckoutSession);
router.post("/verify", protect, authorizeRoles("consumer"), verifyCheckout);

module.exports = router;