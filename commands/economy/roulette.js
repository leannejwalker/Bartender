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
 * ROULETTE CONFIGURATION
 */

const MINIMUM_BET = 1;
const MAXIMUM_BET = 10000;

/*
 * European roulette uses one green zero.
 */

const RED_NUMBERS = new Set([
    1, 3, 5, 7, 9,
    12, 14, 16, 18,
    19, 21, 23, 25, 27,
    30, 32, 34, 36
]);

const BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10,
    11, 13, 15, 17,
    20, 22, 24, 26, 28,
    29, 31, 33, 35
]);

function getNumberColour(number) {
    if (number === 0) {
        return "green";
    }

    if (RED_NUMBERS.has(number)) {
        return "red";
    }

    return "black";
}

function getColourEmoji(colour) {
    const emojis = {
        red: "🔴",
        black: "⚫",
        green: "🟢"
    };

    return emojis[colour] || "🎡";
}

function formatBetType(type) {
    const names = {
        colour: "Colour",
        parity: "Odd or Even",
        range: "Low or High",
        dozen: "Dozen",
        number: "Single Number"
    };

    return names[type] || type;
}

function formatChoice(type, choice) {
    if (type === "colour") {
        return (
            `${getColourEmoji(choice)} ` +
            choice.charAt(0).toUpperCase() +
            choice.slice(1)
        );
    }

    if (type === "parity") {
        return (
            choice.charAt(0).toUpperCase() +
            choice.slice(1)
        );
    }

    if (type === "range") {
        return choice === "low"
            ? "Low, 1–18"
            : "High, 19–36";
    }

    if (type === "dozen") {
        const dozenNames = {
            first: "First dozen, 1–12",
            second: "Second dozen, 13–24",
            third: "Third dozen, 25–36"
        };

        return dozenNames[choice];
    }

    if (type === "number") {
        return `Number ${choice}`;
    }

    return String(choice);
}

function calculateResult(
    type,
    choice,
    resultNumber
) {
    const resultColour =
        getNumberColour(resultNumber);

    /*
     * Zero only wins on a direct number-zero bet.
     */

    if (type === "number") {
        return {
            won:
                Number(choice) ===
                resultNumber,
            multiplier: 36
        };
    }

    if (resultNumber === 0) {
        return {
            won: false,
            multiplier: 0
        };
    }

    if (type === "colour") {
        return {
            won:
                choice ===
                resultColour,
            multiplier: 2
        };
    }

    if (type === "parity") {
        const parity =
            resultNumber % 2 === 0
                ? "even"
                : "odd";

        return {
            won: choice === parity,
            multiplier: 2
        };
    }

    if (type === "range") {
        const range =
            resultNumber >= 1 &&
            resultNumber <= 18
                ? "low"
                : "high";

        return {
            won: choice === range,
            multiplier: 2
        };
    }

    if (type === "dozen") {
        let dozen;

        if (
            resultNumber >= 1 &&
            resultNumber <= 12
        ) {
            dozen = "first";
        } else if (
            resultNumber >= 13 &&
            resultNumber <= 24
        ) {
            dozen = "second";
        } else {
            dozen = "third";
        }

        return {
            won: choice === dozen,
            multiplier: 3
        };
    }

    return {
        won: false,
        multiplier: 0
    };
}

