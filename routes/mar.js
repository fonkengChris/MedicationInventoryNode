const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const MarService = require("../services/marService");
const AdministrationWindowService = require("../services/administrationWindowService");
const AdministrationSettingsService = require("../services/administrationSettingsService");
const MedicationAdministration = require("../models/medication_administration");

router.get("/:serviceUserId", auth, async (req, res) => {
  try {
    const { serviceUserId } = req.params;
    const { startDate, endDate, groupId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const data = await MarService.fetchMarData({
      serviceUserId,
      startDate,
      endDate,
      groupId,
      userId: req.userId,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching MAR data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MAR data",
      error: error.message,
    });
  }
});

router.get("/:serviceUserId/pdf", auth, async (req, res) => {
  try {
    const { serviceUserId } = req.params;
    const { startDate, endDate, groupId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const pdfBuffer = await MarService.generateMarPdf({
      serviceUserId,
      startDate,
      endDate,
      groupId,
      userId: req.userId,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mar-${serviceUserId}-${startDate}-${endDate}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating MAR PDF:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate MAR PDF",
      error: error.message,
    });
  }
});

router.get(
  "/:serviceUserId/availability",
  auth,
  async (req, res) => {
    try {
      const { serviceUserId } = req.params;
      const { date, now, groupId } = req.query;

      const data = await AdministrationWindowService.getAvailableMedications({
        serviceUserId,
        date,
        now,
        groupId,
        userId: req.userId,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Error fetching availability:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch availability",
        error: error.message,
      });
    }
  }
);

router.post("/:serviceUserId/dispense", auth, async (req, res) => {
  try {
    const { serviceUserId } = req.params;
    const { medicationId, quantity, timestamp, notes, groupId } = req.body;

    if (!medicationId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: "Medication ID and quantity are required",
      });
    }

    const validation = await AdministrationWindowService.validateAdministration({
      medicationId,
      serviceUserId,
      timestamp,
      groupId,
      userId: req.userId,
    });

    if (!validation.valid) {
      return res.status(403).json({
        success: false,
        message: validation.reason,
        data: validation,
      });
    }

    const administrationTime = timestamp ? new Date(timestamp) : new Date();
    const status = AdministrationWindowService.evaluateStatus({
      administrationTime,
      window: validation.window,
    });

    const record = await MedicationAdministration.create({
      medication: medicationId,
      serviceUser: serviceUserId,
      scheduledDate: validation.window.scheduledDate,
      scheduledTime: validation.window.scheduledTime,
      administeredAt: administrationTime,
      administeredBy: req.userId,
      quantity,
      status,
      notes,
    });

    res.status(201).json({
      success: true,
      message: "Medication administration recorded",
      data: record,
    });
  } catch (error) {
    console.error("Error recording administration:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record administration",
      error: error.message,
    });
  }
});

router.get("/settings/current", auth, async (req, res) => {
  try {
    const { groupId } = req.query;

    const settings = await AdministrationSettingsService.getSettings({
      groupId,
      userId: req.userId,
    });

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching administration settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch administration settings",
      error: error.message,
    });
  }
});

router.put("/settings", [auth, adminAuth], async (req, res) => {
  try {
    const { scope = "global", groupId, thresholdBefore, thresholdAfter } = req.body;

    if (
      typeof thresholdBefore !== "number" ||
      typeof thresholdAfter !== "number" ||
      thresholdBefore < 0 ||
      thresholdAfter < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Thresholds must be non-negative numbers",
      });
    }

    if (scope === "group" && !groupId) {
      return res.status(400).json({
        success: false,
        message: "groupId is required when scope is 'group'",
      });
    }

    const settings = await AdministrationSettingsService.updateSettings({
      scope,
      groupId,
      thresholdBefore,
      thresholdAfter,
      userId: req.userId,
    });

    res.json({
      success: true,
      message: "Administration settings updated",
      data: settings,
    });
  } catch (error) {
    console.error("Error updating administration settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update administration settings",
      error: error.message,
    });
  }
});

module.exports = router;

