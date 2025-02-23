const bot = require('../config/botConfig');
const { SHEETS, RANGES } = require('../constants');
const {
  isUserRegistered,
  getWarehouseResponsibleChatIds,
} = require('../googleSheets/users');
const { getWarehouses } = require('../googleSheets/warehouses');
const { getSheetsClient } = require('../googleSheets/auth');
const { updateGoogleSheet } = require('../googleSheets/update');
const {
  sendToOperator1C,
  sendToAdmin,
  getApprovedUsers,
  activeRequests,
} = require('../googleSheets/operators');

const spreadSheetID = process.env.SPREADSHEET_ID;
const userStates = {}; // Об'єкт для тимчасового зберігання стану користувачів

// Обробка команди /start
async function handleStart(msg) {
  const chatId = msg.chat.id;
  const telegramID = msg.from.id;

  if (await isUserRegistered(telegramID)) {
    bot.sendMessage(chatId, '✅ Ви вже зареєстровані в системі.');
    return;
  }

  bot.sendMessage(chatId, '👋 Вітаю! Введіть своє прізвище та ім’я:');
  userStates[chatId] = { step: 'awaiting_name' };
}

// Обробка отриманого імені
async function getUserName(msg) {
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
              callback_data: 'warehouse_' + shortCode, // Callback data - це скорочене ім'я складу
            },
          ];
        }),
      },
    };

    bot.sendMessage(
      chatId,
      '📦 Оберіть склад, за який ви відповідаєте:',
      keyboard
    );
  }
}

//Обробка вибору складу
async function choiceWarehouse(query) {
  const chatId = query.message.chat.id;
  const telegramID = query.from.id;
  const username = query.from.username || 'Без username';
  const callbackData = decodeURIComponent(query.data);

  if (!userStates[chatId] || !callbackData) return;

  const shortCode = callbackData.replace('warehouse_', ''); // Використовуємо callbackData без 'warehouse_' перед префіксом
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

  // Збереження в Google Sheets
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadSheetID,
      range: SHEETS.USERS,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[telegramID, username, userFullName, warehouse]], // Записуємо всі дані, включаючи склад
      },
    });

    const message = `📄 Додано нового користувача:\n${userFullName}\nUserName: ${username}\nUserId: ${telegramID}\nСклад: ${warehouse}`;
    sendToAdmin(message);

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
}

// Функція для відправки повідомлення відповідальному, який передає
async function sendTelegramMessage(rowId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.TRANSFERS_ROW(rowId), // Отримуємо дані для конкретного рядка
  });

  const row = res.data.values[0]; // Останній рядок з таблиці
  const message = `⚠️ Оформлено запит №${rowId} на переміщення.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\n`;

  const warehouseFrom = row[2]; // Склад, з якого переміщується ТМЦ
  const chatIdList = await getWarehouseResponsibleChatIds(warehouseFrom);

  if (chatIdList.length === 0) {
    console.log(
      `⚠️ Немає відповідальних за склад ${warehouseFrom}, повідомлення не відправлено.`
    );
    return;
  }

  for (const chatId of chatIdList) {
    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: 'confirmOut_' + rowId },
            { text: '❌ Скасувати', callback_data: 'cancelOut_' + rowId },
          ],
        ],
      },
    });
  }
}
// Функція для відправки повідомлення відповідальному, який отримує
async function sendToUserIn(rowId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.TRANSFERS_ROW(rowId), // Отримуємо дані для конкретного рядка
  });

  const row = res.data.values[0]; // Останній рядок з таблиці
  const message = `⚠️ Оформлено запит №${rowId} на переміщення.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\n`;

  const warehouseFrom = row[3]; // Склад, з якого переміщується ТМЦ
  const chatIdList = await getWarehouseResponsibleChatIds(warehouseFrom);

  if (chatIdList.length === 0) {
    console.log(
      `⚠️ Немає відповідальних за склад ${warehouseFrom}, повідомлення не відправлено.`
    );
    return;
  }

  for (const chatId of chatIdList) {
    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: 'confirmIn_' + rowId },
            { text: '❌ Скасувати', callback_data: 'cancelIn_' + rowId },
          ],
        ],
      },
    });
  }
}

// Реакція ан натискання кнопок
async function buttonReaction(query) {
  const data = query.data;
  const telegramID = query.from.id;
  const messageId = query.message.message_id;
  const chatId = query.message.chat.id;
  const rowId = data.split('_')[1];
  let newText = '';
  const firstName = query.from.first_name || '';
  const lastName = query.from.last_name || '';
  const userName = query.from.username || `${firstName} ${lastName}`.trim();

  const approvedUsers = await getApprovedUsers(); // Отримуємо список апрувнутих користувачів
  if (!approvedUsers.includes(telegramID.toString())) {
    newText = `❌ Ви не маєта прав на цю операцію.`;
    try {
      await bot.editMessageText(newText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] }, // Видаляємо кнопки разом з текстом
      });
    } catch (error) {
      console.error('Помилка при редагуванні повідомлення:', error);
    }
    return; // Вихід з функції, якщо користувач не апрувнутий
  }

  if (data.startsWith('confirmOut_')) {
    newText = `✅ Запит №${rowId} передано`;
    await updateGoogleSheet(rowId, 'Передано', 'J', userName); // Оновлення статусу в Google Таблиці
    await sendToUserIn(rowId);
  } else if (data.startsWith('cancelOut_')) {
    newText = `❌ Запит №${rowId} скасовано`;
    await updateGoogleSheet(rowId, 'Скасовано', 'J', userName); // Оновлення статусу в Google Таблиці
  } else if (data.startsWith('confirmIn_')) {
    newText = `✅ Запит №${rowId} отримано`;
    await updateGoogleSheet(rowId, 'Отримано', 'K', userName); // Оновлення статусу в Google Таблиці
    await sendToOperator1C(rowId);
  } else if (data.startsWith('cancelIn_')) {
    newText = `❌ Запит №${rowId} скасовано`;
    await updateGoogleSheet(rowId, 'Скасовано', 'K', userName); // Оновлення статусу в Google Таблиці
  } else if (data.startsWith('processed_')) {
    newText = `✅ Запит №${rowId} проведено`;
    await updateGoogleSheet(rowId, 'Проведено', 'L', userName); // Оновлення статусу в Google Таблиці
  } else if (data.startsWith('warehouse_')) {
    newText = `✅ Склад обрано успішно`;
    await choiceWarehouse(query); // Додавання нового користувача в Google Таблиці + повідомлення в TG
    return;
  } else if (data.startsWith('take_')) {
    newText = `⚠️ Ви прийняли запит <a href="https://docs.google.com/spreadsheets/d/${spreadSheetID}/edit?gid=1943639393#gid=1943639393&range=E${rowId}">№${rowId}</a> в роботу`;
    await updateGoogleSheet(rowId, 'В обробці', 'L', userName); // Оновлення статусу в Google Таблиці
    const messages = activeRequests.get(rowId) || []; // Отримуємо всі повідомлення, що були відправлені операторам
    for (const msg of messages) {
      if (Number(msg.chatId) !== chatId) {
        try {
          await bot.deleteMessage(msg.chatId, msg.messageId);
        } catch (err) {
          console.error('Помилка редагування повідомлення:', err);
        }
      } else {
        try {
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Проведено', callback_data: `processed_${rowId}` }],
              ],
            },
          });
        } catch (error) {
          console.error('Помилка при редагуванні повідомлення:', error);
        }
      }
    }
    return;
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
}

module.exports = {
  handleStart,
  getUserName,
  choiceWarehouse,
  sendTelegramMessage,
  buttonReaction,
};
