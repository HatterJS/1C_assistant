const { getSheetsClient } = require('../googleSheets/auth');

const spreadSheetID = process.env.SPREADSHEET_ID;
const usersSheet = 'Переміщення';

// Функція для отримання останнього рядка
async function getLastRow() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: `${usersSheet}!A:A`,
  });

  const rows = res.data.values;
  return rows ? rows.length : 0;
}

module.exports = { getLastRow };
