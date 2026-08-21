const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const { User } = require('./db'); // Твоя готовая база данных

const app = express();
app.use(cors());
app.use(express.json());

// --- НОВЫЕ ЭНДПОИНТЫ ДЛЯ MINI APP (МАГАЗИН, НОВОСТИ, ИВЕНТЫ, ПРОФИЛЬ) ---

// Получение профиля и расширенных данных (валюты, достижения, уровень)
app.get('/api/user-data', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.query.userId });
        res.json(user || { points: 0, level: 1, season_currency: 0, achievements: [] });
    } catch (e) {
        res.status(500).json({ error: "Ошибка при получении данных профиля" });
    }
});

// Эндпоинт для магазина (покупка товаров/валют)
app.get('/api/shop', async (req, res) => {
    res.json([
        { id: 1, name: "🌟 Набор Звездного Резидента", cost: 100, type: "points" },
        { id: 2, name: "💎 Сезонный Бонус", cost: 50, type: "season_currency" }
    ]);
});

// Эндпоинт новостей и ивентов
app.get('/api/news', async (req, res) => {
    res.json([
        { id: 1, title: "🚀 Запуск Together Universe", text: "Обновление бота и новые фичи в Mini App уже доступны!" },
        { id: 2, title: "⭐ Ивент Активности", text: "Копите очки в чатах и получайте сезонную валюту вдвое быстрее!" }
    ]);
});

// ------------------------------------------------------------------------

// Эндпоинт, который забирает данные из MongoDB и отдает топы
app.get('/api/top', async (req, res) => {
    try {
        const { type = 'all', chat_id } = req.query;
        const allUsers = await User.find({});
        
        let usersList = [];
        
        allUsers.forEach(u => {
            let count = 0;
            
            // Если запрашивают топ конкретного чата
            if (chat_id && chat_id !== 'global' && u.chats && u.chats[chat_id]) {
                count = u.chats[chat_id][type] || u.chats[chat_id]['all'] || 0;
            } else {
                // Глобальный топ по всем чатам пользователя
                if (u.chats) {
                    Object.values(u.chats).forEach(chatData => {
                        count += chatData[type] || chatData['all'] || 0;
                    });
                }
            }
            
            if (count > 0) {
                usersList.push({
                    username: u.username || 'Резидент',
                    message_count: count
                });
            }
        });

        // Сортируем по убыванию (от большего к меньшему)
        usersList.sort((a, b) => b.message_count - a.message_count);
        
        // Возвращаем топ-10
        res.json(usersList.slice(0, 10));
    } catch (e) {
        console.error("Ошибка API топов:", e);
        res.status(500).json({ error: "Internal server error" });
    }
});

const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");
const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";

// --- ТЕКСТОВЫЕ КОМАНДЫ И КАЛЛ (ЗАЗЫВАЛА) ---
bot.hears(/^(!калл|калл|зазыв)/i, async (ctx) => {
    await ctx.reply(`📢 Внимание всем! Кликаем по ссылке ниже, заходим в Mini App, зацениваем магазин и новости! 🚀`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('Открыть Mini App', MINI_APP_URL)]
        ])
    );
});

bot.hears(/^(!магазин|магазин)/i, async (ctx) => {
    await ctx.reply(`🛒 Открой Mini App, чтобы зайти в магазин и купить уникальные награды за сезонную валюту!`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('Перейти в магазин', MINI_APP_URL)]
        ])
    );
});

bot.hears(/^(!профиль|профиль)/i, async (ctx) => {
    const user = await User.findOne({ userId: ctx.from.id });
    if (!user) return ctx.reply(`Сначала нажми /start!`);
    await ctx.reply(`👤 Твой профиль:\n💰 Очки: ${user.points || 0}\n⭐ Сезонная валюта: ${user.season_currency || 0}\n🏆 Уровень: ${user.level || 1}`);
});

