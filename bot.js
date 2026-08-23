const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const { User, ShopItem, News, Event, Banner, ChatSettings, trackMessage } = require('./db');

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

// Покупка товара в магазине
app.post('/api/shop/buy', async (req, res) => {
    try {
        const { userId, itemId } = req.body;
        const user = await User.findOne({ userId });
        const item = await ShopItem.findOne({ itemId });

                if (!user || !item) {
            return res.status(404).json({ error: "Пользователь или товар не найден" });
        }


        // Проверяем баланс (если товар не бесплатный)
        if (item.currency === 'stars' && item.price > 0) {
            if ((user.points || 0) < item.price) {
                return res.json({ success: false, error: "Недостаточно звезд 🌟" });
            }
            user.points -= item.price;
        } else if (item.currency === 'season' && item.price > 0) {
            if ((user.season_currency || 0) < item.price) {
                return res.json({ success: false, error: "Недостаточно сезонной валюты 🥥" });
            }
            user.season_currency -= item.price;
        }

        // Проверяем, не куплен ли уже товар
        if (!user.inventory) user.inventory = [];
        if (user.inventory.includes(item.itemId)) {
            return res.json({ success: false, error: "У вас уже есть этот товар!" });
        }
        user.inventory.push(item.itemId);

        // Применяем свойства в зависимости от типа товара
        if (item.type === 'frame') {
            user.activeFrame = item.name;
        } else if (item.type === 'title') {
            user.activeTitle = item.name;
        } else if (item.type === 'achievement') {
            if (!user.achievements) user.achievements = [];
            if (!user.achievements.includes(item.name)) {
                user.achievements.push(item.name);
            }
        }

        await user.save();

        // Отправляем уведомление в ЛС пользователю
        try {
            await bot.telegram.sendMessage(userId, `🎉 Поздравляем с покупкой!\n\nВы успешно приобрели: *${item.name}* 🛒`, { parse_mode: 'Markdown' });
        } catch (e) {}

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка при покупке" });
    }
});

