const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const economy = require(
    "../../dependencies/EconomyManager"
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription(
            "Show the leading Bartender Bucks customers."
        ),

    async execute(interaction) {
        const leaders =
            economy.getLeaderboard(10);

        if (leaders.length === 0) {
            await interaction.reply({
                content:
                    "🍺 The till is empty. Nobody has earned Bartender Bucks yet."
            });

            return;
        }

        const medals = [
            "🥇",
            "🥈",
            "🥉"
        ];

        const lines =
            leaders.map(
                (user, index) => {
                    const position =
                        medals[index] ||
                        `**${index + 1}.**`;

                    return (
                        `${position} ${user.username}` +
                        ` — **${economy.formatBucks(user.balance)} BB**`
                    );
                }
            );

        const embed =
            new EmbedBuilder()
                .setColor(0xd4a017)
                .setTitle(
                    "🍺 Bartender Bucks Leaderboard"
                )
                .setDescription(
                    lines.join("\n")
                )
                .setFooter({
                    text:
                        "The finest customers at the bar."
                })
                .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });
    }
};