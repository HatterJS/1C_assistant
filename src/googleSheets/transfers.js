const { getSheetsClient } = require('./auth');
const { RANGES } = require('../constants');

const spreadsheetId = process.env.SPREADSHEET_ID;

// Отримання останнього рядка
async function getLastRow() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGES.TRANSFERS,
  });
  const rows = res.data.values;
  return rows ? rows.length : 0;
}

module.exports = { getLastRow };
