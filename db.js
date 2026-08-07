const fs = require('fs');
const DB_FILE = './users.json';

function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function registerUser(userId, username) {
    let db = loadDB();
    if (!db[userId]) {
        db[userId] = {
            username: username || "резидент",
            points: 0,
            warns: 0,
            messages_total: 0,
            chats: {} 
        };
        saveDB(db);
        return true;
    }
    return false;
}

// Функция учета сообщений для Ирис-статистики
function trackMessage(userId, username, chatId) {
    let db = loadDB();
    if (!db[userId]) {
        db[userId] = {
            username: username || "резидент",
            points: 0,
            warns: 0,
            messages_total: 0,
            chats: {}
        };
    }

    // Общий счетчик
    db[userId].messages_total += 1;
    db[userId].points += 1; // +1 очко за сообщение

    // Статистика по конкретному чату
    if (!db[userId].chats[chatId]) {
        db[userId].chats[chatId] = {
            day: 0,
            week: 0,
            month: 0,
            all: 0,
            last_reset_day: new Date().toDateString(),
            last_reset_week: getWeekNumber(new Date()),
            last_reset_month: new Date().getMonth()
        };
    }

    let chatStats = db[userId].chats[chatId];
    let now = new Date();

    // Сброс периодов (упрощенная проверка)
    if (chatStats.last_reset_day !== now.toDateString()) {
        chatStats.day = 0;
        chatStats.last_reset_day = now.toDateString();
    }
    if (chatStats.last_reset_month !== now.getMonth()) {
        chatStats.month = 0;
        chatStats.last_reset_month = now.getMonth();
    }

    chatStats.day += 1;
    chatStats.week += 1;
    chatStats.month += 1;
    chatStats.all += 1;

    saveDB(db);
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = { loadDB, saveDB, registerUser, trackMessage };
