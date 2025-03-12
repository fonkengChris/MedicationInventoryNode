router.get("/health", async (req, res) => {
  try {
    // Check database connection
    await mongoose.connection.db.admin().ping();

    // Check last run times of scheduled tasks
    const status = {
      server: "up",
      database: "connected",
      lastAppointmentCheck: global.lastAppointmentCheck || null,
      lastMedicationCheck: global.lastMedicationCheck || null,
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      server: "up",
      database: "disconnected",
      error: error.message,
    });
  }
});
