const cron = require("node-cron");
const Appointment = require("../models/appointment");
const ActiveMedication = require("../models/active_medication");
const NotificationService = require("../services/notificationService");
const DailyStockService = require("../services/dailyStockService");

// Function to check upcoming appointments
async function checkUpcomingAppointments() {
  console.log("Running appointment check...");
  try {
    // Get tomorrow's date range
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    console.log(`Checking appointments between ${tomorrow} and ${tomorrowEnd}`);

    // Find appointments for tomorrow that haven't had reminders sent
    const upcomingAppointments = await Appointment.find({
      dateTime: {
        $gte: tomorrow,
        $lte: tomorrowEnd,
      },
      reminderSent: { $ne: true },
    }).populate("serviceUser", "name group dateOfBirth nhsNumber");

    console.log(`Found ${upcomingAppointments.length} upcoming appointments`);

    // Send notifications for each appointment
    for (const appointment of upcomingAppointments) {
      console.log(`Sending notification for appointment: ${appointment._id}`);
      await NotificationService.notifyUpcomingAppointment(appointment);

      // Mark reminder as sent
      appointment.reminderSent = true;
      await appointment.save();
    }

    console.log(
      `Sent reminders for ${upcomingAppointments.length} appointments`
    );
  } catch (error) {
    console.error("Failed to check upcoming appointments:", error);
  }
}

// Function to check medication stock levels
async function checkMedicationStock() {
  console.log("Running medication stock check...");
  try {
    const medications = await ActiveMedication.find({
      isActive: true,
    }).populate("serviceUser", "name groupdateOfBirth nhsNumber");

    console.log(`Found ${medications.length} active medications`);

    for (const medication of medications) {
      console.log(
        `Checking medication: ${medication.medicationName}, Days remaining: ${medication.daysRemaining}`
      );
      if (medication.daysRemaining <= 10) {
        console.log(
          `Low stock detected for ${medication.medicationName}, sending notification...`
        );
        await NotificationService.notifyLowMedicationStock(
          medication,
          medication.daysRemaining
        );
      }
    }

    console.log("Medication stock check completed");
  } catch (error) {
    console.error("Failed to check medication stock:", error);
  }
}

// Schedule tasks
function initializeScheduledTasks() {
  console.log("Setting up scheduled tasks...");

  // Monitor successful runs
  cron.schedule("0 8 * * *", async () => {
    console.log("Starting daily appointment check:", new Date());
    try {
      await checkUpcomingAppointments();
      console.log("Completed appointment check:", new Date());
    } catch (error) {
      console.error("Failed appointment check:", error);
      // Could add notification to admin here
    }
  });

  // Run medication stock check daily at 9:00 AM
  cron.schedule("0 9 * * *", () => {
    console.log("Running scheduled medication check");
    checkMedicationStock();
  });

  // Record daily stock levels at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Recording daily stock levels:", new Date());
    try {
      await DailyStockService.recordDailyStock();
      console.log("Daily stock levels recorded successfully");
    } catch (error) {
      console.error("Failed to record daily stock levels:", error);
    }
  });

  console.log("Scheduled tasks initialized");
}

module.exports = {
  initializeScheduledTasks,
  checkMedicationStock,
  checkUpcomingAppointments,
};
