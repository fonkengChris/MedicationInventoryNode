const medicationRoutes = require("../routes/medications");
const userRoutes = require("../routes/users");
const serviceUserRoutes = require("../routes/service_users");
const activeMedicationRoutes = require("../routes/active_medications");
const authRoutes = require("../routes/auth");
const updateRoutes = require("../routes/updates");
const appointmentRoutes = require("../routes/appointments");
const groupRoutes = require("../routes/groups");
const summaryRoutes = require("../routes/summaries");
const testRoutes = require("../routes/test");
const express = require("express");

module.exports = function (app) {
  app.use(express.json());

  app.use("/api/medications", medicationRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/service-users", serviceUserRoutes);
  app.use("/api/active-medications", activeMedicationRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/updates", updateRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/summaries", summaryRoutes);
  app.use("/api/test", testRoutes);
};
