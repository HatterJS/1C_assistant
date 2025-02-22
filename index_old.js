require('dotenv').config(); // Підключаємо dotenv для роботи з .env
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
//const { JWT } = require("google-auth-library");
//const fs = require("fs");

// Налаштування GoogleAuth для автентифікації
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json', // Підключаємо файл з ключами
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Доступ до Google Sheets API
});

// Підключення до бота
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Створюємо клієнт для роботи з Google Sheets
async function getSheetsClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

//Постійні середовища
const SPREADSHEET_ID = '1JbQ8-VVoYAkSRAx5ssz7Yv2kbJDcZJ46TQdK6M58w8c';
const USERS_SHEET = 'Users';
const WAREHOUSE_SHEET = 'Склади';

//------------------------------------------ Реєстрація користувачів ------------------------------>
// Об'єкт для тимчасового зберігання стану користувачів
const userStates = {};
// Функція для перевірки реєстрації
async function isUserRegistered(telegramID) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${USERS_SHEET}!A:A`, // Читаємо стовпець TelegramID
  });
  const ids = response.data.values ? response.data.values.flat() : [];
  return ids.includes(String(telegramID));
}
// Функція для отримання списку складів
async function getWarehouses() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${WAREHOUSE_SHEET}!A:B`, // Читаємо стовпець A та B (назви складів)
  });
  const warehouses = response.data.values; // Отримуємо всі значення з таблиці
  return warehouses.map(([fullName, shortCode]) => ({ fullName, shortCode }));
}
// Обробка команди /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramID = msg.from.id;
  if (await isUserRegistered(telegramID)) {
    bot.sendMessage(chatId, '✅ Ви вже зареєстровані в системі.');
    return;
  }
  bot.sendMessage(chatId, '👋 Вітаю! Введіть своє прізвище та ім’я:');
  userStates[chatId] = { step: 'awaiting_name' };
});
// Обробка отриманого імені
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userStates[chatId]) return;

  if (userStates[chatId].step === 'awaiting_name') {
    userStates[chatId].name = text;
    userStates[chatId].step = 'awaiting_warehouse';

    const warehouses = await getWarehouses(); // Отримуємо список складів

    if (warehouses.length === 0) {
      bot.sendMessage(chatId, '❌ Немає доступних складів.');
      delete userStates[chatId];
      return;
    }

    // Формуємо кнопки з короткими ідентифікаторами складів
    const keyboard = {
      reply_markup: {
        inline_keyboard: warehouses.map(({ fullName, shortCode }) => {
          return [
            {
              text: fullName, // Текст кнопки - це повне ім'я складу
              callback_data: shortCode, // Callback data - це скорочене ім'я складу
            },
          ];
        }),
      },
    };

    console.log('Keyboard:', keyboard); // Логування всієї клавіатури

    bot.sendMessage(
      chatId,
      '📦 Оберіть склад, за який ви відповідаєте:',
      keyboard
    );
  }
});

// Обробка вибору складу
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const telegramID = query.from.id;
  const username = query.from.username || 'Без username';
  const callbackData = decodeURIComponent(query.data);

  if (!userStates[chatId] || !callbackData) return;

  const shortCode = callbackData; // Використовуємо callbackData без 'warehouse_' перед префіксом
  const userFullName = userStates[chatId].name;

  // Отримуємо список складів
  const warehouses = await getWarehouses();

  // Знаходимо склад за коротким кодом
  const warehouse = warehouses.find((w) => w.shortCode === shortCode)?.fullName;

  if (!warehouse) {
    bot.sendMessage(chatId, '❌ Склад не знайдено.');
    return;
  }

  const sheets = await getSheetsClient();

  try {
    // Збереження в Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: USERS_SHEET,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[telegramID, username, userFullName, warehouse]], // Записуємо всі дані, включаючи склад
      },
    });

    bot.sendMessage(
      chatId,
      `Реєстрація завершена!\n👤 Ім'я: ${userFullName}\n📦 Склад: ${warehouse}`
    );
  } catch (error) {
    console.error('❌ Помилка запису в Google Sheets:', error);
    bot.sendMessage(
      chatId,
      '❌ Сталася помилка під час реєстрації. Спробуйте ще раз.'
    );
  }

  delete userStates[chatId]; // Очищуємо стан
});

//------------------------------------------ Перевірка додавання нових рядків ------------------------------>

// ID таблиці та діапазон
const spreadsheetId = '1JbQ8-VVoYAkSRAx5ssz7Yv2kbJDcZJ46TQdK6M58w8c';
const range = 'Переміщення!A1:A';

