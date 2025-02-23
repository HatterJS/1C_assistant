require('dotenv').config();

require('./src/telegramBot/commands'); // Підключаємо всі команди для бота

const { getLastRow } = require('./src/googleSheets/transfers');
const { sendTelegramMessage } = require('./src/telegramBot/userFlow');
const { sendToAdmin } = require('./src/googleSheets/operators');

console.log('Бот працює!');
sendToAdmin('Бот працює!');

let lastKnownRow = 0;

// Перевірка нових записів при першому запуску
(async () => {
  lastKnownRow = await getLastRow();
  console.log(`Останній рядок на момент запуску: ${lastKnownRow}`);
  sendToAdmin(`Останній рядок на момент запуску: ${lastKnownRow}`);
})();

// Перевірка нових записів кожну хвилину
setInterval(async () => {
  const lastRow = await getLastRow();

  if (lastRow > lastKnownRow) {
    for (let i = lastKnownRow + 1; i <= lastRow; i++) {
      await sendTelegramMessage(i);
    }

    lastKnownRow = lastRow;
  }
}, 60000);
