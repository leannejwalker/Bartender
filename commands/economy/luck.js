const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const economy = require(
    "../../dependencies/EconomyManager"
);

/*
 * CONFIGURATION
 */

const MINIMUM_COOLDOWN_MS =
    5 * 60 * 1000;

const MAXIMUM_COOLDOWN_MS =
    6 * 60 * 60 * 1000;

const EVENT_DATA_FILE = path.join(
    __dirname,
    "../../database/random-events.json"
);

const EVENT_TEMP_FILE =
    `${EVENT_DATA_FILE}.tmp`;

/*
 * Prevent one member from starting multiple events
 * at precisely the same time.
 */

const activeUsers = new Set();

/*
 * RANDOM EVENTS
 *
 * weight:
 * Higher numbers make the event more common.
 *
 * minimumAmount and maximumAmount:
 * The amount is randomly selected within this range.
 *
 * type:
 * "gain" adds Bartender Bucks.
 * "loss" removes Bartender Bucks.
 */

const EVENTS = [
    /*
     * COMMON SMALL GAINS
     */

    {
        type: "gain",
        weight: 18,
        minimumAmount: 2,
        maximumAmount: 10,
        title: "Loose Change",
        description:
            "You find some loose Bartender Bucks underneath a table.",
        emoji: "🪙"
    },
    {
        type: "gain",
        weight: 16,
        minimumAmount: 5,
        maximumAmount: 15,
        title: "A Generous Tip",
        description:
            "A departing customer leaves you a surprisingly generous tip.",
        emoji: "🍺"
    },
    {
        type: "gain",
        weight: 14,
        minimumAmount: 5,
        maximumAmount: 20,
        title: "Forgotten Coat Pocket",
        description:
            "You check an old coat pocket and discover Bartender Bucks you had forgotten about.",
        emoji: "🧥"
    },
    {
        type: "gain",
        weight: 12,
        minimumAmount: 10,
        maximumAmount: 25,
        title: "Refund Arrives",
        description:
            "A refund you had completely forgotten about finally reaches your account.",
        emoji: "🧾"
    },
    {
        type: "gain",
        weight: 10,
        minimumAmount: 15,
        maximumAmount: 40,
        title: "Office Sweepstake",
        description:
            "Your number comes up in a small sweepstake.",
        emoji: "🎟️"
    },

    /*
     * COMMON SMALL LOSSES
     */

    {
        type: "loss",
        weight: 18,
        minimumAmount: 2,
        maximumAmount: 8,
        title: "Money Lost",
        description:
            "A few Bartender Bucks fall out of your pocket somewhere on the way home.",
        emoji: "🕳️"
    },
    {
        type: "loss",
        weight: 16,
        minimumAmount: 5,
        maximumAmount: 15,
        title: "Pocket Money",
        description:
            "The children remind you that pocket money is due.",
        emoji: "🧒"
    },
    {
        type: "loss",
        weight: 14,
        minimumAmount: 5,
        maximumAmount: 20,
        title: "Another Round",
        description:
            "You offer to buy another round before checking your balance.",
        emoji: "🍻"
    },
    {
        type: "loss",
        weight: 12,
        minimumAmount: 10,
        maximumAmount: 30,
        title: "Unexpected Bill",
        description:
            "An inconvenient bill arrives at exactly the wrong moment.",
        emoji: "📨"
    },
    {
        type: "loss",
        weight: 10,
        minimumAmount: 10,
        maximumAmount: 35,
        title: "Parking Fine",
        description:
            "You return to find an unwelcome notice waiting for you.",
        emoji: "🚗"
    },

    /*
     * UNCOMMON GAINS
     */

    {
        type: "gain",
        weight: 7,
        minimumAmount: 40,
        maximumAmount: 100,
        title: "Successful Side Job",
        description:
            "A small side job pays considerably better than expected.",
        emoji: "🛠️"
    },
    {
        type: "gain",
        weight: 5,
        minimumAmount: 75,
        maximumAmount: 175,
        title: "Premium Bond Win",
        description:
            "One of your numbers wins a modest prize.",
        emoji: "🏦"
    },
    {
        type: "gain",
        weight: 4,
        minimumAmount: 100,
        maximumAmount: 250,
        title: "Tax Rebate",
        description:
            "Bartender slides over a remarkably welcome tax rebate.",
        emoji: "📬"
    },

    /*
     * UNCOMMON LOSSES
     */

    {
        type: "loss",
        weight: 7,
        minimumAmount: 30,
        maximumAmount: 75,
        title: "Emergency Repair",
        description:
            "Something important breaks and needs repairing immediately.",
        emoji: "🔧"
    },
    {
        type: "loss",
        weight: 5,
        minimumAmount: 50,
        maximumAmount: 125,
        title: "Very Expensive Night",
        description:
            "You inspect last night's receipts and immediately regret doing so.",
        emoji: "🧾"
    },
    {
        type: "loss",
        weight: 4,
        minimumAmount: 75,
        maximumAmount: 175,
        title: "Insurance Excess",
        description:
            "A claim is accepted, but the excess still needs paying.",
        emoji: "📋"
    },

    /*
     * RARE MAJOR EVENTS
     */

    {
        type: "gain",
        weight: 2,
        minimumAmount: 300,
        maximumAmount: 750,
        title: "Lottery Winner",
        description:
            "Your numbers come up in the Bartender Bucks lottery.",
        emoji: "🎉"
    },
    {
        type: "gain",
        weight: 1,
        minimumAmount: 750,
        maximumAmount: 1500,
        title: "Bank Heist Windfall",
        description:
            "A mysterious bag of Bartender Bucks appears beside you. Bartender asks no questions.",
        emoji: "💰"
    },
    {
        type: "loss",
        weight: 2,
        minimumAmount: 200,
        maximumAmount: 500,
        title: "Disastrous Investment",
        description:
            "An investment described as completely safe turns out to be neither complete nor safe.",
        emoji: "📉"
    },
    {
        type: "loss",
        weight: 1,
        minimumAmount: 400,
        maximumAmount: 1000,
        title: "The Heist Goes Wrong",
        description:
            "The bank heist plan fails spectacularly and the getaway expenses are enormous.",
        emoji: "🚨"
    }
];

