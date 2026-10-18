const { SlashCommandBuilder } = require("discord.js");
const musicManager = require("../../music/MusicManager");

function isYouTubeUrl(value) {
    try {
        const hostname = new URL(value)
            .hostname
            .toLowerCase()
            .replace(/^www\./, "");

        return [
            "youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtu.be"
        ].includes(hostname);
    } catch {
        return false;
    }
}

function escapeDiscordMarkdown(value) {
    return String(value).replace(
        /([\\`*_{}\[\]()#+\-.!|>~])/g,
        "\\$1"
    );
}

function getSafeErrorMessage(error) {
    const message = String(error?.message || error);
    const normalized = message.toLowerCase();

    if (
        normalized.includes("sign in to confirm") ||
        normalized.includes("not a bot")
    ) {
        return (
            "YouTube rejected this request. " +
            "Refresh the cookies file or try another video."
        );
    }

    if (normalized.includes("private video")) {
        return "That video is private.";
    }

    if (normalized.includes("video unavailable")) {
        return "That video is unavailable.";
    }

    if (normalized.includes("no youtube results")) {
        return "No YouTube results were found.";
    }

    if (normalized.includes("could not connect to the voice channel")) {
        return "I could not connect to your voice channel.";
    }

    return (
        "The track could not be started. " +
        "Check the bot console for the yt-dlp error."
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a YouTube song or resume playback")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("YouTube URL or song name")
                .setMaxLength(200)
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({
                content: "This command only works in a server.",
                ephemeral: true
            });
        }

        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: "Join a voice channel first.",
                ephemeral: true
            });
        }

        const query = interaction.options
            .getString("query")
            ?.trim();

        if (!query) {
            try {
                const data = musicManager.getGuildData(
                    interaction.guildId
                );

                if (!data.current) {
                    return interaction.reply({
                        content: "Nothing is paused or queued.",
                        ephemeral: true
                    });
                }

                await musicManager.connect(
                    interaction.guildId,
                    voiceChannel
                );

                const resumed = musicManager.resume(
                    interaction.guildId
                );

                return interaction.reply(
                    resumed
                        ? "Resumed playback."
                        : "The track is already playing."
                );
            } catch (error) {
                console.error("[Music] Resume error:", error);

                return interaction.reply({
                    content: `Could not resume: ${getSafeErrorMessage(error)}`,
                    ephemeral: true
                });
            }
        }

        await interaction.deferReply();

        try {
            /*
             * Avoid the two pre-playback yt-dlp metadata calls.
             * A normal search is passed to yt-dlp as ytsearch1:<query>.
             * A YouTube URL is passed through unchanged.
             */
            const playbackTarget = isYouTubeUrl(query)
                ? query
                : `ytsearch1:${query}`;

            const track = {
                title: query,
                url: playbackTarget,
                durationInSec: 0,
                thumbnail: null,
                channel: "YouTube",
                requestedBy: interaction.user.toString()
            };

            const before = musicManager.getGuildData(
                interaction.guildId
            );

            await musicManager.connect(
                interaction.guildId,
                voiceChannel
            );

            musicManager.setTextChannel(
                interaction.guildId,
                interaction.channel
            );

            const started = await musicManager.add(
                interaction.guildId,
                track
            );

            const safeTitle = escapeDiscordMarkdown(track.title);

            if (!before.current && started) {
                return interaction.editReply(
                    `Now playing **${safeTitle}**`
                );
            }

            return interaction.editReply(
                `Added **${safeTitle}** to the queue.`
            );
        } catch (error) {
            console.error("[Music] Play command error:", error);

            return interaction.editReply(
                `Could not play: ${getSafeErrorMessage(error)}`
            );
        }
    }
};
