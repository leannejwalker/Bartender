const fs = require("fs");
const path = require("path");

const DATABASE_FILE = path.join(
    __dirname,
    "../database/bartender-bucks.json"
);

const TEMP_FILE = `${DATABASE_FILE}.tmp`;

const MESSAGE_REWARD = 1;
const MESSAGE_COOLDOWN_MS = 30 * 1000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const messageCooldowns = new Map();

function ensureDatabase() {
    const directory = path.dirname(
        DATABASE_FILE
    );

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {
            recursive: true
        });
    }

    if (!fs.existsSync(DATABASE_FILE)) {
        fs.writeFileSync(
            DATABASE_FILE,
            JSON.stringify(
                {
                    users: {}
                },
                null,
                2
            )
        );
    }
}

function loadDatabase() {
    ensureDatabase();

    try {
        const content = fs.readFileSync(
            DATABASE_FILE,
            "utf8"
        );

        const database = JSON.parse(content);

        if (!database.users) {
            database.users = {};
        }

        return database;
    } catch (error) {
        console.error(
            "[Economy] Database load failed:",
            error
        );

        return {
            users: {}
        };
    }
}

function saveDatabase(database) {
    ensureDatabase();

    try {
        fs.writeFileSync(
            TEMP_FILE,
            JSON.stringify(
                database,
                null,
                2
            )
        );

        fs.renameSync(
            TEMP_FILE,
            DATABASE_FILE
        );
    } catch (error) {
        console.error(
            "[Economy] Database save failed:",
            error
        );

        throw error;
    }
}

function createUserRecord(
    userId,
    username = "Unknown"
) {
    return {
        userId,
        username,
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        lastDaily: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

function getUserRecord(
    database,
    userId,
    username = "Unknown"
) {
    if (!database.users[userId]) {
        database.users[userId] =
            createUserRecord(
                userId,
                username
            );
    }

    database.users[userId].username =
        username;

    database.users[userId].updatedAt =
        Date.now();

    return database.users[userId];
}

function getBalance(
    userId,
    username
) {
    const database = loadDatabase();

    const user = getUserRecord(
        database,
        userId,
        username
    );

    saveDatabase(database);

    return user.balance;
}

function addBalance(
    userId,
    amount,
    username
) {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        throw new Error(
            "Amount must be a positive integer."
        );
    }

    const database = loadDatabase();

    const user = getUserRecord(
        database,
        userId,
        username
    );

    user.balance += amount;
    user.totalEarned += amount;
    user.updatedAt = Date.now();

    saveDatabase(database);

    return user.balance;
}

function removeBalance(
    userId,
    amount,
    username
) {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        throw new Error(
            "Amount must be a positive integer."
        );
    }

    const database = loadDatabase();

    const user = getUserRecord(
        database,
        userId,
        username
    );

    if (user.balance < amount) {
        return {
            success: false,
            balance: user.balance
        };
    }

    user.balance -= amount;
    user.totalSpent += amount;
    user.updatedAt = Date.now();

    saveDatabase(database);

    return {
        success: true,
        balance: user.balance
    };
}

function transferBalance(
    senderId,
    senderName,
    recipientId,
    recipientName,
    amount
) {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        return {
            success: false,
            reason: "INVALID_AMOUNT"
        };
    }

    if (senderId === recipientId) {
        return {
            success: false,
            reason: "SAME_USER"
        };
    }

    const database = loadDatabase();

    const sender = getUserRecord(
        database,
        senderId,
        senderName
    );

    const recipient = getUserRecord(
        database,
        recipientId,
        recipientName
    );

    if (sender.balance < amount) {
        return {
            success: false,
            reason: "INSUFFICIENT_FUNDS",
            balance: sender.balance
        };
    }

    sender.balance -= amount;
    sender.totalSpent += amount;
    sender.updatedAt = Date.now();

    recipient.balance += amount;
    recipient.totalEarned += amount;
    recipient.updatedAt = Date.now();

    saveDatabase(database);

    return {
        success: true,
        senderBalance: sender.balance,
        recipientBalance:
            recipient.balance
    };
}

function claimDaily(
    userId,
    username
) {
    const database = loadDatabase();

    const user = getUserRecord(
        database,
        userId,
        username
    );

    const now = Date.now();

    const nextDaily =
        user.lastDaily +
        DAILY_COOLDOWN_MS;

    if (
        user.lastDaily > 0 &&
        now < nextDaily
    ) {
        return {
            success: false,
            nextDaily,
            remaining:
                nextDaily - now,
            balance: user.balance
        };
    }

    const reward =
        Math.floor(
            Math.random() * 101
        ) + 50;

    user.balance += reward;
    user.totalEarned += reward;
    user.lastDaily = now;
    user.updatedAt = now;

    saveDatabase(database);

    return {
        success: true,
        reward,
        balance: user.balance,
        nextDaily:
            now + DAILY_COOLDOWN_MS
    };
}

function rewardMessage(message) {
    if (!message.guild) {
        return false;
    }

    if (message.author.bot) {
        return false;
    }

    const content =
        message.content.trim();

    if (content.length < 3) {
        return false;
    }

    const cooldownKey =
        `${message.guild.id}:${message.author.id}`;

    const now = Date.now();

    const lastReward =
        messageCooldowns.get(
            cooldownKey
        ) || 0;

    if (
        now - lastReward <
        MESSAGE_COOLDOWN_MS
    ) {
        return false;
    }

    messageCooldowns.set(
        cooldownKey,
        now
    );

    addBalance(
        message.author.id,
        MESSAGE_REWARD,
        message.author.username
    );

    return true;
}

function getLeaderboard(limit = 10) {
    const database = loadDatabase();

    return Object.values(
        database.users
    )
        .filter(user => user.balance > 0)
        .sort(
            (first, second) =>
                second.balance -
                first.balance
        )
        .slice(0, limit);
}

function formatBucks(amount) {
    return new Intl.NumberFormat(
        "en-GB"
    ).format(amount);
}

function formatDuration(milliseconds) {
    const totalMinutes = Math.ceil(
        milliseconds / 60000
    );

    const hours = Math.floor(
        totalMinutes / 60
    );

    const minutes =
        totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}


function getEconomyReport() {
    const database = loadDatabase();

    const users = Object.values(
        database.users
    );

    const activeUsers = users.filter(
        user => user.balance > 0
    );

    const totalMoney =
        activeUsers.reduce(
            (total, user) =>
                total + user.balance,
            0
        );

    const averageBalance =
        activeUsers.length > 0
            ? Math.round(
                  totalMoney /
                      activeUsers.length
              )
            : 0;

    const richestUsers =
        activeUsers
            .sort(
                (a, b) =>
                    b.balance -
                    a.balance
            )
            .slice(0, 5);

    return {
        totalMoney,
        averageBalance,
        activeUsers:
            activeUsers.length,
        richestUsers
    };
}

module.exports = {
    getBalance,
    addBalance,
    removeBalance,
    transferBalance,
    claimDaily,
    rewardMessage,
    getLeaderboard,
    formatBucks,
    formatDuration,
    getEconomyReport
};