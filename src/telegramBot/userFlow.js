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
const activeRequestsOut = new Map(); // Збережемо тут повідомлення передачі
const activeRequestsIn = new Map(); // Збережемо тут повідомлення отримання

// Обробка команди /start
async function handleStart(msg) {
  const chatId = msg.chat.id;
  const telegramID = msg.from.id;

  if (await isUserRegistered(telegramID)) {
    bot.sendMessage(chatId, `✅ Ви вже зареєстровані в системі.\n👤 Ваш ID: ${telegramID}`);
    return;
  }

  bot.sendMessage(chatId, '👋 Вітаю! Введіть своє прізвище та ім’я:');
  userStates[chatId] = { step: 'awaiting_name' };
}

//Форматування повідомлення для користувача
function formatTransferMessage(transfer) {
  const {
    rowIndex,
    date,
    inicUser,
    from,
    to,
    code,
    name,
    quantity,
    status = ''
  } = transfer;

  return `
${inicUser} оформив запит №${rowIndex}

З: ${from}
На: ${to}
Код 1С: ${code}
Назва: ${name}
К-сть: ${quantity}
`.trim();
}

//Отримуємо склади за які відповідає користувач
async function getWarehousesByUser(telegramID) {
  const sheets = await getSheetsClient();
  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.WAREHOUSES_ALL,
  });

  const rows = data.data.values || [];

  const warehouses = rows.reduce((acc, row) => {
    const warehouseName = row[0];
    const responsibleIDs = row.slice(2);
    if (responsibleIDs.includes(String(telegramID))) {
      acc.push(warehouseName);
    }
    return acc;
  }, []);

  return warehouses;
}

// Обробка команди /orderOut - всі переміщення без статусу
async function handleOrderOut(msg) {
  const chatId = msg.chat.id;
  const telegramID = msg.from.id;

  if (!(await isUserRegistered(telegramID))) {
    return bot.sendMessage(chatId, 'Ви не зареєстровані.');
  }

  const warehouses = await getWarehousesByUser(telegramID);
  const transfers = await getTransfersByStatus(warehouses, "");

  if (!transfers.length) {
    return bot.sendMessage(chatId, 'Немає відкритих переміщень.');
  }

  for (const transfer of transfers) {
    const message = formatTransferMessage(transfer);

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Підтвердити", callback_data: `confirmOut_${transfer.rowIndex}` },
            { text: "❌ Скасувати", callback_data: `cancelOut_${transfer.rowIndex}` }
          ]
        ]
      },
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    await bot.sendMessage(chatId, message, keyboard);
  }

}

// Обробка команди /orderIn - всі переміщення зі статусом "Передано"
async function handleOrderIn(msg) {
  const chatId = msg.chat.id;
  const telegramID = msg.from.id;

  if (!(await isUserRegistered(telegramID))) {
    return bot.sendMessage(chatId, 'Ви не зареєстровані.');
  }

  const warehouses = await getWarehousesByUser(telegramID);
  const transfers = await getTransfersByStatus(warehouses, "Передано", "in");

  if (!transfers.length) {
    return bot.sendMessage(chatId, 'Немає відкритих переміщень.');
  }

  for (const transfer of transfers) {
    const message = formatTransferMessage(transfer);

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Підтвердити", callback_data: `confirmIn_${transfer.rowIndex}` },
            { text: "❌ Скасувати", callback_data: `cancelIn_${transfer.rowIndex}` }
          ]
        ]
      },
      parse_mode: "HTML",
      disable_web_page_preview: true
    };

    await bot.sendMessage(chatId, message, keyboard);
  }
}

