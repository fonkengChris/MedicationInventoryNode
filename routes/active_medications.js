const express = require("express");
const router = express.Router();
const ActiveMedication = require("../models/active_medication");
const MedicationUpdate = require("../models/medication_update");

// Get the helper function
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

// Helper function to generate user-friendly notes for qualitative updates
function generateQualitativeNote(updateType, changes) {
  const formatValue = (value) => {
    if (value === null || value === undefined) return "not set";
    if (typeof value === "object") {
      if (value.amount && value.unit) return `${value.amount} ${value.unit}`;
      if (Array.isArray(value)) return value.join(", ");
      if (value.name) return value.name;
      return JSON.stringify(value);
    }
    return String(value);
  };

  switch (updateType) {
    case "New Medication":
      return `New medication "${formatValue(changes.medicationName?.newValue)}" has been added to the system.`;
    
    case "Name Change":
      return `Medication name changed from "${formatValue(changes.medicationName?.oldValue)}" to "${formatValue(changes.medicationName?.newValue)}".`;
    
    case "Dosage Change":
      return `Dosage adjusted from ${formatValue(changes.dosage?.oldValue)} to ${formatValue(changes.dosage?.newValue)}.`;
    
    case "Frequency Change":
      return `Administration frequency changed from "${formatValue(changes.frequency?.oldValue)}" to "${formatValue(changes.frequency?.newValue)}".`;
    
    case "Administration Times Change":
      const oldTimes = Array.isArray(changes.administrationTimes?.oldValue) 
        ? changes.administrationTimes.oldValue.join(", ") 
        : formatValue(changes.administrationTimes?.oldValue);
      const newTimes = Array.isArray(changes.administrationTimes?.newValue) 
        ? changes.administrationTimes.newValue.join(", ") 
        : formatValue(changes.administrationTimes?.newValue);
      return `Administration times updated from ${oldTimes} to ${newTimes}.`;
    
    case "Prescriber Change":
      return `Prescriber changed from "${formatValue(changes.prescribedBy?.oldValue)}" to "${formatValue(changes.prescribedBy?.newValue)}".`;
    
    case "Service User Change":
      return `Service user changed from "${formatValue(changes.serviceUser?.oldValue)}" to "${formatValue(changes.serviceUser?.newValue)}".`;
    
    case "Instructions Change":
      const oldInstructions = formatValue(changes.instructions?.oldValue) || "no instructions";
      const newInstructions = formatValue(changes.instructions?.newValue) || "no instructions";
      if (oldInstructions === "no instructions") {
        return `Administration instructions added: "${newInstructions}".`;
      }
      return `Administration instructions updated. Previous: "${oldInstructions}". New: "${newInstructions}".`;
    
    case "Activated":
      return "Medication has been activated and is now available for administration.";
    
    case "Deactivated":
      return "Medication has been temporarily deactivated and is no longer available for administration.";
    
    case "Deleted":
      return "Medication has been permanently removed from the system.";
    
    case "Form Change":
      return `Medication form changed from "${formatValue(changes.form?.oldValue)}" to "${formatValue(changes.form?.newValue)}".`;
    
    case "Route Change":
      return `Administration route changed from "${formatValue(changes.route?.oldValue)}" to "${formatValue(changes.route?.newValue)}".`;
    
    default:
      return `Medication details have been updated.`;
  }
}
const DailyStock = require("../models/daily_stock");
const DailyStockService = require("../services/dailyStockService");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const superAdminAuth = require("../middleware/superAdminAuth");
const NotificationService = require("../services/notificationService");
const mongoose = require("mongoose");
const ServiceUser = require("../models/service_user");

// Helper function to get user ID from token
async function getUserIdFromToken(req) {
  const token = req.header("x-auth-token");
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findOne({ email: decoded.email });
  return user._id;
}

