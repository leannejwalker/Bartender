const {
    SlashCommandBuilder
} = require("discord.js");

const { spawn } =
    require("child_process");

const musicManager =
    require("../../music/MusicManager");

const YTDLP_PATH =
    "/usr/local/bin/yt-dlp";

const YTDLP_COMMON_ARGS =
    musicManager.YTDLP_COMMON_ARGS;

function runYtDlp(args) {
    return new Promise(
        (resolve, reject) => {
            const ytDlp = spawn(
                YTDLP_PATH,
                args,
                {
                    stdio: [
                        "ignore",
                        "pipe",
                        "pipe"
                    ]
                }
            );

            let stdout = "";
            let stderr = "";
            let settled = false;

            ytDlp.stdout.setEncoding(
                "utf8"
            );

            ytDlp.stderr.setEncoding(
                "utf8"
            );

            const succeed = value => {
                if (settled) {
                    return;
                }

                settled = true;
                resolve(value);
            };

            const fail = error => {
                if (settled) {
                    return;
                }

                settled = true;
                reject(error);
            };

            ytDlp.stdout.on(
                "data",
                chunk => {
                    stdout += chunk;
                }
            );

            ytDlp.stderr.on(
                "data",
                chunk => {
                    stderr += chunk;
                }
            );

            ytDlp.once(
                "error",
                fail
            );

            ytDlp.once(
                "close",
                code => {
                    if (code !== 0) {
                        fail(
                            new Error(
                                stderr.trim() ||
                                `yt-dlp exited with code ${code}`
                            )
                        );

                        return;
                    }

                    succeed(stdout);
                }
            );
        }
    );
}

