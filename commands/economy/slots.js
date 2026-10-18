const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const crypto = require("crypto");

const economy = require(
    "../../dependencies/EconomyManager"
);

const symbols = [
    "🍺",
    "🍒",
    "🍋",
    "🔔",
    "💎"
];

function spinReel() {
    return symbols[
        crypto.randomInt(
            0,
            symbols.length
        )
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("slots")
        .setDescription(
            "Publicly gamble Bartender Bucks on the slots."
        )
        .addIntegerOption(option =>
            option
                .setName("bet")
                .setDescription(
                    "The amount to wager."
                )
                .setMinValue(1)
                .setMaxValue(10000)
                .setRequired(true)
        ),

    async execute(interaction) {
        const bet =
            interaction.options.getInteger(
                "bet",
                true
            );

        const deduction =
            economy.removeBalance(
                interaction.user.id,
                bet,
                interaction.user.username
            );

        if (!deduction.success) {
            await interaction.reply({
                content:
                    `🍺 **${interaction.user.displayName}** doesn't have enough Bartender Bucks for that wager.`
            });

            return;
        }

        const reels = [
            spinReel(),
            spinReel(),
            spinReel()
        ];

        const allMatch =
            reels[0] === reels[1] &&
            reels[1] === reels[2];

        const twoMatch =
            reels[0] === reels[1] ||
            reels[1] === reels[2] ||
            reels[0] === reels[2];

        let multiplier = 0;

        if (allMatch) {
            multiplier =
                reels[0] === "💎"
                    ? 10
                    : reels[0] === "🍺"
                        ? 5
                        : 4;
        } else if (twoMatch) {
            multiplier = 2;
        }

        const payout =
            bet * multiplier;

        let balance =
            deduction.balance;

        if (payout > 0) {
            balance =
                economy.addBalance(
                    interaction.user.id,
                    payout,
                    interaction.user.username
                );
        }

        const resultText =
            allMatch
                ? multiplier === 10
                    ? "💎 **DIAMOND JACKPOT!**"
                    : "🎉 **JACKPOT!**"
                : twoMatch
                    ? "✨ **Two matching symbols!**"
                    : "The machine keeps the wager.";

        const embed =
            new EmbedBuilder()
                .setColor(
                    payout > 0
                        ? 0x57f287
                        : 0xed4245
                )
                .setTitle(
                    "🎰 Bartender's Slots"
                )
                .setDescription(
                    [
                        `**${interaction.user.displayName}** wagered **${economy.formatBucks(bet)} BB**.`,
                        "",
                        `## ${reels.join("  ")}`,
                        "",
                        resultText,
                        "",
                        payout > 0
                            ? `Payout: **${economy.formatBucks(payout)} BB**`
                            : "Payout: **0 BB**",
                        "",
                        `Balance: **${economy.formatBucks(balance)} BB**`
                    ].join("\n")
                );

        await interaction.reply({
            embeds: [embed]
        });
    }
};