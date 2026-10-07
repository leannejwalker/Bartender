const { SlashCommandBuilder } = require("discord.js");
const { spawn } = require("child_process");
const musicManager = require("../../music/MusicManager");

const YTDLP_PATH = "/usr/local/bin/yt-dlp";

const NODE_PATH =
    "/home/bartenderadmin/.nvm/versions/node/v24.21.0/bin/node";

const YTDLP_COMMON_ARGS = [
    "--js-runtimes",
    `node:${NODE_PATH}`,
    "--no-playlist",
    "--no-warnings"
];

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const process = spawn(
            YTDLP_PATH,
            args,
            {
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", chunk => {
            stdout += chunk.toString();
        });

        process.stderr.on("data", chunk => {
            stderr += chunk.toString();
        });

        process.on("error", reject);

        process.on("close", code => {
            if (code !== 0) {
                reject(
                    new Error(
                        stderr ||
                        `yt-dlp exited with code ${code}`
                    )
                );
                return;
            }

            resolve(stdout);
        });
    });
}

async function searchYouTube(query) {
    const output = await runYtDlp([
        ...YTDLP_COMMON_ARGS,
        "--flat-playlist",
        "--dump-single-json",
        "ytsearch1:" + query
    ]);

    const data = JSON.parse(output);

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
    const isUrl =
        query.startsWith("http://") ||
        query.startsWith("https://");

    // Direct YouTube URL
    if (isUrl) {
        const output = await runYtDlp([
            ...YTDLP_COMMON_ARGS,
            "--dump-single-json",
            "-f",
            "bestaudio/best",
            query
        ]);

        return JSON.parse(output);
    }

    // Search YouTube
    const result =
        await searchYouTube(query);

    const videoUrl =
        result.webpage_url ||
        result.url ||
        (
            result.id
                ? `https://www.youtube.com/watch?v=${result.id}`
                : null
        );

    if (!videoUrl) {
        throw new Error(
            "YouTube search returned a result without a video URL."
        );
    }

    console.log(
        `[Music] Search result: ${videoUrl}`
    );

    // Now fetch the REAL video metadata.
    const output = await runYtDlp([
        ...YTDLP_COMMON_ARGS,
        "--dump-single-json",
        "-f",
        "bestaudio/best",
        videoUrl
    ]);

    return JSON.parse(output);
}

function getThumbnail(info) {
    if (info.id) {
        return `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
    }

    if (
        typeof info.thumbnail === "string" &&
        info.thumbnail.startsWith("http")
    ) {
        return info.thumbnail;
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
        .trim();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription(
            "Play a song, or resume the current music"
        )
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription(
                    "YouTube URL or song name (optional)"
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        const memberChannel =
            interaction.member?.voice?.channel;

        if (!memberChannel) {
            return interaction.reply({
                content:
                    "❌ You need to be in a voice channel first.",
                ephemeral: true
            });
        }

        const query =
            interaction.options.getString("query");

        // /play with no query
        if (!query) {
            const data =
                musicManager.getGuildData(
                    interaction.guildId
                );

            if (data.current) {
                musicManager.connect(
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
            }

            if (
                !data.current &&
                data.queue.length > 0
            ) {
                musicManager.connect(
                    interaction.guildId,
                    memberChannel
                );

                musicManager.setTextChannel(
                    interaction.guildId,
                    interaction.channel
                );

                await musicManager.playNext(
                    interaction.guildId
                );

                return interaction.reply(
                    "▶️ Started the music queue."
                );
            }

            return interaction.reply({
                content:
                    "🎵 Nothing is paused or queued. Use `/play query:<song>` to start some music.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            console.log(
                `[Music] Searching YouTube for: ${query}`
            );

            const info =
                await getVideoInfo(query);

            console.log(
                `[Music] Found: ${info.title}`
            );

            const videoUrl =
                info.webpage_url ||
                info.original_url ||
                (
                    info.id
                        ? `https://www.youtube.com/watch?v=${info.id}`
                        : null
                );

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
                    Number(info.duration || 0),

                thumbnail:
                    getThumbnail(info),

                channel:
                    info.uploader ||
                    info.channel ||
                    "YouTube",

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

            const data =
                musicManager.getGuildData(
                    interaction.guildId
                );

            musicManager.connect(
                interaction.guildId,
                memberChannel
            );

            musicManager.setTextChannel(
                interaction.guildId,
                interaction.channel
            );

            const wasPlaying =
                Boolean(data.current);

            await musicManager.add(
                interaction.guildId,
                track
            );

            if (wasPlaying) {
                await interaction.editReply(
                    `🎵 Added **${track.title}** to the queue.`
                );
            } else {
                await interaction.editReply(
                    `▶️ Now playing **${track.title}**`
                );
            }
        } catch (error) {
            console.error(
                "[Music] Play command error:",
                error
            );

            const message =
                String(error?.message || error);

            if (
                message
                    .toLowerCase()
                    .includes("verification")
            ) {
                await interaction.editReply(
                    "❌ YouTube's verification challenge could not be solved."
                );
                return;
            }

            await interaction.editReply(
                `❌ Could not play that: ${message.slice(
                    0,
                    1500
                )}`
            );
        }
    }
};