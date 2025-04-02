const spreadSheetID = process.env.SPREADSHEET_ID;

const SHEETS = {
  TRANSFERS: 'Переміщення',
  WAREHOUSES: 'Склади',
  USERS: 'Users',
};

const RANGES = {
  TRANSFERS: `${SHEETS.TRANSFERS}!A1:A`, // Всі рядки з переміщеннями для пошуку останнього доданого рядка
  TRANSFERS_ROW: (row) => `${SHEETS.TRANSFERS}!A${row}:H${row}`, // Рядок за номером
  TRANSFERS_STATUS: (row) => `${SHEETS.TRANSFERS}!I${row}`, // Клітинка статусу за номером рядка
  TRANSFERS_USER: (column, row) => `${SHEETS.TRANSFERS}!${column}${row}`, // Відповідальний за зміну статусу
  WAREHOUSES: `${SHEETS.WAREHOUSES}!A2:B`, // A - перелік складів / B - скорочення
  WAREHOUSES_ALL: `${SHEETS.WAREHOUSES}!A2:Z`, // A - перелік складів / B - скорочення / C-G - відповідальні
  USERS: `${SHEETS.USERS}!A2:E`, // Перелік користувачів
  CELLLINK: `https://docs.google.com/spreadsheets/d/${spreadSheetID}/edit?gid=1943639393#gid=1943639393&range=E` // Лінк для посилання на комірку таблиці Е+ххх
};

module.exports = {
  SHEETS,
  RANGES,
};
