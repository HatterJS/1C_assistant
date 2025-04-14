const bot = require('../config/botConfig');
const { createMenu } = require('./menu');
const userFlow = require('./userFlow');

//bot.onText(/\/start/, userFlow.handleStart);
bot.on('message', userFlow.getUserName);
bot.on('callback_query', userFlow.buttonReaction);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userFlow.handleStart(msg);
  createMenu(chatId);
});

bot.onText(/Передати/, userFlow.handleOrderOut);
bot.onText(/Отримати/, userFlow.handleOrderIn);
