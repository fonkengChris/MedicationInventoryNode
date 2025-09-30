const express = require("express");
const router = express.Router();
const ServiceUser = require("../models/service_user");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const superAdminAuth = require("../middleware/superAdminAuth");

// Get all service users - accessible to all authenticated users
router.get("/", auth, async (req, res) => {
  try {
    const serviceUsers = await ServiceUser.find().populate({
      path: "group",
      options: { strictPopulate: false }
    });
    
    // Filter out any service users with null groups or invalid group objects
    const validServiceUsers = serviceUsers.filter(user => {
      return user.group !== null && 
             user.group !== undefined && 
             typeof user.group === 'object' &&
             user.group._id;
    });
    
    res.json(validServiceUsers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get one service user - accessible to all authenticated users
router.get("/:id", auth, async (req, res) => {
  try {
    const serviceUser = await ServiceUser.findById(req.params.id);
    if (!serviceUser) {
      return res.status(404).json({ message: "Service user not found" });
    }
    res.json(serviceUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create service user - admin only
router.post("/", [auth, adminAuth], async (req, res) => {
  const serviceUser = new ServiceUser({
    name: req.body.name,
    dateOfBirth: req.body.dateOfBirth,
    nhsNumber: req.body.nhsNumber,
    group: req.body.group,
    address: req.body.address,
    phoneNumber: req.body.phoneNumber,
    emergencyContact: req.body.emergencyContact,
  });

  try {
    const newServiceUser = await serviceUser.save();
    res.status(201).json(newServiceUser);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update service user - admin only
router.put("/:id", [auth, adminAuth], async (req, res) => {
  try {
    const serviceUser = await ServiceUser.findById(req.params.id);
    if (!serviceUser) {
      return res.status(404).json({ message: "Service user not found" });
    }

    Object.keys(req.body).forEach((key) => {
      if (req.body[key] != null) {
        serviceUser[key] = req.body[key];
      }
    });

    const updatedServiceUser = await serviceUser.save();
    res.json(updatedServiceUser);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete service user - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const serviceUser = await ServiceUser.findById(req.params.id);
    if (!serviceUser) {
      return res.status(404).json({ message: "Service user not found" });
    }

    await ServiceUser.deleteOne({ _id: req.params.id });
    res.json({ message: "Service user deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
