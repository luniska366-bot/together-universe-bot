const { Telegraf, Markup } = require('telegraf');

// Токен интегрирован
const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");

const MINI_APP_URL = "[https://luniska366-bot.github.io/together-universe-bot/](https://luniska366-bot.github.io/together-universe-bot/)";

bot.start((ctx) => {
    const userName = ctx.from.first_name || "резидент";
    
    return ctx.reply(
        `Привет, **${userName}**! 🌌\n\n` +
        `Добро пожаловать в официальный хаб **Together Universe**. ` +
        `Здесь тебя ждет прокачка профиля, достижения, магазин и вся наша экосистема!\n\n` +
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
    ctx.reply("💬 **Все чаты и контент Together Universe:**\n\n• Главный чат резидентов: [ссылка]\n• Новостной канал: [ссылка]\n• Вики-проекты и архивы: настроено!", { parse_mode: "Markdown" });
});

bot.action('get_achievement', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🎉 Поздравляю! Ты получил редкое достижение **«Первооткрыватель хаба»**! +100 очков к карме Together Universe! 🚀");
});

bot.launch();
console.log("Бот Together Universe успешно взлетел на JavaScript! 🚀");
