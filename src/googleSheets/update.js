const { getSheetsClient } = require('./auth');
const spreadSheetID = process.env.SPREADSHEET_ID;

// Оновлення статусу замовлення
async function updateGoogleSheet(rowId, status, column, userName) {
  try {
    const sheets = await getSheetsClient();
    const updates = [
      { range: `Переміщення!I${rowId}`, value: status },
      { range: `Переміщення!${column}${rowId}`, value: userName },
    ];

    for (const update of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadSheetID,
        range: update.range,
        valueInputOption: 'RAW',
        resource: { values: [[update.value]] },
      });
    }
  } catch (error) {
    console.error('❌ Помилка оновлення Google Таблиці:', error);
  }
}

module.exports = { updateGoogleSheet };
