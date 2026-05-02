// Seed script to create test APIs for development
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/user");
const Api = require("../models/Api");

const seedApis = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/meterflow");
    console.log("✓ MongoDB connected");

    // Find or create a test provider
    let provider = await User.findOne({ email: "provider@test.com" });
    if (!provider) {
      provider = await User.create({
        name: "Test Provider",
        email: "provider@test.com",
        password: "password123",
        role: "owner",
        freeCredits: 1000
      });
      console.log("✓ Created test provider:", provider.email);
    } else {
      console.log("✓ Using existing provider:", provider.email);
    }

    // Create test APIs
    const testApis = [
      {
        name: "Weather API",
        baseUrl: "https://api.weatherapi.com",
        description: "Real-time weather data and forecasts for any location",
        pricingPer100Requests: 0.5,
        rateLimitPerMinute: 60,
        user: provider._id
      },
      {
        name: "Email Service API",
        baseUrl: "https://api.sendgrid.com",
        description: "Send transactional and marketing emails reliably",
        pricingPer100Requests: 0.75,
        rateLimitPerMinute: 120,
        user: provider._id
      },
      {
        name: "Analytics API",
        baseUrl: "https://api.analytics.example.com",
        description: "Track user behavior, events, and conversion metrics",
        pricingPer100Requests: 1.0,
        rateLimitPerMinute: 30,
        user: provider._id
      },
      {
        name: "SMS Gateway",
        baseUrl: "https://api.sms.example.com",
        description: "Send SMS messages globally with high delivery rates",
        pricingPer100Requests: 0.25,
        rateLimitPerMinute: 100,
        user: provider._id
      }
    ];

    for (const apiData of testApis) {
      const existing = await Api.findOne({ name: apiData.name });
      if (!existing) {
        const api = await Api.create(apiData);
        console.log(`✓ Created API: ${api.name} (${api._id})`);
      } else {
        console.log(`• API already exists: ${apiData.name}`);
      }
    }

    console.log("\n✓ Seed data created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("✗ Seed error:", error.message);
    process.exit(1);
  }
};

seedApis();
