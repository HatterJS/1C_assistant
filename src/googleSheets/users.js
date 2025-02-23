const { getSheetsClient } = require('./auth');
const { RANGES } = require('../constants');
const spreadSheetID = process.env.SPREADSHEET_ID;

// Перевірка користувача на реєстрацію
async function isUserRegistered(telegramID) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.USERS,
  });
  const ids = response.data.values ? response.data.values.flat() : [];
  return ids.includes(String(telegramID));
}

// Отримуємо відповідальних за склади
async function getWarehouseResponsibleChatIds(warehouseName) {
  const sheets = await getSheetsClient();

  // Отримуємо всі дані з аркуша "Склади"
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.WAREHOUSES_ALL,
  });

  const rows = res.data.values;
  for (const row of rows) {
    if (row[0] === warehouseName) {
      return row.slice(2).filter((id) => id); // Видаляємо порожні значення
    }
  }

  return []; // Якщо склад не знайдено або немає відповідальних
}

module.exports = { isUserRegistered, getWarehouseResponsibleChatIds };
