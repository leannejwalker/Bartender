const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const musicManager = require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the music queue"),

    async execute(interaction) {
        const data = musicManager.getGuildDataPublic(interaction.guildId);

        if (!data) {
            return interaction.reply({
                content: "🎵 The music queue is empty.",
                ephemeral: true
            });
        }

        const current = data.current;
        const queue = data.queue || [];

        if (!current && queue.length === 0) {
            return interaction.reply({
                content: "🎵 The music queue is empty.",
                ephemeral: true
            });
        }

        const lines = [];

        if (current) {
            lines.push(`🎵 **Now Playing:** ${current.title}`);
            lines.push("");
        }

        if (queue.length > 0) {
            queue.forEach((track, index) => {
                lines.push(`**${index + 1}.** ${track.title}`);
            });
        } else {
            lines.push("No songs waiting in the queue.");
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎶 Music Queue")
            .setDescription(lines.join("\n"))
            .setFooter({
                text: `${queue.length} song${queue.length === 1 ? "" : "s"} queued`
            });

        await interaction.reply({
            embeds: [embed]
        });
    }
};