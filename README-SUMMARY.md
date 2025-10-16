# Medication Summary Functionality

This document describes the periodic medication summary functionality that allows administrators to generate comprehensive reports of medication stock changes and usage over specified time periods.

## Overview

The summary functionality provides:
- **Periodic Summary Generation**: Generate summaries for any date range
- **Stock Level Tracking**: Track initial and final stock levels
- **Change Analysis**: Analyze cumulative changes (from pharmacy, administered, etc.)
- **PDF Export**: Download summaries as PDF reports
- **Historical Data**: Retrieve and view past summaries

## API Endpoints

### Generate Summary
```
POST /api/summaries/generate
```
**Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-07"
}
```

### Get Summaries by Date Range
```
GET /api/summaries/date-range?startDate=2024-01-01&endDate=2024-01-07
```

### Get Summary by ID
```
GET /api/summaries/:id
```

### Download PDF
```
GET /api/summaries/:id/pdf
```

### Get Summaries by Medication
```
GET /api/summaries/medication/:medicationId?startDate=2024-01-01&endDate=2024-01-07
```

### Get Summaries by Service User
```
GET /api/summaries/service-user/:serviceUserId?startDate=2024-01-01&endDate=2024-01-07
```

## Data Structure

### Summary Object
```typescript
interface WeeklySummary {
  _id: string;
  startDate: string;
  endDate: string;
  summaries: {
    serviceUser: {
      _id: string;
      name: string;
      dateOfBirth: string;
      nhsNumber: string;
    };
    medication: {
      _id: string;
      medicationName: string;
      quantityInStock: number;
      quantityPerDose: number;
      dosesPerDay: number;
    };
    stockLevels: {
      initial: number;
      final: number;
      daysRemaining: number;
    };
    cumulativeChanges: {
      fromPharmacy: number;
      quantityAdministered: number;
      leavingHome: number;
      returningHome: number;
      returnedToPharmacy: number;
      lost: number;
      damaged: number;
      other: number;
    };
    changes: {
      type: string;
      quantity: number;
      note: string;
      timestamp: string;
      updatedBy: {
        _id: string;
        username: string;
        email: string;
      };
      _id: string;
    }[];
    _id: string;
  }[];
  createdAt: string;
  __v: number;
}
```

## How It Works

### Summary Generation Process

1. **Data Collection**: The system collects all active medications and their associated updates within the specified date range.

2. **Stock Level Calculation**: 
   - Initial stock is calculated based on the most recent stock level before the start date
   - Final stock is the current stock level
   - Days remaining is calculated based on current stock and daily dosage requirements

3. **Change Analysis**: The system analyzes medication updates to categorize changes:
   - **From Pharmacy**: Stock increases from pharmacy deliveries
   - **Administered**: Stock decreases due to medication administration
   - **Leaving Home**: Stock decreases when service users leave home
   - **Returning Home**: Stock increases when service users return
   - **Returned to Pharmacy**: Stock decreases when medication is returned to pharmacy
   - **Lost/Damaged**: Stock decreases due to loss or damage

4. **Recent Changes**: The system tracks the 10 most recent changes for each medication

### Change Categorization Logic

The system categorizes changes based on:
- **Update Type**: "MedStock Increase", "MedStock Decrease", "New Medication"
- **Notes Content**: Keywords in the notes field help categorize the change
- **Quantity Changes**: Calculated from the difference between old and new stock levels

## Usage Examples

### Frontend Integration

```typescript
import { weeklySummariesApi } from '../services/api';

// Generate a new summary
const generateSummary = async (startDate: string, endDate: string) => {
  try {
    const response = await weeklySummariesApi.generate({ startDate, endDate });
    return response.data;
  } catch (error) {
    console.error('Error generating summary:', error);
  }
};

// Get existing summaries
const getSummaries = async (startDate: string, endDate: string) => {
  try {
    const response = await weeklySummariesApi.getAll({ startDate, endDate });
    return response.data;
  } catch (error) {
    console.error('Error getting summaries:', error);
  }
};

// Download PDF
const downloadPdf = async (summaryId: string) => {
  try {
    const response = await weeklySummariesApi.downloadPdf(summaryId);
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `weekly-summary-${summaryId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading PDF:', error);
  }
};
```

### Backend Service Usage

```javascript
const SummaryService = require('./services/summaryService');

// Generate a summary
const summary = await SummaryService.generateSummary(
  '2024-01-01',
  '2024-01-07'
);

// Get summaries by date range
const summaries = await SummaryService.getSummariesByDateRange(
  '2024-01-01',
  '2024-01-07'
);

// Get summary by ID
const summaryById = await SummaryService.getSummaryById(summaryId);
```

## Security

- All summary endpoints require authentication (`auth` middleware)
- Summary generation requires admin privileges (`adminAuth` middleware)
- PDF downloads are restricted to authenticated users

## Error Handling

The system handles various error scenarios:
- Invalid date ranges
- Missing required parameters
- Database connection issues
- PDF generation failures

## Performance Considerations

- Summaries are generated on-demand to avoid storage overhead
- Database indexes are optimized for date range queries
- PDF generation is asynchronous to prevent blocking

## Testing

Run the test script to verify functionality:
```bash
node test-summary.js
```

## Dependencies

- `pdfkit`: PDF generation
- `pdfkit-table`: Table formatting in PDFs
- `mongoose`: Database operations

## Future Enhancements

- Scheduled summary generation
- Email notifications for completed summaries
- Advanced filtering and sorting options
- Trend analysis integration
- Custom report templates # CI/CD Test - Thu Oct 16 04:16:11 PM BST 2025
