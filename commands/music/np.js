const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const musicManager = require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("Show what's currently playing"),

    async execute(interaction) {
        const data = musicManager.getGuildDataPublic(interaction.guildId);

        if (!data || !data.current) {
            return interaction.reply({
                content: "🎵 Nothing is currently playing.",
                ephemeral: true
            });
        }

        const track = data.current;

        const position = Math.max(0, Number(data.position || 0));
        const duration = Math.max(0, Number(track.durationInSec || 0));

        const formatTime = (seconds) => {
            seconds = Math.floor(Math.max(0, seconds));

            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;

            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
            }

            return `${minutes}:${String(secs).padStart(2, "0")}`;
        };

        // Build a visual progress bar.
        const barLength = 20;

        let progress = 0;

        if (duration > 0) {
            progress = Math.min(position / duration, 1);
        }

        const filled = Math.round(progress * barLength);
        const empty = barLength - filled;

        const progressBar =
            "━".repeat(Math.max(0, filled)) +
            "🔘" +
            "━".repeat(Math.max(0, empty));

        const percentage = Math.round(progress * 100);

        const elapsed = formatTime(position);
        const total = formatTime(duration);

        // Work out where this song sits relative to the queue.
        const queueLength = data.queue?.length || 0;

        const queueText =
            queueLength > 0
                ? `#1 • ${queueLength} more in queue`
                : "#1 • Queue empty";

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({
                name: "🎵 NOW PLAYING"
            })
            .setTitle(track.title || "Unknown Track")
            .setURL(track.url)
            .setDescription(
                [
                    `**${progressBar}**`,
                    `\`${elapsed}\` ━━━━━━━━━ \`${total}\``,
                    "",
                    `**${percentage}% complete**`,
                    "",
                    `📻 ${track.channel || "YouTube"}`,
                    `👤 Requested by ${track.requestedBy || "Unknown"}`,
                    `📜 ${queueText}`
                ].join("\n")
            )
            .setTimestamp();

        if (track.thumbnail) {
            embed.setImage(track.thumbnail);
        }

        await interaction.reply({
            embeds: [embed]
        });
    }
};