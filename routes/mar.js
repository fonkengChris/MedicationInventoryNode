const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const MarService = require("../services/marService");
const AdministrationWindowService = require("../services/administrationWindowService");
const AdministrationSettingsService = require("../services/administrationSettingsService");
const MedicationAdministration = require("../models/medication_administration");
const ActiveMedication = require("../models/active_medication");
const MedicationUpdate = require("../models/medication_update");
const DailyStockService = require("../services/dailyStockService");

// Get the helper function for category
const getCategoryFromUpdateType = MedicationUpdate.getCategoryFromUpdateType || ((updateType) => {
  const quantitativeTypes = [
    "MedStock Increase",
    "MedStock Decrease",
    "Quantity Per Dose Change",
    "Doses Per Day Change",
  ];
  return quantitativeTypes.includes(updateType) ? "quantitative" : "qualitative";
});

// Helper function to generate user-friendly notes for quantitative updates
function generateQuantitativeNote(updateType, changes) {
  const formatValue = (value) => {
    if (value === null || value === undefined) return "not set";
    if (typeof value === "number") return String(value);
    if (typeof value === "object") {
      if (value.amount && value.unit) return `${value.amount} ${value.unit}`;
      if (Array.isArray(value)) return value.join(", ");
      return JSON.stringify(value);
    }
    return String(value);
  };

  switch (updateType) {
    case "MedStock Increase":
      const increaseAmount = changes.quantityInStock?.newValue - changes.quantityInStock?.oldValue;
      const newStock = changes.quantityInStock?.newValue;
      const oldStock = changes.quantityInStock?.oldValue;
      return `Stock increased by ${increaseAmount} units (from ${oldStock} to ${newStock} units).`;
    
    case "MedStock Decrease":
      const decreaseAmount = changes.quantityInStock?.oldValue - changes.quantityInStock?.newValue;
      const decreasedNewStock = changes.quantityInStock?.newValue;
      const decreasedOldStock = changes.quantityInStock?.oldValue;
      return `Stock decreased by ${decreaseAmount} units (from ${decreasedOldStock} to ${decreasedNewStock} units).`;
    
    case "Quantity Per Dose Change":
      const oldQtyPerDose = formatValue(changes.quantityPerDose?.oldValue);
      const newQtyPerDose = formatValue(changes.quantityPerDose?.newValue);
      const oldDaysRemaining = changes.daysRemaining?.oldValue;
      const newDaysRemaining = changes.daysRemaining?.newValue;
      return `Quantity per dose changed from ${oldQtyPerDose} to ${newQtyPerDose}. Days remaining updated from ${oldDaysRemaining} to ${newDaysRemaining} days.`;
    
    case "Doses Per Day Change":
      const oldDosesPerDay = formatValue(changes.dosesPerDay?.oldValue);
      const newDosesPerDay = formatValue(changes.dosesPerDay?.newValue);
      const oldDaysRemainingDose = changes.daysRemaining?.oldValue;
      const newDaysRemainingDose = changes.daysRemaining?.newValue;
      return `Daily dose frequency changed from ${oldDosesPerDay} to ${newDosesPerDay} doses per day. Days remaining updated from ${oldDaysRemainingDose} to ${newDaysRemainingDose} days.`;
    
    default:
      return `Stock or quantity details have been updated.`;
  }
}

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

// Helper function to generate notes for different MAR scenarios
function generateMarScenarioNote(status, notes, quantity, medicationName) {
  const userNote = notes?.trim();
  const medName = medicationName || "medication";
  const qty = quantity || 0;

  switch (status) {
    case "refused":
      return userNote && userNote.length > 0
        ? `R - Refused: ${userNote}`
        : `R - Refused: Service user refused to take ${qty} unit(s) of ${medName}.`;
    
    case "nausea":
    case "nausea_vomiting":
      return userNote && userNote.length > 0
        ? `N - Nausea/Vomiting: ${userNote}`
        : `N - Nausea/Vomiting: Medication not administered due to nausea/vomiting.`;
    
    case "hospital":
      return userNote && userNote.length > 0
        ? `H - Hospital: ${userNote}`
        : `H - Hospital: Service user is in hospital. Medication not administered.`;
    
    case "on_leave":
      return userNote && userNote.length > 0
        ? `L - On Leave: ${userNote}`
        : `L - On Leave: Service user is on leave. Medication not administered.`;
    
    case "destroyed":
      return userNote && userNote.length > 0
        ? `D - Destroyed: ${userNote}`
        : `D - Destroyed: Medication destroyed. Stock decreased by ${qty} unit(s).`;
    
    case "sleeping":
      return userNote && userNote.length > 0
        ? `S - Sleeping: ${userNote}`
        : `S - Sleeping: Service user was sleeping. Medication not administered.`;
    
    case "pulse_abnormal":
      return userNote && userNote.length > 0
        ? `P - Pulse Abnormal: ${userNote}`
        : `P - Pulse Abnormal: Medication not administered due to abnormal pulse.`;
    
    case "not_required":
      return userNote && userNote.length > 0
        ? `NR - Not Required: ${userNote}`
        : `NR - Not Required: Medication not required at this time.`;
    
    case "missed":
      return userNote && userNote.length > 0
        ? `Missed: ${userNote}`
        : `Missed: Medication dose was missed.`;
    
    case "cancelled":
      return userNote && userNote.length > 0
        ? `Cancelled: ${userNote}`
        : `Cancelled: Medication administration was cancelled.`;
    
    case "other":
      return userNote && userNote.length > 0
        ? `O - Other: ${userNote}`
        : `O - Other: Medication not administered for other reasons.`;
    
    case "on-time":
    case "early":
    case "late":
    case "recorded":
    default:
      // Medication was actually administered
      const generatedNote = `Medication administered: ${qty} unit(s) of ${medName}.`;
      return userNote && userNote.length > 0
        ? `${userNote} (${generatedNote})`
        : generatedNote;
  }
}

