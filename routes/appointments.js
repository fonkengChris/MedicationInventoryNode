const express = require("express");
const router = express.Router();
const Appointment = require("../models/appointment");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const NotificationService = require("../services/notificationService");

// Helper function to get user ID from token
async function getUserIdFromToken(req) {
  const token = req.header("x-auth-token");
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findOne({ email: decoded.email });
  return user._id;
}

// Get all appointments
router.get("/", auth, async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username")
      .sort({ dateTime: 1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get appointments for a specific service user
router.get("/service-user/:serviceUserId", auth, async (req, res) => {
  try {
    const appointments = await Appointment.find({
      serviceUser: req.params.serviceUserId,
    })
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username")
      .sort({ dateTime: 1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get appointments by date range
router.get("/date-range", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const appointments = await Appointment.find({
      dateTime: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    })
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username")
      .sort({ dateTime: 1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single appointment
router.get("/:id", auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username");
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create new appointment
router.post("/", [auth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const appointment = new Appointment({
      serviceUser: req.body.serviceUser,
      appointmentType: req.body.appointmentType,
      dateTime: req.body.dateTime,
      duration: req.body.duration,
      location: req.body.location,
      provider: req.body.provider,
      notes: req.body.notes,
      createdBy: userId,
      updatedBy: userId,
    });

    const newAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(newAppointment._id)
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username");

    res.status(201).json(populatedAppointment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update appointment - admin only
router.put("/:id", [auth, adminAuth], async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Update allowed fields
    const updateableFields = [
      "appointmentType",
      "dateTime",
      "duration",
      "location",
      "provider",
      "status",
      "notes",
      "reminderSent",
    ];

    updateableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        appointment[field] = req.body[field];
      }
    });

    appointment.updatedBy = userId;

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username");

    res.json(populatedAppointment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update appointment status
router.put("/:id/status", auth, async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    appointment.status = req.body.status;
    appointment.updatedBy = userId;

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("serviceUser", "name dateOfBirth nhsNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username");

    res.json(populatedAppointment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete appointment - admin only
router.delete("/:id", [auth, adminAuth], async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    await Appointment.deleteOne({ _id: req.params.id });
    res.json({ message: "Appointment deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new route to check for tomorrow's appointments
router.get("/check-upcoming", auth, async (req, res) => {
  try {
    // Get tomorrow's date range
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const upcomingAppointments = await Appointment.find({
      dateTime: {
        $gte: tomorrow,
        $lte: tomorrowEnd,
      },
      reminderSent: { $ne: true },
    }).populate("serviceUser", "name dateOfBirth nhsNumber");

    // Send notifications for each appointment
    for (const appointment of upcomingAppointments) {
      await NotificationService.notifyUpcomingAppointment(appointment);

      // Mark reminder as sent
      appointment.reminderSent = true;
      await appointment.save();
    }

    res.json({
      message: `Sent reminders for ${upcomingAppointments.length} appointments`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
