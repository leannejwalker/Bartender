const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const economy = require("../../dependencies/EconomyManager");

const DATABASE_FILE = path.join(
    __dirname,
    "../../database/stocks.json"
);
const TEMP_FILE = `${DATABASE_FILE}.tmp`;
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const MAX_CATCH_UPDATES = 48;
const MAX_SHARES_PER_TRANSACTION = 10000;

/* Random volatility and crash safeguards. */
const MIN_RANDOM_VOLATILITY = 0.005;
const MAX_RANDOM_VOLATILITY = 0.03;
const MAX_NORMAL_DROP = 0.025;
const MAX_NEWS_DROP = 0.04;
const MAX_TOTAL_RISE = 0.08;
const SOFT_24H_DROP_LIMIT = 0.15;
const HARD_24H_DROP_LIMIT = 0.25;
const SOFT_LIMIT_MAX_DROP = 0.01;
const PRICE_FLOOR = 1;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

const activeTransactions = new Set();

const COMPANIES = [
    {
        ticker: "AHP",
        name: "After Hours Pubs",
        description: "A late-opening pub group with ambitious expansion plans.",
        emoji: "🍺",
        startingPrice: 100,
        volatility: 0.05
    },
    {
        ticker: "BRS",
        name: "Bartender Breweries",
        description: "Producer of drinks and questionable seasonal specials.",
        emoji: "🍻",
        startingPrice: 75,
        volatility: 0.06
    },
    {
        ticker: "MUG",
        name: "Golden Mug Holdings",
        description: "A hospitality investment company with a very expensive logo.",
        emoji: "🏆",
        startingPrice: 150,
        volatility: 0.04
    },
    {
        ticker: "JBL",
        name: "Jukebox Live",
        description: "Music, entertainment and temperamental jukeboxes.",
        emoji: "🎵",
        startingPrice: 60,
        volatility: 0.08
    },
    {
        ticker: "DCL",
        name: "Dodgy Cab Limited",
        description: "Transport services with flexible routes and optimistic arrival times.",
        emoji: "🚕",
        startingPrice: 35,
        volatility: 0.12
    },
    {
        ticker: "CRP",
        name: "Crisps & Pork Scratchings PLC",
        description: "A major supplier of essential bar snacks.",
        emoji: "🥜",
        startingPrice: 45,
        volatility: 0.07
    }
];

const MARKET_EVENTS = [
    {
        ticker: "AHP",
        headline: "After Hours Pubs reports record weekend sales.",
        minChange: 0.08,
        maxChange: 0.18
    },
    {
        ticker: "AHP",
        headline: "After Hours Pubs receives a large furniture repair bill.",
        minChange: -0.16,
        maxChange: -0.06
    },
    {
        ticker: "BRS",
        headline: "Bartender Breweries launches a popular new drink.",
        minChange: 0.07,
        maxChange: 0.16
    },
    {
        ticker: "BRS",
        headline: "A production fault delays brewery deliveries.",
        minChange: -0.15,
        maxChange: -0.05
    },
    {
        ticker: "MUG",
        headline: "Golden Mug Holdings reports stronger-than-expected results.",
        minChange: 0.05,
        maxChange: 0.12
    },
    {
        ticker: "MUG",
        headline: "Golden Mug Holdings announces a confusing acquisition.",
        minChange: -0.11,
        maxChange: -0.04
    },
    {
        ticker: "JBL",
        headline: "Jukebox Live signs an exclusive entertainment deal.",
        minChange: 0.08,
        maxChange: 0.20
    },
    {
        ticker: "JBL",
        headline: "Jukebox Live suffers a widespread playlist outage.",
        minChange: -0.18,
        maxChange: -0.07
    },
    {
        ticker: "DCL",
        headline: "Dodgy Cab Limited passes its annual inspection.",
        minChange: 0.10,
        maxChange: 0.25
    },
    {
        ticker: "DCL",
        headline: "Dodgy Cab Limited misplaces another vehicle.",
        minChange: -0.25,
        maxChange: -0.10
    },
    {
        ticker: "CRP",
        headline: "Strong snack demand boosts CRP sales.",
        minChange: 0.06,
        maxChange: 0.15
    },
    {
        ticker: "CRP",
        headline: "A pork-scratching shortage disrupts supplies.",
        minChange: -0.17,
        maxChange: -0.06
    }
];

