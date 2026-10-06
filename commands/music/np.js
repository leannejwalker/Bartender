const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

function formatTime(ms) {
    const totalSeconds =
        Math.max(
            0,
            Math.floor(ms / 1000)
        );

    const minutes =
        Math.floor(totalSeconds / 60);

    const seconds =
        totalSeconds % 60;

    return `${minutes}:${seconds
        .toString()
        .padStart(2, "0")}`;
}

function progressBar(
    current,
    total,
    size = 24
) {
    if (!total || total <= 0) {
        return "━━━━━━━━━━━━━━━━━━━━━━━━";
    }

    const progress =
        Math.min(
            Math.max(current / total, 0),
            1
        );

    const position =
        Math.floor(progress * size);

    return (
        "━".repeat(position) +
        "●" +
        "━".repeat(
            Math.max(
                0,
                size - position
            )
        )
    );
}

function buildNowPlayingEmbed(guildId) {
    const data =
        musicManager.get(guildId);

    if (!data.current) {
        return new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎵 Nothing Playing")
            .setDescription(
                "There's currently nothing playing.\n\n" +
                "Use `/play` to start some music."
            )
            .setFooter({
                text: "Bartender • Music"
            });
    }

    const track = data.current;

    const current =
        musicManager.getPosition(guildId);

    const duration =
        (track.durationInSec || 0) * 1000;

    const percentage =
        duration > 0
            ? Math.min(
                100,
                Math.floor(
                    (current / duration) * 100
                )
            )
            : 0;

    const bar =
        progressBar(
            current,
            duration
        );

    const embed =
        new EmbedBuilder()
            .setColor(0x7c3aed)
            .setAuthor({
                name: "🎵  NOW PLAYING"
            })
            .setTitle(
                track.title
            )
            .setURL(
                track.url
            )
            .setDescription(
                `**${track.channel || "YouTube"}**\n\n` +
                `\`${bar}\`\n\n` +
                `\`${formatTime(current)}\` **${percentage}%** \`${formatTime(duration)}\``
            )
            .addFields(
                {
                    name: "👤 Requested By",
                    value:
                        track.requestedBy ||
                        "Unknown",
                    inline: true
                },
                {
                    name: "🔊 Volume",
                    value:
                        `${Math.round(
                            data.volume * 100
                        )}%`,
                    inline: true
                },
                {
                    name: "🎶 Queue",
                    value:
                        `${data.queue.length} waiting`,
                    inline: true
                },
                {
                    name: "🔁 Loop",
                    value:
                        data.loop
                            ? "Enabled"
                            : "Disabled",
                    inline: true
                }
            )
            .setThumbnail(
                track.thumbnail ||
                "https://cdn.discordapp.com/embed/avatars/0.png"
            )
            .setFooter({
                text:
                    "Bartender • YouTube Music"
            })
            .setTimestamp();

    return embed;
}

function buildNowPlayingButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "music_pause"
                )
                .setEmoji("⏸️")
                .setStyle(
                    ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "music_resume"
                )
                .setEmoji("▶️")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    "music_skip"
                )
                .setEmoji("⏭️")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "music_loop"
                )
                .setEmoji("🔁")
                .setStyle(
                    ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "music_stop"
                )
                .setEmoji("🛑")
                .setStyle(
                    ButtonStyle.Danger
                )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription(
            "Show the currently playing song"
        ),

    buildNowPlayingEmbed,
    buildNowPlayingButtons,

    async execute(interaction) {
        const guildId =
            interaction.guild.id;

        const data =
            musicManager.get(guildId);

        const embed =
            buildNowPlayingEmbed(
                guildId
            );

        const buttons =
            buildNowPlayingButtons();

        const message =
            await interaction.reply({
                embeds: [embed],
                components: [buttons],
                fetchReply: true
            });

        data.nowPlayingMessage =
            message;
    }
};