const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://luniska366_db_user:france2021@togetheruniverse.jjuirxp.mongodb.net/TogetherUniverse?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Подключено к MongoDB!"))
    .catch(err => console.error("Ошибка базы:", err));

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    points: { type: Number, default: 0 },          // Звезды (1 сообщение = 10 очков, 1 звезда за сообщение)
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
    currency: { type: String, default: 'stars' },    // 'stars' или сезонные вайбы
    image: String,
    type: String,                                    // 'frame', 'title', 'achievement', 'merch', 'other'
    accessType: { type: String, default: 'permanent' }, // 'permanent', 'temporary', 'limited'
    eventId: { type: String, default: null }
});

const NewsSchema = new mongoose.Schema({
    newsId: { type: String, required: true, unique: true },
    title: String,
    text: String,
    mediaUrl: { type: String, default: null },
    date: { type: Date, default: Date.now }
});

const EventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    title: String,
    description: String,
    coverUrl: String,
    instructions: String,
    rewardType: String,                             // 'title', 'achievement', 'frame', 'currency'
    rewardValue: String
});

const User = mongoose.model('User', UserSchema);
const ShopItem = mongoose.model('ShopItem', ShopItemSchema);
const News = mongoose.model('News', NewsSchema);
const Event = mongoose.model('Event', EventSchema);

async function trackMessage(userId, username, chatId, messageTime = new Date()) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username, chats: {} });
    }

    if (!user.chats) {
        user.chats = {};
    }

    if (!user.chats[chatId]) {
        user.chats[chatId] = { day: 0, week: 0, month: 0, all: 0 };
    }

    // 1 сообщение = 10 очков для левела
    user.points = (user.points || 0) + 10;
    
    // Простейшая прогрессия уровней (каждые 500 очков новый левел, можешь скорректировать)
    user.level = Math.floor(user.points / 500) + 1;

    user.chats[chatId].day += 1;
    user.chats[chatId].week += 1;
    user.chats[chatId].month += 1;
    user.chats[chatId].all += 1;

    user.markModified('chats');
    await user.save();
    return user;
}

module.exports = { trackMessage, User, ShopItem, News, Event };
