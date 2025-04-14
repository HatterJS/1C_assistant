const bot = require('../config/botConfig');
const {
  updateOperatorStatus,
  getOperators1C,
} = require('../googleSheets/operators');

// Функція для створення меню
async function createMenu(chatId) {
  //const operators = await getOperators1C();
  //if (operators.includes(chatId.toString())) {
    const options = {
      reply_markup: {
        //keyboard: [[{ text: 'Приєднатись' }, { text: 'Відключитись' }]],
        keyboard: [[{ text: 'Передати' }, { text: 'Отримати' }], [{ text: '/start' }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };

    bot.sendMessage(chatId, 'Оберіть опцію.', options);
  //}
}
/*
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
*/
module.exports = { createMenu };