// Get all active medications
router.get("/", auth, async (req, res) => {
  try {
    const medications = await ActiveMedication.find({})
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "email");

    // Check stock levels for each medication
    for (const medication of medications) {
      if (medication.daysRemaining <= 10) {
        await NotificationService.notifyLowMedicationStock(
          medication,
          medication.daysRemaining
        );
      }
    }

    res.json(medications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all medications for a service user - accessible to all authenticated users
router.get("/service-user/:serviceUserId", auth, async (req, res) => {
  try {
    const medications = await ActiveMedication.find({
      serviceUser: req.params.serviceUserId,
      isActive: true,
    }).populate("serviceUser updatedBy");
    res.json(medications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get one medication - accessible to all authenticated users
router.get("/:id", auth, async (req, res) => {
  try {
    const medication = await ActiveMedication.findById(req.params.id).populate(
      "serviceUser updatedBy"
    );
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }
    res.json(medication);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all updates
router.get("/updates", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find()
      .populate({
        path: "updatedBy",
        select: "_id username email",
      })
      .sort({ timestamp: -1 });

    // Handle both old and new updates
    const formattedUpdates = await Promise.all(
      updates.map(async (update) => {
        // For old updates where medication name is missing
        if (
          update.medication &&
          (!update.medication.medicationName ||
            update.medication.medicationName === "Unknown Medication")
        ) {
          const medicationData = await ActiveMedication.findById(
            update.medication._id
          )
            .select(
              "medicationName quantityInStock quantityPerDose dosesPerDay"
            )
            .lean();

          if (medicationData) {
            return {
              _id: update._id,
              medication: {
                _id: update.medication._id,
                medicationName: medicationData.medicationName,
                quantityInStock: medicationData.quantityInStock,
                quantityPerDose: medicationData.quantityPerDose,
                dosesPerDay: medicationData.dosesPerDay,
                daysRemaining: Math.floor(
                  medicationData.quantityInStock /
                    (medicationData.quantityPerDose *
                      medicationData.dosesPerDay)
                ),
              },
              updatedBy: {
                _id: update.updatedBy._id,
                username: update.updatedBy.username || "Unknown User",
                email: update.updatedBy.email || "no-email",
              },
              updateType: update.updateType,
              changes: update.changes,
              timestamp: update.timestamp,
            };
          }
        }

        // For new updates or if medication lookup failed
        return {
          _id: update._id,
          medication: {
            _id: update.medication._id,
            medicationName:
              update.medication.medicationName || "Unknown Medication",
            quantityInStock: update.medication.quantityInStock,
            quantityPerDose: update.medication.quantityPerDose,
            dosesPerDay: update.medication.dosesPerDay,
            daysRemaining: update.medication.daysRemaining,
          },
          updatedBy: {
            _id: update.updatedBy._id,
            username: update.updatedBy.username || "Unknown User",
            email: update.updatedBy.email || "no-email",
          },
          updateType: update.updateType,
          changes: update.changes,
          timestamp: update.timestamp,
        };
      })
    );

    res.json(formattedUpdates);
  } catch (err) {
    console.error("Error fetching updates:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get updates for a specific medication
router.get("/updates/medication/:medicationId", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find({
      medication: req.params.medicationId,
    })
      .populate({
        path: "medication",
        model: "ActiveMedication",
      })
      .populate({
        path: "updatedBy",
        select: "_id username email",
      })
      .sort({ timestamp: -1 });

    // Populate missing medication data for each update
    await Promise.all(updates.map((update) => update.populateMissingData()));

    res.json(updates);
  } catch (err) {
    console.error("Error fetching medication updates:", err);
    res.status(500).json({ message: err.message });
  }
});

// Add new medication - admin only
router.post("/", [auth, adminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = new ActiveMedication({
      serviceUser: req.body.serviceUser,
      medicationName: req.body.medicationName,
      dosage: {
        amount: req.body.dosage.amount,
        unit: req.body.dosage.unit,
      },
      quantityInStock: req.body.quantityInStock,
      quantityPerDose: req.body.quantityPerDose,
      dosesPerDay: req.body.dosesPerDay,
      administrationTimes: req.body.administrationTimes,
      frequency: req.body.frequency,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      prescribedBy: req.body.prescribedBy,
      instructions: req.body.instructions,
      updatedBy: userId,
    });

    const newMedication = await medication.save();

    // Create update record with proper medication data
    const updateType = "New Medication";
    const changes = {
      medicationName: {
        oldValue: null,
        newValue: req.body.medicationName,
      },
    };
    const notes = generateQualitativeNote(updateType, changes);
    
    const update = new MedicationUpdate({
      medication: {
        _id: newMedication._id,
        medicationName: newMedication.medicationName,
        quantityInStock: newMedication.quantityInStock,
        quantityPerDose: newMedication.quantityPerDose,
        dosesPerDay: newMedication.dosesPerDay,
        daysRemaining: Math.floor(
          newMedication.quantityInStock /
            (newMedication.quantityPerDose * newMedication.dosesPerDay)
        ),
      },
      updatedBy: userId,
      updateType: updateType,
      category: getCategoryFromUpdateType(updateType),
      changes: changes,
      notes: notes,
    });

    await update.save();

    // Populate the response
    const populatedMedication = await ActiveMedication.findById(
      newMedication._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "username email");

    res.status(201).json({
      medication: populatedMedication,
      update: update,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update active medication
router.put("/:id", [auth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = await ActiveMedication.findById(req.params.id).populate(
      "serviceUser",
      "name"
    );
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Store old values before update
    const oldValues = {
      medicationName: medication.medicationName,
      quantityInStock: medication.quantityInStock,
      quantityPerDose: medication.quantityPerDose,
      dosesPerDay: medication.dosesPerDay,
      prescribedBy: medication.prescribedBy,
      dosage: medication.dosage,
      frequency: medication.frequency,
      instructions: medication.instructions,
      isActive: medication.isActive,
      serviceUser: medication.serviceUser,
    };

    // Track changes
    const changes = {};
    let updateType = null;

    // Check what's being updated and store changes
    if (
      req.body.medicationName &&
      req.body.medicationName !== oldValues.medicationName
    ) {
      changes.medicationName = {
        oldValue: oldValues.medicationName,
        newValue: req.body.medicationName,
      };
      updateType = "Name Change";
    }

    // Add service user change check
    if (
      req.body.serviceUser &&
      req.body.serviceUser !== oldValues.serviceUser?._id.toString()
    ) {
      // Fetch new service user name
      const newServiceUser = await ServiceUser.findById(req.body.serviceUser)
        .select("name")
        .lean();

      changes.serviceUser = {
        oldValue: oldValues.serviceUser?.name || "Unknown",
        newValue: newServiceUser?.name || "Unknown",
      };
      updateType = "Service User Change";
    }

    // Handle stock changes with accompanying note
    if (
      req.body.quantityInStock !== undefined &&
      req.body.quantityInStock !== oldValues.quantityInStock
    ) {
      changes.quantityInStock = {
        oldValue: oldValues.quantityInStock,
        newValue: req.body.quantityInStock,
        note: req.body.stockChangeNote,
      };
      updateType =
        req.body.quantityInStock > oldValues.quantityInStock
          ? "MedStock Increase"
          : "MedStock Decrease";

      // Record the stock change using DailyStockService
      const quantity = Math.abs(
        req.body.quantityInStock - oldValues.quantityInStock
      );
      let changeType = "Other";

      if (req.body.stockChangeNote) {
        const note = req.body.stockChangeNote.toLowerCase();
        if (note.includes("pharmacy") && note.includes("received")) {
          changeType = "From Pharmacy";
        } else if (note.includes("administered")) {
          changeType = "Quantity Administered";
        } else if (note.includes("leaving") && note.includes("home")) {
          changeType = "Leaving Home";
        } else if (note.includes("returning") && note.includes("home")) {
          changeType = "Returning Home";
        } else if (note.includes("returned") && note.includes("pharmacy")) {
          changeType = "Returned to Pharmacy";
        } else if (note.includes("lost")) {
          changeType = "Lost";
        } else if (note.includes("damaged")) {
          changeType = "Damaged";
        }
      }

      await DailyStockService.recordQuantityChange(
        medication._id,
        userId,
        changeType,
        quantity,
        req.body.stockChangeNote
      );
    }

    if (
      req.body.quantityPerDose !== undefined &&
      req.body.quantityPerDose !== oldValues.quantityPerDose
    ) {
      const oldDaysRemaining = Math.floor(
        medication.quantityInStock /
          (oldValues.quantityPerDose * medication.dosesPerDay)
      );
      const newDaysRemaining = Math.floor(
        medication.quantityInStock /
          (req.body.quantityPerDose * medication.dosesPerDay)
      );
      changes.quantityPerDose = {
        oldValue: oldValues.quantityPerDose,
        newValue: req.body.quantityPerDose,
      };
      changes.daysRemaining = {
        oldValue: oldDaysRemaining,
        newValue: newDaysRemaining,
      };
      updateType = "Quantity Per Dose Change";
    }

    if (
      req.body.dosesPerDay !== undefined &&
      req.body.dosesPerDay !== oldValues.dosesPerDay
    ) {
      const oldDaysRemaining = Math.floor(
        medication.quantityInStock /
          (medication.quantityPerDose * oldValues.dosesPerDay)
      );
      const newDaysRemaining = Math.floor(
        medication.quantityInStock /
          (medication.quantityPerDose * req.body.dosesPerDay)
      );
      changes.dosesPerDay = {
        oldValue: oldValues.dosesPerDay,
        newValue: req.body.dosesPerDay,
      };
      changes.daysRemaining = {
        oldValue: oldDaysRemaining,
        newValue: newDaysRemaining,
      };
      updateType = "Doses Per Day Change";
    }

    if (
      req.body.prescribedBy !== undefined &&
      req.body.prescribedBy !== oldValues.prescribedBy
    ) {
      changes.prescribedBy = {
        oldValue: oldValues.prescribedBy,
        newValue: req.body.prescribedBy,
      };
      updateType = "Prescriber Change";
    }

    if (
      req.body.dosage &&
      (req.body.dosage.amount !== oldValues.dosage.amount ||
        req.body.dosage.unit !== oldValues.dosage.unit)
    ) {
      changes.dosage = {
        oldValue: oldValues.dosage,
        newValue: req.body.dosage,
      };
      updateType = "Dosage Change";
    }

    if (
      req.body.frequency !== undefined &&
      req.body.frequency !== oldValues.frequency
    ) {
      changes.frequency = {
        oldValue: oldValues.frequency,
        newValue: req.body.frequency,
      };
      updateType = "Frequency Change";
    }

    if (
      Array.isArray(req.body.administrationTimes) &&
      JSON.stringify(req.body.administrationTimes) !==
        JSON.stringify(medication.administrationTimes || [])
    ) {
      changes.administrationTimes = {
        oldValue: medication.administrationTimes || [],
        newValue: req.body.administrationTimes,
      };
      updateType = "Administration Times Change";
    }

    if (
      req.body.instructions !== undefined &&
      req.body.instructions !== oldValues.instructions
    ) {
      changes.instructions = {
        oldValue: oldValues.instructions,
        newValue: req.body.instructions,
      };
      updateType = "Instructions Change";
    }

    if (
      req.body.isActive !== undefined &&
      req.body.isActive !== oldValues.isActive
    ) {
      changes.isActive = {
        oldValue: oldValues.isActive,
        newValue: req.body.isActive,
      };
      updateType = req.body.isActive ? "Activated" : "Deactivated";
    }

    // If no changes were detected, return early
    if (!updateType) {
      return res.status(400).json({ message: "No changes detected" });
    }

    // Update the medication with new values
    Object.assign(medication, req.body);
    medication.updatedBy = userId;
    medication.lastUpdated = Date.now();

    const updatedMedication = await medication.save();

    // Generate notes based on update type
    let notes = undefined;
    if (updateType.includes("MedStock") || updateType === "Quantity Per Dose Change" || updateType === "Doses Per Day Change") {
      // Quantitative updates: use user-provided note if available (and not empty), otherwise generate one
      const userNote = req.body.stockChangeNote?.trim();
      notes = userNote && userNote.length > 0 
        ? userNote 
        : generateQuantitativeNote(updateType, changes);
    } else {
      // Qualitative updates get user-friendly generated notes
      notes = generateQualitativeNote(updateType, changes);
    }

    // Create update record
    const update = new MedicationUpdate({
      medication: {
        _id: medication._id,
        medicationName: medication.medicationName,
        quantityInStock: medication.quantityInStock,
        quantityPerDose: medication.quantityPerDose,
        dosesPerDay: medication.dosesPerDay,
        daysRemaining: Math.floor(
          medication.quantityInStock /
            (medication.quantityPerDose * medication.dosesPerDay)
        ),
      },
      updatedBy: userId,
      updateType: updateType,
      category: getCategoryFromUpdateType(updateType),
      changes: changes,
      notes: notes,
    });

    await update.save();

    // Populate and return the response
    const populatedMedication = await ActiveMedication.findById(
      updatedMedication._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "username email");

    res.json({
      medication: populatedMedication,
      update: update,
    });
  } catch (err) {
    console.error("Error updating medication:", err);
    res.status(400).json({ message: err.message });
  }
});

// Deactivate medication
router.put("/:id/deactivate", [auth, adminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = await ActiveMedication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    medication.isActive = false;
    medication.updatedBy = userId;
    medication.lastUpdated = Date.now();

    const updatedMedication = await medication.save();

    // Create update record with new schema format
    const updateType = "Deactivated";
    const changes = {
      isActive: {
        oldValue: true,
        newValue: false,
      },
    };
    const notes = generateQualitativeNote(updateType, changes);
    
    const update = new MedicationUpdate({
      medication: {
        _id: medication._id,
        medicationName: medication.medicationName,
        quantityInStock: medication.quantityInStock,
        quantityPerDose: medication.quantityPerDose,
        dosesPerDay: medication.dosesPerDay,
        daysRemaining: Math.floor(
          medication.quantityInStock /
            (medication.quantityPerDose * medication.dosesPerDay)
        ),
      },
      updatedBy: userId,
      updateType: updateType,
      category: getCategoryFromUpdateType(updateType),
      changes: changes,
      notes: notes,
    });

    await update.save();

    // Populate and return the response
    const populatedMedication = await ActiveMedication.findById(
      updatedMedication._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("updatedBy", "username email");

    res.json({
      medication: populatedMedication,
      update: update,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete active medication
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const medication = await ActiveMedication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Create update record with proper medication data
    const updateType = "Deleted";
    const changes = {
      status: {
        oldValue: "active",
        newValue: "deleted",
      },
    };
    const notes = generateQualitativeNote(updateType, changes);
    
    const update = new MedicationUpdate({
      medication: {
        _id: medication._id,
        medicationName: medication.medicationName,
        quantityInStock: medication.quantityInStock,
        quantityPerDose: medication.quantityPerDose,
        dosesPerDay: medication.dosesPerDay,
        daysRemaining: Math.floor(
          medication.quantityInStock /
            (medication.quantityPerDose * medication.dosesPerDay)
        ),
      },
      updatedBy: userId,
      updateType: updateType,
      category: getCategoryFromUpdateType(updateType),
      changes: changes,
      notes: notes,
    });

    await update.save();
    await ActiveMedication.deleteOne({ _id: req.params.id });

    res.json({
      message: "Medication deleted successfully",
      update: update,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
