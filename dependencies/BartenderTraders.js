const fs = require("node:fs");
const path = require("node:path");

const { EmbedBuilder } = require("discord.js");

const stocksCommand = require(
    "../commands/economy/stocks"
);

const STATE_FILE = path.join(
    __dirname,
    "../database/bartender-traders.json"
);
const TEMP_FILE = `${STATE_FILE}.tmp`;

const CHECK_INTERVAL_MS = 60 * 1000;
const MAJOR_MOVE_THRESHOLD = 0.05;

let checkRunning = false;
let intervalHandle = null;

function ensureStateFile() {
    const directory = path.dirname(STATE_FILE);

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {
            recursive: true
        });
    }

    if (!fs.existsSync(STATE_FILE)) {
        fs.writeFileSync(
            STATE_FILE,
            JSON.stringify(
                {
                    allTimeHighs: {},
                    allTimeLows: {},
                    lastNotificationAt: 0
                },
                null,
                2
            ),
            "utf8"
        );
    }
}

function loadState() {
    ensureStateFile();

    try {
        const state = JSON.parse(
            fs.readFileSync(
                STATE_FILE,
                "utf8"
            )
        );

        if (!state.allTimeHighs) {
            state.allTimeHighs = {};
        }

        if (!state.allTimeLows) {
            state.allTimeLows = {};
        }

        return state;
    } catch (error) {
        console.error(
            "[Bartender Traders] Could not load notification state:",
            error
        );

        return {
            allTimeHighs: {},
            allTimeLows: {},
            lastNotificationAt: 0
        };
    }
}

function saveState(state) {
    ensureStateFile();

    fs.writeFileSync(
        TEMP_FILE,
        JSON.stringify(state, null, 2),
        "utf8"
    );
    fs.renameSync(TEMP_FILE, STATE_FILE);
}

function formatBucks(amount) {
    return new Intl.NumberFormat(
        "en-GB"
    ).format(amount);
}

function formatPercent(value) {
    const percentage = value * 100;
    const sign = percentage > 0 ? "+" : "";

    return `${sign}${percentage.toFixed(2)}%`;
}

function movementEmoji(change) {
    if (change > 0) return "📈";
    if (change < 0) return "📉";
    return "➖";
}

function movementColour(change) {
    if (change > 0) return 0x57f287;
    if (change < 0) return 0xed4245;
    return 0xfee75c;
}

function calculateChange(beforePrice, afterPrice) {
    if (!beforePrice) {
        return 0;
    }

    return (
        afterPrice - beforePrice
    ) / beforePrice;
}

function buildMarketUpdateEmbed(result) {
    const movers = result.companies
        .map(company => {
            const beforePrice =
                result.before[company.ticker].price;
            const afterPrice =
                result.after[company.ticker].price;
            const change = calculateChange(
                beforePrice,
                afterPrice
            );

            return {
                company,
                beforePrice,
                afterPrice,
                change
            };
        })
        .sort((first, second) => {
            return Math.abs(second.change) -
                Math.abs(first.change);
        });

    const biggestMover = movers[0];

    const lines = movers.map(entry => {
        return (
            `${movementEmoji(entry.change)} ` +
            `**${entry.company.ticker}** ` +
            `${formatBucks(entry.afterPrice)} BB ` +
            `(**${formatPercent(entry.change)}**)`
        );
    });

    return new EmbedBuilder()
        .setColor(
            movementColour(
                biggestMover?.change || 0
            )
        )
        .setAuthor({
            name: "Bartender Traders • Market Update"
        })
        .setTitle("📱 Your market update has arrived")
        .setDescription(
            [
                `📰 **${result.latestNews}**`,
                "",
                ...lines
            ].join("\n")
        )
        .setFooter({
            text:
                "Fictional shares • Virtual Bartender Bucks only"
        })
        .setTimestamp(
            new Date(
                result.lastMarketUpdate
            )
        );
}

function findRecordAlerts(result, state) {
    const alerts = [];

    for (const company of result.companies) {
        const currentPrice =
            result.after[company.ticker].price;

        const previousHigh = Number(
            state.allTimeHighs[company.ticker]
        );
        const previousLow = Number(
            state.allTimeLows[company.ticker]
        );

        if (!previousHigh) {
            state.allTimeHighs[company.ticker] =
                currentPrice;
        } else if (currentPrice > previousHigh) {
            alerts.push({
                type: "high",
                company,
                price: currentPrice,
                previous: previousHigh
            });
            state.allTimeHighs[company.ticker] =
                currentPrice;
        }

        if (!previousLow) {
            state.allTimeLows[company.ticker] =
                currentPrice;
        } else if (currentPrice < previousLow) {
            alerts.push({
                type: "low",
                company,
                price: currentPrice,
                previous: previousLow
            });
            state.allTimeLows[company.ticker] =
                currentPrice;
        }
    }

    return alerts;
}

