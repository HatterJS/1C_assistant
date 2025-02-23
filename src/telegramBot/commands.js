const bot = require('../config/botConfig');
const userFlow = require('./userFlow');

bot.onText(/\/start/, userFlow.handleStart);
bot.on('message', userFlow.getUserName);
bot.on('callback_query', userFlow.buttonReaction);
