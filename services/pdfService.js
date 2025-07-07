const PDFDocument = require("pdfkit");
const PDFTable = require("pdfkit-table");
const WeeklySummary = require("../models/weekly_summary");
const TrendAnalysisService = require("./trendAnalysisService");

class PDFService {
  static async generateWeeklySummaryPDF(summaryId) {
    try {
      const summary = await WeeklySummary.findById(summaryId).populate({
        path: "summaries.changes.updatedBy",
        select: "username email",
      });

      if (!summary) {
        throw new Error("Summary not found");
      }

      // Create a new PDF document
      const doc = new PDFDocument();
      const buffers = [];

      // Collect PDF data
      doc.on("data", (buffer) => buffers.push(buffer));

      // Set up the document
      doc.fontSize(20).text("Weekly Medication Summary", { align: "center" });
      doc.moveDown();
      doc
        .fontSize(12)
        .text(
          `Period: ${new Date(
            summary.startDate
          ).toLocaleDateString()} - ${new Date(
            summary.endDate
          ).toLocaleDateString()}`
        );
      doc.moveDown();

      // Add each summary
      for (const item of summary.summaries) {
        // Service User Information
        doc.fontSize(14).text(`Service User: ${item.serviceUser.name}`);
        doc.fontSize(12).text(`NHS Number: ${item.serviceUser.nhsNumber}`);
        doc.moveDown();

        // Medication Information
        doc.fontSize(14).text(`Medication: ${item.medication.name}`);
        doc
          .fontSize(12)
          .text(
            `Dosage: ${item.medication.dosage.amount} ${item.medication.dosage.unit}`
          );
        doc.moveDown();

        // Stock Summary Table
        const stockTable = {
          headers: ["Category", "Quantity"],
          rows: [
            ["Initial Stock", item.totals.initialStock],
            ["From Pharmacy", item.totals.fromPharmacy],
            ["Quantity Administered", item.totals.quantityAdministered],
            ["Leaving Home", item.totals.leavingHome],
            ["Returning Home", item.totals.returningHome],
            ["Returned to Pharmacy", item.totals.returnedToPharmacy],
            ["Lost", item.totals.lost],
            ["Damaged", item.totals.damaged],
            ["Other", item.totals.other],
            ["Current Stock", item.totals.currentStock],
          ],
        };

        await doc.table(stockTable, {
          prepareHeader: () => doc.font("Helvetica-Bold").fontSize(12),
          prepareRow: () => doc.font("Helvetica").fontSize(10),
        });
        doc.moveDown();

        // Trend Analysis
        const trends = await TrendAnalysisService.analyzeTrends(
          item.medication._id
        );

        if (trends.stockTrend) {
          doc.fontSize(14).text("Stock Trend Analysis");
          doc.fontSize(12);
          doc.text(
            `Direction: ${trends.stockTrend.direction} (${Math.round(
              trends.stockTrend.percentage
            )}% change)`
          );
          doc.text(`Average Stock: ${Math.round(trends.stockTrend.average)}`);
          doc.moveDown();
        }

        if (trends.usageTrend) {
          doc.fontSize(14).text("Usage Trend Analysis");
          doc.fontSize(12);
          doc.text(
            `Direction: ${trends.usageTrend.direction} (${Math.round(
              trends.usageTrend.percentage
            )}% change)`
          );
          doc.text(`Average Usage: ${Math.round(trends.usageTrend.average)}`);
          doc.moveDown();
        }

        // Anomalies
        if (trends.anomalies.length > 0) {
          doc.fontSize(14).text("Detected Anomalies");
          doc.fontSize(12);
          trends.anomalies.forEach((anomaly) => {
            doc.text(`• ${anomaly.message}`);
          });
          doc.moveDown();
        }

        // Individual Changes
        if (item.changes.length > 0) {
          doc.fontSize(14).text("Change History");
          const changesTable = {
            headers: ["Date", "Type", "Quantity", "Note", "Updated By"],
            rows: item.changes.map((change) => [
              new Date(change.timestamp).toLocaleString(),
              change.type,
              change.quantity,
              change.note || "",
              change.updatedBy.username,
            ]),
          };

          await doc.table(changesTable, {
            prepareHeader: () => doc.font("Helvetica-Bold").fontSize(12),
            prepareRow: () => doc.font("Helvetica").fontSize(10),
          });
        }

        // Add a page break if not the last item
        if (item !== summary.summaries[summary.summaries.length - 1]) {
          doc.addPage();
        }
      }

      // Finalize the PDF
      doc.end();

      // Return a promise that resolves with the PDF buffer
      return new Promise((resolve, reject) => {
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on("error", reject);
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      throw error;
    }
  }
}

module.exports = PDFService;
