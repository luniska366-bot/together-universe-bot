const { Telegraf } = require('telegraf');
const http = require('http');
const { registerUser, loadDB, trackMessage } = require('./db');

// Сервер для Render
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");
const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";

// Команда /start с разделением на личку и группу
bot.start(async (ctx) => {
    console.log("Получена команда /start");
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const isGroup = ctx.chat.type !== 'private';

    if (!isGroup) {
        // Логика для лички
        registerUser(userId, username);
        return ctx.reply(
            `Привет, ${ctx.from.first_name}! 🌌\n\nТвой паспорт Юниверса готов.`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: "✨ Открыть Hub", web_app: { url: MINI_APP_URL } }]]
                }
            }
        );
    } else {
        // Логика для группы
        return ctx.reply("🌌 Бот Together Universe активирован в этом чате! Начинаем копить очки.");
    }
});

// Улучшенная команда топов
bot.command(['topall', 'topday', 'topweek', 'topmonth'], async (ctx) => {
    console.log("Вызвана команда топа"); 
    
    // Проверка админства
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Только для админов!");
        }
    } catch (e) {
        return ctx.reply("Ошибка проверки прав.");
    }

    const command = ctx.message.text.substring(1).toLowerCase();
    const period = command.replace('top', '');
    
    const chatId = ctx.chat.id;
    const db = loadDB();
    
    let usersList = [];
    for (let id in db) {
        if (db[id].chats && db[id].chats[chatId]) {
            usersList.push({
                username: db[id].username,
                count: db[id].chats[chatId][period] || 0
            });
        }
    }

    usersList.sort((a, b) => b.count - a.count);
    let topText = `📊 **Топ (${period})**:\n\n`;
    usersList.slice(0, 10).forEach((item, i) => {
        topText += `${i + 1}. @${item.username} — ${item.count} сообщ.\n`;
    });

    ctx.reply(topText || "Пока пусто!", { parse_mode: "Markdown" });
});

// Команда "кто я"
bot.hears(/^кто я$/i, (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const db = loadDB();
    const user = db[userId];

    if (!user || !user.chats[chatId]) {
        return ctx.reply(`🪪 У тебя еще нет статистики в этом чате.`);
    }

    const stats = user.chats[chatId];
    ctx.reply(
        `🪪 **Паспорт Юниверса**\n\n` +
        `👤 Резидент: @${user.username}\n` +
        `🌟 Очки: ${user.points}\n` +
        `💬 Сообщений (всего): ${stats.all}`,
        { parse_mode: "Markdown" }
    );
});

// Логгирование сообщений
bot.on('text', (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const chatId = ctx.chat.id;
    trackMessage(userId, username, chatId);
    return next();
});

bot.launch();
console.log("Бот запущен и работает!");
