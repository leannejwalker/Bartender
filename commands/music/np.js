const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const musicManager = require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("Show the currently playing song"),

    async execute(interaction) {
        const data = musicManager.getGuildDataPublic(interaction.guildId);

        if (!data || !data.current) {
            return interaction.reply({
                content: "🎵 Nothing is currently playing.",
                ephemeral: true
            });
        }

        const track = data.current;

        const position = Number(data.position || 0);
        const duration = Number(track.durationInSec || 0);

        const formatTime = (seconds) => {
            seconds = Math.max(0, Math.floor(seconds));

            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;

            return `${minutes}:${String(secs).padStart(2, "0")}`;
        };

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎵 Now Playing")
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields({
                name: "Progress",
                value: duration > 0
                    ? `${formatTime(position)} / ${formatTime(duration)}`
                    : formatTime(position),
                inline: true
            });

        if (track.requestedBy) {
            embed.addFields({
                name: "Requested by",
                value: track.requestedBy,
                inline: true
            });
        }

        if (track.channel) {
            embed.addFields({
                name: "Channel",
                value: track.channel,
                inline: true
            });
        }

        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }

        await interaction.reply({
            embeds: [embed]
        });
    }
};