// Функція для отримання останнього рядка
async function getLastRow() {
  const client = await auth.getClient(); // Отримуємо клієнт для автентифікації
  const sheets = google.sheets({ version: 'v4', auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values;
  return rows ? rows.length : 0; // Повертаємо кількість рядків
}

// Змінна для збереження останнього перевіреного рядка
let lastKnownRow = 0;

// Перевірка нових записів при першому запуску
(async () => {
  lastKnownRow = await getLastRow();
  console.log(`Останній рядок на момент запуску: ${lastKnownRow}`);
})();

// Перевірка нових записів кожну хвилину
setInterval(async () => {
  const lastRow = await getLastRow();
  console.log(lastRow);

  if (lastRow > lastKnownRow) {
    console.log(`Новий запис додано! Кількість рядків: ${lastRow}`);

    // Обробка всіх нових рядків
    for (let i = lastKnownRow + 1; i <= lastRow; i++) {
      console.log(`Обробляється рядок ${i}`);
      // Викликаємо функцію для відправки повідомлення
      await sendTelegramMessage(i);
    }

    // Оновлюємо точку відліку на новий останній рядок
    lastKnownRow = lastRow;
  }
}, 60000); // перевіряємо кожну хвилину

// Функція для відправки повідомлення в Telegram
async function sendTelegramMessage(rowId) {
  const client = await auth.getClient(); // Отримуємо клієнт для автентифікації
  const sheets = google.sheets({ version: 'v4', auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Переміщення!A${rowId}:G${rowId}`, // Отримуємо дані для конкретного рядка
  });

  const row = res.data.values[0]; // Останній рядок з таблиці
  const message = `⚠️ Оформлено запит №${rowId} на переміщення.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\n`;

  const chatId = 7522288922; // або отримуєте з іншої таблиці

  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: 'confirm_' + rowId },
          { text: '❌ Скасувати', callback_data: 'cancel_' + rowId },
        ],
      ],
    },
  });
}
//<-----------------------------------------------------------------------------------------------------------

//------------------------ Видалення кнопок після натискання + відповідне редагування повідомлення + оновлення статусу таблиці + повідомлення оператору ---------->
bot.on('callback_query', async (query) => {
  const data = query.data;
  const messageId = query.message.message_id;
  const chatId = query.message.chat.id;
  const rowId = data.split('_')[1];
  let newText = '';
  const firstName = query.from.first_name || '';
  const lastName = query.from.last_name || '';
  const userName = query.from.username || `${firstName} ${lastName}`.trim();

  if (data.startsWith('confirm_')) {
    newText = `✅ Запит №${rowId} підтверджено`;
    await updateGoogleSheet(rowId, 'Підтверджено', 'J', userName); // Оновлення статусу в Google Таблиці
    await sendToOperator1C(rowId);
  } else if (data.startsWith('cancel_')) {
    newText = `❌ Запит №${rowId} скасовано`;
    await updateGoogleSheet(rowId, 'Скасовано', 'J', userName); // Оновлення статусу в Google Таблиці
  } else if (data.startsWith('processed_')) {
    newText = `✅ Запит №${rowId} проведено`;
    await updateGoogleSheet(rowId, 'Проведено', 'K', userName); // Оновлення статусу в Google Таблиці
  }

  try {
    await bot.editMessageText(newText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }, // Видаляємо кнопки разом з текстом
    });
  } catch (error) {
    console.error('Помилка при редагуванні повідомлення:', error);
  }
});
//<------------------------------------------------------------------------------------------------------
//------------------------------ Оновлення статусу переміщення в таблиці -------------------------------->

async function updateGoogleSheet(rowId, status, column, userName) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = '1JbQ8-VVoYAkSRAx5ssz7Yv2kbJDcZJ46TQdK6M58w8c';
    const updates = [
      { range: `Переміщення!I${rowId}`, value: status },
      { range: `Переміщення!${column}${rowId}`, value: userName },
    ];
    /*
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: { values: [[status]] },
    });
*/
    for (const update of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: update.range,
        valueInputOption: 'RAW',
        resource: { values: [[update.value]] },
      });
    }

    console.log(`✅ Оновлено рядок ${rowId} у стовпці H: ${status}`);
  } catch (error) {
    console.error('❌ Помилка оновлення Google Таблиці:', error);
  }
}

//<-------------------------------------------------------------------------------------------------------

// 7️⃣ Відправка повідомлення оператору 1С
async function sendToOperator1C(rowId) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Переміщення!A${rowId}:H${rowId}`,
  });

  if (!res.data.values || res.data.values.length === 0) return;

  const row = res.data.values[0];
  const message = `Підтверджено запит №${rowId}.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\nОчікує на проведення у системі.`;

  const operators = await getOperators1C();
  //const operatorId = 7522288922;
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
getOperators1C().then((ids) => console.log('📋 Отримані ID операторів:', ids));

// 8️⃣ Отримання ID операторів 1С
async function getOperators1C() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Оператори 1С!B2:B`, // Тут у стовпці A містяться Telegram ID операторів 1С
  });

  if (!res.data.values) return [];

  return res.data.values.flat();
}
//<-------------------------------------------------------------------------------------------------------

/* Обробник будь-якого тексту
bot.on('message', (msg) => {
  console.log(`Отримано повідомлення від ${msg.chat.id}: ${msg.text}`);
});
*/