function ensureEconomyFunctions() {
    const required = [
        "getBalance",
        "addBalance",
        "removeBalance",
        "formatBucks"
    ];

    const missing = required.filter(
        functionName => typeof economy[functionName] !== "function"
    );

    if (missing.length > 0) {
        throw new Error(
            `EconomyManager is missing exports: ${missing.join(", ")}`
        );
    }
}

function randomDecimal(minimum, maximum) {
    const scale = 1000000;
    const min = Math.round(minimum * scale);
    const max = Math.round(maximum * scale);

    return crypto.randomInt(min, max + 1) / scale;
}

function getCompany(ticker) {
    return COMPANIES.find(company => company.ticker === ticker);
}

function formatPercent(value) {
    const percentage = value * 100;
    const sign = percentage > 0 ? "+" : "";
    return `${sign}${percentage.toFixed(2)}%`;
}

function movementEmoji(value) {
    if (value > 0) return "📈";
    if (value < 0) return "📉";
    return "➖";
}

function createInitialDatabase() {
    const stocks = {};

    for (const company of COMPANIES) {
        stocks[company.ticker] = {
            price: company.startingPrice,
            previousPrice: company.startingPrice,
            percentageChange: 0,
            currentVolatility: 0,
            lastUpdated: Date.now(),
            priceHistory: [
                {
                    timestamp: Date.now(),
                    price: company.startingPrice
                }
            ]
        };
    }

    return {
        lastMarketUpdate: Date.now(),
        latestNews: "The Bartender Stock Exchange has opened for business.",
        stocks,
        portfolios: {}
    };
}

function ensureDatabase() {
    const directory = path.dirname(DATABASE_FILE);

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(DATABASE_FILE)) {
        fs.writeFileSync(
            DATABASE_FILE,
            JSON.stringify(createInitialDatabase(), null, 2),
            "utf8"
        );
    }
}

function normaliseDatabase(database) {
    if (!database || typeof database !== "object") {
        return createInitialDatabase();
    }

    if (!database.stocks || typeof database.stocks !== "object") {
        database.stocks = {};
    }

    if (!database.portfolios || typeof database.portfolios !== "object") {
        database.portfolios = {};
    }

    if (!Number.isFinite(database.lastMarketUpdate)) {
        database.lastMarketUpdate = Date.now();
    }

    if (typeof database.latestNews !== "string") {
        database.latestNews = "Markets are trading normally.";
    }

    for (const company of COMPANIES) {
        const existing = database.stocks[company.ticker];

        if (!existing || typeof existing !== "object") {
            database.stocks[company.ticker] = {
                price: company.startingPrice,
                previousPrice: company.startingPrice,
                percentageChange: 0,
                lastUpdated: Date.now()
            };
            continue;
        }

        existing.price = Math.max(
            1,
            Math.round(Number(existing.price) || company.startingPrice)
        );
        existing.previousPrice = Math.max(
            1,
            Math.round(Number(existing.previousPrice) || existing.price)
        );
        existing.percentageChange =
            Number(existing.percentageChange) || 0;
        existing.currentVolatility = Math.max(
            0,
            Number(existing.currentVolatility) || 0
        );
        existing.lastUpdated =
            Number(existing.lastUpdated) || Date.now();

        if (!Array.isArray(existing.priceHistory)) {
            existing.priceHistory = [];
        }

        existing.priceHistory = existing.priceHistory
            .filter(entry => {
                return (
                    entry &&
                    Number.isFinite(Number(entry.timestamp)) &&
                    Number.isFinite(Number(entry.price))
                );
            })
            .map(entry => ({
                timestamp: Number(entry.timestamp),
                price: Math.max(PRICE_FLOOR, Math.round(Number(entry.price)))
            }));

        if (existing.priceHistory.length === 0) {
            existing.priceHistory.push({
                timestamp: existing.lastUpdated,
                price: existing.price
            });
        }
    }

    return database;
}