// Функция трекинга сообщений в БД (с начислением очков, уровней и сезонной валюты)
async function trackMessage(userId, username, chatId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username, chats: {}, points: 0, level: 1, season_currency: 0, warnings: {}, verified: true });
    }
    
    chatId = chatId.toString();
    if (!user.chats) user.chats = {};
    if (!user.chats[chatId]) {
        user.chats[chatId] = { all: 0, day: 0, week: 0, month: 0 };
    }
    
    user.chats[chatId].all += 1;
    user.chats[chatId].day = (user.chats[chatId].day || 0) + 1;
    user.chats[chatId].week = (user.chats[chatId].week || 0) + 1;
    user.chats[chatId].month = (user.chats[chatId].month || 0) + 1;
    
    // Начисление очков (1 сообщение = 10 очков), сезонной валюты и расчет уровня
    user.points = (user.points || 0) + 10;
    user.season_currency = (user.season_currency || 0) + 1;
    user.level = Math.floor(user.points / 500) + 1;

    user.username = username || user.username;
    
    user.markModified('chats');
    await user.save();
}

// --- 1. КАПЧА ДЛЯ НОВЫХ УЧАСТНИКОВ ---
bot.on('chat_member', async (ctx) => {
    const newMember = ctx.chatMember.new_chat_member;
    const oldMember = ctx.chatMember.old_chat_member;

    if (oldMember.status === 'left' && (newMember.status === 'member' || newMember.status === 'restricted')) {
        const userId = newMember.user.id;
        const userName = newMember.user.first_name || 'друг';

        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, username: userName, verified: false, chats: {}, warnings: {} });
            await user.save();
        } else {
            user.verified = false;
            await user.save();
        }

        try {
            await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
                permissions: { can_send_messages: false }
            });
        } catch (err) {
            console.log("Не удалось ограничить права для капчи:", err);
        }

        await ctx.reply(
            `Привет, ${userName}! 💖 Добро пожаловать. Нажми на кнопку ниже в течение 3 минут, чтобы доказать, что ты не бот!`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: "🐈 Я человек (Пройти капчу)", callback_data: `verify_${userId}` }]]
                }
            }
        );
    }
});

bot.action(/^verify_(\d+)$/, async (ctx) => {
    const targetUserId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;

    if (userId !== targetUserId) {
        return ctx.answerCbQuery("Эта кнопка не для тебя, солнышко! ✨", { show_alert: true });
    }

    try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            }
        });
    } catch (err) {
        console.log("Не удалось вернуть права:", err);
    }

    await User.updateOne({ userId }, { verified: true });
    await ctx.answerCbQuery("Успешно! Добро пожаловать!");
    await ctx.editMessageText(`Успешно! ${ctx.from.first_name} прошел проверку и готов общаться! 🌟`);
});

// Команда /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const isGroup = ctx.chat.type !== 'private';

    if (!isGroup) {
        let user = await User.findOne({ userId });
        if (!user) {
            await new User({ userId, username, chats: {}, warnings: {}, verified: true }).save();
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
        return ctx.reply("🌌 Бот Together Universe активирован в этом чате! Начинаем копить очки и сезонную валюту.");
    }
});

// Команда "кто я"
bot.hears(/^кто я$/i, async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id.toString();
    const user = await User.findOne({ userId });

    if (!user || !user.chats || !user.chats[chatId]) {
        return ctx.reply(`🪪 У тебя еще нет статистики в этом чате.`);
    }

    const stats = user.chats[chatId];
    const titleText = user.activeTitle ? `\n🏷 Титул: ${user.activeTitle}` : '';
    const frameText = user.activeFrame ? `\n🖼 Рамка: ${user.activeFrame}` : '';
    const descText = user.description ? `\n💬 Статус: ${user.description}` : '';

    ctx.reply(
        `🪪 **Паспорт Юниверса**\n\n` +
        `👤 Резидент: @${user.username || ctx.from.first_name}` +
        titleText + frameText + descText + `\n` +
        `🌟 Очки: ${user.points || 0} (Левел ${user.level || 1})\n` +
        `⭐ Сезонная валюта: ${user.season_currency || 0}\n` +
        `💬 Сообщений (всего): ${stats.all}`,
        { parse_mode: "Markdown" }
    );
});

// Команда установки статуса
bot.command('setdesc', async (ctx) => {
    const text = ctx.message.text.replace('/setdesc', '').trim();
    if (!text) {
        return ctx.reply("Напиши текст после команды, например: `/setdesc Живу музыкой!`");
    }
    await User.updateOne({ userId: ctx.from.id }, { description: text });
    await ctx.reply("Твой статус успешно обновлен! ✨");
});