// Helper function to determine if stock should be decreased
function shouldDecreaseStock(status) {
  // Decrease stock if medication was actually administered, destroyed, or issued for leave
  const stockDecreaseStatuses = [
    "on-time",
    "early",
    "late",
    "recorded",
    "destroyed", // Destroyed medication reduces stock
    "on_leave", // Medication issued for leave reduces stock
  ];
  return stockDecreaseStatuses.includes(status);
}

router.post("/:serviceUserId/dispense", auth, async (req, res) => {
  try {
    const { serviceUserId } = req.params;
    const { medicationId, quantity, timestamp, notes, groupId, outcome } = req.body;

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
    
    // Determine status based on outcome or timing
    let status;
    if (outcome) {
      // Use the provided outcome (refused, unavailable, etc.)
      status = outcome;
    } else {
      // Default to timing-based status
      status = AdministrationWindowService.evaluateStatus({
        administrationTime,
        window: validation.window,
      });
    }

    // Get medication for note generation
    const medication = await ActiveMedication.findById(medicationId);
    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found",
      });
    }

    // Generate appropriate note based on scenario
    const scenarioNote = generateMarScenarioNote(
      status,
      notes,
      quantity,
      medication.medicationName
    );

    // Create the administration record
    const record = await MedicationAdministration.create({
      medication: medicationId,
      serviceUser: serviceUserId,
      scheduledDate: validation.window.scheduledDate,
      scheduledTime: validation.window.scheduledTime,
      administeredAt: administrationTime,
      administeredBy: req.userId,
      quantity: shouldDecreaseStock(status) ? quantity : 0, // Only record quantity if actually administered
      status,
      notes: scenarioNote,
    });

    // All dispense outcomes generate quantitative updates
    const oldStock = medication.quantityInStock;
    let newStock = oldStock;
    let updateType = "MedStock Decrease";
    
    // Only decrease stock if medication was actually administered or destroyed
    if (shouldDecreaseStock(status)) {
      newStock = Math.max(0, oldStock - quantity);
      
      // Update the medication stock
      medication.quantityInStock = newStock;
      medication.lastUpdated = Date.now();
      await medication.save();

      // Record in DailyStockService
      let changeType = "Quantity Administered";
      if (status === "destroyed") {
        changeType = "Damaged";
      } else if (status === "on_leave") {
        changeType = "Leaving Home";
      }
      await DailyStockService.recordQuantityChange(
        medication._id,
        req.userId,
        changeType,
        quantity,
        scenarioNote
      );
    } else {
      // For non-administered scenarios, stock doesn't change but we still record a quantitative update
      // Use "MedStock Decrease" with 0 change to indicate no stock was used
      updateType = "MedStock Decrease";
    }

    // Create medication update record (quantitative for all scenarios)
    const changes = {
      quantityInStock: {
        oldValue: oldStock,
        newValue: newStock,
      },
      daysRemaining: {
        oldValue: Math.floor(oldStock / (medication.quantityPerDose * medication.dosesPerDay)),
        newValue: Math.floor(newStock / (medication.quantityPerDose * medication.dosesPerDay)),
      },
    };

    // Generate note - if stock didn't change, modify the note to reflect that
    let finalNote = scenarioNote;
    if (!shouldDecreaseStock(status)) {
      // For non-administered scenarios, add note that stock was not affected
      const stockNote = `Stock unchanged (${oldStock} units). ${scenarioNote}`;
      finalNote = stockNote;
    } else {
      // For administered scenarios, combine with quantitative note
      const generatedNote = generateQuantitativeNote(updateType, changes);
      finalNote = scenarioNote && scenarioNote.length > 0 
        ? `${scenarioNote} (${generatedNote})`
        : generatedNote;
    }

    const update = new MedicationUpdate({
      medication: {
        _id: medication._id,
        medicationName: medication.medicationName,
        quantityInStock: newStock,
        quantityPerDose: medication.quantityPerDose,
        dosesPerDay: medication.dosesPerDay,
        daysRemaining: Math.floor(newStock / (medication.quantityPerDose * medication.dosesPerDay)),
      },
      updatedBy: req.userId,
      updateType: updateType,
      category: getCategoryFromUpdateType(updateType), // This will be "quantitative"
      changes: changes,
      notes: finalNote,
    });

    await update.save();

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