/*
 * STORAGE FUNCTIONS
 */

function ensureEventDatabase() {
    const folder = path.dirname(
        EVENT_DATA_FILE
    );

    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, {
            recursive: true
        });
    }

    if (!fs.existsSync(EVENT_DATA_FILE)) {
        fs.writeFileSync(
            EVENT_DATA_FILE,
            JSON.stringify(
                {
                    users: {}
                },
                null,
                2
            ),
            "utf8"
        );
    }
}

function loadEventDatabase() {
    ensureEventDatabase();

    try {
        const content = fs.readFileSync(
            EVENT_DATA_FILE,
            "utf8"
        );

        const database =
            JSON.parse(content);

        if (
            !database.users ||
            typeof database.users !== "object"
        ) {
            database.users = {};
        }

        return database;
    } catch (error) {
        console.error(
            "[Random Event] Could not load event database:",
            error
        );

        return {
            users: {}
        };
    }
}

function saveEventDatabase(database) {
    ensureEventDatabase();

    try {
        fs.writeFileSync(
            EVENT_TEMP_FILE,
            JSON.stringify(
                database,
                null,
                2
            ),
            "utf8"
        );

        fs.renameSync(
            EVENT_TEMP_FILE,
            EVENT_DATA_FILE
        );
    } catch (error) {
        console.error(
            "[Random Event] Could not save event database:",
            error
        );

        throw error;
    }
}

/*
 * RANDOM SELECTION FUNCTIONS
 */

function randomInteger(
    minimum,
    maximum
) {
    return crypto.randomInt(
        minimum,
        maximum + 1
    );
}

function selectRandomEvent() {
    const totalWeight =
        EVENTS.reduce(
            (total, event) =>
                total + event.weight,
            0
        );

    let selection = crypto.randomInt(
        1,
        totalWeight + 1
    );

    for (const event of EVENTS) {
        selection -= event.weight;

        if (selection <= 0) {
            return event;
        }
    }

    return EVENTS[0];
}

function generateCooldown() {
    return randomInteger(
        MINIMUM_COOLDOWN_MS,
        MAXIMUM_COOLDOWN_MS
    );
}

/*
 * TIME FORMATTING
 */

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(
        0,
        Math.ceil(milliseconds / 1000)
    );

    const hours = Math.floor(
        totalSeconds / 3600
    );

    const minutes = Math.floor(
        (totalSeconds % 3600) / 60
    );

    const seconds =
        totalSeconds % 60;

    const parts = [];

    if (hours > 0) {
        parts.push(
            `${hours} hour${hours === 1 ? "" : "s"}`
        );
    }

    if (minutes > 0) {
        parts.push(
            `${minutes} minute${minutes === 1 ? "" : "s"}`
        );
    }

    if (
        seconds > 0 &&
        hours === 0
    ) {
        parts.push(
            `${seconds} second${seconds === 1 ? "" : "s"}`
        );
    }

    return parts.join(", ") || "a moment";
}

/*
 * COMMAND
 */