// Команды топов
bot.command(['topall', 'topday', 'topweek', 'topmonth'], async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Только для админов!");
        }

        let fullCommand = ctx.message.text.substring(1).toLowerCase();
        let cleanCommand = fullCommand.split('@')[0];
        let period = cleanCommand.replace('top', '');
        
        const chatId = ctx.chat.id.toString();
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
            topText += `${i + 1}. @${item.username || 'Резидент'} — ${item.count} сообщ.\n`;
        });

        ctx.reply(topText || "Пока пусто!");
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при получении топа.");
    }
});

// Трекинг сообщений
bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    
    if (ctx.chat.type !== 'private') {
        const userId = ctx.from.id;
        const user = await User.findOne({ userId });
        if (user && user.verified === false) {
            try {
                await ctx.deleteMessage();
            } catch (e) {}
            return;
        }

        const username = ctx.from.username || ctx.from.first_name;
        const chatId = ctx.chat.id;
        await trackMessage(userId, username, chatId);
    }
    return next();
});

// Система предов (/warn, /unwarn, /warns)
bot.command('warn', async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Эта команда только для администраторов!");
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply("⚠️ Ответь этой командой на сообщение нарушителя, чтобы выдать пред!");
        }

        const targetUser = ctx.message.reply_to_message.from;
        const targetId = targetUser.id;
        const targetUsername = targetUser.username || targetUser.first_name;
        const chatId = ctx.chat.id.toString();

        let user = await User.findOne({ userId: targetId });
        if (!user) {
            user = new User({ userId: targetId, username: targetUsername, chats: {}, warnings: {} });
        }

        if (!user.warnings) user.warnings = {};
        if (!user.warnings[chatId]) user.warnings[chatId] = 0;

        user.warnings[chatId] += 1;
        let currentWarns = user.warnings[chatId];

        user.markModified('warnings');
        await user.save();

        ctx.reply(`⚠️ Администратор выдал предупреждение пользователю @${targetUsername}.\n📌 Предов в этом чате: ${currentWarns}/3`);

        if (currentWarns >= 3) {
            try {
                await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
                    until_date: Math.floor(Date.now() / 1000) + 3600,
                    permissions: { can_send_messages: false }
                });
                ctx.reply(`🚫 У @${targetUsername} накопилось 3 предупреждения, выдан мут на 1 час!`);
            } catch (e) {
                console.log("Не удалось замутить:", e);
            }
        }
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при выдаче предупреждения.");
    }
});

bot.command('unwarn', async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Эта команда только для администраторов!");
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply("⚠️ Ответь на сообщение пользователя, чтобы снять пред.");
        }

        const targetId = ctx.message.reply_to_message.from.id;
        const chatId = ctx.chat.id.toString();

        let user = await User.findOne({ userId: targetId });
        if (user && user.warnings && user.warnings[chatId] > 0) {
            user.warnings[chatId] -= 1;
            user.markModified('warnings');
            await user.save();
            return ctx.reply(`✅ Снят один пред. Текущее количество: ${user.warnings[chatId]}`);
        } else {
            return ctx.reply("У пользователя и так нет предупреждений в этом чате.");
        }
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при снятии преда.");
    }
});

bot.command('warns', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id.toString();

    let user = await User.findOne({ userId });
    let warns = (user && user.warnings && user.warnings[chatId]) ? user.warnings[chatId] : 0;

    ctx.reply(`📌 Ваши предупреждения в этом чате: ${warns} из 3.`);
});

// Система чистки сообщений (/clear)
bot.command(['clear', 'clean'], async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Чистить чат могут только администраторы!");
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply("⚠️ Чтобы очистить сообщения, ответь командой `/clear` на сообщение, начиная с которого нужно всё удалить.", { parse_mode: "Markdown" });
        }

        const replyId = ctx.message.reply_to_message.message_id;
        const currentId = ctx.message.message_id;

        await ctx.deleteMessage(currentId).catch(() => {});
        
        for (let msgId = currentId - 1; msgId >= replyId; msgId--) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
            } catch (err) {}
        }

        const notify = await ctx.reply("🧹 Чат успешно очищен!");
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, notify.message_id).catch(() => {});
        }, 3000);

    } catch (e) {
        console.error(e);
        ctx.reply("❌ Не удалось очистить чат.");
    }
});

