const express = require("express");
require("dotenv").config();
const { initializeScheduledTasks } = require("./jobs/scheduledTasks");

const app = express();

// Startup
require("./startup/cors")(app);
require("./startup/routes")(app);
require("./startup/db-connection")();

// Initialize scheduled tasks with logging
console.log("Initializing scheduled tasks...");
initializeScheduledTasks();
console.log("Scheduled tasks initialized");

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Checking for pending notifications...");
  // Run initial checks when server starts
  require("./jobs/scheduledTasks").checkMedicationStock();
  require("./jobs/scheduledTasks").checkUpcomingAppointments();
});
