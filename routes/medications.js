const express = require("express");
const router = express.Router();
const Medication = require("../models/medication");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const superAdminAuth = require("../middleware/superAdminAuth");

// Get all medications
router.get("/", async (req, res) => {
  try {
    const medications = await Medication.find();
    res.json(medications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add new medication
router.post("/", [auth, adminAuth], async (req, res) => {
  const medication = new Medication({
    name: req.body.name,
    dosage: req.body.dosage,
    form: req.body.form,
    route: req.body.route,
    manufacturer: req.body.manufacturer,
    notes: req.body.notes,
  });

  try {
    const newMedication = await medication.save();
    res.status(201).json(newMedication);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update medication - admin only
router.patch("/:id", [auth, adminAuth], async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Update fields that are present in the request
    if (req.body.name) medication.name = req.body.name;
    if (req.body.dosage) medication.dosage = req.body.dosage;
    if (req.body.form) medication.form = req.body.form;
    if (req.body.route) medication.route = req.body.route;
    if (req.body.manufacturer) medication.manufacturer = req.body.manufacturer;
    if (req.body.notes) medication.notes = req.body.notes;

    const updatedMedication = await medication.save();
    res.json(updatedMedication);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Replace medication (PUT) - admin only
router.put("/:id", [auth, adminAuth], async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Replace all fields with new data
    medication.name = req.body.name;
    medication.dosage = req.body.dosage;
    medication.form = req.body.form;
    medication.route = req.body.route;
    medication.manufacturer = req.body.manufacturer;
    medication.notes = req.body.notes;

    const updatedMedication = await medication.save();
    res.json(updatedMedication);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete medication - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    await Medication.deleteOne({ _id: req.params.id });
    res.json({ message: "Medication deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get medication by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }
    res.json(medication);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