function createResultEmbed({
    displayName,
    type,
    choice,
    bet,
    resultNumber,
    resultColour,
    won,
    payout,
    balance
}) {
    const resultEmoji =
        getColourEmoji(resultColour);

    const outcomeText = won
        ? [
            "## 🍺 Winner!",
            "",
            `Bartender pays out **${economy.formatBucks(payout)} BB**.`
        ].join("\n")
        : [
            "## 🎩 The house wins",
            "",
            `Bartender collects the **${economy.formatBucks(bet)} BB** wager.`
        ].join("\n");

    return new EmbedBuilder()
        .setColor(
            won
                ? 0x57f287
                : 0xed4245
        )
        .setTitle(
            "🎡 Bartender's Roulette"
        )
        .setDescription(
            [
                `**${displayName}** placed a wager.`,
                "",
                "The wheel spins...",
                "",
                `# ${resultEmoji} ${resultNumber}`,
                "",
                outcomeText
            ].join("\n")
        )
        .addFields(
            {
                name: "Bet type",
                value:
                    formatBetType(type),
                inline: true
            },
            {
                name: "Selection",
                value:
                    formatChoice(
                        type,
                        choice
                    ),
                inline: true
            },
            {
                name: "Wager",
                value:
                    `${economy.formatBucks(bet)} BB`,
                inline: true
            },
            {
                name: "Winning number",
                value:
                    `${resultEmoji} ${resultNumber} ${
                        resultColour
                            .charAt(0)
                            .toUpperCase() +
                        resultColour.slice(1)
                    }`,
                inline: true
            },
            {
                name: "Payout",
                value:
                    `${economy.formatBucks(payout)} BB`,
                inline: true
            },
            {
                name: "New balance",
                value:
                    `${economy.formatBucks(balance)} BB`,
                inline: true
            }
        )
        .setFooter({
            text:
                "European roulette • Virtual Bartender Bucks only"
        })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("roulette")
        .setDescription(
            "Play public roulette using Bartender Bucks."
        )

        /*
         * RED OR BLACK
         */

        .addSubcommand(subcommand =>
            subcommand
                .setName("colour")
                .setDescription(
                    "Bet on red or black."
                )
                .addStringOption(option =>
                    option
                        .setName("choice")
                        .setDescription(
                            "Choose red or black."
                        )
                        .setRequired(true)
                        .addChoices(
                            {
                                name: "Red",
                                value: "red"
                            },
                            {
                                name: "Black",
                                value: "black"
                            }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName("bet")
                        .setDescription(
                            "The number of Bartender Bucks to wager."
                        )
                        .setMinValue(
                            MINIMUM_BET
                        )
                        .setMaxValue(
                            MAXIMUM_BET
                        )
                        .setRequired(true)
                )
        )

        /*
         * ODD OR EVEN
         */

        .addSubcommand(subcommand =>
            subcommand
                .setName("parity")
                .setDescription(
                    "Bet on an odd or even number."
                )
                .addStringOption(option =>
                    option
                        .setName("choice")
                        .setDescription(
                            "Choose odd or even."
                        )
                        .setRequired(true)
                        .addChoices(
                            {
                                name: "Odd",
                                value: "odd"
                            },
                            {
                                name: "Even",
                                value: "even"
                            }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName("bet")
                        .setDescription(
                            "The number of Bartender Bucks to wager."
                        )
                        .setMinValue(
                            MINIMUM_BET
                        )
                        .setMaxValue(
                            MAXIMUM_BET
                        )
                        .setRequired(true)
                )
        )

        /*
         * LOW OR HIGH
         */

        .addSubcommand(subcommand =>
            subcommand
                .setName("range")
                .setDescription(
                    "Bet on low, 1–18, or high, 19–36."
                )
                .addStringOption(option =>
                    option
                        .setName("choice")
                        .setDescription(
                            "Choose low or high."
                        )
                        .setRequired(true)
                        .addChoices(
                            {
                                name:
                                    "Low, 1–18",
                                value: "low"
                            },
                            {
                                name:
                                    "High, 19–36",
                                value: "high"
                            }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName("bet")
                        .setDescription(
                            "The number of Bartender Bucks to wager."
                        )
                        .setMinValue(
                            MINIMUM_BET
                        )
                        .setMaxValue(
                            MAXIMUM_BET
                        )
                        .setRequired(true)
                )
        )

        /*
         * DOZENS
         */

        .addSubcommand(subcommand =>
            subcommand
                .setName("dozen")
                .setDescription(
                    "Bet on one of the three dozens."
                )
                .addStringOption(option =>
                    option
                        .setName("choice")
                        .setDescription(
                            "Choose a dozen."
                        )
                        .setRequired(true)
                        .addChoices(
                            {
                                name:
                                    "First dozen, 1–12",
                                value: "first"
                            },
                            {
                                name:
                                    "Second dozen, 13–24",
                                value: "second"
                            },
                            {
                                name:
                                    "Third dozen, 25–36",
                                value: "third"
                            }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName("bet")
                        .setDescription(
                            "The number of Bartender Bucks to wager."
                        )
                        .setMinValue(
                            MINIMUM_BET
                        )
                        .setMaxValue(
                            MAXIMUM_BET
                        )
                        .setRequired(true)
                )
        )

        /*
         * SINGLE NUMBER
         */

        .addSubcommand(subcommand =>
            subcommand
                .setName("number")
                .setDescription(
                    "Bet on one number from 0 to 36."
                )
                .addIntegerOption(option =>
                    option
                        .setName("choice")
                        .setDescription(
                            "Choose a number from 0 to 36."
                        )
                        .setMinValue(0)
                        .setMaxValue(36)
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("bet")
                        .setDescription(
                            "The number of Bartender Bucks to wager."
                        )
                        .setMinValue(
                            MINIMUM_BET
                        )
                        .setMaxValue(
                            MAXIMUM_BET
                        )
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const type =
            interaction.options.getSubcommand();

        const bet =
            interaction.options.getInteger(
                "bet",
                true
            );

        let choice;

        if (type === "number") {
            choice =
                interaction.options.getInteger(
                    "choice",
                    true
                );
        } else {
            choice =
                interaction.options.getString(
                    "choice",
                    true
                );
        }

        const userId =
            interaction.user.id;

        const databaseUsername =
            interaction.user.username;

        const displayName =
            interaction.user.displayName;

        /*
         * Deduct the wager before spinning.
         */

        const deduction =
            economy.removeBalance(
                userId,
                bet,
                databaseUsername
            );

        if (!deduction.success) {
            await interaction.reply({
                content:
                    `🍺 I'm afraid your tab won't stretch to a wager of **${economy.formatBucks(bet)} BB**.\n\n` +
                    `Your current balance is **${economy.formatBucks(deduction.balance)} BB**.`,
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        /*
         * Securely select one number from 0 through 36.
         * The upper boundary supplied to randomInt is exclusive.
         */

        const resultNumber =
            crypto.randomInt(0, 37);

        const resultColour =
            getNumberColour(
                resultNumber
            );

        const result =
            calculateResult(
                type,
                choice,
                resultNumber
            );

        let payout = 0;
        let balance =
            deduction.balance;

        if (result.won) {
            /*
             * Payout includes the original stake:
             *
             * Even-money bet: 2×
             * Dozen: 3×
             * Single number: 36×
             */

            payout =
                bet *
                result.multiplier;

            balance =
                economy.addBalance(
                    userId,
                    payout,
                    databaseUsername
                );
        }

        const embed =
            createResultEmbed({
                displayName,
                type,
                choice,
                bet,
                resultNumber,
                resultColour,
                won: result.won,
                payout,
                balance
            });

        await interaction.reply({
            embeds: [embed]
        });
    }
};