// Статус отдыха (/rest)
bot.command('rest', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        
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
            user.isResting = !user.isResting;
        }

        await user.save();

        if (user.isResting) {
            return ctx.reply(`🏖️ Пользователь @${targetName} отправлен на **рест (отдых)**. Чистка его не тронет!`);
        } else {
            return ctx.reply(`⚡ Пользователь @${targetName} вернулся с отдыха и снова участвует в проверках активности.`);
        }
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при изменении статуса реста.");
    }
});

// Проверка активности
async function handleCheckCommand(ctx) {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("⛔ Проверку активности могут запускать только администраторы!");
        }

        const args = ctx.message.text.split(' ');
        const period = args[1] && ['day', 'week', 'month', 'all'].includes(args[1]) ? args[1] : 'month';
        
        const defaultNorms = { day: 10, week: 100, month: 300, all: 300 };
        const minMessages = parseInt(args[2]) || defaultNorms[period];
        
        const chatId = ctx.chat.id.toString();
        const allUsers = await User.find({});
        let lazyUsers = [];

        const periodNames = { day: 'за день', week: 'за неделю', month: 'за месяц', all: 'за всё время' };

        allUsers.forEach(u => {
            if (u.isResting) return;

            if (u.chats && u.chats[chatId]) {
                const userMessages = u.chats[chatId][period] || 0;
                if (userMessages < minMessages) {
                    lazyUsers.push({ user: u, count: userMessages });
                }
            } else {
                lazyUsers.push({ user: u, count: 0 });
            }
        });

        if (lazyUsers.length === 0) {
            return ctx.reply(`✅ Все активны ${periodNames[period]} или находятся на ресте! Варны не нужны.`);
        }

        let list = `🧹 **Кандидаты на предупреждение (${periodNames[period]}, меньше ${minMessages} сообщ.):**\n*(Те, кто на ресте — защищены)*\n\n`;
        lazyUsers.forEach(item => {
            list += `👤 @${item.user.username || 'Без юзернейма'} — ${item.count} сообщ.\n`;
        });
        
        ctx.reply(list, {
            reply_markup: {
                inline_keyboard: [[{
                    text: "⚠️ Выдать варны неактивным",
                    callback_data: `warn_lazy_${period}_${minMessages}`
                }]]
            }
        });
    } catch (e) {
        console.error(e);
        ctx.reply("Ошибка при запуске проверки.");
    }
}

bot.command('check', handleCheckCommand);

bot.action(/^warn_lazy_(day|week|month|all)_(\d+)$/, async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.answerCbQuery({ text: "⛔ Только для администраторов!", show_alert: true });
        }

        const period = ctx.match[1];
        const minMessages = parseInt(ctx.match[2]);
        const chatId = ctx.chat.id.toString();
        const allUsers = await User.find({});
        
        let warnedCount = 0;

        for (let u of allUsers) {
            if (u.isResting) continue;

            let userMessages = 0;
            if (u.chats && u.chats[chatId]) {
                userMessages = u.chats[chatId][period] || 0;
            }

            if (userMessages < minMessages) {
                if (!u.warnings) u.warnings = {};
                u.warnings[chatId] = (u.warnings[chatId] || 0) + 1;
                u.markModified('warnings');
                await u.save();
                warnedCount++;
            }
        }

        await ctx.answerCbQuery("Выдача предупреждений завершена!");
        await ctx.editMessageText(`⚠️ Авто-проверка (${period}) завершена! Выдано варнов за неактивность: ${warnedCount}`);

    } catch (e) {
        console.error(e);
        ctx.answerCbQuery({ text: "Произошла ошибка при выдаче варнов.", show_alert: true });
    }
});

bot.hears(/^\/checkday(@\w+)?$/, async (ctx) => {
    ctx.message.text = '/check day 10';
    return handleCheckCommand(ctx);
});

bot.hears(/^\/checkweek(@\w+)?$/, async (ctx) => {
    ctx.message.text = '/check week 100';
    return handleCheckCommand(ctx);
});

bot.hears(/^\/checkmonth(@\w+)?$/, async (ctx) => {
    ctx.message.text = '/check month 300';
    return handleCheckCommand(ctx);
});

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

SERVER_PORT = process.env.PORT || 10000; 
app.listen(SERVER_PORT, '0.0.0.0', async () => {
    console.log(`Сервер запущен на порту ${SERVER_PORT}!`);
    const webhookUrl = `https://together-universe-bot.onrender.com/bot${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log("Webhook установлен!");
});

console.log("Бот запущен с MongoDB и всеми обновлениями!");
