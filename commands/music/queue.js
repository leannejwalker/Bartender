const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const MusicManager = require("../../music/MusicManager");

module.exports = {
    category: "Music",

    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the current music queue"),

    async execute(interaction) {
        const manager =
            MusicManager.get(
                interaction.guild.id
            );

        const lines = [];

        if (manager.current) {
            lines.push(
                `🎵 **Now Playing**\n[${manager.current.title}](${manager.current.url})`
            );
        }

        if (manager.queue.length) {
            lines.push(
                manager.queue
                    .map(
                        (track, index) =>
                            `**${index + 1}.** [${track.title}](${track.url})`
                    )
                    .join("\n")
            );
        }

        if (!lines.length) {
            return interaction.reply(
                "📭 The queue is empty."
            );
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎶 Music Queue")
            .setDescription(
                lines.join("\n\n")
            )
            .setFooter({
                text: "After Hours • Bartender"
            });

        await interaction.reply({
            embeds: [embed]
        });
    }
};