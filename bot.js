const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { User, ShopItem, News, Event, Banner } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || "8708472061:AAGsyYm8RhgDlqpyeEiGwYlbnXFZwKdTI2M";
const bot = new Telegraf(BOT_TOKEN);
const MINI_APP_URL = "https://luniska366-bot.github.io/together-universe-bot/";

// Функция трекинга сообщений (если её не было в db.js, определяем здесь)
async function trackMessage(userId, username, chatId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username, chats: {} });
    }
    if (!user.chats) user.chats = {};
    if (!user.chats[chatId]) {
        user.chats[chatId] = { all: 0, day: 0, week: 0, month: 0 };
    }
    user.chats[chatId].all += 1;
    user.chats[chatId].day = (user.chats[chatId].day || 0) + 1;
    user.chats[chatId].week = (user.chats[chatId].week || 0) + 1;
    user.chats[chatId].month = (user.chats[chatId].month || 0) + 1;
    user.username = username;
    await user.save();
}

// --- API ДЛЯ MINI APP ---

app.get('/api/user-data', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.query.userId });
        res.json(user || { points: 0, level: 1, season_currency: 0, achievements: [], inventory: [] });
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

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

app.post('/api/set-frame', async (req, res) => {
    try {
        const { userId, frameId } = req.body;
        await User.updateOne({ userId }, { activeFrame: frameId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
    }
});

app.get('/api/shop', async (req, res) => {
    try {
        const items = await ShopItem.find({});
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: "Ошибка" });
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

// --- ДОСТИЖЕНИЯ ---
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
    try { await botInstance.telegram.sendMessage(user.userId, text, { parse_mode: 'Markdown' }); } catch (e) {}
    if (chatId) {
        try { await botInstance.telegram.sendMessage(chatId, `🎉 Пользователь @${user.username || 'резидент'} разблокировал достижение: *${achName}*!`, { parse_mode: 'Markdown' }); } catch (e) {}
    }
}

// --- КОМАНДЫ БОТА ---

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
            await ctx.reply(`📢 КАЛЛ: ${callText}\n\n${tags}`);
        } else {
            await ctx.reply('В этом чате пока никто не написал ни одного сообщения!');
        }
    } catch (e) {
        console.error("ТОЧНАЯ ОШИБКА КАЛЛА:", e);
    }
});

bot.hears(/^\/callall(?:\s+(.+))?/i, async (ctx) => {
    ctx.message.text = ctx.message.text.replace('/callall', 'калл');
    return bot.handleUpdate(ctx.update);
});

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

bot.hears(/^пред$/i, async (ctx) => {
    if (!ctx.message.reply_to_message) return ctx.reply('Ответьте на сообщение командой "пред"');
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
        `💬 Статус: ${user.description || 'Не указан'}\n` +
        `🌟 Очки: ${user.points || 0} (Левел ${user.level || 1})\n` +
        `📊 Сообщений в чате: ${stats.all}`;

    ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.start(async (ctx) => {
    if (ctx.chat.type === 'private') {
        let user = await User.findOne({ userId: String(ctx.from.id) });
        if (!user) {
            await new User({ userId: String(ctx.from.id), username: ctx.from.username, verified: true }).save();
        }
        return ctx.reply(`Привет, ${ctx.from.first_name}! 🌌 Твой паспорт Юниверса активирован.`, {
            reply_markup: { inline_keyboard: [[{ text: "✨ Открыть Hub", web_app: { url: MINI_APP_URL } }]] }
        });
    }
});

bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();

    if (ctx.chat.type !== 'private') {
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

app.delete('/api/shop/delete', async (req, res) => {
    try {
        const { itemId } = req.query;
        await ShopItem.deleteOne({ itemId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/banners', async (req, res) => {
    try {
        const banners = await Banner.find({});
        res.json(banners);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/banners/add', async (req, res) => {
    try {
        const { id, imageUrl, link } = req.body;
        await Banner.create({ id, imageUrl, link });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/banners/delete', async (req, res) => {
    try {
        const { id } = req.query;
        await Banner.deleteOne({ id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

const PORT = process.env.PORT || 10000;

// ЗАПУСК С ПОДКЛЮЧЕНИЕМ К БАЗЕ ДАННЫХ
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Успешно подключились к MongoDB!");

        app.listen(PORT, '0.0.0.0', async () => {
            console.log(`Сервер запущен на порту ${PORT}!`);
            await bot.telegram.setWebhook(`https://together-universe-bot.onrender.com/bot${BOT_TOKEN}`);
            console.log("Webhook установлен!");
        });
    } catch (e) {
        console.error("Ошибка при подключении к базе данных:", e);
    }
}

startServer();
