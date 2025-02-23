const { RANGES } = require('../constants');
const { getSheetsClient } = require('./auth');
const spreadSheetID = process.env.SPREADSHEET_ID;

// Отримання переліку складів
async function getWarehouses() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.WAREHOUSES,
  });
  const warehouses = response.data.values;
  return warehouses.map(([fullName, shortCode]) => ({ fullName, shortCode }));
}

module.exports = { getWarehouses };
