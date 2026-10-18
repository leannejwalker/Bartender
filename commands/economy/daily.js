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
        .setName("daily")
        .setDescription(
            "Collect your daily Bartender Bucks."
        ),

    async execute(interaction) {
        const result =
            economy.claimDaily(
                interaction.user.id,
                interaction.user.username
            );

        if (!result.success) {
            const embed =
                new EmbedBuilder()
                    .setColor(
                        0x8b4513
                    )
                    .setTitle(
                        "🍺 Not Quite Yet"
                    )
                    .setDescription(
                        [
                            "Bartender checks the clock.",
                            "",
                            "You've already collected today's allowance.",
                            "",
                            `Come back in **${economy.formatDuration(result.remaining)}**.`,
                            "",
                            `Your tab: **${economy.formatBucks(result.balance)} BB**`
                        ].join("\n")
                    );

            await interaction.reply({
                embeds: [embed],
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        const embed =
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle(
                    "🍺 A Little Something for You"
                )
                .setDescription(
                    [
                        "Bartender quietly slides a small envelope across the bar.",
                        "",
                        `You received **${economy.formatBucks(result.reward)} Bartender Bucks**.`,
                        "",
                        `Your new balance is **${economy.formatBucks(result.balance)} BB**.`
                    ].join("\n")
                )
                .setFooter({
                    text:
                        "Your next daily allowance is available in 24 hours."
                });

        await interaction.reply({
            embeds: [embed],
            flags:
                MessageFlags.Ephemeral
        });
    }
};