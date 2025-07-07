const WeeklySummary = require("../models/weekly_summary");
const NotificationService = require("./notificationService");

class TrendAnalysisService {
  static async analyzeTrends(medicationId, weeks = 4) {
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      // Get summaries for the period
      const summaries = await WeeklySummary.find({
        startDate: { $gte: startDate },
        endDate: { $lte: endDate },
      })
        .populate({
          path: "summaries.changes.updatedBy",
          select: "username email",
        })
        .sort({ startDate: 1 });

      // Extract data for the specific medication
      const medicationData = summaries
        .map((summary) => {
          const medicationSummary = summary.summaries.find(
            (s) => s.medication._id.toString() === medicationId
          );
          if (!medicationSummary) return null;

          return {
            weekStart: summary.startDate,
            weekEnd: summary.endDate,
            totals: medicationSummary.totals,
            daysRemaining: medicationSummary.daysRemaining,
          };
        })
        .filter(Boolean);

      // Calculate trends
      const trends = {
        stockTrend: this.calculateStockTrend(medicationData),
        usageTrend: this.calculateUsageTrend(medicationData),
        anomalies: this.detectAnomalies(medicationData),
      };

      return trends;
    } catch (error) {
      console.error("Error analyzing trends:", error);
      throw error;
    }
  }

  static calculateStockTrend(medicationData) {
    if (medicationData.length < 2) return null;

    const stockValues = medicationData.map((data) => data.totals.currentStock);
    const trend = {
      direction:
        stockValues[stockValues.length - 1] > stockValues[0]
          ? "increasing"
          : "decreasing",
      percentage:
        ((stockValues[stockValues.length - 1] - stockValues[0]) /
          stockValues[0]) *
        100,
      average: stockValues.reduce((a, b) => a + b, 0) / stockValues.length,
    };

    return trend;
  }

  static calculateUsageTrend(medicationData) {
    if (medicationData.length < 2) return null;

    const usageValues = medicationData.map(
      (data) => data.totals.quantityAdministered
    );
    const trend = {
      direction:
        usageValues[usageValues.length - 1] > usageValues[0]
          ? "increasing"
          : "decreasing",
      percentage:
        ((usageValues[usageValues.length - 1] - usageValues[0]) /
          usageValues[0]) *
        100,
      average: usageValues.reduce((a, b) => a + b, 0) / usageValues.length,
    };

    return trend;
  }

  static detectAnomalies(medicationData) {
    if (medicationData.length < 2) return [];

    const anomalies = [];

    // Check for sudden stock changes
    const stockChanges = medicationData.map((data) => data.totals.currentStock);
    const averageStock =
      stockChanges.reduce((a, b) => a + b, 0) / stockChanges.length;
    const stockStdDev = this.calculateStandardDeviation(
      stockChanges,
      averageStock
    );

    medicationData.forEach((data, index) => {
      // Check for significant stock deviation
      if (Math.abs(data.totals.currentStock - averageStock) > 2 * stockStdDev) {
        anomalies.push({
          type: "stock_anomaly",
          week: data.weekStart,
          value: data.totals.currentStock,
          expected: averageStock,
          message: `Unusual stock level detected: ${
            data.totals.currentStock
          } (expected around ${Math.round(averageStock)})`,
        });
      }

      // Check for low stock
      if (data.daysRemaining < 7) {
        anomalies.push({
          type: "low_stock",
          week: data.weekStart,
          value: data.daysRemaining,
          message: `Low stock warning: ${data.daysRemaining} days remaining`,
        });
      }

      // Check for high usage
      const usage = data.totals.quantityAdministered;
      const previousUsage =
        index > 0
          ? medicationData[index - 1].totals.quantityAdministered
          : usage;
      if (usage > previousUsage * 1.5) {
        anomalies.push({
          type: "high_usage",
          week: data.weekStart,
          value: usage,
          previous: previousUsage,
          message: `Significant increase in medication usage detected`,
        });
      }
    });

    return anomalies;
  }

  static calculateStandardDeviation(values, mean) {
    const squareDiffs = values.map((value) => {
      const diff = value - mean;
      return diff * diff;
    });
    const avgSquareDiff =
      squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  static async sendTrendAlerts(medicationId, trends) {
    try {
      if (!trends.anomalies.length) return;

      const summary = await WeeklySummary.findOne({
        "summaries.medication._id": medicationId,
      }).populate("summaries.serviceUser");

      if (!summary) return;

      const medicationSummary = summary.summaries.find(
        (s) => s.medication._id.toString() === medicationId
      );

      if (!medicationSummary) return;

      // Send alerts for each anomaly
      for (const anomaly of trends.anomalies) {
        await NotificationService.notifyMedicationAnomaly(
          medicationSummary,
          anomaly
        );
      }
    } catch (error) {
      console.error("Error sending trend alerts:", error);
      throw error;
    }
  }
}

module.exports = TrendAnalysisService;
