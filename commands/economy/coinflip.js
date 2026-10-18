const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const crypto = require("crypto");

const economy = require(
    "../../dependencies/EconomyManager"
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("coinflip")
        .setDescription(
            "Publicly bet Bartender Bucks on a coin toss."
        )
        .addStringOption(option =>
            option
                .setName("choice")
                .setDescription(
                    "Choose heads or tails."
                )
                .setRequired(true)
                .addChoices(
                    {
                        name: "Heads",
                        value: "heads"
                    },
                    {
                        name: "Tails",
                        value: "tails"
                    }
                )
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
        const choice =
            interaction.options.getString(
                "choice",
                true
            );

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
                    `🍺 **${interaction.user.displayName}** tried to bet **${economy.formatBucks(bet)} BB**, but the tab wouldn't stretch that far.`
            });

            return;
        }

        const result =
            crypto.randomInt(0, 2) === 0
                ? "heads"
                : "tails";

        const won =
            result === choice;

        let balance =
            deduction.balance;

        if (won) {
            balance =
                economy.addBalance(
                    interaction.user.id,
                    bet * 2,
                    interaction.user.username
                );
        }

        const embed =
            new EmbedBuilder()
                .setColor(
                    won
                        ? 0x57f287
                        : 0xed4245
                )
                .setTitle(
                    won
                        ? "🪙 Winner!"
                        : "🪙 Better Luck Next Time"
                )
                .setDescription(
                    [
                        `**${interaction.user.displayName}** chose **${choice}**.`,
                        "",
                        `The coin landed on **${result}**.`,
                        "",
                        won
                            ? `🍺 Bartender pays out **${economy.formatBucks(bet * 2)} BB**.`
                            : `🍺 Bartender collects the **${economy.formatBucks(bet)} BB** wager.`,
                        "",
                        `Balance: **${economy.formatBucks(balance)} BB**`
                    ].join("\n")
                );

        await interaction.reply({
            embeds: [embed]
        });
    }
};