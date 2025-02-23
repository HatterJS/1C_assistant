const bot = require('../config/botConfig');
const { getSheetsClient } = require('../googleSheets/auth');
const {
  updateOperatorStatus,
  getOperators1C,
} = require('../googleSheets/operators');
const { RANGES } = require('../constants');

const spreadsheetId = process.env.SPREADSHEET_ID;

// Функція для створення меню
async function createMenu(chatId) {
  const operators = await getOperators1C();
  if (operators.includes(chatId.toString())) {
    const options = {
      reply_markup: {
        keyboard: [[{ text: 'Приєднатись' }, { text: 'Відключитись' }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };

    bot.sendMessage(chatId, 'Оберіть опцію.', options);
  }
}

bot.onText(/Приєднатись/, async (msg) => {
  const chatId = msg.chat.id;
  await updateOperatorStatus(chatId, 'Operator_on');
  bot.sendMessage(chatId, '🟢 Ви тепер активний оператор.');
});

bot.onText(/Відключитись/, async (msg) => {
  const chatId = msg.chat.id;
  await updateOperatorStatus(chatId, 'Operator_off');
  bot.sendMessage(chatId, '🔴 Ви тепер неактивний оператор.');
});
/*
// Показ меню при кожному новому повідомленні
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  createMenu(chatId);
});
*/
module.exports = { createMenu };
