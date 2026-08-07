const { Telegraf } = require('telegraf');
const http = require('http');
const { trackMessage, User } = require('./db');

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");
const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";

// Команда /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const isGroup = ctx.chat.type !== 'private';

    if (!isGroup) {
        // Регистрация в базе при старте в личке
        let user = await User.findOne({ userId });
        if (!user) {
            await new User({ userId, username, chats: {} }).save();
        }
        return ctx.reply(
            `Привет, ${ctx.from.first_name}! 🌌\n\nТвой паспорт Юниверса готов.`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: "✨ Открыть Hub", web_app: { url: MINI_APP_URL } }]]
                }
            }
        );
    } else {
        return ctx.reply("🌌 Бот Together Universe активирован в этом чате! Начинаем копить очки.");
    }
});

// Команда "кто я"
bot.hears(/^кто я$/i, async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const user = await User.findOne({ userId });

    if (!user || !user.chats || !user.chats[chatId]) {
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

// Команды топов (topall, topday, etc)
bot.command(['topall', 'topday', 'topweek', 'topmonth'], async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Только для админов!");
        }

        let fullCommand = ctx.message.text.substring(1).toLowerCase();
        let cleanCommand = fullCommand.split('@')[0];
        let period = cleanCommand.replace('top', '');
        
        const chatId = ctx.chat.id;
        const allUsers = await User.find({});
        
        let usersList = [];
        allUsers.forEach(u => {
            if (u.chats && u.chats[chatId]) {
                usersList.push({
                    username: u.username,
                    count: u.chats[chatId][period] || 0
                });
            }
        });

        usersList.sort((a, b) => b.count - a.count);
        let topText = `📊 **Топ (${period})**:\n\n`;
        usersList.slice(0, 10).forEach((item, i) => {
            topText += `${i + 1}. @${item.username} — ${item.count} сообщ.\n`;
        });

        ctx.reply(topText || "Пока пусто!", { parse_mode: "Markdown" });
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при получении топа.");
    }
});

// Трекинг сообщений
bot.on('text', (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const chatId = ctx.chat.id;
    trackMessage(userId, username, chatId);
    return next();
});

bot.launch();
console.log("Бот запущен с MongoDB!");
