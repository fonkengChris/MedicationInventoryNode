const express = require("express");
const router = express.Router();
const SummaryService = require("../services/summaryService");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const pdfService = require("../services/pdfService");

/**
 * Generate a new summary for a date range
 * POST /api/summaries/generate
 */
router.post("/generate", auth, adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    // Validate date format
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: "Start date must be before end date",
      });
    }

    const summary = await SummaryService.generateSummary(startDate, endDate);

    res.status(201).json({
      success: true,
      data: summary,
      message: "Summary generated successfully",
    });
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({
      success: false,
      message: "Error generating summary",
      error: error.message,
    });
  }
});

/**
 * Get summaries for a date range
 * GET /api/summaries/date-range?startDate=2024-01-01&endDate=2024-01-07
 */
router.get("/date-range", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const summaries = await SummaryService.getSummariesByDateRange(
      startDate,
      endDate
    );

    // If no summaries found, return the most recent one or empty
    if (summaries.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No summaries found for the specified date range",
      });
    }

    // Return the most recent summary
    const mostRecentSummary = summaries[0];

    res.status(200).json({
      success: true,
      data: mostRecentSummary,
    });
  } catch (error) {
    console.error("Error getting summaries by date range:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving summaries",
      error: error.message,
    });
  }
});

/**
 * Get summary by ID
 * GET /api/summaries/:id
 */
router.get("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const summary = await SummaryService.getSummaryById(id);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error getting summary by ID:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving summary",
      error: error.message,
    });
  }
});

/**
 * Download PDF for a summary
 * GET /api/summaries/:id/pdf
 */
router.get("/:id/pdf", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const summary = await SummaryService.getSummaryById(id);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    // Generate PDF
    const pdfBuffer = await pdfService.generateSummaryPdf(summary);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="weekly-summary-${id}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({
      success: false,
      message: "Error generating PDF",
      error: error.message,
    });
  }
});

/**
 * Get summaries for a specific medication
 * GET /api/summaries/medication/:medicationId?startDate=2024-01-01&endDate=2024-01-07
 */
router.get("/medication/:medicationId", auth, async (req, res) => {
  try {
    const { medicationId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const summaries = await SummaryService.getSummariesByMedication(
      medicationId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error("Error getting summaries by medication:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving summaries",
      error: error.message,
    });
  }
});

/**
 * Get summaries for a specific service user
 * GET /api/summaries/service-user/:serviceUserId?startDate=2024-01-01&endDate=2024-01-07
 */
router.get("/service-user/:serviceUserId", auth, async (req, res) => {
  try {
    const { serviceUserId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const summaries = await SummaryService.getSummariesByServiceUser(
      serviceUserId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error("Error getting summaries by service user:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving summaries",
      error: error.message,
    });
  }
});

module.exports = router; 