module.exports = {
    data: new SlashCommandBuilder()
        .setName("event")
        .setDescription(
            "See whether fortune smiles upon your Bartender Bucks."
        ),

    async execute(interaction) {
        const userId =
            interaction.user.id;

        const username =
            interaction.user.username;

        const displayName =
            interaction.user.displayName;

        /*
         * Prevent two simultaneous requests from the same user.
         */

        if (activeUsers.has(userId)) {
            await interaction.reply({
                content:
                    "🍺 Bartender is already checking what happened to you.",
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        activeUsers.add(userId);

        try {
            const database =
                loadEventDatabase();

            const userEventData =
                database.users[userId] || {
                    nextEventAt: 0,
                    lastEventAt: 0,
                    lastEventTitle: null
                };

            const now = Date.now();

            /*
             * Check the persistent cooldown.
             */

            if (
                userEventData.nextEventAt &&
                now < userEventData.nextEventAt
            ) {
                const remaining =
                    userEventData.nextEventAt -
                    now;

                const cooldownEmbed =
                    new EmbedBuilder()
                        .setColor(
                            0x747f8d
                        )
                        .setTitle(
                            "⏳ Nothing Yet"
                        )
                        .setDescription(
                            [
                                `Bartender checks the day's news for **${displayName}**.`,
                                "",
                                "Nothing else has happened just yet.",
                                "",
                                `Try again in **${formatDuration(remaining)}**.`
                            ].join("\n")
                        )
                        .setFooter({
                            text:
                                "The next event time is different after every event."
                        })
                        .setTimestamp();

                await interaction.reply({
                    embeds: [
                        cooldownEmbed
                    ],
                    flags:
                        MessageFlags.Ephemeral
                });

                return;
            }

            /*
             * Select the event and amount.
             */

            const selectedEvent =
                selectRandomEvent();

            const requestedAmount =
                randomInteger(
                    selectedEvent.minimumAmount,
                    selectedEvent.maximumAmount
                );

            const balanceBefore =
                economy.getBalance(
                    userId,
                    username
                );

            let actualAmount =
                requestedAmount;

            let balanceAfter =
                balanceBefore;

            /*
             * Apply the event.
             */

            if (
                selectedEvent.type ===
                "gain"
            ) {
                balanceAfter =
                    economy.addBalance(
                        userId,
                        actualAmount,
                        username
                    );
            } else {
                /*
                 * Never leave the account below zero.
                 */

                actualAmount = Math.min(
                    requestedAmount,
                    balanceBefore
                );

                if (actualAmount > 0) {
                    const removal =
                        economy.removeBalance(
                            userId,
                            actualAmount,
                            username
                        );

                    if (removal.success) {
                        balanceAfter =
                            removal.balance;
                    }
                } else {
                    balanceAfter = 0;
                }
            }

            /*
             * Generate and store a new random cooldown.
             */

            const cooldown =
                generateCooldown();

            const nextEventAt =
                now + cooldown;

            database.users[userId] = {
                nextEventAt,
                lastEventAt: now,
                lastEventTitle:
                    selectedEvent.title,
                lastEventType:
                    selectedEvent.type,
                lastEventAmount:
                    actualAmount
            };

            saveEventDatabase(database);

            /*
             * Produce the result text.
             */

            let resultText;
            let colour;

            if (
                selectedEvent.type ===
                "gain"
            ) {
                resultText =
                    `You gained **${economy.formatBucks(actualAmount)} Bartender Bucks**.`;

                colour = 0x57f287;
            } else if (
                actualAmount === 0
            ) {
                resultText =
                    "The event would have cost you Bartender Bucks, but your tab was already empty.";

                colour = 0xfee75c;
            } else {
                resultText =
                    `You lost **${economy.formatBucks(actualAmount)} Bartender Bucks**.`;

                colour = 0xed4245;
            }

            const eventEmbed =
                new EmbedBuilder()
                    .setColor(colour)
                    .setAuthor({
                        name:
                            "Bartender • Random Event",
                        iconURL:
                            interaction.client.user.displayAvatarURL()
                    })
                    .setTitle(
                        `${selectedEvent.emoji} ${selectedEvent.title}`
                    )
                    .setDescription(
                        [
                            selectedEvent.description,
                            "",
                            `## ${resultText}`
                        ].join("\n")
                    )
                    .addFields(
                        {
                            name:
                                "Previous balance",
                            value:
                                `${economy.formatBucks(balanceBefore)} BB`,
                            inline: true
                        },
                        {
                            name:
                                "New balance",
                            value:
                                `${economy.formatBucks(balanceAfter)} BB`,
                            inline: true
                        },
                        {
                            name:
                                "Next event",
                            value:
                                `Available in ${formatDuration(cooldown)}`,
                            inline: false
                        }
                    )
                    .setFooter({
                        text:
                            "This event is private between you and Bartender."
                    })
                    .setTimestamp();

            await interaction.reply({
                embeds: [eventEmbed],
                flags:
                    MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error(
                "[Random Event] Command failed:",
                error
            );

            const response = {
                content:
                    "🍺 Bartender lost track of that story. Your event could not be completed safely.",
                flags:
                    MessageFlags.Ephemeral
            };

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp(
                    response
                );
            } else {
                await interaction.reply(
                    response
                );
            }
        } finally {
            activeUsers.delete(userId);
        }
    }
};