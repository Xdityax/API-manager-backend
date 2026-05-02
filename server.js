const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./config/db");
const paymentRoutes = require("./routes/paymentRoutes");
const apiRoutes = require("./routes/apiRoutes");
const authRoutes = require("./routes/authRoutes");
const gatewayRoutes = require("./routes/gatewayRoutes");
const limiter = require("./middleware/rateLimiter");

dotenv.config();

// Connect Database
connectDB();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api", limiter);

// Test Route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "MeterFlow API is running successfully 🚀"
    });
});

app.use("/api/payment", paymentRoutes);
app.use("/api/apis", apiRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/gateway", gatewayRoutes);

app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        success: false,
        message: "Internal server error"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});