function loadDatabase() {
    ensureDatabase();

    try {
        const content = fs.readFileSync(DATABASE_FILE, "utf8");
        return normaliseDatabase(JSON.parse(content));
    } catch (error) {
        console.error("[Stocks] Database load failed:", error);
        return createInitialDatabase();
    }
}

function saveDatabase(database) {
    ensureDatabase();

    fs.writeFileSync(
        TEMP_FILE,
        JSON.stringify(database, null, 2),
        "utf8"
    );
    fs.renameSync(TEMP_FILE, DATABASE_FILE);
}

function getPortfolio(database, userId, username) {
    if (!database.portfolios[userId]) {
        database.portfolios[userId] = {
            userId,
            username,
            holdings: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    const portfolio = database.portfolios[userId];
    portfolio.username = username;
    portfolio.updatedAt = Date.now();

    if (!portfolio.holdings || typeof portfolio.holdings !== "object") {
        portfolio.holdings = {};
    }

    return portfolio;
}

function getHolding(portfolio, ticker) {
    if (!portfolio.holdings[ticker]) {
        portfolio.holdings[ticker] = {
            shares: 0,
            totalPurchaseCost: 0
        };
    }

    const holding = portfolio.holdings[ticker];
    holding.shares = Math.max(0, Math.floor(Number(holding.shares) || 0));
    holding.totalPurchaseCost = Math.max(
        0,
        Math.round(Number(holding.totalPurchaseCost) || 0)
    );

    return holding;
}

function cleanPriceHistory(stock, updateTime) {
    const cutoff = updateTime - HISTORY_WINDOW_MS;

    if (!Array.isArray(stock.priceHistory)) {
        stock.priceHistory = [];
    }

    stock.priceHistory = stock.priceHistory.filter(entry => {
        return (
            entry &&
            Number(entry.timestamp) >= cutoff &&
            Number.isFinite(Number(entry.price))
        );
    });
}

function getTwentyFourHourDrop(stock, currentPrice) {
    if (!Array.isArray(stock.priceHistory) || stock.priceHistory.length === 0) {
        return 0;
    }

    const referencePrice = Math.max(
        PRICE_FLOOR,
        Number(stock.priceHistory[0].price) || currentPrice
    );

    if (currentPrice >= referencePrice) {
        return 0;
    }

    return (referencePrice - currentPrice) / referencePrice;
}

function applyOneMarketUpdate(database, updateTime) {
    let selectedNews = null;

    if (crypto.randomInt(0, 5) === 0) {
        selectedNews = MARKET_EVENTS[
            crypto.randomInt(0, MARKET_EVENTS.length)
        ];
    }

    for (const company of COMPANIES) {
        const stock = database.stocks[company.ticker];
        const oldPrice = Math.max(PRICE_FLOOR, Math.round(stock.price));

        cleanPriceHistory(stock, updateTime);

        const randomVolatility = randomDecimal(
            MIN_RANDOM_VOLATILITY,
            MAX_RANDOM_VOLATILITY
        );
        const riskMultiplier = Math.max(0.75, company.volatility / 0.06);
        const effectiveVolatility = Math.min(
            MAX_RANDOM_VOLATILITY,
            randomVolatility * riskMultiplier
        );

        stock.currentVolatility = effectiveVolatility;

        let movement = randomDecimal(
            -effectiveVolatility,
            effectiveVolatility
        );

        const hasCompanyNews =
            selectedNews && selectedNews.ticker === company.ticker;

        if (hasCompanyNews) {
            movement += randomDecimal(
                selectedNews.minChange,
                selectedNews.maxChange
            );
        }

        const rollingDrop = getTwentyFourHourDrop(stock, oldPrice);
        let maximumDrop = hasCompanyNews ? MAX_NEWS_DROP : MAX_NORMAL_DROP;

        if (rollingDrop >= HARD_24H_DROP_LIMIT) {
            maximumDrop = 0;
        } else if (rollingDrop >= SOFT_24H_DROP_LIMIT) {
            maximumDrop = Math.min(maximumDrop, SOFT_LIMIT_MAX_DROP);
        }

        movement = Math.max(-maximumDrop, Math.min(MAX_TOTAL_RISE, movement));

        const newPrice = Math.max(
            PRICE_FLOOR,
            Math.round(oldPrice * (1 + movement))
        );

        stock.previousPrice = oldPrice;
        stock.price = newPrice;
        stock.percentageChange = (newPrice - oldPrice) / oldPrice;
        stock.lastUpdated = updateTime;
        stock.priceHistory.push({
            timestamp: updateTime,
            price: newPrice
        });
    }

    database.latestNews = selectedNews
        ? selectedNews.headline
        : "Markets moved during ordinary trading.";
}

function updateMarketIfRequired(database) {
    const now = Date.now();
    const elapsed = now - database.lastMarketUpdate;
    const updatesDue = Math.floor(elapsed / UPDATE_INTERVAL_MS);

    if (updatesDue < 1) {
        return false;
    }

    const updatesToRun = Math.min(updatesDue, MAX_CATCH_UPDATES);

    for (let index = 0; index < updatesToRun; index++) {
        const updateTime = database.lastMarketUpdate + UPDATE_INTERVAL_MS;
        applyOneMarketUpdate(database, updateTime);
        database.lastMarketUpdate = updateTime;
    }

    if (updatesDue > MAX_CATCH_UPDATES) {
        database.lastMarketUpdate = now;
    }

    saveDatabase(database);
    return true;
}

function calculatePortfolio(database, portfolio) {
    const positions = [];
    let purchaseValue = 0;
    let marketValue = 0;
    let totalShares = 0;

    for (const [ticker, holding] of Object.entries(portfolio.holdings)) {
        const company = getCompany(ticker);
        const stock = database.stocks[ticker];
        const shares = Math.max(0, Math.floor(Number(holding.shares) || 0));

        if (!company || !stock || shares === 0) {
            continue;
        }

        const cost = Math.max(
            0,
            Math.round(Number(holding.totalPurchaseCost) || 0)
        );
        const value = shares * stock.price;

        purchaseValue += cost;
        marketValue += value;
        totalShares += shares;

        positions.push({
            ticker,
            company,
            shares,
            price: stock.price,
            purchaseValue: cost,
            marketValue: value,
            profitLoss: value - cost
        });
    }

    positions.sort((first, second) => {
        return second.marketValue - first.marketValue;
    });

    return {
        positions,
        purchaseValue,
        marketValue,
        profitLoss: marketValue - purchaseValue,
        totalShares
    };
}

function createMarketEmbed(database, client) {
    const embed = new EmbedBuilder()
        .setColor(0xd4a017)
        .setAuthor({
            name: "Bartender Stock Exchange",
            iconURL: client.user.displayAvatarURL()
        })
        .setTitle("📈 Market Prices")
        .setDescription(
            [
                "Fictional shares traded using virtual Bartender Bucks.",
                "",
                `📰 **Latest news:** ${database.latestNews}`,
                "",
                "Prices update every 30 minutes when the market is accessed.",
                "Falls are capped and protected by a rolling 24-hour circuit breaker."
            ].join("\n")
        );

    for (const company of COMPANIES) {
        const stock = database.stocks[company.ticker];
        const change = Number(stock.percentageChange) || 0;

        embed.addFields({
            name: `${company.emoji} ${company.ticker} • ${company.name}`,
            value:
                `Price: **${economy.formatBucks(stock.price)} BB**\n` +
                `${movementEmoji(change)} Movement: **${formatPercent(change)}**\n` +
                `Current volatility: **${formatPercent(stock.currentVolatility || 0)}**\n` +
                company.description,
            inline: false
        });
    }

    return embed
        .setFooter({
            text: "Virtual Bartender Bucks only • No real-world value"
        })
        .setTimestamp(new Date(database.lastMarketUpdate));
}

function createChoices() {
    return COMPANIES.map(company => ({
        name: `${company.ticker} • ${company.name}`,
        value: company.ticker
    }));
}

/*
 * Used by BartenderTraders.js. This runs the same guarded market update
 * used by /stocks, then returns a before-and-after snapshot for notices.
 */
function runScheduledMarketUpdates() {
    const beforeDatabase = loadDatabase();
    const before = {};

    for (const company of COMPANIES) {
        const stock = beforeDatabase.stocks[company.ticker];
        before[company.ticker] = {
            price: stock.price,
            percentageChange: stock.percentageChange || 0
        };
    }

    const updated = updateMarketIfRequired(beforeDatabase);

    if (!updated) {
        return {
            updated: false,
            latestNews: beforeDatabase.latestNews,
            lastMarketUpdate: beforeDatabase.lastMarketUpdate,
            companies: COMPANIES,
            before,
            after: before
        };
    }

    const afterDatabase = loadDatabase();
    const after = {};

    for (const company of COMPANIES) {
        const stock = afterDatabase.stocks[company.ticker];
        after[company.ticker] = {
            price: stock.price,
            percentageChange: stock.percentageChange || 0,
            currentVolatility: stock.currentVolatility || 0
        };
    }

    return {
        updated: true,
        latestNews: afterDatabase.latestNews,
        lastMarketUpdate: afterDatabase.lastMarketUpdate,
        companies: COMPANIES,
        before,
        after
    };
}

module.exports = {
    runScheduledMarketUpdates,
    data: new SlashCommandBuilder()
        .setName("stocks")
        .setDescription("Trade fictional shares using Bartender Bucks.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("market")
                .setDescription("View current public stock prices.")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("buy")
                .setDescription("Buy shares using Bartender Bucks.")
                .addStringOption(option =>
                    option
                        .setName("ticker")
                        .setDescription("The company ticker.")
                        .setRequired(true)
                        .addChoices(...createChoices())
                )
                .addIntegerOption(option =>
                    option
                        .setName("shares")
                        .setDescription("The number of shares to buy.")
                        .setMinValue(1)
                        .setMaxValue(MAX_SHARES_PER_TRANSACTION)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("sell")
                .setDescription("Sell shares for Bartender Bucks.")
                .addStringOption(option =>
                    option
                        .setName("ticker")
                        .setDescription("The company ticker.")
                        .setRequired(true)
                        .addChoices(...createChoices())
                )
                .addIntegerOption(option =>
                    option
                        .setName("shares")
                        .setDescription("The number of shares to sell.")
                        .setMinValue(1)
                        .setMaxValue(MAX_SHARES_PER_TRANSACTION)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("portfolio")
                .setDescription("View your private stock portfolio.")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("leaderboard")
                .setDescription("View the five most valuable portfolios.")
        ),

    async execute(interaction) {
        try {
            ensureEconomyFunctions();
        } catch (error) {
            console.error("[Stocks] Configuration error:", error);

            await interaction.reply({
                content: "📈 The stock market is not configured correctly.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const displayName = interaction.user.displayName;

        let database = loadDatabase();
        updateMarketIfRequired(database);
        database = loadDatabase();

        if (subcommand === "market") {
            await interaction.reply({
                embeds: [createMarketEmbed(database, interaction.client)]
            });
            return;
        }

        if (subcommand === "leaderboard") {
            const rankings = [];

            for (const portfolio of Object.values(database.portfolios)) {
                const totals = calculatePortfolio(database, portfolio);

                if (totals.marketValue > 0) {
                    rankings.push({
                        username: portfolio.username || "Unknown",
                        marketValue: totals.marketValue,
                        profitLoss: totals.profitLoss
                    });
                }
            }

            rankings.sort((first, second) => {
                return second.marketValue - first.marketValue;
            });

            const topFive = rankings.slice(0, 5);

            if (topFive.length === 0) {
                await interaction.reply({
                    content: "📈 Nobody owns any shares yet."
                });
                return;
            }

            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
            const lines = topFive.map((entry, index) => {
                const sign = entry.profitLoss >= 0 ? "+" : "";

                return (
                    `${medals[index]} **${entry.username}**\n` +
                    `Portfolio: **${economy.formatBucks(entry.marketValue)} BB** • ` +
                    `P/L: **${sign}${economy.formatBucks(entry.profitLoss)} BB**`
                );
            });

            const embed = new EmbedBuilder()
                .setColor(0xd4a017)
                .setTitle("🏆 Bartender Stock Exchange Leaders")
                .setDescription(lines.join("\n\n"))
                .setFooter({
                    text: "Ranked by current share value • Virtual currency only"
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        if (subcommand === "portfolio") {
            const portfolio = getPortfolio(database, userId, username);
            const totals = calculatePortfolio(database, portfolio);
            const cash = economy.getBalance(userId, username);
            const sign = totals.profitLoss >= 0 ? "+" : "";

            const embed = new EmbedBuilder()
                .setColor(totals.profitLoss >= 0 ? 0x57f287 : 0xed4245)
                .setTitle("💼 Your Stock Portfolio")
                .setDescription(
                    [
                        `A private account statement for **${displayName}**.`,
                        "",
                        `💵 Available cash: **${economy.formatBucks(cash)} BB**`,
                        `📈 Current share value: **${economy.formatBucks(totals.marketValue)} BB**`,
                        `🧾 Purchase value: **${economy.formatBucks(totals.purchaseValue)} BB**`,
                        `📊 Unrealised P/L: **${sign}${economy.formatBucks(totals.profitLoss)} BB**`
                    ].join("\n")
                );

            if (totals.positions.length === 0) {
                embed.addFields({
                    name: "Current holdings",
                    value: "You do not currently own any shares.",
                    inline: false
                });
            } else {
                for (const position of totals.positions) {
                    const positionSign = position.profitLoss >= 0 ? "+" : "";

                    embed.addFields({
                        name:
                            `${position.company.emoji} ${position.ticker} • ` +
                            position.company.name,
                        value:
                            `Shares: **${economy.formatBucks(position.shares)}**\n` +
                            `Price: **${economy.formatBucks(position.price)} BB each**\n` +
                            `Value: **${economy.formatBucks(position.marketValue)} BB**\n` +
                            `P/L: **${positionSign}${economy.formatBucks(position.profitLoss)} BB**`,
                        inline: false
                    });
                }
            }

            embed
                .setFooter({
                    text: "This portfolio is private between you and Bartender."
                })
                .setTimestamp();

            saveDatabase(database);

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (activeTransactions.has(userId)) {
            await interaction.reply({
                content: "📈 Bartender is already processing one of your stock transactions.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        activeTransactions.add(userId);

        try {
            const ticker = interaction.options
                .getString("ticker", true)
                .toUpperCase();
            const shares = interaction.options.getInteger("shares", true);
            const company = getCompany(ticker);
            const stock = database.stocks[ticker];

            if (!company || !stock) {
                await interaction.reply({
                    content: "📈 Bartender could not find that company.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const price = Math.max(1, Math.round(stock.price));
            const transactionValue = price * shares;

            if (!Number.isSafeInteger(transactionValue)) {
                await interaction.reply({
                    content: "📈 That transaction is too large to process safely.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const portfolio = getPortfolio(database, userId, username);
            const holding = getHolding(portfolio, ticker);

            if (subcommand === "buy") {
                const payment = economy.removeBalance(
                    userId,
                    transactionValue,
                    username
                );

                if (!payment.success) {
                    await interaction.reply({
                        content:
                            "🍺 Your tab will not cover that purchase.\n\n" +
                            `Cost: **${economy.formatBucks(transactionValue)} BB**\n` +
                            `Balance: **${economy.formatBucks(payment.balance)} BB**`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    holding.shares += shares;
                    holding.totalPurchaseCost += transactionValue;
                    portfolio.updatedAt = Date.now();
                    saveDatabase(database);
                } catch (error) {
                    economy.addBalance(userId, transactionValue, username);
                    throw error;
                }

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle("📈 Shares Purchased")
                    .setDescription(
                        [
                            `Bartender purchased **${economy.formatBucks(shares)} ${ticker} shares** for you.`,
                            "",
                            `Price per share: **${economy.formatBucks(price)} BB**`,
                            `Total cost: **${economy.formatBucks(transactionValue)} BB**`,
                            `Shares now owned: **${economy.formatBucks(holding.shares)}**`,
                            `Remaining cash: **${economy.formatBucks(payment.balance)} BB**`
                        ].join("\n")
                    )
                    .setFooter({
                        text: "Private stock transaction • Virtual currency only"
                    })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (subcommand === "sell") {
                if (holding.shares < shares) {
                    await interaction.reply({
                        content:
                            `📉 You cannot sell **${economy.formatBucks(shares)} ${ticker} shares** ` +
                            `because you only own **${economy.formatBucks(holding.shares)}**.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const oldShares = holding.shares;
                const oldCost = holding.totalPurchaseCost;
                const averageCost = oldShares > 0 ? oldCost / oldShares : 0;
                const soldCost = Math.min(
                    oldCost,
                    Math.round(averageCost * shares)
                );

                holding.shares -= shares;
                holding.totalPurchaseCost = Math.max(0, oldCost - soldCost);

                if (holding.shares === 0) {
                    delete portfolio.holdings[ticker];
                }

                portfolio.updatedAt = Date.now();
                saveDatabase(database);

                let newBalance;

                try {
                    newBalance = economy.addBalance(
                        userId,
                        transactionValue,
                        username
                    );
                } catch (error) {
                    const rollbackDatabase = loadDatabase();
                    const rollbackPortfolio = getPortfolio(
                        rollbackDatabase,
                        userId,
                        username
                    );
                    rollbackPortfolio.holdings[ticker] = {
                        shares: oldShares,
                        totalPurchaseCost: oldCost
                    };
                    saveDatabase(rollbackDatabase);
                    throw error;
                }

                const realisedProfit = transactionValue - soldCost;
                const profitSign = realisedProfit >= 0 ? "+" : "";
                const sharesRemaining = holding.shares;

                const embed = new EmbedBuilder()
                    .setColor(realisedProfit >= 0 ? 0x57f287 : 0xed4245)
                    .setTitle("📉 Shares Sold")
                    .setDescription(
                        [
                            `Bartender sold **${economy.formatBucks(shares)} ${ticker} shares** for you.`,
                            "",
                            `Price per share: **${economy.formatBucks(price)} BB**`,
                            `Sale proceeds: **${economy.formatBucks(transactionValue)} BB**`,
                            `Realised P/L: **${profitSign}${economy.formatBucks(realisedProfit)} BB**`,
                            `Shares remaining: **${economy.formatBucks(sharesRemaining)}**`,
                            `New cash balance: **${economy.formatBucks(newBalance)} BB**`
                        ].join("\n")
                    )
                    .setFooter({
                        text: "Private stock transaction • Virtual currency only"
                    })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: "📈 Bartender did not recognise that stock action.",
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error("[Stocks] Transaction failed:", error);

            const response = {
                content: "📈 Bartender could not complete that stock transaction safely.",
                flags: MessageFlags.Ephemeral
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(response);
            } else {
                await interaction.reply(response);
            }
        } finally {
            activeTransactions.delete(userId);
        }
    }
};
