const express = require("express");
const router = express.Router();
const MedicationUpdate = require("../models/medication_update");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const superAdminAuth = require("../middleware/superAdminAuth");

// Get all updates - accessible to authenticated users
router.get("/", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find()
      .populate("medication", "medicationName")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get updates for a specific medication
router.get("/medication/:medicationId", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find({
      medication: req.params.medicationId,
    })
      .populate("medication", "medicationName")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get updates by a specific user
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const updates = await MedicationUpdate.find({
      updatedBy: req.params.userId,
    })
      .populate("medication", "medicationName")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get updates within a date range
router.get("/date-range", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const updates = await MedicationUpdate.find({
      timestamp: {
        $gte: new Date(startDate),
        $lte: endOfDay,
      },
    })
      .populate("medication", "medicationName")
      .populate("updatedBy", "username email")
      .sort({ timestamp: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete update - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const update = await MedicationUpdate.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: "Update not found" });
    }

    await MedicationUpdate.deleteOne({ _id: req.params.id });
    res.json({ message: "Update deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
