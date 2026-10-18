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
        .setName("balance")
        .setDescription(
            "Check your Bartender Bucks balance."
        ),

    async execute(interaction) {
        const balance =
            economy.getBalance(
                interaction.user.id,
                interaction.user.username
            );

        const embed =
            new EmbedBuilder()
                .setColor(0xd4a017)
                .setTitle(
                    "🍺 Your Bar Tab"
                )
                .setDescription(
                    [
                        `Evening, **${interaction.user.displayName}**.`,
                        "",
                        "Your current balance is:",
                        "",
                        `## ${economy.formatBucks(balance)} Bartender Bucks`
                    ].join("\n")
                )
                .setFooter({
                    text:
                        "This conversation is between you and Bartender."
                });

        await interaction.reply({
            embeds: [embed],
            flags:
                MessageFlags.Ephemeral
        });
    }
};