const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    points: { type: Number, default: 0 },
    season_currency: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    activeTitle: { type: String, default: '' },
    activeFrame: { type: String, default: '' },
    achievements: { type: Array, default: [] },
    inventory: { type: Array, default: [] }
});

const newsSchema = new mongoose.Schema({
    newsId: String,
    title: String,
    text: String,
    mediaUrl: String
});

const shopItemSchema = new mongoose.Schema({
    itemId: String,
    name: String,
    price: Number,
    currency: String,
    type: String,
    accessType: String,
    image: String
});

const eventSchema = new mongoose.Schema({
    eventId: String,
    title: String,
    description: String,
    rewardValue: String,
    coverUrl: String
});

// Схема для WB-баннеров
const bannerSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true },
    link: { type: String, default: '' }
});

const User = mongoose.model('User', userSchema);
const News = mongoose.model('News', newsSchema);
const ShopItem = mongoose.model('ShopItem', shopItemSchema);
const Event = mongoose.model('Event', eventSchema);
const Banner = mongoose.model('Banner', bannerSchema);

module.exports = {
    User,
    News,
    ShopItem,
    Event,
    Banner
};
