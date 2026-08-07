// db.js - модуль для работы с JSON-базой данных Together Universe
const fs = require('fs');
const DB_FILE = './users.json';

// Загрузка базы
function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Сохранение базы
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Инициализация (регистрация) пользователя
function registerUser(userId, username) {
    let db = loadDB();
    if (!db[userId]) {
        db[userId] = {
            username: username || "резидент",
            points: 0,
            warns: 0,
            messages_total: 0,
            chats: {} // Статистика по конкретным чатам
        };
        saveDB(db);
        return true;
    }
    return false;
}

module.exports = { loadDB, saveDB, registerUser };