//Функція для повернення всіх переміщень в залежності від статусу out / in
async function getTransfersByStatus(warehouses, status, direction = "out") {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetID,
    range: RANGES.TRANSFERS_ALL,
  });

  const rows = response.data.values || [];

  // Повертаємо не просто рядки, а об'єкти з рядком
  const transfers = [];

  rows.forEach((row, index) => {
    const fromWarehouse = row[2]; // Стовпець C
    const toWarehouse = row[3];   // Стовпець D
    const rowStatus = row[8];     // Стовпець I

    const match =
      (direction === "out" && warehouses.includes(fromWarehouse) && (!rowStatus || rowStatus.trim() === status)) ||
      (direction === "in" && warehouses.includes(toWarehouse) && rowStatus && rowStatus.trim() === status);

    if (match) {
      transfers.push({
        rowIndex: index + 2, // Google Sheets має 1-based індексацію
        date: row[0] || '',
        inicUser: row[1] || 'Анонім',
        from: fromWarehouse || '',
        to: toWarehouse || '',
        code: row[4] || '',
        name: row[5] || '',
        quantity: row[6] || '',
        status: rowStatus || '',
      });
    }
  });

  return transfers;
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
      `Реєстрація завершена!\n👤 Ім'я: ${userFullName}\n👤 ID: ${chatId}\n📦 Склад: ${warehouse}`
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
  const message = `⚠️ Оформлено запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> на переміщення.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\n`;

  const warehouseFrom = row[2]; // Склад, з якого переміщується ТМЦ
  const chatIdList = await getWarehouseResponsibleChatIds(warehouseFrom);
  const approvedUsers = await getApprovedUsers(); // Отримуємо список апрувнутих користувачів

  if (chatIdList.length === 0) {
    console.log(
      `⚠️ Немає відповідальних за склад ${warehouseFrom}, повідомлення не відправлено.`
    );
    return;
  }

  for (const chatId of chatIdList) {
    if (!approvedUsers.includes(chatId.toString())) {
      continue; // Перехід до наступної ітерації, якщо користувач не апрувнутий
    }

    try {
      const sentMessage = await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Підтвердити', callback_data: 'confirmOut_' + rowId },
              { text: '❌ Скасувати', callback_data: 'cancelOut_' + rowId },
            ],
          ],
        },
      });
  
      // Зберігаємо ідентифікатор повідомлення
      if (!activeRequestsOut.has(rowId)) {
        activeRequestsOut.set(rowId, []);
      }
      activeRequestsOut
        .get(rowId)
        .push({ chatId: chatId, messageId: sentMessage.message_id });
    } catch(error){
      console.error(`❌ Помилка при надсиланні повідомлення для chatId ${chatId}:`, error.message);
      continue; // Перехід до наступного користувача у списку
    }
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
  const message = `⚠️ Оформлено запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> на переміщення.\n\nЗі складу: ${row[2]}\nНа склад: ${row[3]}\nКод 1С: ${row[4]}\nНоменклатура: ${row[5]}\nКількість: ${row[6]}\n\n`;

  const warehouseFrom = row[3]; // Склад, з якого переміщується ТМЦ
  const chatIdList = await getWarehouseResponsibleChatIds(warehouseFrom);
  const approvedUsers = await getApprovedUsers(); // Отримуємо список апрувнутих користувачів

  if (chatIdList.length === 0) {
    console.log(
      `⚠️ Немає відповідальних за склад ${warehouseFrom}, повідомлення не відправлено.`
    );
    return;
  }

  for (const chatId of chatIdList) {
    if (!approvedUsers.includes(chatId.toString())) {
      continue; // Перехід до наступної ітерації, якщо користувач не апрувнутий
    }

    try {
      const sentMessage = await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Підтвердити', callback_data: 'confirmIn_' + rowId },
              { text: '❌ Скасувати', callback_data: 'cancelIn_' + rowId },
            ],
          ],
        },
      });
  
      // Зберігаємо ідентифікатор повідомлення
      if (!activeRequestsIn.has(rowId)) {
        activeRequestsIn.set(rowId, []);
      }
      activeRequestsIn
        .get(rowId)
        .push({ chatId: chatId, messageId: sentMessage.message_id });
    } catch(error){
      console.error(`❌ Помилка при надсиланні повідомлення для chatId ${chatId}:`, error.message);
      continue; // Перехід до наступного користувача у списку
    }
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
  
 async function deleteDuplicates(step, newText) {
    const messages = step === 'out' 
    ? activeRequestsOut.get(Number(rowId)) || [] 
    : activeRequestsIn.get(rowId) || [];

    for (const msg of messages) {
      if (Number(msg.chatId) !== Number(chatId)) {
        try {
          await bot.editMessageText(newText, {
            chat_id: msg.chatId,
            message_id: msg.messageId,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }, // Видаляємо кнопки разом з текстом
          });
        } catch (error) {
          console.error('Помилка при редагуванні повідомлення:', error);
        }
      }
    }
 }

  if (data.startsWith('confirmOut_')) {
    newText = `✅ Запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> передано @${userName}`;
    await updateGoogleSheet(rowId, 'Передано', 'J', userName); // Оновлення статусу в Google Таблиці
    //await deleteDuplicates('out', newText);
    //await sendToUserIn(rowId);
  } else if (data.startsWith('cancelOut_')) {
    newText = `❌ Запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> скасовано @${userName}`;
    await updateGoogleSheet(rowId, 'Скасовано', 'J', userName); // Оновлення статусу в Google Таблиці
    //await deleteDuplicates('out', newText);
  } else if (data.startsWith('confirmIn_')) {
    newText = `✅ Запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> отримано @${userName}`;
    await updateGoogleSheet(rowId, 'Отримано', 'K', userName); // Оновлення статусу в Google Таблиці
    //await deleteDuplicates('in', newText);
    //await sendToOperator1C(rowId);
  } else if (data.startsWith('cancelIn_')) {
    newText = `❌ Запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> скасовано @${userName}`;
    await updateGoogleSheet(rowId, 'Скасовано', 'K', userName); // Оновлення статусу в Google Таблиці
    //await deleteDuplicates('in', newText);
  } else if (data.startsWith('processed_')) {
    newText = `✅ Запит <a href="${RANGES.CELLLINK}${rowId}">№${rowId}</a> проведено @${userName}`;
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
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }, // Видаляємо кнопки разом з текстом
    });
  } catch (error) {
    console.error('Помилка при редагуванні повідомлення:', error);
  }
}

module.exports = {
  handleStart,
  handleOrderOut,
  handleOrderIn,
  getUserName,
  choiceWarehouse,
  sendTelegramMessage,
  buttonReaction,
};
