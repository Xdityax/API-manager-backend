const crypto = require("crypto");
const Razorpay = require("razorpay");
const User = require("../models/user");
const ActivityLog = require("../models/activityLog");

const getRazorpayKeyId = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;

    if (!keyId || keyId === "your_razorpay_key_id") {
        return null;
    }

    return keyId;
};

const getRazorpayKeySecret = () => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret || keySecret === "your_razorpay_key_secret") {
        return null;
    }

    return keySecret;
};

const getFrontendUrl = () => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return frontendUrl.replace(/\/$/, "");
};

const getUpiId = () => {
    return process.env.UPI_ID || process.env.RAZORPAY_UPI_ID || "";
};

const getUpiAccountName = () => {
    return process.env.UPI_ACCOUNT_NAME || process.env.UPI_PAYEE_NAME || "MeterFlow";
};

const getSubscriptionAmount = () => 100;

const getUpiAmount = () => Number((getSubscriptionAmount() / 100).toFixed(2));

const buildUpiLink = () => {
    const UPI_ID = getUpiId();
    const merchantName = getUpiAccountName();
    const amount = getUpiAmount();

    if (!UPI_ID) {
        return "";
    }

    return `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(merchantName)}&am=${amount}&cu=INR`;
};

const getErrorMessage = (error) => {
    return (
        error?.error?.description ||
        error?.message ||
        error?.error?.message ||
        "Unable to process Razorpay request"
    );
};

const buildReceipt = (userId) => {
    const userFragment = String(userId || "user").slice(-6);
    const timestampFragment = String(Date.now()).slice(-8);

    return `mf_${userFragment}_${timestampFragment}`;
};

const getPaymentDetails = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            amount: getSubscriptionAmount(),
            upiLink: buildUpiLink(),
            currency: "INR",
            UPI_ID: getUpiId(),
            UPI_ACCOUNT_NAME: getUpiAccountName(),
            merchantName: "MeterFlow",
            description: "MeterFlow Pro subscription"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: getErrorMessage(error)
        });
    }
};

const createCheckoutSession = async (req, res) => {
    try {
        const razorpayKeyId = getRazorpayKeyId();
        const razorpayKeySecret = getRazorpayKeySecret();

        if (!razorpayKeyId || !razorpayKeySecret) {
            return res.status(500).json({
                success: false,
                message: "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to valid values."
            });
        }

        const razorpay = new Razorpay({
            key_id: razorpayKeyId,
            key_secret: razorpayKeySecret
        });
        const amount = getSubscriptionAmount();
        const currency = "INR";

        const order = await razorpay.orders.create({
            amount,
            currency,
            receipt: buildReceipt(req.user.id),
            notes: {
                userId: req.user.id,
                plan: "MeterFlow Pro",
                billingCycle: "monthly"
            }
        });

        res.status(200).json({
            success: true,
            keyId: razorpayKeyId,
            orderId: order.id,
            amount,
            currency,
            merchantName: "MeterFlow",
            description: "MeterFlow Pro subscription"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: getErrorMessage(error)
        });
    }
};

const verifyCheckout = async (req, res) => {
    try {
        const razorpayKeySecret = getRazorpayKeySecret();

        if (!razorpayKeySecret) {
            return res.status(500).json({
                success: false,
                message: "Razorpay is not configured. Set RAZORPAY_KEY_SECRET to a valid value."
            });
        }

        const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};

        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({
                success: false,
                message: "Missing Razorpay verification fields."
            });
        }

        const expectedSignature = crypto
            .createHmac("sha256", razorpayKeySecret)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        if (expectedSignature !== signature) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment signature."
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { plan: "pro" },
            { new: true }
        ).select("_id name email role plan freeCredits createdAt");

        await ActivityLog.create({
            user: req.user.id,
            type: "plan_upgraded",
            title: "Plan upgraded to Pro",
            detail: "Consumer subscription upgraded successfully.",
            metadata: {
                paymentId,
                orderId
            }
        });

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully.",
            user: updatedUser
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: getErrorMessage(error)
        });
    }
};

module.exports = {
    getPaymentDetails,
    createCheckoutSession,
    verifyCheckout
};