// Обновленный эндпоинт получения магазина с сортировкой по закреплению
app.get('/api/shop', async (req, res) => {
    try {
        // Сначала закрепленные (pinned: true), потом остальные
        const items = await ShopItem.find({}).sort({ pinned: -1, _id: -1 });
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

// Эндпоинт для закрепления/открепления товара
app.post('/api/shop/pin', async (req, res) => {
    try {
        const { itemId, pinned } = req.body;
        await ShopItem.updateOne({ itemId }, { pinned });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка закрепления" });
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

// --- СИСТЕМА КАЛЛОВ (ПО ПАРТИЯМ ПО 5 ЧЕЛОВЕК) И АНРЕГ ---

// Команда анрег (отключить каллы на 24 часа)
bot.hears(/^анрег$/i, async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Эта команда работает только в чатах!');
    const userId = String(ctx.from.id);

    try {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, username: ctx.from.username || ctx.from.first_name });
        }

        // Ставим блок на 24 часа
        const unregTime = Date.now() + 24 * 60 * 60 * 1000;
        user.unregUntil = unregTime;
        await user.save();

        ctx.reply(`🔕 @${user.username || 'Резидент'}, вы успешно ушли в «анрег» на 24 часа! Вас больше не будут тегать в каллах.`);
    } catch (e) {
        console.error("Ошибка анрега:", e);
        ctx.reply('⚠️ Не удалось оформить анрег.');
    }
});

// Умный калл по всем участникам чата (партиями по 5 человек)
bot.hears(/^калл(?:\s+(.+))?/i, async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Эта команда работает только в чатах!');
    const callText = ctx.match[1] || 'Внимание всем!';
    const chatId = String(ctx.chat.id);
    const now = Date.now();

    try {
        // 1. Получаем ВСЕХ участников, которые вообще есть в базе данных бота
        const allUsers = await User.find({});
        
        let validUsers = [];
        for (const u of allUsers) {
            // Проверяем, не стоит ли у пользователя активный анрег (прошло ли 24 часа)
            if (u.unregUntil && u.unregUntil > now) {
                continue; // Пропускаем тех, кто отдыхает
            }

            // Достаем юзернейм
            if (u.username) {
                // Проверяем, состоит ли пользователь в этом чате реально через Telegram API
                try {
                    const memberInfo = await ctx.telegram.getChatMember(chatId, u.userId);
                    // Если он не покинул чат и не забанен
                    if (!['left', 'kicked'].includes(memberInfo.status)) {
                        validUsers.push(`@${u.username}`);
                    }
                } catch (err) {
                    // Если бот не смог проверить (например, юзер долго не писал), 
                    // но он есть в базе и писал раньше — всё равно добавим на всякий случай
                    validUsers.push(`@${u.username}`);
                }
            }
        }

        // Убираем дубликаты на всякий случай
        validUsers = [...new Set(validUsers)];

        if (validUsers.length === 0) {
            return ctx.reply('❌ В базе нет активных пользователей для калла!');
        }

        await ctx.reply(`📢 *КАЛЛ:* ${callText}\n(Рассылаю теги партиями по 5 человек...)`, { parse_mode: 'Markdown' });

        // 2. Делим список пользователей на пачки по 5 человек
        const chunkSize = 5;
        for (let i = 0; i < validUsers.length; i += chunkSize) {
            const chunk = validUsers.slice(i, i + chunkSize);
            const tagsString = chunk.join(' ');

            // Отправляем пачку сообщением
            await ctx.reply(`💬 Пакет ${Math.floor(i / chunkSize) + 1}:\n${tagsString}`);

            // Делаем небольшую паузу в 1 секунду между сообщениями, чтобы Telegram не заспамил чат
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

    } catch (e) {
        console.error("ОШИБКА КАЛЛА:", e);
        ctx.reply(`⚠️ Произошла ошибка при выполнении калла: ${e.message}`);
    }
});

// Дублируем для синонима /callall
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
        try {
            // Пропускаем создателя и администраторов чата
            const memberInfo = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
            if (['creator', 'administrator'].includes(memberInfo.status)) {
                const userId = String(ctx.from.id);
                const username = ctx.from.username || ctx.from.first_name;
                const chatId = String(ctx.chat.id);
                await trackMessage(userId, username, chatId);
                return next();
            }

            // Проверяем подписку на главный канал для обычных участников
            const mainSub = await ctx.telegram.getChatMember('@togetheruniversechats', ctx.from.id);
            if (['left', 'kicked'].includes(mainSub.status)) {
                try { await ctx.deleteMessage(); } catch (e) {} // Удаляем сообщение того, кто не подписан
                return;
            }
        } catch (e) {}

        // Если всё проверено и ок, трекаем сообщение и достижения
        const userId = String(ctx.from.id);
        const username = ctx.from.username || ctx.from.first_name;
        const chatId = String(ctx.chat.id);
        
        await trackMessage(userId, username, chatId);
        const updatedUser = await User.findOne({ userId });
        if (updatedUser && updatedUser.chats && updatedUser.chats[chatId]) {
            const totalAll = updatedUser.chats[chatId].all;
            const hour = new Date().getHours();
            await checkAchievements(updatedUser, chatId, bot, totalAll, hour);
        }
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

// Изменение порядка баннеров
app.post('/api/banners/reorder', async (req, res) => {
    try {
        const { banners } = req.body; // Ожидает массив объектов в новом порядке
        // Очищаем старые и записываем заново в нужном порядке
        await Banner.deleteMany({});
        if (banners && banners.length > 0) {
            await Banner.insertMany(banners);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Команда только для тебя: /give @username количество
bot.command('give', async (ctx) => {
    const adminId = 8970685551; // Твой Telegram ID

    if (ctx.from.id !== adminId) {
        return ctx.reply('У вас нет прав для использования этой команды! 🛑');
    }

    const args = ctx.message.text.split(' ');

    if (args.length !== 3) {
        return ctx.reply('Используй формат: /give @username [число очков]');
    }

    const targetUsername = args[1].replace('@', ''); // Убираем @ если есть
    const pointsToAdd = parseInt(args[2]);

    if (isNaN(pointsToAdd)) {
        return ctx.reply('Количество очков должно быть числом!');
    }

    try {
        // Ищем пользователя в базе по его юзернейму и добавляем очки
        const user = await User.findOneAndUpdate(
            { username: targetUsername }, 
            { $inc: { points: pointsToAdd } }, 
            { new: true }
        );

        if (user) {
            ctx.reply(`✅ Успешно! Пользователю @${targetUsername} добавлено ${pointsToAdd} очков. Теперь у него: ${user.points} 🌟`);
        } else {
            ctx.reply(`❌ Пользователь @${targetUsername} не найден в базе. Пусть он сначала напишет что-нибудь в чат, чтобы бот его запомнил!`);
        }
    } catch (error) {
        console.error(error);
        ctx.reply('Произошла ошибка при выдаче очков.');
    }
});

// Команда для переноса сообщений из Ириса: /import_msg @username [кол-во сообщений]
bot.command('import_msg', async (ctx) => {
    const adminId = 8970685551; // Твой Telegram ID

    if (ctx.from.id !== adminId) {
        return ctx.reply('У вас нет прав для использования этой команды! 🛑');
    }

    const args = ctx.message.text.split(' ');

    if (args.length !== 3) {
        return ctx.reply('Используй формат: /import_msg @username [количество]');
    }

    const targetUsername = args[1].replace('@', '');
    const msgToAdd = parseInt(args[2]);

    if (isNaN(msgToAdd)) {
        return ctx.reply('Количество сообщений должно быть числом!');
    }

    const chatId = String(ctx.chat.id);

    try {
        let user = await User.findOne({ username: targetUsername });
        
        if (!user) {
            return ctx.reply(`❌ Пользователь @${targetUsername} не найден в базе. Пусть сначала напишет что-нибудь в чат!`);
        }

        // Начисляем сообщения в общие очки и сезонную валюту
        user.points = (user.points || 0) + msgToAdd;
        user.season_currency = (user.season_currency || 0) + msgToAdd;

        // Пересчитываем левел (по твоей логике: 1 сообщение = 10 очков для прогрессии, 500 очков = 1 левел)
        const totalPointsForLevel = user.points * 10;
        user.level = Math.floor(totalPointsForLevel / 500) + 1;

        // Инициализируем объект чатов, если его не было
        if (!user.chats) user.chats = {};
        if (!user.chats[chatId]) {
            user.chats[chatId] = { day: 0, week: 0, month: 0, all: 0 };
        }

        // Добавляем сообщения в статистику этого чата
        user.chats[chatId].day += msgToAdd;
        user.chats[chatId].week += msgToAdd;
        user.chats[chatId].month += msgToAdd;
        user.chats[chatId].all += msgToAdd;

        user.markModified('chats');
        await user.save();

        ctx.reply(`✅ Успешно! Пользователю @${targetUsername} перенесено ${msgToAdd} сообщений из Ириса. Теперь у него в этом чате всего сообщений: ${user.chats[chatId].all} 💬 (и ${user.points} 🌟 очков)`);
    } catch (error) {
        console.error(error);
        ctx.reply('Произошла ошибка при переносе сообщений.');
    }
});

// Обработка новых участников в чате
bot.on('new_chat_members', async (ctx) => {
    try {
        for (let member of ctx.message.new_chat_members) {
            if (member.id === ctx.botInfo.id) continue;

            const userId = member.id;
            const name = member.first_name || 'Новичок';
            const chatId = String(ctx.chat.id);

            

            // Ищем привязанный инфо-канал чата
            let chatSettings = null;
            try {
                chatSettings = await ChatSettings.findOne({ chatId: chatId });
            } catch (err) {}

            // Формируем кнопки
            const inlineKeyboard = [
                [ { text: '📢 Подписаться на основной канал', url: 'https://t.me/togetheruniversechats' } ]
            ];

            if (chatSettings && chatSettings.infoChannel) {
                inlineKeyboard.push([ { text: '📌 Инфо этого чата', url: chatSettings.infoChannel } ]);
            }

            inlineKeyboard.push([ { text: '✅ Я подписался', callback_data: `check_sub_${userId}` } ]);

            // 2. Отправляем сообщение с требованием подписки
            await ctx.reply(
                `👋 Привет, [${name}](tg://user?id=${userId})!\n\n` +
                `💡 Для отправки сообщений в этом чате необходимо подписаться на каналы ниже и нажать кнопку подтверждения.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: inlineKeyboard }
                }
            );
        }
    } catch (e) {
        console.error("Ошибка при входе нового участника:", e);
    }
});

bot.action(/^check_sub_(\d+)$/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    
    // Нажать может только сам пользователь или ты (админ)
    if (ctx.from.id !== targetUserId && ctx.from.id !== 8970685551) {
        return ctx.answerCbQuery('Эту кнопку может нажать только сам участник! 🛑', { show_alert: true });
    }

    const chatId = String(ctx.chat.id);
    const MAIN_CHANNEL = '@togetheruniversechats';

    try {
        // 1. Проверяем главный канал
        const mainMember = await ctx.telegram.getChatMember(MAIN_CHANNEL, targetUserId);
        const isMainSubscribed = ['creator', 'administrator', 'member'].includes(mainMember.status);

        if (!isMainSubscribed) {
            return ctx.answerCbQuery('❌ Вы еще не подписались на главный канал!', { show_alert: true });
        }

        // 2. Проверяем инфо-канал чата (если он у этого чата настроен)
        let chatSettings = await ChatSettings.findOne({ chatId: chatId });
        if (chatSettings && chatSettings.infoChannel) {
            // Извлекаем юзернейм из ссылки (например, из https://t.me/durov делаем @durov)
            let infoChan = chatSettings.infoChannel;
            if (infoChan.includes('t.me/')) {
                infoChan = '@' + infoChan.split('t.me/').pop().replace('/', '');
            }

            try {
                const infoMember = await ctx.telegram.getChatMember(infoChan, targetUserId);
                const isInfoSubscribed = ['creator', 'administrator', 'member'].includes(infoMember.status);
                if (!isInfoSubscribed) {
                    return ctx.answerCbQuery(`❌ Вы не подписались на инфо-канал этого чата (${infoChan})!`, { show_alert: true });
                }
            } catch (err) {
                console.error("Ошибка проверки инфо-канала:", err);
            }
        }

        // 3. Если везде подписан — возвращаем права на отправку сообщений (снимаем мут)
        await ctx.telegram.restrictChatMember(ctx.chat.id, targetUserId, {
            permissions: { 
                can_send_messages: true, 
                can_send_media_messages: true, 
                can_send_other_messages: true,
                can_add_web_page_previews: true 
            }
        });

        await ctx.editMessageText('✅ Подписка подтверждена! Добро пожаловать в чат, ограничения сняты. 🎉');
    } catch (e) {
        console.error("Ошибка проверки подписки:", e);
        await ctx.answerCbQuery('⚠️ Ошибка проверки. Убедитесь, что бот назначен администратором в каналах!', { show_alert: true });
    }
});


// Команда для установки инфо-канала конкретного чата: /setinfotg https://t.me/chat_info_channel
bot.command('setinfotg', async (ctx) => {
    // Проверяем, что команду пишет админ или создатель чата
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (!['creator', 'administrator'].includes(member.status)) {
            return ctx.reply('Эту команду могут использовать только администраторы чата! 🛑');
        }

        const args = ctx.message.text.split(' ');
        if (args.length !== 2) {
            return ctx.reply('Используй формат: /setinfotg [ссылка или юзернейм канала]');
        }

        let channelLink = args[1];
        // Если пользователь ввел просто юзернейм без ссылки, приведем к виду https://t.me/...
        if (!channelLink.startsWith('http') && channelLink.startsWith('@')) {
            channelLink = `https://t.me/${channelLink.replace('@', '')}`;
        }

        const chatId = String(ctx.chat.id);

        // Сохраняем инфо-канал для этого конкретного чата в базе (предполагаем, что у тебя есть модель Chat)
        // Если модели чата нет отдельно, можно хранить в настройках бота или через общую схему
        await ChatSettings.findOneAndUpdate(
            { chatId: chatId },
            { infoChannel: channelLink },
            { upsert: true, new: true }
        );

        ctx.reply(`✅ Инфо-канал для этого чата успешно обновлен: ${channelLink} 📢`);
    } catch (e) {
        console.error("Ошибка при установке инфо-канала:", e);
        ctx.reply('⚠️ Не удалось обновить инфо-канал. Убедитесь, что бот является администратором.');
    }
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
