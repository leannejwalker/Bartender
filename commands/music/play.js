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

async function getVideoInfo(query) {
    const target =
        query.startsWith("http://") ||
        query.startsWith("https://")
            ? query
            : `ytsearch1:${query}`;

    const output = await runYtDlp([
        ...YTDLP_COMMON_ARGS,
        "--dump-single-json",
        "--no-simulate",
        "-f",
        "bestaudio/best",
        target
    ]);

    return JSON.parse(output);
}

function getBestThumbnail(info) {
    if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
        const sorted = [...info.thumbnails].sort(
            (a, b) =>
                (b.width || 0) * (b.height || 0) -
                (a.width || 0) * (a.height || 0)
        );

        for (const thumbnail of sorted) {
            if (
                thumbnail?.url &&
                thumbnail.url.startsWith("http")
            ) {
                return thumbnail.url;
            }
        }
    }

    if (
        info.thumbnail &&
        typeof info.thumbnail === "string" &&
        info.thumbnail.startsWith("http")
    ) {
        return info.thumbnail;
    }

    // YouTube's standard max-resolution thumbnail.
    if (info.id) {
        return `https://i.ytimg.com/vi/${info.id}/maxresdefault.jpg`;
    }

    return null;
}

function cleanTitle(title) {
    if (!title) {
        return "Unknown Track";
    }

    return String(title)
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

        // /play with no query = resume/start queue
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

            const title =
                cleanTitle(info.title);

            const url =
                info.webpage_url ||
                info.original_url ||
                (
                    info.id
                        ? `https://www.youtube.com/watch?v=${info.id}`
                        : query
                );

            const thumbnail =
                getBestThumbnail(info);

            const track = {
                title,

                url,

                durationInSec:
                    Number(info.duration || 0),

                thumbnail,

                channel:
                    info.uploader ||
                    info.channel ||
                    info.uploader_id ||
                    "YouTube",

                requestedBy:
                    interaction.user.toString()
            };

            console.log(
                "[Music] Track metadata:",
                JSON.stringify(
                    {
                        title: track.title,
                        url: track.url,
                        thumbnail: track.thumbnail,
                        duration: track.durationInSec,
                        channel: track.channel
                    },
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