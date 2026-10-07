const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const musicManager = require("../../music/MusicManager");

function formatTime(seconds) {
    seconds = Math.floor(Math.max(0, Number(seconds) || 0));

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function buildProgressBar(position, duration, length = 20) {
    if (!duration || duration <= 0) {
        return "━━━━━━━━━━━━━━━━━━━━";
    }

    const progress = Math.min(Math.max(position / duration, 0), 1);
    const filled = Math.round(progress * length);
    const empty = length - filled;

    return (
        "━".repeat(Math.max(0, filled)) +
        "🔘" +
        "━".repeat(Math.max(0, empty))
    );
}

function buildNowPlayingEmbed(data) {
    if (!data?.current) {
        return new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: "🎵 NOW PLAYING" })
            .setDescription("Nothing is currently playing.");
    }

    const track = data.current;

    const position = Math.max(
        0,
        Number(data.position || 0)
    );

    const duration = Math.max(
        0,
        Number(track.durationInSec || 0)
    );

    const progress =
        duration > 0
            ? Math.min(position / duration, 1)
            : 0;

    const percentage = Math.round(progress * 100);

    const elapsed = formatTime(position);
    const total = formatTime(duration);

    const progressBar = buildProgressBar(
        position,
        duration
    );

    const queueLength = data.queue?.length || 0;

    let queueText;

    if (queueLength > 0) {
        queueText = `#1 • ${queueLength} more in queue`;
    } else {
        queueText = "#1 • Queue empty";
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
            name: "🎵 NOW PLAYING"
        })
        .setTitle(track.title || "Unknown Track")
        .setDescription([
            `**${progressBar}**`,
            `\`${elapsed}\` ━━━━━━━━━ \`${total}\``,
            "",
            `**${percentage}% complete**`,
            "",
            `📻 ${track.channel || "YouTube"}`,
            `👤 Requested by ${track.requestedBy || "Unknown"}`,
            `📜 ${queueText}`
        ].join("\n"))
        .setTimestamp();

    if (track.url) {
        embed.setURL(track.url);
    }

    if (track.thumbnail) {
        embed.setImage(track.thumbnail);
    }

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("Show what's currently playing"),

    /*
     * MusicManager uses this function to refresh the
     * existing /nowplaying message.
     */
    buildNowPlayingEmbed,

    async execute(interaction) {
        const data = musicManager.getGuildDataPublic(
            interaction.guildId
        );

        if (!data || !data.current) {
            return interaction.reply({
                content: "🎵 Nothing is currently playing.",
                ephemeral: true
            });
        }

        const embed = buildNowPlayingEmbed(data);

        await interaction.reply({
            embeds: [embed]
        });

        /*
         * Save the actual Discord message so MusicManager
         * can edit it as playback progresses.
         */
        try {
            const message = await interaction.fetchReply();

            const guildData = musicManager.getGuildData(
                interaction.guildId
            );

            guildData.nowPlayingMessage = message;
        } catch (error) {
            console.error(
                "[Music] Could not store now-playing message:",
                error
            );
        }
    }
};