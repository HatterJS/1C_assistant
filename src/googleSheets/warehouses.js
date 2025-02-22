const { google } = require('googleapis');
const { getSheetsClient } = require('./auth');
const spreadSheetID = process.env.SPREADSHEET_ID;
const WAREHOUSE_SHEET = 'Склади';

// Отримання переліку складів
async function getWarehouses() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: `${WAREHOUSE_SHEET}!A2:B`,
  });
  const warehouses = response.data.values;
  return warehouses.map(([fullName, shortCode]) => ({ fullName, shortCode }));
}

module.exports = { getWarehouses };
