require('dotenv').config();

const token = process.env.BOT_TOKEN;
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(token, { polling: true });

module.exports = bot;
