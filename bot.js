const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const { User, ShopItem, News, Event, Banner, trackMessage } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const bot = new Telegraf("8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M");
const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";

// --- API ДЛЯ MINI APP (МАГАЗИН, НОВОСТИ, ИВЕНТЫ, ПРОФИЛЬ, АДМИНКА) ---

app.get('/api/user-data', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.query.userId });
        res.json(user || { points: 0, level: 1, season_currency: 0, achievements: [], inventory: [] });
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

// Сохранение/обновление описания через Mini App или бота (+описание)
app.post('/api/update-description', async (req, res) => {
    try {
        const { userId, description } = req.body;
        if (description.length > 150) return res.status(400).json({ error: "Слишком длинное описание (максимум 150 символов)" });
        await User.updateOne({ userId }, { description });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// Смена активной рамки
app.post('/api/set-frame', async (req, res) => {
    try {
        const { userId, frameId } = req.body;
        await User.updateOne({ userId }, { activeFrame: frameId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

// Магазин
app.get('/api/shop', async (req, res) => {
    try {
        const items = await ShopItem.find({});
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

// Покупка товара в магазине
app.post('/api/shop/buy', async (req, res) => {
    try {
        const { userId, itemId } = req.body;
        const user = await User.findOne({ userId });
        const item = await ShopItem.findOne({ itemId });

        if (!user || !item) {
            return res.status(404).json({ error: "Пользователь или товар не найден" });
        }

        // Проверяем баланс в зависимости от валюты
        if (item.currency === 'stars') {
            if ((user.points || 0) < item.price) {
                return res.json({ success: false, error: "Недостаточно звезд 🌟" });
            }
            user.points -= item.price;
        } else if (item.currency === 'season') {
            if ((user.season_currency || 0) < item.price) {
                return res.json({ success: false, error: "Недостаточно сезонной валюты 🥥" });
            }
            user.season_currency -= item.price;
        }

        // Добавляем товар в инвентарь или активируем рамку/титул
        if (!user.inventory) user.inventory = [];
        user.inventory.push(item.itemId);

        if (item.type === 'frame') {
            user.activeFrame = item.name; // Или сохраняем ID/ссылку в зависимости от логики
        } else if (item.type === 'title') {
            user.activeTitle = item.name;
        }

        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка при покупке" });
    }
});


app.post('/api/shop/add', async (req, res) => {
    try {
        const newItem = new ShopItem(req.body);
        await newItem.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка добавления товара" });
    }
});

// Новости
app.get('/api/news', async (req, res) => {
    try {
        const news = await News.find({}).sort({ date: -1 });
        res.json(news);
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

app.post('/api/news/add', async (req, res) => {
    try {
        const newNews = new News(req.body);
        await newNews.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка добавления новости" });
    }
});

// Ивенты
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find({});
        res.json(events);
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

app.post('/api/events/add', async (req, res) => {
    try {
        const newEvent = new Event(req.body);
        await newEvent.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка добавления ивента" });
    }
});

// Топы
app.get('/api/top', async (req, res) => {
    try {
        const { type = 'all', chat_id } = req.query;
        const allUsers = await User.find({});
        let usersList = [];
        
        allUsers.forEach(u => {
            let count = 0;
            if (chat_id && chat_id !== 'global' && u.chats && u.chats[chat_id]) {
                count = u.chats[chat_id][type] || u.chats[chat_id]['all'] || 0;
            } else {
                if (u.chats) {
                    Object.values(u.chats).forEach(chatData => {
                        count += chatData[type] || chatData['all'] || 0;
                    });
                }
            }
            if (count > 0) {
                usersList.push({ username: u.username || 'Резидент', message_count: count });
            }
        });

        usersList.sort((a, b) => b.message_count - a.message_count);
        res.json(usersList.slice(0, 10));
    } catch (e) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// --- СИСТЕМА ДОСТИЖЕНИЙ С УВЕДОМЛЕНИЯМИ В ЛС И ЧАТ ---
const ACHIEVEMENTS_DEF = [
    { id: 'novice', name: 'Новичок Юниверс', count: 1 },
    { id: 'advanced', name: 'Продвинутый Юниверс', count: 100 },
    { id: 'cool', name: 'Крутой Юниверс', count: 500 },
    { id: 'amazing', name: 'Удивительный Юниверс', count: 800 },
    { id: 'talkative', name: 'Разговорчивый Юниверс', count: 1000 },
    { id: 'pro', name: 'Про-Юниверс', count: 2000 },
    { id: 'master', name: 'Мастер Юниверс', count: 5000 },
    { id: 'veteran', name: 'Ветеран Юниверс', count: 10000 },
    { id: 'super', name: 'Супер Юниверс', count: 15000 },
    { id: 'active_uni', name: 'Актив Юниверс', count: 20000 },
];

async function checkAchievements(user, chatId, botInstance, totalMessages, messageHour) {
    for (const ach of ACHIEVEMENTS_DEF) {
        if (totalMessages >= ach.count && !user.achievements.includes(ach.name)) {
            user.achievements.push(ach.name);
            await notifyAchievement(user, ach.name, chatId, botInstance);
        }
    }

    // Бессонница (00:00 - 6:00) и Утро (6:01 - 10:00)
    if (messageHour >= 0 && messageHour < 6 && !user.achievements.includes('Бессонница')) {
        user.achievements.push('Бессонница');
        await notifyAchievement(user, 'Бессонница', chatId, botInstance);
    }
    if (messageHour >= 6 && messageHour <= 10 && !user.achievements.includes('Утро')) {
        user.achievements.push('Утро');
        await notifyAchievement(user, 'Утро', chatId, botInstance);
    }
}

async function notifyAchievement(user, achName, chatId, botInstance) {
    await user.save();
    const text = `🏆 Вы получили достижение: *${achName}*!`;
    try {
        await botInstance.telegram.sendMessage(user.userId, text, { parse_mode: 'Markdown' });
    } catch (e) {}
    if (chatId) {
        try {
            await botInstance.telegram.sendMessage(chatId, `🎉 Пользователь @${user.username || 'резидент'} разблокировал достижение: *${achName}*!`, { parse_mode: 'Markdown' });
        } catch (e) {}
    }
}

// --- ТЕКСТОВЫЕ КОМАНДЫ И КАЛЛ (ЗАЗЫВАЛА) ---

// Финальный исправленный КАЛЛ без падений разметки
bot.hears(/^калл(?:\s+(.+))?/i, async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Эта команда работает только в чатах!');
    const callText = ctx.match[1] || 'Внимание всем!';
    const chatId = ctx.chat.id.toString();

    try {
        const allUsers = await User.find({});
        let tags = '';
        
        allUsers.forEach(u => {
            if (u.chats && u.chats[chatId] && u.username) {
                tags += `@${u.username} `;
            }
        });

        if (tags.trim()) {
            // Отправляем без parse_mode, чтобы спецсимволы в именах не ломали сообщение
            await ctx.reply(`📢 КАЛЛ: ${callText}\n\n${tags}`);
        } else {
            await ctx.reply('В этом чате пока никто не написал ни одного сообщения, некого тегать!');
        }
    } catch (e) {
        console.error("ТОЧНАЯ ОШИБКА КАЛЛА:", e);
        await ctx.reply(`Ошибка калла: ${e.message}`);
    }
});

bot.hears(/^\/callall(?:\s+(.+))?/i, async (ctx) => {
    ctx.message.text = ctx.message.text.replace('/callall', 'калл');
    return bot.handleUpdate(ctx.update);
});




// 13. Текстовые команды
bot.hears(/^топ вся$/i, async (ctx) => showTop(ctx, 'all'));
bot.hears(/^топ дня$/i, async (ctx) => showTop(ctx, 'day'));
bot.hears(/^топ недели$/i, async (ctx) => showTop(ctx, 'week'));

async function showTop(ctx, type) {
    if (ctx.chat.type === 'private') return;
    const chatId = ctx.chat.id.toString();
    const allUsers = await User.find({});
    let list = [];
    allUsers.forEach(u => {
        if (u.chats && u.chats[chatId]) {
            list.push({ username: u.username, count: u.chats[chatId][type] || 0 });
        }
    });
    list.sort((a, b) => b.count - a.count);
    let text = `🏆 *Топ (${type})*:\n\n`;
    list.slice(0, 10).forEach((item, i) => {
        text += `${i + 1}. @${item.username || 'Резидент'} — ${item.count} сообщ.\n`;
    });
    ctx.reply(text, { parse_mode: 'Markdown' });
}

// Варн и бан текстовые команды
bot.hears(/^пред$/i, async (ctx) => {
    if (!ctx.message.reply_to_message) return ctx.reply('Ответьте на сообщение командой "пред"');
    handleWarn(ctx);
});
bot.hears(/^бан$/i, async (ctx) => {
    if (!ctx.message.reply_to_message) return ctx.reply('Ответьте на сообщение командой "бан"');
    try {
        await ctx.telegram.banChatMember(ctx.chat.id, ctx.message.reply_to_message.from.id);
        ctx.reply('🔨 Пользователь забанен.');
    } catch(e) {
        ctx.reply('Не удалось забанить.');
    }
});

// 1, 6. Чек нормы (месяц = 300, неделя = 100, день = 10) -> выдача ВАРНОВ вместо киков
bot.hears(/^чек месяц$/i, async (ctx) => runCheck(ctx, 'month', 300));
bot.hears(/^чек неделя$/i, async (ctx) => runCheck(ctx, 'week', 100));
bot.hears(/^чек дня$/i, async (ctx) => runCheck(ctx, 'day', 10));
bot.hears(/^чек$/i, async (ctx) => runCheck(ctx, 'month', 300));

async function runCheck(ctx, period, norm) {
    if (ctx.chat.type === 'private') return;
    const chatId = ctx.chat.id.toString();
    const users = await User.find({});
    let countPunished = 0;

    for (let u of users) {
        if (u.isResting) continue;
        const msgs = (u.chats && u.chats[chatId]) ? (u.chats[chatId][period] || 0) : 0;
        if (msgs < norm) {
            if (!u.warnings) u.warnings = {};
            u.warnings[chatId] = (u.warnings[chatId] || 0) + 1;
            u.markModified('warnings');
            await u.save();
            countPunished++;
        }
    }
    ctx.reply(`🧹 Чистка завершена! Норма: ${norm} (${period}). Получили предупреждение (варн): ${countPunished} чел.`);
}

// 14. Установка описания (+описание) и расширенная команда "кто я"
bot.hears(/^\+описание\s+(.+)/i, async (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.match[1].trim();
    if (text.length > 150) return ctx.reply('❌ Описание не должно превышать 150 символов.');
    await User.updateOne({ userId }, { description: text });
    ctx.reply('✅ Описание профиля успешно обновлено!');
});

bot.hears(/^кто я$/i, async (ctx) => {
    const userId = String(ctx.from.id);
    const chatId = ctx.chat.id.toString();
    const user = await User.findOne({ userId });

    if (!user) return ctx.reply('Сначала напишите что-нибудь в чат!');
    const stats = user.chats && user.chats[chatId] ? user.chats[chatId] : { all: 0 };

    let text = `🪪 *Паспорт Юниверса*\n\n` +
        `👤 Резидент: @${user.username || ctx.from.first_name}\n` +
        `💬 Статус: ${user.description || 'Не указан (+описание [текст])'}\n` +
        `🏷 Титул: ${user.activeTitle || 'Нет'}\n` +
        `🖼 Рамка: ${user.activeFrame || 'Нет'}\n` +
        `🌟 Очки: ${user.points || 0} (Левел ${user.level || 1})\n` +
        `⭐ Сезонная валюта: ${user.season_currency || 0}\n` +
        `🏆 Достижения: ${user.achievements.length ? user.achievements.join(', ') : 'Пока нет'}\n` +
        `📊 Сообщений в чате: ${stats.all}`;

    ctx.reply(text, { parse_mode: 'Markdown' });
});

// --- 12. КАПЧА ДЛЯ НОВЫХ УЧАСТНИКОВ И ЗАЯВОК ---
bot.on('chat_join_request', async (ctx) => {
    try {
        await ctx.approveChatJoinRequest();
        const userId = ctx.from.id;
        await ctx.telegram.sendMessage(userId, `👋 Привет! Твоя заявка в чат принята. Чтобы писать в чате, подпишись на наш главный ТГК: t.me/togetheruniversechats и нажми /start в ЛС с ботом!`);
    } catch (e) {}
});

// Команда для привязки канала к чату (пиши в чате: /setchannel @юзернейм_канала)
bot.hears(/^\/setchannel\s+(@\w+)/i, async (ctx) => {
    const channel = ctx.match[1];
    await ChatModel.findOneAndUpdate({ chatId: String(ctx.chat.id) }, { linkedChannel: channel }, { upsert: true });
    ctx.reply(`✅ Канал ${channel} успешно привязан к этому чату для прохождения капчи! (Не забудьте выдать боту права админа в этом канале)`);
});

bot.on('chat_member', async (ctx) => {
    const newMember = ctx.chatMember.new_chat_member;
    const oldMember = ctx.chatMember.old_chat_member;

    if (oldMember.status === 'left' && (newMember.status === 'member' || newMember.status === 'restricted')) {
        const userId = newMember.user.id;
        let user = await User.findOne({ userId });
        if (!user) {
            await new User({ userId, username: newMember.user.username, verified: false }).save();
        } else {
            await User.updateOne({ userId }, { verified: false });
        }

        try {
            await ctx.telegram.restrictChatMember(ctx.chat.id, userId, { permissions: { can_send_messages: false } });
        } catch (e) {}

        ctx.reply(`Привет, ${newMember.user.first_name}! 💖\n\nЧтобы получить доступ к общению, выполни шаги:\n1️⃣ Подпишись на главный ТГК: t.me/togetheruniversechats\n2️⃣ Подпишись на канал чата (если задан)\n3️⃣ Напиши мне в ЛС команду /start\n4️⃣ Нажми кнопку ниже!`, {
            reply_markup: { inline_keyboard: [
                [{ text: "📢 Наш главный ТГК", url: "https://t.me/togetheruniversechats" }],
                [{ text: "✍️ Написать боту в ЛС", url: `https://t.me/${ctx.botInfo.username}?start=verify` }],
                [{ text: "✅ Я всё выполнил (Проверить)", callback_data: `verify_${userId}` }]
            ]}
        });
    }
});

bot.action(/^verify_(\d+)$/, async (ctx) => {
    const targetId = parseInt(ctx.match[1]);
    if (ctx.from.id !== targetId) return ctx.answerCbQuery("Эта кнопка не для тебя! ✨", { show_alert: true });

    const chatId = String(ctx.chat.id);
    const chatSettings = await ChatModel.findOne({ chatId });
    const MAIN_CHANNEL = "@togetheruniversechats";

    try {
        // Проверка подписки на главный канал
        const mainMember = await ctx.telegram.getChatMember(MAIN_CHANNEL, targetId);
        if (['left', 'kicked'].includes(mainMember.status)) {
            return ctx.answerCbQuery(`❌ Сначала подпишитесь на наш главный канал t.me/togetheruniversechats!`, { show_alert: true });
        }

        // Проверка подписки на канал чата (если администратор его привязал через /setchannel)
        if (chatSettings && chatSettings.linkedChannel) {
            const chatMember = await ctx.telegram.getChatMember(chatSettings.linkedChannel, targetId);
            if (['left', 'kicked'].includes(chatMember.status)) {
                return ctx.answerCbQuery(`❌ Сначала подпишитесь на канал чата ${chatSettings.linkedChannel}!`, { show_alert: true });
            }
        }
    } catch (e) {
        return ctx.answerCbQuery("❌ Ошибка проверки. Убедитесь, что бот - администратор в каналах!", { show_alert: true });
    }

    try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
            permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true }
        });
    } catch (e) {}

    await User.updateOne({ userId: targetId }, { verified: true });
    await ctx.answerCbQuery("Успешно!");
    await ctx.editMessageText(`Успешно! ${ctx.from.first_name} прошел проверку и готов общаться! 🌟`);
});

bot.start(async (ctx) => {
    if (ctx.chat.type === 'private') {
        let user = await User.findOne({ userId: String(ctx.from.id) });
        if (!user) {
            await new User({ userId: String(ctx.from.id), username: ctx.from.username, verified: true }).save();
        } else {
            await User.updateOne({ userId: String(ctx.from.id) }, { verified: true });
        }
        return ctx.reply(`Привет, ${ctx.from.first_name}! 🌌 Твой паспорт Юниверса активирован.`, {
            reply_markup: { inline_keyboard: [[{ text: "✨ Открыть Hub", web_app: { url: MINI_APP_URL } }]] }
        });
    }
});

// Трекинг сообщений и капча-контроль
bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();

    if (ctx.chat.type !== 'private') {
        const userId = String(ctx.from.id);
        const user = await User.findOne({ userId });
        if (user && user.verified === false) {
            try { await ctx.deleteMessage(); } catch (e) {}
            return;
        }

        const username = ctx.from.username || ctx.from.first_name;
        const chatId = String(ctx.chat.id);
        
        await trackMessage(userId, username, chatId);
        const updatedUser = await User.findOne({ userId });
        const totalAll = updatedUser.chats[chatId].all;
        const hour = new Date().getHours();
        
        await checkAchievements(updatedUser, chatId, bot, totalAll, hour);
    }
    return next();
});

app.delete('/api/news/delete', async (req, res) => {
    try {
        const { newsId } = req.query;
        await News.deleteOne({ newsId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Получение списка баннеров
app.get('/api/banners', async (req, res) => {
    try {
        const banners = await Banner.find({});
        res.json(banners);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Добавление баннера
app.post('/api/banners/add', async (req, res) => {
    try {
        const { id, imageUrl, link } = req.body;
        await Banner.create({ id, imageUrl, link });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Удаление баннера
app.delete('/api/banners/delete', async (req, res) => {
    try {
        const { id } = req.query;
        await Banner.deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Сервер запущен на порту ${PORT}!`);
    await bot.telegram.setWebhook(`https://together-universe-bot.onrender.com/bot${process.env.BOT_TOKEN}`);
    console.log("Webhook установлен!");
});
