const SHEETS = {
  TRANSFERS: 'Переміщення',
  WAREHOUSES: 'Склади',
  OPERATORS: 'Оператори 1С',
  USERS: 'Users',
};

const RANGES = {
  TRANSFERS: `${SHEETS.TRANSFERS}!A1:A`, // Всі рядки з переміщеннями для пошуку останнього доданого рядка
  TRANSFERS_ROW: (row) => `${SHEETS.TRANSFERS}!A${row}:H${row}`, // Рядок за номером
  TRANSFERS_STATUS: (row) => `${SHEETS.TRANSFERS}!I${row}`, // Клітинка статусу за номером рядка
  TRANSFERS_USER: (column, row) => `${SHEETS.TRANSFERS}!${column}${row}`, // Відповідальний за зміну статусу
  WAREHOUSES: `${SHEETS.WAREHOUSES}!A2:B`, // A - перелік складів / B - скорочення
  WAREHOUSES_ALL: `${SHEETS.WAREHOUSES}!A2:G`, // A - перелік складів / B - скорочення / C-G - відповідальні
  OPERATORS: `${SHEETS.OPERATORS}!B2:B`, // Перелік операторів 1С
  ADMINS: `${SHEETS.OPERATORS}!D2:D`, // Перелік адмінів
  USERS: `${SHEETS.USERS}!A2:A`, // Перелік відповідальних за склади
};
/*
  const TELEGRAM = {
    ADMIN_ID: 123456789
  }
  */
module.exports = {
  SHEETS,
  RANGES,
};
