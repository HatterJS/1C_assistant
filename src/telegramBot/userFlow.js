const bot = require('../config/botConfig');
const {
  isUserRegistered,
  getWarehouseResponsibleChatIds,
} = require('../googleSheets/users');
const { getWarehouses } = require('../googleSheets/warehouses');
const { getSheetsClient } = require('../googleSheets/auth');
const { updateGoogleSheet } = require('../googleSheets/update');
const { sendToOperator1C, sendToAdmin } = require('../googleSheets/operators');

const spreadSheetID = process.env.SPREADSHEET_ID;
const usersSheet = 'Users';
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
      range: usersSheet,
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

// Функція для відправки повідомлення в Telegram
async function sendTelegramMessage(rowId) {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: `Переміщення!A${rowId}:G${rowId}`, // Отримуємо дані для конкретного рядка
  });

  const row = res.data.values[0]; // Останній рядок з таблиці
  const message = `⚠️ Оформлено запит №${rowId} на переміщення.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\n`;

  //const chatId = 7522288922; // або отримуєте з іншої таблиці
  const warehouseTo = row[3]; // Склад, на який переміщується ТМЦ
  const chatIdList = await getWarehouseResponsibleChatIds(warehouseTo);

  if (chatIdList.length === 0) {
    console.log(
      `⚠️ Немає відповідальних за склад ${warehouseTo}, повідомлення не відправлено.`
    );
    return;
  }

  for (const chatId of chatIdList) {
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
}
// Реакція ан натискання кнопок
async function buttonReaction(query) {
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
}

module.exports = {
  handleStart,
  getUserName,
  choiceWarehouse,
  sendTelegramMessage,
  buttonReaction,
};
