const bot = require('../config/botConfig');
const { getSheetsClient } = require('./auth');
const spreadsheetId = process.env.SPREADSHEET_ID;

// Відправка повідомлення оператору 1С
async function sendToOperator1C(rowId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Переміщення!A${rowId}:H${rowId}`,
  });

  if (!res.data.values || res.data.values.length === 0) return;

  const row = res.data.values[0];
  const message = `Підтверджено запит №${rowId}.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\nОчікує на проведення у системі.`;

  const operators = await getOperators1C();

  for (const operatorId of operators) {
    bot.sendMessage(operatorId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Проведено', callback_data: 'processed_' + rowId }],
        ],
      },
    });
  }
}

// Отримання ID операторів 1С
async function getOperators1C() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Оператори 1С!B2:B`, // Тут у стовпці B містяться Telegram ID операторів 1С
  });

  if (!res.data.values) return [];

  return res.data.values.flat();
}

// Відправка повідомлення адміністратору
async function sendToAdmin(message) {
  const adminns = await getAdmin();

  for (const adminId of adminns) {
    bot.sendMessage(adminId, message);
  }
}

// Отримання ID адміністраторів
async function getAdmin() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Оператори 1С!D2:D`, // Тут у стовпці D містяться Telegram ID адмінів
  });

  if (!res.data.values) return [];

  return res.data.values.flat();
}

getAdmin().then((ids) => console.log('📋 Отримані ID адміністраторів:', ids));
getOperators1C().then((ids) => console.log('📋 Отримані ID операторів:', ids));

module.exports = { sendToOperator1C, sendToAdmin };
