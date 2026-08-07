const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const { registerUser, loadDB, saveDB } = require('./db');

// Поднимаем HTTP-сервер для Render, чтобы статус был Live
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

// Инициализация бота
const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");

const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";
const MAIN_CHANNEL = "@togetheruniversechats";

bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.username;

    // Проверка подписки на главное сообщество
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
        // Если бот не админ в канале, можно пропустить или сообщить, но лучше выдать предупреждение
    }

    // Регистрация в базе данных
    const isNew = registerUser(userId, username);
    const userName = ctx.from.first_name || "резидент";

    return ctx.reply(
        `Привет, **${userName}**! 🌌\n\n` +
        (isNew ? `✨ Твой паспорт Юниверса успешно создан!\n\n` : `Твой паспорт Юниверса уже активен!\n\n`) +
        `Добро пожаловать в официальный хаб **Together Universe**. ` +
        `Выбирай раздел или открывай Mini App:`,
        {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [Markup.button.webApp("✨ Открыть Together Universe", MINI_APP_URL)],
                [
                    Markup.button.callback("🏆 Топ активов", "top_list"),
                    Markup.button.callback("🛍 Магазин", "shop")
                ],
                [Markup.button.callback("💬 Все чаты и контент", "chats_list")],
                [Markup.button.callback("⭐ Получить достижение", "get_achievement")]
            ])
        }
    );
});

// Команда /whoami для просмотра своего паспорта
bot.command('whoami', (ctx) => {
    const userId = ctx.from.id;
    const db = loadDB();
    const user = db[userId];

    if (!user) {
        return ctx.reply("У тебя еще нет паспорта! Напиши /start для регистрации.");
    }

    ctx.reply(
        `🪪 **Паспорт Юниверса**\n\n` +
        `👤 Имя: @${user.username}\n` +
        `🌟 Очки: ${user.points}\n` +
        `⚠️ Предупреждения: ${user.warns}\n` +
        `💬 Сообщений за всё время: ${user.messages_total}`,
        { parse_mode: "Markdown" }
    );
});

bot.action('top_list', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("📊 **Топ активов Together Universe:**\n\n1. Макар — 🌟 9999 очков (Легенда)\n2. Сообщество — 💎 5000 очков\n\n*Таблица обновляется в реальном времени!*", { parse_mode: "Markdown" });
});

bot.action('shop', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🛍 **Магазин Together Universe:**\n\n• Кастомный статус в профиле — 500 очков\n• Уникальная роль в чате — 1000 очков\n\n*Покупка через Mini App откроется совсем скоро!*", { parse_mode: "Markdown" });
});

bot.action('chats_list', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("💬 **Все чаты и контент Together Universe:**\n\n• Главный чат резидентов: [ссылка]\n• Новостной канал: https://t.me/togetheruniversechats\n• Вики-проекты и архивы: настроено!", { parse_mode: "Markdown" });
});

bot.action('get_achievement', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🎉 Поздравляю! Ты получил редкое достижение **«Первооткрыватель хаба»**! +100 очков к карме Together Universe! 🚀");
});

// Запуск бота
bot.launch();
console.log("Бот Together Universe успешно взлетел на JavaScript! 🚀");
