const express = require("express");
const router = express.Router();
const DailyStockService = require("../services/dailyStockService");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");

// Get summary by date range
router.get("/date-range", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "Start date and end date are required",
      });
    }

    const summary = await DailyStockService.getSummaryByDateRange(
      new Date(startDate),
      new Date(endDate)
    );

    res.json(summary);
  } catch (err) {
    console.error("Error getting summary:", err);
    res.status(500).json({ message: err.message });
  }
});

// Generate new summary for date range
router.post("/generate", [auth, adminAuth], async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "Start date and end date are required",
      });
    }

    const summary = await DailyStockService.generateWeeklySummary(
      new Date(startDate),
      new Date(endDate)
    );

    res.status(201).json(summary);
  } catch (err) {
    console.error("Error generating summary:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get summary by medication ID
router.get("/medication/:medicationId", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "Start date and end date are required",
      });
    }

    const summary = await DailyStockService.getSummaryByDateRange(
      new Date(startDate),
      new Date(endDate)
    );

    // Filter summary for specific medication
    const medicationSummary = summary.summaries.find(
      (s) => s.medication._id.toString() === req.params.medicationId
    );

    if (!medicationSummary) {
      return res.status(404).json({
        message:
          "No summary found for this medication in the specified date range",
      });
    }

    res.json(medicationSummary);
  } catch (err) {
    console.error("Error getting medication summary:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get summary by service user ID
router.get("/service-user/:serviceUserId", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "Start date and end date are required",
      });
    }

    const summary = await DailyStockService.getSummaryByDateRange(
      new Date(startDate),
      new Date(endDate)
    );

    // Filter summary for specific service user
    const serviceUserSummaries = summary.summaries.filter(
      (s) => s.serviceUser._id.toString() === req.params.serviceUserId
    );

    if (serviceUserSummaries.length === 0) {
      return res.status(404).json({
        message:
          "No summary found for this service user in the specified date range",
      });
    }

    res.json(serviceUserSummaries);
  } catch (err) {
    console.error("Error getting service user summary:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
