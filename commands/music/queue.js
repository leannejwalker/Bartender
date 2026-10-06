const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription(
            "Show the music queue"
        ),

    async execute(interaction) {
        const data =
            musicManager.get(
                interaction.guild.id
            );

        if (
            !data.current &&
            data.queue.length === 0
        ) {
            return interaction.reply(
                "📭 The queue is empty."
            );
        }

        let description = "";

        if (data.current) {
            description +=
                `🎵 **Now Playing**\n` +
                `${data.current.title}\n\n`;
        }

        if (data.queue.length > 0) {
            description +=
                "**Up Next**\n";

            description += data.queue
                .slice(0, 10)
                .map(
                    (track, index) =>
                        `\`${index + 1}.\` ${track.title}`
                )
                .join("\n");
        }

        const embed =
            new EmbedBuilder()
                .setColor(0x7c3aed)
                .setTitle(
                    "🎶 Music Queue"
                )
                .setDescription(
                    description
                )
                .setFooter({
                    text:
                        `${data.queue.length} song(s) waiting`
                });

        await interaction.reply({
            embeds: [embed]
        });
    }
};