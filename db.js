const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://luniska366_db_user:france2021@togetheruniverse.jjuirxp.mongodb.net/TogetherUniverse?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Подключено к MongoDB!"))
    .catch(err => console.error("Ошибка базы:", err));

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    points: { type: Number, default: 0 },          // Звезды 🌟 (1 сообщение = 1 очко)
    season_currency: { type: Number, default: 0 },   // Сезонная валюта
    level: { type: Number, default: 1 },
    chats: { type: Object, default: {} },
    warnings: { type: Object, default: {} },
    isResting: { type: Boolean, default: false },
    description: { type: String, default: "" },      // Описание профиля (+описание)
    inventory: { type: Array, default: [] },         // Купленные товары (ID)
    achievements: { type: Array, default: [] },      // Полученные ачивки (ID)
    activeTitle: { type: String, default: null },    // Надетый титул
    activeFrame: { type: String, default: null },    // Надетая рамка
    verified: { type: Boolean, default: false }      // Прошла ли капча
});

const ShopItemSchema = new mongoose.Schema({
        itemId: { type: String, required: true, unique: true },
    name: String,
    price: Number,
    currency: { type: String, default: 'stars' }, // 'stars' или сезонная
    image: String,
    pinned: { type: Boolean, default: false },
    type: { type: String, default: 'other' }, // 'frame', 'title', 'achievement', 'merch', 'other'
    accessType: { type: String, default: 'permanent' }, // 'permanent', 'temporary', 'limited'
    eventId: { type: String, default: null }
});

const NewsSchema = new mongoose.Schema({
    newsId: { type: String, required: true, unique: true },
    title: String,
    text: String,
    mediaUrl: { type: String, default: null },       // Медиа/изображения
    date: { type: Date, default: Date.now }
});

const EventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    title: String,
    description: String,
    coverUrl: String,
    instructions: String,
    rewardType: String,                             // 'title', 'achievement', 'frame', 'currency'
    rewardValue: String,
    rewardAmount: { type: Number, default: 0 }
});

const User = mongoose.model('User', UserSchema);
const ShopItem = mongoose.model('ShopItem', ShopItemSchema);
const News = mongoose.model('News', NewsSchema);
const Event = mongoose.model('Event', EventSchema);

// Схема для настроек чатов (инфо-каналы и т.д.)
const chatSettingsSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    infoChannel: { type: String, default: null }
});

// Безопасное объявление модели, чтобы Mongoose не ругался при перезапуске
const ChatSettings = mongoose.models.ChatSettings || mongoose.model('ChatSettings', chatSettingsSchema);

// Функция определения сезонной валюты по дате (пункт 9)
function getCurrentSeasonCurrencySymbol() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Зимняя: 1 декабря - 28 февраля
    if (month === 12 || month === 1 || month === 2) return '❄️';
    // Любовная: 7 февраля - 21 февраля
    if (month === 2 && day >= 7 && day <= 21) return '💝';
    // Весенняя: 1 марта - 31 мая
    if (month >= 3 && month <= 5) return '🌸';
    // Летняя: 1 июня - 31 августа
    if (month >= 6 && month <= 8) return '🥥';
    // Осенняя: 1 сентября - 30 ноября
    if (month >= 9 && month <= 11) return '🍁';
    // Хеллоуинская: неделя до и неделя после 31 октября
    if ((month === 10 && day >= 24) || (month === 11 && day <= 7)) return '🎃';
    
    return '🌟';
}

async function trackMessage(userId, username, chatId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username, chats: {} });
    }

    if (!user.chats) user.chats = {};
    if (!user.chats[chatId]) {
        user.chats[chatId] = { day: 0, week: 0, month: 0, all: 0 };
    }

    // 1 сообщение = 1 очко (звезда) и 10 очков для левела
    user.points = (user.points || 0) + 1;
    user.season_currency = (user.season_currency || 0) + 1;
    
    // Левэлы (1 сообщение = 10 очков для прогрессии левела)
    const totalPointsForLevel = (user.points * 10);
    user.level = Math.floor(totalPointsForLevel / 500) + 1;

    user.chats[chatId].day += 1;
    user.chats[chatId].week += 1;
    user.chats[chatId].month += 1;
    user.chats[chatId].all += 1;

    user.markModified('chats');
    await user.save();
    return user;
}

const ChatSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    linkedChannel: { type: String, default: null }
});
const ChatModel = mongoose.model('ChatSettings', ChatSchema);

const BannerSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true },
    link: { type: String, default: null }
});

const Banner = mongoose.model('Banner', BannerSchema);


module.exports = { trackMessage, User, ShopItem, News, Event, Banner, ChatSettings, ChatModel, getCurrentSeasonCurrencySymbol };
