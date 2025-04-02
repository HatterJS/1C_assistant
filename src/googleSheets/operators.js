const bot = require('../config/botConfig');
const { RANGES } = require('../constants');
const { getSheetsClient } = require('./auth');
const spreadsheetId = process.env.SPREADSHEET_ID;

const activeRequests = new Map(); // Збережемо тут повідомлення операторів

// Функція для відправки повідомлення обом операторам
async function sendToOperator1C(rowId) {
  const sheets = await getSheetsClient();

  // Отримуємо дані по рядку з аркуша
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGES.TRANSFERS_ROW(rowId), // Отримуємо дані з рядка rowId
  });
  if (!res.data.values || res.data.values.length === 0) return;

  const row = res.data.values[0];
  const message = `Підтверджено запит №${rowId}.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\nОчікує на проведення у системі.`;

  // Отримуємо всіх користувачів із таблиці Users, де статус 'Operator_on'
  const operators = await getOperatorsByStatus('Operator_on');

  for (const operatorId of operators) {
    try {
      const sentMessage = await bot.sendMessage(operatorId, message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Взяти в роботу', callback_data: `take_${rowId}` }],
            [{ text: '✅ Проведено', callback_data: `processed_${rowId}` }],
          ],
        },
      });
  
      // Зберігаємо ідентифікатор повідомлення
      if (!activeRequests.has(rowId)) {
        activeRequests.set(rowId, []);
      }
      activeRequests
        .get(rowId)
        .push({ chatId: operatorId, messageId: sentMessage.message_id });
    } catch(error){
      console.error(`❌ Помилка при надсиланні повідомлення для chatId ${operatorId}:`, error.message);
      continue; // Перехід до наступного користувача у списку
    }
  }
}

// Отримання ID операторів 1С
async function getOperators1C() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGES.USERS, // Отримуємо стовпці A (Telegram ID) і E (Ролі)
  });

  if (!res.data.values) return [];

  return res.data.values
    .filter((row) => row[4] === 'Operator_on' || row[4] === 'Operator_off') // Фільтруємо по 5-му стовпцю (E)
    .map((row) => row[0]); // Беремо лише Telegram ID (стовпець A)
}

// Функція для отримання операторів з статусом 'Operator_on'
async function getOperatorsByStatus(status) {
  const sheets = await getSheetsClient();

  // Отримуємо всі дані з аркуша Users
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Users!A:E', // Отримуємо колонки A (Telegram ID) і E (Роль)
  });

  if (!res.data.values) return [];

  const rows = res.data.values;
  const operatorIds = [];

  // Проходимо по всіх рядках і шукаємо операторів з потрібним статусом
  rows.forEach((row) => {
    if (row[4] === status) {
      operatorIds.push(row[0]); // Додаємо Telegram ID оператора
    }
  });

  return operatorIds;
}

// Відправка повідомлення адміністратору
async function sendToAdmin(message) {
  const adminns = await getAdmin();
  
  for (const adminId of adminns) {
    try {
      bot.sendMessage(adminId, message);
    } catch(error){
      console.error(`❌ Помилка при надсиланні повідомлення для chatId ${adminId}:`, error.message);
      continue; // Перехід до наступного користувача у списку
    }
  }
}

// Отримання ID адміністраторів
async function getAdmin() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGES.USERS, // Отримуємо дані користувачів
  });

  if (!res.data.values) return [];

  return res.data.values
    .filter((row) => row[4] === 'Admin') // Фільтруємо по 5-му стовпцю (E)
    .map((row) => row[0]); // Беремо лише Telegram ID (стовпець A)
}

// Отримання ID апрувнутих користувачів
async function getApprovedUsers() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGES.USERS, // Отримуємо дані користувачів
  });

  if (!res.data.values) return [];

  return res.data.values
    .filter((row) => row[4] === 'Approved') // Фільтруємо по 5-му стовпцю (E)
    .map((row) => row[0]); // Беремо лише Telegram ID (стовпець A)
}

// Зміна активності оператора
async function updateOperatorStatus(chatId, newStatus) {
  const sheets = await getSheetsClient();

  // Отримуємо всі дані з аркуша Users
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Users!A:E', // Отримуємо колонки A (Telegram ID) і E (Посада)
  });

  if (!res.data.values) return;

  const rows = res.data.values;
  const updates = [];

  // Проходимо по всіх рядках і шукаємо тільки рядки з статусом "Operator_on" або "Operator_off"
  rows.forEach((row, index) => {
    if (
      row[0] === chatId.toString() &&
      (row[4] === 'Operator_on' || row[4] === 'Operator_off')
    ) {
      updates.push({
        range: `Users!E${index + 1}`, // Оновлюємо тільки статус в колонці E
        values: [[newStatus]],
      });
    }
  });

  // Якщо є рядки для оновлення, виконати пакетне оновлення
  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      resource: { data: updates, valueInputOption: 'RAW' },
    });
  }
}

module.exports = {
  sendToOperator1C,
  sendToAdmin,
  updateOperatorStatus,
  getOperators1C,
  getApprovedUsers,
  activeRequests,
};
