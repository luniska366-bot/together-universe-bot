const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const { registerUser, loadDB, saveDB, trackMessage } = require('./db');

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");
const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";
const MAIN_CHANNEL = "@togetheruniversechats";

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const isGroup = ctx.chat.type !== 'private';

    // В личке проверяем подписку на канал
    if (!isGroup) {
        try {
            const member = await bot.telegram.getChatMember(MAIN_CHANNEL, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return ctx.reply(
                    `🌌 Чтобы открыть паспорт Together Universe, подпишись на наше главное сообщество:\nhttps://t.me/togetheruniversechats`,
                    { disable_web_page_preview: true }
                );
            }
        } catch (e) {
            console.log("Ошибка проверки подписки:", e);
        }
    }

    const isNew = registerUser(userId, username);
    const userName = ctx.from.first_name || "резидент";

    // Если это группа — отправляем просто текст без WebApp кнопок, чтобы не было ошибок
    if (isGroup) {
        return ctx.reply(
            `🌌 Бот Together Universe активирован в этом чате!\n` +
            `Пишите сообщения, чтобы копить очки. Используйте команду «кто я», чтобы посмотреть свой паспорт, и /topall для топов (доступно админам).`,
            { parse_mode: "Markdown" }
        );
    }

сть    // В личке даем кнопку Mini App
    return ctx.reply(
        `Привет, **${userName}**! 🌌\n\n` +
        (isNew ? `✨ Твой паспорт Юниверса успешно создан!\n\n` : `Твой паспорт Юниверса уже активен!\n\n`) +
        `Добро пожаловать в официальный хаб **Together Universe**.`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✨ Открыть Together Universe", web_app: { url: MINI_APP_URL } }]
                ]
            }
        }
    );
});

// Слушаем все текстовые сообщения в чатах для статистики (как Ирис)
bot.on('text', (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();

    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const chatId = ctx.chat.id;

    trackMessage(userId, username, chatId);
    return next();
});

// Команда «кто я» (как в Ирисе)
bot.hears(/^кто я$/i, (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const db = loadDB();
    const user = db[userId];

    if (!user || !user.chats[chatId]) {
        return ctx.reply(`🪪 У тебя еще нет статистики в этом чате. Напиши что-нибудь!`);
    }

    const stats = user.chats[chatId];
    ctx.reply(
        `🪪 **Паспорт Юниверса (Статистика чата)**\n\n` +
        `👤 Резидент: @${user.username}\n` +
        `🌟 Очки (общее): ${user.points}\n` +
        `💬 Сообщений за сутки: ${stats.day}\n` +
        `💬 Сообщений за неделю: ${stats.week}\.week\n` +
        `💬 Сообщений за месяц: ${stats.month}\n` +
        `💬 Сообщений за всё время: ${stats.all}`,
        { parse_mode: "Markdown" }
    );
});

// Админские топы чата
bot.hears(/^\/top(day|week|month|all)?$/i, async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Эту команду могут вызывать только администраторы чата!");
        }
    } catch (e) {
        return ctx.reply("Не удалось проверить права администратора.");
    }

    const text = ctx.message.text.toLowerCase();
    let period = 'all';
    if (text.includes('day')) period = 'day';
    if (text.includes('week')) period = 'week';
    if (text.includes('month')) period = 'month';

    const chatId = ctx.chat.id;
    const db = loadDB();
    
    let usersList = [];
    for (let id in db) {
        let u = db[id];
        if (u.chats && u.chats[chatId]) {
            usersList.push({
                username: u.username,
                count: u.chats[chatId][period] || 0
            });
        }
    }

    usersList.sort((a, b) => b.count - a.count);
    let topText = `📊 **Топ участников чата (${period.toUpperCase()})**:\n\n`;
    
    usersList.slice(0, 10).forEach((item, index) => {
        topText += `${index + 1}. @${item.username} — ${item.count} сообщ.\n`;
    });

    if (usersList.length === 0) {
        topText += "Пока пусто!";
    }

    ctx.reply(topText, { parse_mode: "Markdown" });
});

bot.launch();
console.log("Бот успешно запущен без ошибок кнопок! 🚀");
