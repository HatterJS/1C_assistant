const { getSheetsClient } = require('./auth');
const spreadSheetID = process.env.SPREADSHEET_ID;
const usersSheet = 'Users';

// Перевірка користувача на реєстрацію
async function isUserRegistered(telegramID) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: `${usersSheet}!A:A`,
  });
  const ids = response.data.values ? response.data.values.flat() : [];
  return ids.includes(String(telegramID));
}
/*
// Додавання нового користувача
async function saveUser(telegramID, username, name, warehouse) {
  // const message = `Додано нового користувача:\n\n${name}\n🆔 UserName:${username}\n📄 UserId: ${name}\nСклад: ${warehouse}}`;
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadSheetID,
      range: usersSheet,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[telegramID, username, name, warehouse]],
      },
    });
    // sendToAdmin(message);
  } catch (error) {
    console.log('Помилка при додаванні рядка в Google Sheets:', error);
  }
}
*/
// Отримуємо відповідальних за склади
async function getWarehouseResponsibleChatIds(warehouseName) {
  const sheets = await getSheetsClient();

  // Отримуємо всі дані з аркуша "Склади"
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: 'Склади!A:G', // Колонки A (склади) - G (відповідальні)
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
