const fs = require("fs");
const path = require("path");
const {
    DatabaseSync
} = require("node:sqlite");

const DATABASE_DIR =
    __dirname;

const DATABASE_PATH =
    path.join(
        DATABASE_DIR,
        "bartender.db"
    );


/*
 * Make sure the database directory exists.
 */

if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(
        DATABASE_DIR,
        {
            recursive: true
        }
    );
}


/*
 * Open database.
 */

const db =
    new DatabaseSync(
        DATABASE_PATH
    );


/*
 * Create tables.
 */

db.exec(`
    CREATE TABLE IF NOT EXISTS bot_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_messages INTEGER NOT NULL DEFAULT 0,
        total_commands INTEGER NOT NULL DEFAULT 0,
        total_songs_played INTEGER NOT NULL DEFAULT 0,
        total_mod_actions INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        messages INTEGER NOT NULL DEFAULT 0,
        commands INTEGER NOT NULL DEFAULT 0,
        songs_played INTEGER NOT NULL DEFAULT 0,
        mod_actions INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS command_usage (
        command TEXT PRIMARY KEY,
        uses INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS channel_activity (
        channel_id TEXT PRIMARY KEY,
        channel_name TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_activity (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        commands INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS member_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        event TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);


/*
 * Create the main statistics row.
 */

db.prepare(`
    INSERT OR IGNORE INTO bot_stats (
        id,
        started_at
    )
    VALUES (
        1,
        ?
    )
`).run(
    new Date().toISOString()
);


/*
 * Get today's date.
 */

function getDate() {
    return new Date()
        .toISOString()
        .slice(0, 10);
}


/*
 * Make sure today's statistics row exists.
 */

function ensureDailyStats() {
    db.prepare(`
        INSERT OR IGNORE INTO daily_stats (
            date
        )
        VALUES (
            ?
        )
    `).run(
        getDate()
    );
}


/*
 * Record a normal Discord message.
 */

function recordMessage(message) {
    if (!message) {
        return;
    }

    if (message.author?.bot) {
        return;
    }

    if (!message.guild) {
        return;
    }

    ensureDailyStats();


    /*
     * Global message count.
     */

    db.prepare(`
        UPDATE bot_stats
        SET total_messages =
            total_messages + 1
        WHERE id = 1
    `).run();


    /*
     * Daily message count.
     */

    db.prepare(`
        UPDATE daily_stats
        SET messages =
            messages + 1
        WHERE date = ?
    `).run(
        getDate()
    );


    /*
     * Channel statistics.
     */

    db.prepare(`
        INSERT INTO channel_activity (
            channel_id,
            channel_name,
            messages
        )
        VALUES (
            ?,
            ?,
            1
        )
        ON CONFLICT(channel_id)
        DO UPDATE SET
            channel_name =
                excluded.channel_name,
            messages =
                channel_activity.messages + 1
    `).run(
        message.channelId,
        message.channel?.name || "Unknown"
    );


    /*
     * User statistics.
     */

    db.prepare(`
        INSERT INTO user_activity (
            user_id,
            username,
            messages,
            commands
        )
        VALUES (
            ?,
            ?,
            1,
            0
        )
        ON CONFLICT(user_id)
        DO UPDATE SET
            username =
                excluded.username,
            messages =
                user_activity.messages + 1
    `).run(
        message.author.id,
        message.author.username
    );
}


/*
 * Record a slash command.
 */

function recordCommand(interaction) {
    if (!interaction) {
        return;
    }

    if (
        !interaction.isChatInputCommand()
    ) {
        return;
    }

    if (!interaction.guild) {
        return;
    }

    ensureDailyStats();

    const commandName =
        interaction.commandName;


    /*
     * Global command count.
     */

    db.prepare(`
        UPDATE bot_stats
        SET total_commands =
            total_commands + 1
        WHERE id = 1
    `).run();


    /*
     * Daily command count.
     */

    db.prepare(`
        UPDATE daily_stats
        SET commands =
            commands + 1
        WHERE date = ?
    `).run(
        getDate()
    );


    /*
     * Individual command usage.
     */

    db.prepare(`
        INSERT INTO command_usage (
            command,
            uses
        )
        VALUES (
            ?,
            1
        )
        ON CONFLICT(command)
        DO UPDATE SET
            uses =
                command_usage.uses + 1
    `).run(
        commandName
    );


    /*
     * User command statistics.
     */

    db.prepare(`
        INSERT INTO user_activity (
            user_id,
            username,
            messages,
            commands
        )
        VALUES (
            ?,
            ?,
            0,
            1
        )
        ON CONFLICT(user_id)
        DO UPDATE SET
            username =
                excluded.username,
            commands =
                user_activity.commands + 1
    `).run(
        interaction.user.id,
        interaction.user.username
    );
}


/*
 * Record a song being played.
 */

function recordSongPlayed() {
    ensureDailyStats();

    db.prepare(`
        UPDATE bot_stats
        SET total_songs_played =
            total_songs_played + 1
        WHERE id = 1
    `).run();

    db.prepare(`
        UPDATE daily_stats
        SET songs_played =
            songs_played + 1
        WHERE date = ?
    `).run(
        getDate()
    );
}


/*
 * Record a moderation action.
 */

function recordModerationAction() {
    ensureDailyStats();

    db.prepare(`
        UPDATE bot_stats
        SET total_mod_actions =
            total_mod_actions + 1
        WHERE id = 1
    `).run();

    db.prepare(`
        UPDATE daily_stats
        SET mod_actions =
            mod_actions + 1
        WHERE date = ?
    `).run(
        getDate()
    );
}


/*
 * Record a member joining.
 */

function recordMemberJoin(member) {
    if (!member?.user) {
        return;
    }

    db.prepare(`
        INSERT INTO member_events (
            user_id,
            username,
            event,
            created_at
        )
        VALUES (
            ?,
            ?,
            ?,
            ?
        )
    `).run(
        member.user.id,
        member.user.username,
        "join",
        new Date().toISOString()
    );
}


/*
 * Record a member leaving.
 */

function recordMemberLeave(member) {
    if (!member?.user) {
        return;
    }

    db.prepare(`
        INSERT INTO member_events (
            user_id,
            username,
            event,
            created_at
        )
        VALUES (
            ?,
            ?,
            ?,
            ?
        )
    `).run(
        member.user.id,
        member.user.username,
        "leave",
        new Date().toISOString()
    );
}


/*
 * Get overall statistics.
 */

function getOverview() {
    return db.prepare(`
        SELECT
            total_messages,
            total_commands,
            total_songs_played,
            total_mod_actions,
            started_at
        FROM bot_stats
        WHERE id = 1
    `).get();
}


/*
 * Get daily statistics.
 */

function getDailyStats(days = 30) {
    const safeDays =
        Math.max(
            1,
            Math.min(
                365,
                Number(days) || 30
            )
        );

    return db.prepare(`
        SELECT
            date,
            messages,
            commands,
            songs_played,
            mod_actions
        FROM daily_stats
        ORDER BY date DESC
        LIMIT ?
    `).all(
        safeDays
    );
}


/*
 * Get most-used commands.
 */

function getTopCommands(limit = 10) {
    const safeLimit =
        Math.max(
            1,
            Math.min(
                100,
                Number(limit) || 10
            )
        );

    return db.prepare(`
        SELECT
            command,
            uses
        FROM command_usage
        ORDER BY uses DESC
        LIMIT ?
    `).all(
        safeLimit
    );
}


/*
 * Get most active channels.
 */

function getTopChannels(limit = 10) {
    const safeLimit =
        Math.max(
            1,
            Math.min(
                100,
                Number(limit) || 10
            )
        );

    return db.prepare(`
        SELECT
            channel_id,
            channel_name,
            messages
        FROM channel_activity
        ORDER BY messages DESC
        LIMIT ?
    `).all(
        safeLimit
    );
}


/*
 * Get most active users.
 */

function getTopUsers(limit = 10) {
    const safeLimit =
        Math.max(
            1,
            Math.min(
                100,
                Number(limit) || 10
            )
        );

    return db.prepare(`
        SELECT
            user_id,
            username,
            messages,
            commands
        FROM user_activity
        ORDER BY messages DESC
        LIMIT ?
    `).all(
        safeLimit
    );
}


/*
 * Get recent joins/leaves.
 */

function getRecentMemberEvents(limit = 20) {
    const safeLimit =
        Math.max(
            1,
            Math.min(
                100,
                Number(limit) || 20
            )
        );

    return db.prepare(`
        SELECT
            user_id,
            username,
            event,
            created_at
        FROM member_events
        ORDER BY id DESC
        LIMIT ?
    `).all(
        safeLimit
    );
}


/*
 * Exports.
 */

module.exports = {
    recordMessage,
    recordCommand,
    recordSongPlayed,
    recordModerationAction,
    recordMemberJoin,
    recordMemberLeave,

    getOverview,
    getDailyStats,
    getTopCommands,
    getTopChannels,
    getTopUsers,
    getRecentMemberEvents
};