function buildRecordEmbed(alert) {
    const isHigh = alert.type === "high";

    return new EmbedBuilder()
        .setColor(
            isHigh
                ? 0x57f287
                : 0xed4245
        )
        .setAuthor({
            name: "Bartender Traders • Price Alert"
        })
        .setTitle(
            isHigh
                ? "🏆 New all-time high"
                : "⚠️ New all-time low"
        )
        .setDescription(
            [
                `${alert.company.emoji} **${alert.company.ticker} • ${alert.company.name}**`,
                "",
                isHigh
                    ? "The share has reached a new record price."
                    : "The share has fallen to a new record low.",
                "",
                `Previous record: **${formatBucks(alert.previous)} BB**`,
                `New record: **${formatBucks(alert.price)} BB**`
            ].join("\n")
        )
        .setFooter({
            text:
                "Fictional shares • Virtual Bartender Bucks only"
        })
        .setTimestamp();
}

function findMajorMovers(result) {
    return result.companies
        .map(company => {
            const beforePrice =
                result.before[company.ticker].price;
            const afterPrice =
                result.after[company.ticker].price;
            const change = calculateChange(
                beforePrice,
                afterPrice
            );

            return {
                company,
                beforePrice,
                afterPrice,
                change
            };
        })
        .filter(entry => {
            return Math.abs(entry.change) >=
                MAJOR_MOVE_THRESHOLD;
        });
}

function buildMajorMoverEmbed(entry) {
    const rising = entry.change > 0;

    return new EmbedBuilder()
        .setColor(
            rising
                ? 0x57f287
                : 0xed4245
        )
        .setAuthor({
            name: "Bartender Traders • Breaking Alert"
        })
        .setTitle(
            rising
                ? "🚀 Major price rise"
                : "🚨 Major price fall"
        )
        .setDescription(
            [
                `${entry.company.emoji} **${entry.company.ticker} • ${entry.company.name}**`,
                "",
                `Movement: **${formatPercent(entry.change)}**`,
                `Previous price: **${formatBucks(entry.beforePrice)} BB**`,
                `Current price: **${formatBucks(entry.afterPrice)} BB**`
            ].join("\n")
        )
        .setFooter({
            text:
                "Fictional shares • Virtual Bartender Bucks only"
        })
        .setTimestamp();
}

async function getNotificationChannel(client) {
    const channelId =
        process.env.STOCK_NEWS_CHANNEL_ID;

    if (!channelId) {
        console.error(
            "[Bartender Traders] STOCK_NEWS_CHANNEL_ID is missing from .env"
        );
        return null;
    }

    try {
        const channel = await client.channels.fetch(
            channelId
        );

        if (!channel || !channel.isTextBased()) {
            console.error(
                "[Bartender Traders] STOCK_NEWS_CHANNEL_ID is not a text channel."
            );
            return null;
        }

        return channel;
    } catch (error) {
        console.error(
            "[Bartender Traders] Could not fetch the notification channel:",
            error.message
        );
        return null;
    }
}

async function runNotificationCheck(client) {
    if (checkRunning) {
        return;
    }

    checkRunning = true;

    try {
        if (
            typeof stocksCommand.runScheduledMarketUpdates !==
            "function"
        ) {
            throw new Error(
                "stocks.js does not export runScheduledMarketUpdates"
            );
        }

        const channel = await getNotificationChannel(
            client
        );

        if (!channel) {
            return;
        }

        const result =
            stocksCommand.runScheduledMarketUpdates();

        if (!result.updated) {
            return;
        }

        const state = loadState();

        await channel.send({
            embeds: [
                buildMarketUpdateEmbed(result)
            ]
        });

        const majorMovers = findMajorMovers(
            result
        );

        for (const mover of majorMovers) {
            await channel.send({
                embeds: [
                    buildMajorMoverEmbed(mover)
                ]
            });
        }

        const recordAlerts = findRecordAlerts(
            result,
            state
        );

        for (const alert of recordAlerts) {
            await channel.send({
                embeds: [
                    buildRecordEmbed(alert)
                ]
            });
        }

        state.lastNotificationAt = Date.now();
        saveState(state);

        console.log(
            "[Bartender Traders] Market notification posted."
        );
    } catch (error) {
        console.error(
            "[Bartender Traders] Notification check failed:",
            error
        );
    } finally {
        checkRunning = false;
    }
}

function startBartenderTraders(client) {
    if (!process.env.STOCK_NEWS_CHANNEL_ID) {
        console.error(
            "[Bartender Traders] STOCK_NEWS_CHANNEL_ID is missing from .env"
        );
        return;
    }

    if (intervalHandle) {
        clearInterval(intervalHandle);
    }

    runNotificationCheck(client).catch(error => {
        console.error(
            "[Bartender Traders] Initial check failed:",
            error
        );
    });

    intervalHandle = setInterval(() => {
        runNotificationCheck(client).catch(error => {
            console.error(
                "[Bartender Traders] Scheduled check failed:",
                error
            );
        });
    }, CHECK_INTERVAL_MS);

    console.log(
        "[Bartender Traders] Monitoring the market for channel alerts."
    );
}

module.exports = {
    startBartenderTraders
};
