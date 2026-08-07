const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://luniska366_db_user:france2021@togetheruniverse.jjuirxp.mongodb.net/TogetherUniverse?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Подключено к MongoDB!"))
    .catch(err => console.error("Ошибка базы:", err));

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    points: { type: Number, default: 0 },
    chats: { type: Object, default: {} }
});

const User = mongoose.model('User', UserSchema);

async function trackMessage(userId, username, chatId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username, chats: {} });
    }

    // Защита: если объект chats вообще отсутствует у старых записей
    if (!user.chats) {
        user.chats = {};
    }

    if (!user.chats[chatId]) {
        user.chats[chatId] = { day: 0, week: 0, month: 0, all: 0 };
    }

    user.points += 1;
    user.chats[chatId].day += 1;
    user.chats[chatId].week += 1;
    user.chats[chatId].month += 1;
    user.chats[chatId].all += 1;

    user.markModified('chats');
    await user.save();
}

module.exports = { trackMessage, User };
