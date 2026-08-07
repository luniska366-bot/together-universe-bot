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

// Включить/выключить статус отдыха (/rest)
bot.command('rest', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        
        // Админ может отправить команду в ответ на сообщение другого человека, чтобы отправить того в рест
        let targetId = userId;
        let targetName = ctx.from.first_name;

        if (ctx.message.reply_to_message && (member.status === 'administrator' || member.status === 'creator')) {
            targetId = ctx.message.reply_to_message.from.id;
            targetName = ctx.message.reply_to_message.from.username || ctx.message.reply_to_message.from.first_name;
        }

        let user = await User.findOne({ userId: targetId });
        if (!user) {
            user = new User({ userId: targetId, username: targetName, chats: {}, isResting: true });
        } else {
            user.isResting = !user.isResting; // Переключаем статус (если был на ресте — снимаем, если нет — ставим)
        }

        await user.save();

        if (user.isResting) {
            return ctx.reply(`🏖️ Пользователь @${targetName} отправлен на **рест (отдых)**. Чистка его не тронет!`, { parse_mode: "Markdown" });
        } else {
            return ctx.reply(`⚡ Пользователь @${targetName} вернулся с отдыха и снова участвует в проверках активности.`);
        }
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при изменении статуса реста.");
    }
});


// Авто-проверка активности с выбором периода (/check [период] [норма])
// Периоды: day, week, month, all
bot.command('check', async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Проверку активности могут запускать только администраторы!");
        }

        const args = ctx.message.text.split(' ');
        // Аргумент 1: период (day, week, month, all). По умолчанию week (неделя)
        const period = args[1] && ['day', 'week', 'month', 'all'].includes(args[1]) ? args[1] : 'week';
        // Аргумент 2: минимальная норма сообщений. По умолчанию 5
        const minMessages = parseInt(args[2]) || (period === 'day' ? 2 : (period === 'week' ? 5 : 15));
        
        const chatId = ctx.chat.id.toString();
        const allUsers = await User.find({});
        let lazyUsers = [];

        // Переводим период на человеческий язык для отчета
        const periodNames = { day: 'за день', week: 'за неделю', month: 'за месяц', all: 'за всё время' };

        allUsers.forEach(u => {
            if (u.isResting) return; // Пропускаем тех, кто на ресте

            if (u.chats && u.chats[chatId]) {
                const userMessages = u.chats[chatId][period] || 0;
                if (userMessages < minMessages) {
                    lazyUsers.push({ user: u, count: userMessages });
                }
            } else {
                // Если у пользователя вообще нет записи по этому чату
                lazyUsers.push({ user: u, count: 0 });
            }
        });

        if (lazyUsers.length === 0) {
            return ctx.reply(`✅ Все активны ${periodNames[period]} или находятся на ресте! Чистка не нужна.`);
        }

        let list = `🧹 **Кандидаты на вылет (${periodNames[period]}, меньше ${minMessages} сообщ.):**\n*(Те, кто на ресте — защищены)*\n\n`;
        lazyUsers.forEach(item => {
            list += `👤 @${item.user.username || 'Без юзернейма'} — ${item.count} сообщ.\n`;
        });
        
        ctx.reply(list, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[{ text: "🔥 Выгнать неактивных", callback_data: `kick_lazy_${period}_${minMessages}` }]]
            }
        });

    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при запуске проверки.");
    }
});


// Кнопка подтверждения кика с учетом периода
bot.action(/^kick_lazy_(day|week|month|all)_(\d+)$/, async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.answerCbQuery({ text: "⛔ Только для администраторов!", show_alert: true });
        }

        const period = ctx.match[1];
        const minMessages = parseInt(ctx.match[2]);
        const chatId = ctx.chat.id.toString();
        const allUsers = await User.find({});
        
        let kickedCount = 0;

        for (let u of allUsers) {
            if (u.isResting) continue;

            let userMessages = 0;
            if (u.chats && u.chats[chatId]) {
                userMessages = u.chats[chatId][period] || 0;
            }

            if (userMessages < minMessages) {
                try {
                    await ctx.telegram.banChatMember(ctx.chat.id, u.userId);
                    await ctx.telegram.unbanChatMember(ctx.chat.id, u.userId);
                    kickedCount++;
                } catch (err) {
                    console.log(`Не удалось кикнуть пользователя ${u.userId}:`, err);
                }
            }
        }

        await ctx.answerCbQuery("Чистка завершена!");
        await ctx.editMessageText(`✅ Авто-чистка (${period}) завершена! Удалено неактивных участников: ${kickedCount}`);

    } catch (e) {
        console.error(e);
        ctx.answerCbQuery({ text: "Произошла ошибка при чистке.", show_alert: true });
    }
});



bot.launch();
console.log("Бот запущен с MongoDB!");
