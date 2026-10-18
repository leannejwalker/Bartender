const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const economy = require(
    "../../dependencies/EconomyManager"
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription(
            "Privately give Bartender Bucks to another member."
        )
        .addUserOption(option =>
            option
                .setName("member")
                .setDescription(
                    "The member receiving the payment."
                )
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription(
                    "The number of Bartender Bucks to send."
                )
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction) {
        const recipient =
            interaction.options.getUser(
                "member",
                true
            );

        const amount =
            interaction.options.getInteger(
                "amount",
                true
            );

        if (recipient.bot) {
            await interaction.reply({
                content:
                    "🍺 Bartender can't open a tab for another bot.",
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        const result =
            economy.transferBalance(
                interaction.user.id,
                interaction.user.username,
                recipient.id,
                recipient.username,
                amount
            );

        if (
            result.reason ===
            "SAME_USER"
        ) {
            await interaction.reply({
                content:
                    "🍺 Moving money between your own pockets won't make you any richer.",
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        if (
            result.reason ===
            "INSUFFICIENT_FUNDS"
        ) {
            await interaction.reply({
                content:
                    `🍺 I'm afraid your tab won't stretch that far. You currently have **${economy.formatBucks(result.balance)} BB**.`,
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        if (!result.success) {
            await interaction.reply({
                content:
                    "🍺 Bartender couldn't complete that payment.",
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        const embed =
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle(
                    "💸 Payment Complete"
                )
                .setDescription(
                    [
                        `Bartender has passed **${economy.formatBucks(amount)} Bartender Bucks** to **${recipient.displayName}**.`,
                        "",
                        `Your remaining balance is **${economy.formatBucks(result.senderBalance)} BB**.`
                    ].join("\n")
                );

        await interaction.reply({
            embeds: [embed],
            flags:
                MessageFlags.Ephemeral
        });
    }
};