function isYouTubeUrl(value) {
    try {
        const url = new URL(value);

        const hostname =
            url.hostname
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

function getVideoUrl(info) {
    if (
        typeof info?.webpage_url ===
            "string" &&
        info.webpage_url
    ) {
        return info.webpage_url;
    }

    if (
        typeof info?.original_url ===
            "string" &&
        isYouTubeUrl(info.original_url)
    ) {
        return info.original_url;
    }

    if (info?.id) {
        return (
            "https://www.youtube.com/" +
            `watch?v=${info.id}`
        );
    }

    return null;
}

async function searchYouTube(query) {
    const output = await runYtDlp([
        ...YTDLP_COMMON_ARGS,
        "--flat-playlist",
        "--dump-single-json",
        `ytsearch1:${query}`
    ]);

    let data;

    try {
        data = JSON.parse(output);
    } catch {
        throw new Error(
            "YouTube search returned invalid data."
        );
    }

    const entry =
        data.entries?.[0];

    if (!entry) {
        throw new Error(
            "No YouTube results were found."
        );
    }

    return entry;
}

async function getVideoInfo(query) {
    let videoUrl;

    if (isYouTubeUrl(query)) {
        videoUrl = query;
    } else {
        const result =
            await searchYouTube(query);

        videoUrl =
            getVideoUrl(result);
    }

    if (!videoUrl) {
        throw new Error(
            "YouTube returned a result without a video URL."
        );
    }

    const output = await runYtDlp([
        ...YTDLP_COMMON_ARGS,
        "--dump-single-json",
        "-f",
        "bestaudio/best",
        videoUrl
    ]);

    try {
        return JSON.parse(output);
    } catch {
        throw new Error(
            "YouTube returned invalid video information."
        );
    }
}

function getThumbnail(info) {
    if (
        typeof info?.thumbnail ===
            "string" &&
        info.thumbnail.startsWith(
            "https://"
        )
    ) {
        return info.thumbnail;
    }

    if (info?.id) {
        return (
            "https://i.ytimg.com/vi/" +
            `${info.id}/hqdefault.jpg`
        );
    }

    return null;
}

function cleanTitle(title) {
    if (
        typeof title !== "string" ||
        !title.trim()
    ) {
        return "Unknown Track";
    }

    return title
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
}

function cleanChannelName(name) {
    if (
        typeof name !== "string" ||
        !name.trim()
    ) {
        return "YouTube";
    }

    return name
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
}

function escapeDiscordMarkdown(value) {
    return String(value).replace(
        /([\\`*_{}[\]()#+\-.!|>~])/g,
        "\\$1"
    );
}

function getSafeErrorMessage(error) {
    const message = String(
        error?.message || error
    );

    const normalized =
        message.toLowerCase();

    if (
        normalized.includes(
            "no youtube results"
        )
    ) {
        return (
            "No YouTube results were found " +
            "for that search."
        );
    }

    if (
        normalized.includes(
            "verification"
        ) ||
        normalized.includes(
            "sign in to confirm"
        ) ||
        normalized.includes(
            "confirm you're not a bot"
        )
    ) {
        return (
            "YouTube's verification challenge " +
            "could not be completed."
        );
    }

    if (
        normalized.includes(
            "video unavailable"
        )
    ) {
        return (
            "That video is unavailable."
        );
    }

    if (
        normalized.includes(
            "private video"
        )
    ) {
        return (
            "That video is private."
        );
    }

    if (
        normalized.includes(
            "members-only"
        )
    ) {
        return (
            "That video is restricted to channel members."
        );
    }

    if (
        normalized.includes(
            "age-restricted"
        )
    ) {
        return (
            "That video is age restricted and could not be loaded."
        );
    }

    if (
        normalized.includes(
            "unsupported url"
        )
    ) {
        return (
            "That YouTube URL is not supported."
        );
    }

    if (
        normalized.includes(
            "could not connect to the voice channel"
        )
    ) {
        return (
            "I could not connect to your voice channel."
        );
    }

    return (
        "The track could not be loaded. " +
        "Check the URL or try another search."
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription(
            "Play a song or resume the current music"
        )
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription(
                    "YouTube URL or song name"
                )
                .setMaxLength(200)
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({
                content:
                    "❌ This command can only be used in a server.",
                ephemeral: true
            });
        }

        const memberChannel =
            interaction.member
                ?.voice
                ?.channel;

        if (!memberChannel) {
            return interaction.reply({
                content:
                    "❌ You need to be in a voice channel first.",
                ephemeral: true
            });
        }

        const query =
            interaction.options
                .getString("query")
                ?.trim();

        if (!query) {
            try {
                const data =
                    musicManager.getGuildData(
                        interaction.guildId
                    );

                if (data.current) {
                    await musicManager.connect(
                        interaction.guildId,
                        memberChannel
                    );

                    musicManager.setTextChannel(
                        interaction.guildId,
                        interaction.channel
                    );

                    const resumed =
                        musicManager.resume(
                            interaction.guildId
                        );

                    if (resumed) {
                        return interaction.reply(
                            "▶️ Resumed the current song."
                        );
                    }

                    return interaction.reply({
                        content:
                            "ℹ️ The current song is already playing.",
                        ephemeral: true
                    });
                }

                if (data.queue.length > 0) {
                    await musicManager.connect(
                        interaction.guildId,
                        memberChannel
                    );

                    musicManager.setTextChannel(
                        interaction.guildId,
                        interaction.channel
                    );

                    const started =
                        await musicManager.playNext(
                            interaction.guildId
                        );

                    if (started) {
                        return interaction.reply(
                            "▶️ Started the music queue."
                        );
                    }
                }

                return interaction.reply({
                    content:
                        "🎵 Nothing is paused or queued. " +
                        "Use `/play query:<song>` to start music.",
                    ephemeral: true
                });
            } catch (error) {
                console.error(
                    "[Music] Resume error:",
                    error
                );

                return interaction.reply({
                    content:
                        `❌ ${getSafeErrorMessage(error)}`,
                    ephemeral: true
                });
            }
        }

        await interaction.deferReply();

        try {
            console.log(
                `[Music] Searching YouTube for: ${query}`
            );

            const info =
                await getVideoInfo(query);

            const videoUrl =
                getVideoUrl(info);

            if (!videoUrl) {
                throw new Error(
                    "Could not determine the YouTube video URL."
                );
            }

            const track = {
                title:
                    cleanTitle(info.title),

                url:
                    videoUrl,

                durationInSec:
                    Number.isFinite(
                        Number(info.duration)
                    )
                        ? Number(
                            info.duration
                        )
                        : 0,

                thumbnail:
                    getThumbnail(info),

                channel:
                    cleanChannelName(
                        info.uploader ||
                        info.channel
                    ),

                requestedBy:
                    interaction.user.toString()
            };

            console.log(
                "[Music] Track metadata:",
                JSON.stringify(
                    track,
                    null,
                    2
                )
            );

            const existingData =
                musicManager.getGuildData(
                    interaction.guildId
                );

            const wasPlaying =
                Boolean(
                    existingData.current
                );

            await musicManager.connect(
                interaction.guildId,
                memberChannel
            );

            musicManager.setTextChannel(
                interaction.guildId,
                interaction.channel
            );

            await musicManager.add(
                interaction.guildId,
                track
            );

            const safeTitle =
                escapeDiscordMarkdown(
                    track.title
                );

            if (wasPlaying) {
                await interaction.editReply(
                    `🎵 Added **${safeTitle}** to the queue.`
                );

                return;
            }

            await interaction.editReply(
                `▶️ Now playing **${safeTitle}**`
            );
        } catch (error) {
            console.error(
                "[Music] Play command error:",
                error
            );

            await interaction.editReply(
                `❌ ${getSafeErrorMessage(error)}`
            );
        }
    }
};